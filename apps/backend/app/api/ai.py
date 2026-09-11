"""AI 助手接口（模块 K）：配置查询 / 限定域问答 / 视觉识别（奶瓶·便便·奶粉罐）。

约定：
- 小程序 JWT 随行（Authorization: Bearer），用户数据行（会话/分析/补录）以用户身份写入，RLS 填 user_id；
- 配置/提示词/用量走 service_role（客户端无授权）；供应商密钥只在网关内部使用；
- 一切失败走「降级文案」路径（FR-K1）：业务性不可用返回 200 + allowed=false / degraded=true，不抛裸错误。
"""
import datetime as dt
import time
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.core import ai_gateway as gw
from app.core import ai_safety as safety
from app.core.config import get_settings
from app.core.deps import current_user, require_admin, require_jwt
from app.core.secret_box import SecretBox, get_master_secret
from app.core.supabase import gotrue, postgrest

router = APIRouter(prefix="/v1/ai", tags=["ai"])
# 管理端专用前缀（NFR-7：管理能力一律走 /v1/admin/**，与 C 端分开鉴权与审计）
admin_router = APIRouter(prefix="/v1/admin/ai", tags=["ai-admin"])

DISCLAIMER = safety.DISCLAIMER

# 便便观察枚举与 FR-D3 打卡一致（映射即所得，客户端直接预填）
POOP_COLORS = {"golden", "green", "black", "bloody"}
POOP_TEXTURES = {"normal", "soft", "watery", "constipated"}


