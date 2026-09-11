"""AI 网关（FR-K1）：场景配置读取（带缓存）→ 供应商调用（OpenAI 兼容）→ 配额与记账。

密钥安全（NFR-2）：key 只从后端环境变量读取，不落库、不写日志、不进响应。
供应商接入为配置驱动：任意供应商字符串可用，密钥按约定读 AI_<PROVIDER大写>_API_KEY
（zhipu/openai 另有 Settings 字段兜底，支持 .env 文件），自定义供应商须在场景配置 base_url。
"""
import json
import os
import re
import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.secret_box import try_decrypt_stored
from app.core.supabase import postgrest

# 测试注入 MockTransport 用（模型上游）
_transport: httpx.AsyncBaseTransport | None = None

# 会话内缓存：场景配置、供应商注册表与密钥掩码（TTL 同配置）
_config_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
_provider_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
_secret_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}

SCENES = ("chat", "poop", "bottle", "can")

# 内置供应商的默认端点（场景配置 base_url 可覆盖；其他供应商必须显式配 base_url）
PROVIDER_BASE_URL = {
    "zhipu": lambda: get_settings().ai_zhipu_base_url,
    "deepseek": lambda: get_settings().ai_deepseek_base_url,
    "openai": lambda: get_settings().ai_openai_base_url,
}
BUILTIN_PROVIDERS = tuple(PROVIDER_BASE_URL)


class GatewayError(Exception):
    """模型调用失败（超时/上游错误/响应不合法）——调用方据此走降级路径。

    status：上游 HTTP 状态码（可达性判定用；超时/解析失败类为 None）。
    """

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


async def fetch_scene_config(scene: str) -> dict[str, Any] | None:
    """读取场景配置（service_role，TTL 缓存）；未配置或已停用返回 None。"""
    now = time.monotonic()
    cached = _config_cache.get(scene)
    if cached and now - cached[0] < get_settings().ai_config_cache_seconds:
        return cached[1]

    res = await postgrest(
        "GET",
        "/ai_configs",
        jwt=get_settings().supabase_service_role_key,
        params={"scene": f"eq.{scene}", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    row = rows[0] if rows else None
    _config_cache[scene] = (now, row)
    return row


async def fetch_provider(name: str) -> dict[str, Any] | None:
    """读供应商注册表行（service_role，TTL 缓存）；未注册返回 None（内置供应商走默认端点）。"""
    if not name:
        return None
    now = time.monotonic()
    cached = _provider_cache.get(name)
    if cached and now - cached[0] < get_settings().ai_config_cache_seconds:
        return cached[1]

    res = await postgrest(
        "GET",
        "/ai_providers",
        jwt=get_settings().supabase_service_role_key,
        params={"name": f"eq.{name}", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    row = rows[0] if rows else None
    _provider_cache[name] = (now, row)
    return row


async def fetch_provider_secret(provider: str) -> dict[str, Any] | None:
    """读界面配置的密钥元数据（掩码）；明文仅在 decrypt 时于内存瞬时存在。"""
    if not provider:
        return None
    now = time.monotonic()
    cached = _secret_cache.get(provider)
    if cached and now - cached[0] < get_settings().ai_config_cache_seconds:
        return cached[1]

    res = await postgrest(
        "GET",
        "/ai_provider_secrets",
        jwt=get_settings().supabase_service_role_key,
        params={"provider_name": f"eq.{provider}", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    row = rows[0] if rows else None
    _secret_cache[provider] = (now, row)
    return row


def provider_key_status(row: dict[str, Any] | None) -> dict[str, Any]:
    """对外只暴露 配置状态 + 末 4 位掩码，密文与明文均不出网关。"""
    if not row:
        return {"configured": False, "last4": "", "source": "none"}
    return {
        "configured": True,
        "last4": str(row.get("key_last4") or ""),
        "source": "database",
    }


def invalidate_cache() -> None:
    _config_cache.clear()
    _provider_cache.clear()
    _secret_cache.clear()


async def fetch_prompt(scene: str) -> str | None:
    """取当前生效的提示词：仅 approved 且 enabled 的版本可生效（NFR-1，服务端强制）。"""
    res = await postgrest(
        "GET",
        "/ai_prompt_templates",
        jwt=get_settings().supabase_service_role_key,
        params={
            "scene": f"eq.{scene}",
            "enabled": "eq.true",
            "review_status": "eq.approved",
            "order": "version.desc",
            "limit": "1",
        },
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        return None
    return str(rows[0].get("system_prompt") or "") or None


async def count_today_usage(user_id: str, scene: str, day_start: str) -> int:
    """当日（喂养日口径由调用方传 day_start）该用户该场景的调用次数。"""
    res = await postgrest(
        "GET",
        "/ai_usage_logs",
        jwt=get_settings().supabase_service_role_key,
        params={
            "user_id": f"eq.{user_id}",
            "scene": f"eq.{scene}",
            "created_at": f"gte.{day_start}",
            "select": "id",
            "limit": "1",
        },
        prefer="count=exact",
    )
    content_range = res.headers.get("content-range", "")
    total = content_range.rsplit("/", 1)[-1] if "/" in content_range else "0"
    return int(total) if total.isdigit() else 0


async def log_usage(
    user_id: str, scene: str, success: bool, tokens: int = 0, fallback_used: bool = False
) -> None:
    await postgrest(
        "POST",
        "/ai_usage_logs",
        jwt=get_settings().supabase_service_role_key,
        json_body={
            "user_id": user_id,
            "scene": scene,
            "success": success,
            "tokens": tokens,
            "fallback_used": fallback_used,
        },
    )


async def resolve_model_config(config: dict[str, Any]) -> dict[str, Any]:
    """合成可调用配置：端点（场景覆盖 > 注册表 > 内置默认）+ 密钥（库内密文 > 环境变量）。

    解析出的明文密钥放在结果的 `_resolved_key`，仅在后端内存中传递，不落日志/响应。
    """
    provider = str(config.get("provider", "")).strip()
    base_url = config.get("base_url")
    if not base_url:
        row = await fetch_provider(provider)
        if row:
            base_url = row.get("base_url")
    if not base_url:
        factory = PROVIDER_BASE_URL.get(provider)
        if not factory:
            raise GatewayError(
                f"供应商 {provider} 未配置 base_url（请在供应商注册表登记或于场景配置覆盖）"
            )
        base_url = factory()

    key = await _resolve_key(provider)
    return {**config, "base_url": str(base_url), "_resolved_key": key}


async def _resolve_key(provider: str) -> str:
    """密钥解析优先级（FR-K6/NFR-2）：数据库密文（解密）> 环境变量 AI_<PROVIDER大写>_API_KEY。"""
    row = await fetch_provider_secret(provider)
    if row:
        plaintext = try_decrypt_stored(row.get("key_ciphertext"))
        if plaintext:
            return plaintext
    key = os.environ.get(f"AI_{provider.upper()}_API_KEY", "") or getattr(
        get_settings(), f"ai_{provider.lower()}_api_key", ""
    )
    if not key:
        raise GatewayError(
            f"供应商密钥未配置（请在管理端设置，或配置环境变量 AI_{provider.upper()}_API_KEY）"
        )
    return key




def build_messages(
    system: str, question: str, history: list[dict[str, str]], image_b64: str | None
) -> list[dict[str, Any]]:
    """OpenAI 兼容消息体；带图时 user content 为多模态 parts（图片走 data URL，即析即弃）。"""
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history[-6:])
    if image_b64:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": question},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ],
        })
    else:
        messages.append({"role": "user", "content": question})
    return messages


async def call_model(config: dict[str, Any], messages: list[dict[str, Any]]) -> dict[str, Any]:
    """调用模型，返回 {"text", "tokens"}；任何失败抛 GatewayError（调用方降级）。"""
    body = {
        "model": config.get("model"),
        "messages": messages,
        "temperature": float(config.get("temperature", 0.3)),
        "max_tokens": int(config.get("max_tokens", 1024)),
    }
    base_url = str(config.get("base_url") or "")
    if not base_url:
        raise GatewayError("供应商端点未解析（缺少 base_url）")
    key = str(config.get("_resolved_key") or "")
    if not key:
        raise GatewayError("供应商密钥未解析（须先经 resolve_model_config）")
    try:
        async with httpx.AsyncClient(
            transport=_transport, timeout=get_settings().ai_timeout_seconds
        ) as client:
            res = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json=body,
            )
    except httpx.HTTPError as exc:
        raise GatewayError(f"模型请求失败：{exc}") from exc
    if res.status_code >= 400:
        raise GatewayError(f"模型上游错误 HTTP {res.status_code}", status=res.status_code)
    try:
        payload = res.json()
        text = payload["choices"][0]["message"]["content"]
        tokens = int(payload.get("usage", {}).get("total_tokens", 0))
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        raise GatewayError("模型响应不合法") from exc
    return {"text": str(text), "tokens": tokens}


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def parse_model_json(text: str) -> dict[str, Any]:
    """从模型输出稳健提取 JSON 对象（容忍 markdown 代码块与前后杂文本）。"""
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    match = _JSON_BLOCK.search(cleaned)
    if not match:
        raise GatewayError("输出中未找到 JSON")
    try:
        data = json.loads(match.group(0))
    except ValueError as exc:
        raise GatewayError("JSON 解析失败") from exc
    if not isinstance(data, dict):
        raise GatewayError("JSON 不是对象")
    return data