class ChatBody(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    baby_id: str | None = None
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class AnalyzeBody(BaseModel):
    scene: Literal["poop", "bottle", "can"]
    image_base64: str = Field(min_length=32)
    baby_id: str | None = None


# 配额「今天」按中国时区计算（产品面向国内微信小程序；与喂养日 04:00 切点近似对齐）
_TZ_CN = dt.timezone(dt.timedelta(hours=8))


def _today() -> dt.date:
    return dt.datetime.now(_TZ_CN).date()


def _today_start() -> str:
    return f"{_today():%Y-%m-%d}T00:00:00"


async def _load_scene(scene: str) -> tuple[dict[str, Any] | None, str | None, str | None]:
    """返回 (场景配置, 生效提示词, 降级原因)；供应商禁用按「场景停用」同路径降级（FR-K6）。"""
    config = await gw.fetch_scene_config(scene)
    if not config or not config.get("enabled"):
        return None, None, "scene_disabled"
    provider_row = await gw.fetch_provider(str(config.get("provider", "")))
    if provider_row is not None and not provider_row.get("enabled"):
        return None, None, "provider_disabled"
    prompt = await gw.fetch_prompt(scene)
    if prompt is None:
        return None, None, "prompt_missing"
    return config, prompt, None


async def _call_with_fallback(
    config: dict[str, Any], messages: list[dict[str, Any]]
) -> tuple[dict[str, Any], bool]:
    """FR-K7：主模型失败时以备用配置重试一次；未配置备用则原样抛错。"""
    try:
        return await gw.call_model(await gw.resolve_model_config(config), messages), False
    except gw.GatewayError:
        fp, fm = config.get("fallback_provider"), config.get("fallback_model")
        if not fp or not fm:
            raise
        fallback = {**config, "provider": str(fp), "model": str(fm), "base_url": None}
        return await gw.call_model(await gw.resolve_model_config(fallback), messages), True


async def _quota_guard(user_id: str, scene: str, config: dict[str, Any]) -> bool:
    used = await gw.count_today_usage(user_id, scene, _today_start())
    return used < int(config.get("daily_limit_per_user", 0))


def _interpolate(prompt: str, variables: dict[str, str]) -> str:
    for key, value in variables.items():
        prompt = prompt.replace("{" + key + "}", value)
    return prompt


# ---------- 场景可用性（客户端入口前置判断，省一次模型调用） ----------


@router.get("/scenes/{scene}/config")
async def scene_config(
    scene: Literal["chat", "poop", "bottle", "can"],
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    token = require_jwt(jwt)
    user_id = await current_user(token)
    config = await gw.fetch_scene_config(scene)
    enabled = bool(config and config.get("enabled"))
    if enabled:
        provider_row = await gw.fetch_provider(str(config.get("provider", "")))
        if provider_row is not None and not provider_row.get("enabled"):
            enabled = False
    limit = int(config.get("daily_limit_per_user", 0)) if config else 0
    used = await gw.count_today_usage(user_id, scene, _today_start()) if enabled else 0
    return {
        "status": 200,
        "data": {
            "scene": scene,
            "enabled": enabled,
            "daily_limit": limit,
            "used_today": used,
            "remaining": max(limit - used, 0),
        },
        "error": None,
    }


# ---------- 问答（FR-K5） ----------


async def _build_baby_context(jwt: str, baby_id: str | None) -> tuple[str, dict[str, str]]:
    """构建宝宝上下文段落与提示词插值变量；无档案/计划时给中性降级文案。"""
    empty_vars = {"baby_nickname": "宝宝", "baby_age_months": "", "plan_day_label": "", "current_formula": ""}
    if not baby_id:
        return "", empty_vars
    service = get_settings().supabase_service_role_key
    babies = await postgrest(
        "GET", "/babies", jwt=service,
        params={"id": f"eq.{baby_id}", "select": "nickname,birth_date", "limit": "1"},
    )
    baby_rows = babies.data if isinstance(babies.data, list) else []
    if not baby_rows:
        return "", empty_vars
    nickname = str(baby_rows[0].get("nickname") or "宝宝")
    birth = str(baby_rows[0].get("birth_date") or "")
    age_months = ""
    if birth:
        born = dt.date.fromisoformat(birth)
        months = (_today() - born).days // 30
        age_months = str(months)

    plans = await postgrest(
        "GET", "/transfer_plans", jwt=service,
        params={
            "baby_id": f"eq.{baby_id}",
            "status": "in.(active,paused,rollback)",
            "order": "created_at.desc",
            "limit": "1",
            "select": "*",
        },
    )
    plan_rows = plans.data if isinstance(plans.data, list) else []
    day_label = ""
    formula = ""
    if plan_rows:
        plan = plan_rows[0]
        try:
            start = dt.date.fromisoformat(str(plan.get("start_date")))
            day = (_today() - start).days + 1
            method = "混合法" if plan.get("method") == "mixed" else "隔顿法"
            day_label = f"「{method} · 第{max(day, 1)}天」"
        except ValueError:
            day_label = ""
        formula = str(plan.get("to_brand_text") or "")
    context_parts = [f"宝宝：{nickname}" + (f"（约 {age_months} 月龄）" if age_months else "")]
    if formula or day_label:
        context_parts.append(f"当前：{formula or '暂无配方'} {day_label}".strip())
    variables = {
        "baby_nickname": nickname,
        "baby_age_months": age_months,
        "plan_day_label": day_label,
        "current_formula": formula,
    }
    return "；".join(context_parts), variables


@router.post("/chat")
async def chat(
    body: ChatBody, jwt: Annotated[str | None, Header(alias="authorization")] = None
) -> dict[str, Any]:
    token = require_jwt(jwt)
    user_id = await current_user(token)

    # 出域问题：不调模型，固定引导（FR-K5 验收）
    if not safety.is_in_domain(body.question):
        await gw.log_usage(user_id, "chat", success=True, tokens=0)
        return {
            "status": 200,
            "data": {"answer": f"{safety.OFF_DOMAIN_REPLY}\n\n— {DISCLAIMER}", "degraded": False, "off_domain": True},
            "error": None,
        }

    config, prompt, load_reason = await _load_scene("chat")
    if config is None or prompt is None:
        reason = load_reason or "scene_disabled"
        await gw.log_usage(user_id, "chat", success=False)
        return {
            "status": 200,
            "data": {
                "answer": "AI 问答暂未开放，请到「知识」栏目查看转奶文章。",
                "degraded": True,
                "reason": reason,
            },
            "error": None,
        }

    if not await _quota_guard(user_id, "chat", config):
        await gw.log_usage(user_id, "chat", success=False)
        return {
            "status": 200,
            "data": {"answer": "今天的提问次数用完了，明天再来吧；也可以先看看「知识」栏目。", "degraded": True, "reason": "quota_exceeded"},
            "error": None,
        }

    context_text, variables = await _build_baby_context(token, body.baby_id)
    system = _interpolate(prompt, variables)
    if context_text:
        system = f"{system}\n\n[宝宝上下文] {context_text}"
    history = [m for m in body.history if m.get("role") in ("user", "assistant") and m.get("content")]

    try:
        result, fallback_used = await _call_with_fallback(
            config, gw.build_messages(system, body.question, history, None)
        )
    except gw.GatewayError:
        await gw.log_usage(user_id, "chat", success=False)
        return {
            "status": 200,
            "data": {"answer": "AI 暂时开小差了，请稍后再试；或先到「知识」栏目查阅转奶文章。", "degraded": True, "reason": "gateway_error"},
            "error": None,
        }

    await gw.log_usage(user_id, "chat", success=True, tokens=result["tokens"], fallback_used=fallback_used)
    wrapped = safety.wrap_answer(body.question, result["text"])
    # 会话历史（FR-K5，own RLS）：以用户身份写入
    await postgrest("POST", "/ai_chat_messages", jwt=token,
                    json_body={"role": "user", "scene": "chat", "content": body.question})
    await postgrest("POST", "/ai_chat_messages", jwt=token,
                    json_body={"role": "assistant", "scene": "chat", "content": str(wrapped["answer"])})
    return {"status": 200, "data": {"answer": wrapped["answer"], "degraded": wrapped["degraded"], "off_domain": False}, "error": None}


# ---------- 视觉识别（FR-K2/K3/K4） ----------

VISION_SCHEMAS: dict[str, str] = {
    "poop": '严格输出 JSON（无其他文本）：{"color":"golden|green|black|bloody 之一","texture":"normal|soft|watery|constipated 之一","abnormal_suspect":true/false,"confidence":0到1,"note":"不超过60字的中性观察描述，不得出现诊断或用药建议"}',
    "bottle": '严格输出 JSON（无其他文本）：{"volume_ml":整数奶量毫升,"confidence":0到1}',
    "can": '严格输出 JSON（无其他文本）：{"brand":"品牌","series":"系列名或null","stage":1到4或null,"confidence":0到1}',
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@router.post("/analyze")
async def analyze(
    body: AnalyzeBody, jwt: Annotated[str | None, Header(alias="authorization")] = None
) -> dict[str, Any]:
    token = require_jwt(jwt)
    user_id = await current_user(token)

    degraded_reply = {
        "poop": "这次没能识别清楚，请按人工方式打卡便便情况；异常或持续异常请及时就医。",
        "bottle": "没能识别奶瓶刻度，请手动填写奶量。",
        "can": "没能识别奶粉罐，可手动搜索品牌，或提交补录。",
    }

    config, prompt, load_reason = await _load_scene(body.scene)
    if config is None or prompt is None:
        await gw.log_usage(user_id, body.scene, success=False)
        return {"status": 200, "data": {"ok": False, "degraded": True, "reason": load_reason or "scene_disabled", "message": degraded_reply[body.scene]}, "error": None}

    if not await _quota_guard(user_id, body.scene, config):
        await gw.log_usage(user_id, body.scene, success=False)
        return {"status": 200, "data": {"ok": False, "degraded": True, "reason": "quota_exceeded", "message": "今天的识别次数用完了，请手动填写。"}, "error": None}

    system = f"{prompt}\n\n{VISION_SCHEMAS[body.scene]}"
    try:
        result, fallback_used = await _call_with_fallback(
            config, gw.build_messages(system, "请按约定输出 JSON。", [], body.image_base64)
        )
        parsed = gw.parse_model_json(result["text"])
    except gw.GatewayError:
        await gw.log_usage(user_id, body.scene, success=False)
        return {"status": 200, "data": {"ok": False, "degraded": True, "reason": "gateway_error", "message": degraded_reply[body.scene]}, "error": None}

    confidence = _clamp(float(parsed.get("confidence", 0) or 0), 0, 1)
    analyzed: dict[str, Any] = {"raw": parsed, "confidence": confidence}

    if body.scene == "bottle":
        try:
            volume = int(float(parsed.get("volume_ml", 0)))
        except (TypeError, ValueError):
            volume = -1
        analyzed["volume_ml"] = volume if 0 < volume <= 500 else -1
    elif body.scene == "poop":
        color = str(parsed.get("color", ""))
        texture = str(parsed.get("texture", ""))
        note = str(parsed.get("note", ""))[:120]
        if not safety.is_output_safe(note):
            note = ""
        analyzed.update({
            "color": color if color in POOP_COLORS else None,
            "texture": texture if texture in POOP_TEXTURES else None,
            "abnormal_suspect": bool(parsed.get("abnormal_suspect", False)),
            "note": note,
        })
    else:  # can
        brand = str(parsed.get("brand", "")).strip()[:60]
        stage = parsed.get("stage")
        analyzed.update({
            "brand": brand,
            "series": str(parsed.get("series") or "")[:60] or None,
            "stage": stage if stage in (1, 2, 3, 4) else None,
        })

    # 分析留痕（不含照片，own RLS）
    await postgrest(
        "POST", "/ai_analyses", jwt=token,
        json_body={"scene": body.scene, "baby_id": body.baby_id, "result": analyzed, "confidence": confidence},
    )
    await gw.log_usage(
        user_id, body.scene, success=True, tokens=result["tokens"], fallback_used=fallback_used
    )

    data: dict[str, Any] = {"ok": True, "degraded": False, "confidence": confidence, "analysis": analyzed}
    if body.scene == "can":
        data["matched"] = await _match_products(token, analyzed)
        if not data["matched"]:
            data["submission_id"] = await _create_submission(token, analyzed)
    return {"status": 200, "data": data, "error": None}


class TestBody(BaseModel):
    provider: str = Field(min_length=1, max_length=30)
    model: str = Field(min_length=1, max_length=80)
    base_url: str | None = Field(default=None, max_length=200)


class ProviderKeyBody(BaseModel):
    api_key: str | None = Field(default=None, min_length=1, max_length=400)
    clear: bool = False


@router.post("/chat")
    body: TestBody, jwt: Annotated[str | None, Header(alias="authorization")] = None
) -> dict[str, Any]:
    """FR-K8 连通性自检：最小文本探针（max_tokens ≤ 16），不计用户配额；调用记账 scene='test'。"""
    token = require_jwt(jwt)
    await _require_admin(token)

    probe = {
        "provider": body.provider.strip(),
        "model": body.model.strip(),
        "base_url": body.base_url or None,
        "temperature": 0,
        "max_tokens": 16,
    }
    started = time.monotonic()
    error: dict[str, Any] | None = None
    note: str | None = None
    resolved_base_url: str | None = None
    try:
        effective = await gw.resolve_model_config(probe)
        resolved_base_url = str(effective.get("base_url") or "") or None
        await gw.call_model(
            effective,
            gw.build_messages("连通性探针：仅用于验证供应商可达。", "ping", [], None),
        )
    except gw.GatewayError as exc:
        # 行级探针 model='*' 只验端点+密钥连通性：上游「模型不存在」类 4xx 亦视为可达
        if (
            body.model == "*"
            and exc.status is not None
            and 400 <= exc.status < 500
            and exc.status not in (401, 403)
        ):
            note = "端点与密钥可达（探针未指定真实模型，未校验模型本身）"
        else:
            error = {"message": str(exc)}
    latency_ms = int((time.monotonic() - started) * 1000)

    await gw.log_usage(await current_user(token), "test", success=error is None)
    return {
        "status": 200,
        "data": {
            "ok": error is None,
            "latency_ms": latency_ms,
            "note": note,
            "error": error,
            "resolved_base_url": resolved_base_url,
        },
        "error": None,
    }


@router.get("/providers/keys")
async def provider_keys_overview(
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """全量密钥配置状态（FR-J7 表格列）：仅 provider + 末 4 位掩码。"""
    token = require_jwt(jwt)
    await _require_admin(token)
    res = await postgrest(
        "GET", "/ai_provider_secrets",
        jwt=get_settings().supabase_service_role_key,
        params={"select": "provider_name,key_last4", "order": "provider_name"},
    )
    rows = res.data if isinstance(res.data, list) else []
    return {
        "status": 200,
        "data": [
            {"provider": str(r.get("provider_name")), "last4": str(r.get("key_last4") or "")}
            for r in rows
        ],
        "error": None,
    }


async def _match_products(jwt: str, analyzed: dict[str, Any]) -> list[dict[str, Any]]:
    """识别结果 → 奶粉库匹配（品牌模糊 + 段位精确；命中即返回库内数据，缓存效应）。"""
    brand = str(analyzed.get("brand") or "").strip()
    if not brand:
        return []
    params: dict[str, str] = {
        "status": "eq.on_shelf",
        "brand": f"ilike.%{brand}%",
        "select": "id,brand,name,stage,protein_type,region,reg_no,ingredients",
        "limit": "3",
    }
    if analyzed.get("stage"):
        params["stage"] = f"eq.{analyzed['stage']}"
    res = await postgrest("GET", "/milk_products", jwt=jwt, params=params)
    return res.data if isinstance(res.data, list) else []


async def _create_submission(jwt: str, analyzed: dict[str, Any]) -> str | None:
    """未命中 → 补录队列（用户身份写入，RLS 填 user_id；照片仅用户勾选时另行上传）。"""
    res = await postgrest(
        "POST", "/milk_product_submissions", jwt=jwt,
        json_body={"source": "ai_can", "payload": {"recognized": analyzed}},
        prefer="return=representation",
    )
    rows = res.data if isinstance(res.data, list) else []
    return str(rows[0]["id"]) if rows and isinstance(rows[0], dict) else None
