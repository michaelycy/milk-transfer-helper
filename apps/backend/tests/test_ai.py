"""模块 K AI 接口测试：护栏纯函数 + 网关管线 + 三个场景端点（MockTransport，不出网）。"""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import ai_gateway as gateway
from app.core import ai_safety as safety
from app.core import supabase as supabase_module
from app.core.config import get_settings
from app.main import app

JWT = "test.jwt.token"
USER_ID = "u-1"

# 场景配置 / 提示词 / 会话与用量行为可由测试覆写
STATE: dict = {}


def chat_completion_payload(text: str, tokens: int = 42) -> dict:
    return {"choices": [{"message": {"content": text}}], "usage": {"total_tokens": tokens}}


@pytest.fixture(autouse=True)
def _env_and_transports(monkeypatch: pytest.MonkeyPatch):
    """注入环境变量 + Supabase/模型双 MockTransport。"""
    monkeypatch.setenv("SUPABASE_URL", "https://stub.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("AI_ZHIPU_API_KEY", "zhipu-key")
    monkeypatch.setenv("AI_KEY_MASTER_SECRET", "unit-test-master-secret-32")
    monkeypatch.setenv("API_LOG_ENABLED", "false")
    get_settings.cache_clear()
    STATE.clear()
    STATE.update({
        "config": {"scene": "chat", "enabled": True, "model": "glm-4-flash", "provider": "zhipu",
                   "temperature": 0.5, "max_tokens": 512, "daily_limit_per_user": 2},
        "prompt": {"scene": "chat", "enabled": True, "review_status": "approved",
                   "system_prompt": "你是转奶助手。{baby_nickname}"},
        "usage_count": 0,
        "model_called": 0,
        "model_text": "保持观察，注意打卡。",
        "inserted": [],
        "usage_rows": 0,
        "providers": [],
        "secrets": [],
        "is_admin": False,
        "fail_first_call": False,
        "upstream_status": None,
        "usage_bodies": [],
    })

    def supabase_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID})
        if path == "/rest/v1/ai_configs":
            cfg = STATE["config"]
            return httpx.Response(200, json=[cfg] if cfg else [])
        if path == "/rest/v1/ai_prompt_templates":
            p = STATE["prompt"]
            # 模拟 PostgREST 过滤：仅 approved 可被取到（NFR-1 服务端强制）
            if p and request.url.params.get("review_status") == "eq.approved" and p.get("review_status") != "approved":
                return httpx.Response(200, json=[])
            return httpx.Response(200, json=[p] if p else [])
        if path == "/rest/v1/ai_usage_logs" and request.method == "GET":
            n = STATE.get("usage_count", 0)
            return httpx.Response(
                200, json=[{"id": "x"}] if n else [],
                headers={"content-range": f"0-{max(n - 1, 0)}/{n}"} if n else {"content-range": "*/0"},
            )
        if path == "/rest/v1/ai_usage_logs" and request.method == "POST":
            STATE["usage_rows"] += 1
            STATE["usage_bodies"].append(request.read() and httpx.Request("POST", request.url).read() or b"")
            import json as _json
            STATE["last_usage"] = _json.loads(request.content.decode())
            return httpx.Response(201, json=[{"id": "u"}])
        if path == "/rest/v1/ai_providers" and request.method == "GET":
            name = str(request.url.params.get("name", "")).removeprefix("eq.")
            rows = [r for r in STATE["providers"] if r.get("name") == name] if name else STATE["providers"]
            return httpx.Response(200, json=rows)
        if path == "/rest/v1/admins" and request.method == "GET":
            return httpx.Response(200, json=[{"user_id": USER_ID}] if STATE["is_admin"] else [])
        if path == "/rest/v1/ai_provider_secrets" and request.method == "GET":
            name = str(request.url.params.get("provider_name", "")).removeprefix("eq.")
            rows = [r for r in STATE["secrets"] if r.get("provider_name") == name] if name else STATE["secrets"]
            return httpx.Response(200, json=rows)
        if path == "/rest/v1/ai_provider_secrets" and request.method == "POST":
            import json as _json
            row = _json.loads(request.content.decode())
            STATE["secrets"] = [r for r in STATE["secrets"] if r.get("provider_name") != row["provider_name"]]
            STATE["secrets"].append(row)
            return httpx.Response(201, json=[row])
        if path == "/rest/v1/ai_provider_secrets" and request.method == "DELETE":
            name = str(request.url.params.get("provider_name", "")).removeprefix("eq.")
            STATE["secrets"] = [r for r in STATE["secrets"] if r.get("provider_name") != name]
            return httpx.Response(204)
        if path == "/rest/v1/milk_products" and request.method == "GET":
            return httpx.Response(200, json=[])
        if request.method in ("POST", "PATCH") and path.startswith("/rest/v1/"):
            table = path.removeprefix("/rest/v1/").split("?")[0]
            STATE["inserted"].append(table)
            return httpx.Response(201, json=[{"id": "row-1"}])
        return httpx.Response(200, json=[])

    def model_handler(request: httpx.Request) -> httpx.Response:
        STATE["model_called"] += 1
        # 请求头校验：网关必须携带供应商密钥（密钥安全在网关内部闭环）
        accepted = STATE.get("accepted_keys") or {f"Bearer {STATE.get('expected_key', 'zhipu-key')}"}
        assert request.headers.get("authorization") in accepted
        assert request.url.path.endswith("/chat/completions")
        if STATE.get("probe_request"):
            import json as _json
            assert _json.loads(request.content.decode())["max_tokens"] <= 16
        if STATE.get("fail_first_call") and STATE["model_called"] == 1:
            return httpx.Response(500, json={"error": "primary down"})
        if STATE.get("upstream_status"):
            return httpx.Response(STATE["upstream_status"], json={"error": "model not found"})
        if STATE.get("model_text") is None:
            return httpx.Response(500, json={"error": "upstream down"})
        return httpx.Response(200, json=chat_completion_payload(STATE["model_text"]))

    supabase_module._transport = httpx.MockTransport(supabase_handler)
    gateway._transport = httpx.MockTransport(model_handler)
    gateway.invalidate_cache()
    yield
    supabase_module._transport = None
    gateway._transport = None
    gateway.invalidate_cache()
    get_settings.cache_clear()


client = TestClient(app)


def post(path: str, body: dict) -> httpx.Response:
    return client.post(path, json=body, headers={"authorization": f"Bearer {JWT}"})


def get(path: str) -> httpx.Response:
    return client.get(path, headers={"authorization": f"Bearer {JWT}"})


# ---------- 纯函数护栏（NFR-1） ----------


def test_guard_replaces_diagnosis_output() -> None:
    wrapped = safety.wrap_answer("宝宝湿疹怎么办", "可以诊断为湿疹，建议服用抗过敏药。")
    assert wrapped["degraded"] is True
    assert "诊断为" not in wrapped["answer"]
    assert "喂养观察" in wrapped["answer"]


def test_guard_prepends_urgent_notice() -> None:
    wrapped = safety.wrap_answer("便便有血丝", "请记录性状并观察。")
    assert wrapped["degraded"] is False
    assert wrapped["answer"].startswith("⚠️")
    assert "就医" in wrapped["answer"]


def test_off_domain_detection() -> None:
    assert safety.is_in_domain("转奶第二天拉稀正常吗") is True
    assert safety.is_in_domain("宝宝辅食食谱推荐") is False
    assert safety.is_in_domain("该打疫苗了吗") is False


def test_normal_answer_passes_guard() -> None:
    wrapped = safety.wrap_answer("怎么转奶", "按混合法逐日提高新奶比例即可。")
    assert wrapped["degraded"] is False
    assert "按混合法" in wrapped["answer"]
    assert wrapped["answer"].endswith(safety.DISCLAIMER)


# ---------- 配置查询 ----------


def test_scene_config_enabled_with_quota() -> None:
    STATE["usage_count"] = 1
    res = get("/v1/ai/scenes/chat/config")
    data = res.json()["data"]
    assert data["enabled"] is True
    assert data["daily_limit"] == 2
    assert data["used_today"] == 1
    assert data["remaining"] == 1


def test_scene_config_disabled() -> None:
    STATE["config"] = None
    res = get("/v1/ai/scenes/can/config")
    data = res.json()["data"]
    assert data["enabled"] is False
    assert data["remaining"] == 0


def test_config_requires_jwt() -> None:
    res = client.get("/v1/ai/scenes/chat/config")
    assert res.status_code == 401


# ---------- 问答（FR-K5） ----------


def test_chat_happy_path_with_context_and_history() -> None:
    res = post("/v1/ai/chat", {
        "question": "转奶第二天大便偏稀正常吗？",
        "baby_id": "b-1",
        "history": [{"role": "user", "content": "你好"}, {"role": "assistant", "content": "你好呀"}],
    })
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["degraded"] is False
    assert STATE["model_text"] in data["answer"]
    assert data["answer"].endswith(safety.DISCLAIMER)
    assert STATE["model_called"] == 1
    # 会话两行 + 用量一行
    assert STATE["inserted"].count("ai_chat_messages") == 2
    assert STATE["usage_rows"] == 1


def test_chat_off_domain_skips_model() -> None:
    res = post("/v1/ai/chat", {"question": "推荐一下辅食食谱"})
    data = res.json()["data"]
    assert data["off_domain"] is True
    assert STATE["model_called"] == 0


def test_chat_over_quota_degrades() -> None:
    STATE["usage_count"] = 2  # 已达 daily_limit_per_user
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "quota_exceeded"
    assert STATE["model_called"] == 0


def test_chat_scene_disabled_degrades() -> None:
    STATE["config"] = None
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "scene_disabled"


def test_chat_without_approved_prompt_degrades() -> None:
    STATE["prompt"] = {"scene": "chat", "enabled": True, "review_status": "pending", "system_prompt": "x"}
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "prompt_missing"
    assert STATE["model_called"] == 0


def test_chat_gateway_error_degrades() -> None:
    STATE["model_text"] = None  # 触发响应不合法
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "gateway_error"


def test_chat_red_flag_output_replaced() -> None:
    STATE["model_text"] = "建议服用益生菌调理，可根治。"
    res = post("/v1/ai/chat", {"question": "转奶拉肚子怎么办"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert "服用" not in data["answer"]


# ---------- 视觉识别（FR-K2/K3/K4） ----------


def test_bottle_analyze_ok() -> None:
    STATE["model_text"] = '{"volume_ml": 210, "confidence": 0.92}'
    res = post("/v1/ai/analyze", {"scene": "bottle", "image_base64": "a" * 64, "baby_id": "b-1"})
    data = res.json()["data"]
    assert data["ok"] is True
    assert data["analysis"]["volume_ml"] == 210
    assert data["confidence"] == 0.92
    assert "ai_analyses" in STATE["inserted"]


def test_bottle_analyze_invalid_volume_clamped() -> None:
    STATE["model_text"] = '{"volume_ml": 9999, "confidence": 0.9}'
    res = post("/v1/ai/analyze", {"scene": "bottle", "image_base64": "a" * 64})
    assert res.json()["data"]["analysis"]["volume_ml"] == -1


def test_poop_analyze_maps_enum_and_guards_note() -> None:
    STATE["model_text"] = '{"color":"golden","texture":"soft","abnormal_suspect":false,"confidence":0.87,"note":"成形度略低，未见血丝"}'
    res = post("/v1/ai/analyze", {"scene": "poop", "image_base64": "a" * 64, "baby_id": "b-1"})
    analysis = res.json()["data"]["analysis"]
    assert analysis["color"] == "golden"
    assert analysis["texture"] == "soft"
    assert analysis["abnormal_suspect"] is False
    assert "诊断" not in analysis["note"]


def test_poop_analyze_invalid_enum_nulled() -> None:
    STATE["model_text"] = '{"color":"彩虹色","texture":"未知","abnormal_suspect":true,"confidence":0.5,"note":"ok"}'
    analysis = post("/v1/ai/analyze", {"scene": "poop", "image_base64": "a" * 64}).json()["data"]["analysis"]
    assert analysis["color"] is None
    assert analysis["texture"] is None


def test_poop_analyze_invalid_json_degrades() -> None:
    STATE["model_text"] = "抱歉，我看不清楚这张图片。"
    res = post("/v1/ai/analyze", {"scene": "poop", "image_base64": "a" * 64})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "gateway_error"
    assert "人工" in data["message"]


def test_can_analyze_miss_creates_submission() -> None:
    STATE["model_text"] = '{"brand":"无名小厂","series":null,"stage":null,"confidence":0.5}'
    res = post("/v1/ai/analyze", {"scene": "can", "image_base64": "a" * 64})
    data = res.json()["data"]
    assert data["ok"] is True
    assert data["matched"] == []
    assert data["submission_id"] == "row-1"
    assert "milk_product_submissions" in STATE["inserted"]


def test_custom_provider_via_env_convention(monkeypatch: pytest.MonkeyPatch) -> None:
    """FR-K1 配置驱动接入：任意供应商字符串 + base_url + AI_<PROVIDER>_API_KEY 即可用，无需改代码。"""
    monkeypatch.setenv("AI_DASHSCOPE_API_KEY", "ds-key")
    STATE.update({
        "config": {"scene": "chat", "enabled": True, "provider": "dashscope",
                   "model": "qwen-plus", "base_url": "https://dashscope.example/compatible-mode/v1",
                   "temperature": 0.5, "max_tokens": 512, "daily_limit_per_user": 5},
        "expected_key": "ds-key",
    })
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is False
    assert STATE["model_called"] == 1


def test_custom_provider_without_key_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_DASHSCOPE_API_KEY", raising=False)
    STATE.update({
        "config": {"scene": "chat", "enabled": True, "provider": "dashscope",
                   "model": "qwen-plus", "base_url": "https://dashscope.example/v1",
                   "temperature": 0.5, "max_tokens": 512, "daily_limit_per_user": 5},
    })
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "gateway_error"
    assert STATE["model_called"] == 0


def test_custom_provider_without_base_url_degrades() -> None:
    STATE.update({
        "config": {"scene": "chat", "enabled": True, "provider": "selfhosted",
                   "model": "m1", "base_url": None,
                   "temperature": 0.5, "max_tokens": 512, "daily_limit_per_user": 5},
    })
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    assert res.json()["data"]["reason"] == "gateway_error"


def test_provider_disabled_degrades_scene() -> None:
    """FR-K6：注册表供应商停用 → 引用它的场景按停用同路径降级。"""
    STATE["providers"] = [{"name": "zhipu", "base_url": "https://x", "enabled": False}]
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    assert res.json()["data"]["reason"] == "provider_disabled"
    assert STATE["model_called"] == 0


def test_scene_base_url_overrides_registry() -> None:
    """FR-K6 端点解析链：场景 base_url 覆盖 > 注册表。"""
    STATE["providers"] = [{"name": "zhipu", "base_url": "https://registry.example/v1", "enabled": True}]
    STATE["config"] = {**STATE["config"], "base_url": "https://scene.example/v1"}
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    assert res.json()["data"]["degraded"] is False


def test_fallback_model_recovers_on_primary_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """FR-K7：主模型 500 → 备用模型重试一次成功，fallback_used=true，配额不重复扣。"""
    monkeypatch.setenv("AI_OPENAI_API_KEY", "openai-key")
    STATE["config"] = {
        **STATE["config"],
        "fallback_provider": "openai",
        "fallback_model": "gpt-4o-mini",
    }
    STATE["accepted_keys"] = {"Bearer zhipu-key", "Bearer openai-key"}
    STATE["fail_first_call"] = True
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is False
    assert STATE["model_called"] == 2
    assert STATE["last_usage"]["fallback_used"] is True
    assert STATE["last_usage"]["success"] is True
    # 一次用户请求 = 一次限额消耗（失败的主调用不重复记账）
    assert STATE["usage_rows"] == 1


def test_fallback_both_fail_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_OPENAI_API_KEY", "openai-key")
    STATE["config"] = {
        **STATE["config"],
        "fallback_provider": "openai",
        "fallback_model": "gpt-4o-mini",
    }
    STATE["accepted_keys"] = {"Bearer zhipu-key", "Bearer openai-key"}
    STATE["fail_first_call"] = True
    STATE["model_text"] = None  # 后续调用也失败
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is True
    assert data["reason"] == "gateway_error"
    assert STATE["model_called"] == 2
    assert STATE["last_usage"]["fallback_used"] is False


def test_connectivity_probe_requires_admin() -> None:
    res = post("/v1/admin/ai/providers/probe", {"provider": "zhipu", "model": "glm-4-flash"})
    assert res.status_code == 403


def test_connectivity_probe_ok() -> None:
    STATE["is_admin"] = True
    STATE["probe_request"] = True
    res = post("/v1/admin/ai/providers/probe", {"provider": "zhipu", "model": "glm-4-flash"})
    data = res.json()["data"]
    assert data["ok"] is True
    assert isinstance(data["latency_ms"], int)
    assert data["resolved_base_url"] == "https://open.bigmodel.cn/api/paas/v4"
    assert STATE["last_usage"]["scene"] == "test"


def test_connectivity_probe_reports_error_without_secret() -> None:
    STATE["is_admin"] = True
    STATE["model_text"] = None  # 上游 500
    res = post("/v1/admin/ai/providers/probe", {"provider": "zhipu", "model": "glm-4-flash"})
    data = res.json()["data"]
    assert data["ok"] is False
    assert "HTTP 500" in data["error"]["message"]
    assert "zhipu-key" not in str(data)


def test_builtin_deepseek_endpoint_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    """预置供应商 deepseek：无需 base_url 与密钥配置即可解析内置端点；未配密钥时优雅降级。"""
    monkeypatch.delenv("AI_DEEPSEEK_API_KEY", raising=False)
    STATE.update({
        "config": {"scene": "chat", "enabled": True, "provider": "deepseek",
                   "model": "deepseek-chat", "base_url": None,
                   "temperature": 0.5, "max_tokens": 512, "daily_limit_per_user": 5},
    })
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    # 密钥未配置（默认空字符串）→ 网关报出含环境变量名的明确错误 → 前端降级，不抛裸错误
    assert data["degraded"] is True
    assert data["reason"] == "gateway_error"
    assert STATE["model_called"] == 0


def test_provider_key_set_requires_admin() -> None:
    res = client.put(
        "/v1/admin/ai/providers/zhipu/key",
        json={"api_key": "sk-abc12345"},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403


def test_provider_key_set_and_status_roundtrip() -> None:
    """FR-K6/NFR-2：界面密钥加密落库；状态只回显掩码；响应不含明文与密文。"""
    STATE["is_admin"] = True
    res = client.put(
        "/v1/admin/ai/providers/zhipu/key",
        json={"api_key": "sk-live-abcd9876"},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data == {"configured": True, "last4": "9876", "source": "database"}
    # 库内是密文（非明文）
    stored = STATE["secrets"][0]
    assert stored["key_ciphertext"].startswith("v1.")
    assert "sk-live-abcd9876" not in stored["key_ciphertext"]
    assert stored["key_last4"] == "9876"

    status = get("/v1/admin/ai/providers/zhipu/key-status")
    body = status.json()
    assert body["data"] == {"configured": True, "last4": "9876", "source": "database"}
    assert "sk-live-abcd9876" not in status.text
    assert "key_ciphertext" not in status.text


def test_provider_key_empty_means_no_change_clear_explicit() -> None:
    STATE["is_admin"] = True
    res = client.put(
        "/v1/admin/ai/providers/zhipu/key",
        json={},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 400
    res = client.put(
        "/v1/admin/ai/providers/zhipu/key",
        json={"api_key": "sk-live-abcd9876"},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    res = client.put(
        "/v1/admin/ai/providers/zhipu/key",
        json={"clear": True},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["configured"] is False
    assert STATE["secrets"] == []


def test_chat_prefers_database_key_over_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """密钥解析优先级：数据库密文 > 环境变量。"""
    from app.core.secret_box import SecretBox

    monkeypatch.setenv("AI_KEY_MASTER_SECRET", "unit-test-master-secret-32")
    cipher = SecretBox("unit-test-master-secret-32").encrypt("db-stored-key-9999")
    STATE["secrets"] = [{"provider_name": "zhipu", "key_ciphertext": cipher, "key_last4": "9999"}]
    STATE["accepted_keys"] = {"Bearer db-stored-key-9999"}
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    assert res.json()["data"]["degraded"] is False
    # 响应与用法记录不得泄露库内明文
    assert "db-stored-key-9999" not in res.text


def test_chat_falls_back_to_env_when_master_secret_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """主密钥未配置：库内密文不可解，回退环境变量密钥路径。"""
    from app.core.secret_box import SecretBox

    monkeypatch.delenv("AI_KEY_MASTER_SECRET", raising=False)
    cipher = SecretBox("unit-test-master-secret-32").encrypt("db-stored-key-9999")
    STATE["secrets"] = [{"provider_name": "zhipu", "key_ciphertext": cipher, "key_last4": "9999"}]
    gateway.invalidate_cache()
    res = post("/v1/ai/chat", {"question": "怎么转奶"})
    data = res.json()["data"]
    assert data["degraded"] is False  # 环境变量 zhipu-key 兜底成功
    assert STATE["model_called"] == 1


def test_probe_star_model_treats_model_not_found_as_reachable() -> None:
    """行级探针 model='*'：上游「模型不存在」(400) 说明端点与密钥均有效 → ok + note。"""
    STATE["is_admin"] = True
    STATE["probe_request"] = True
    STATE["upstream_status"] = 400
    res = post("/v1/admin/ai/providers/probe", {"provider": "zhipu", "model": "*", "base_url": "https://open.bigmodel.cn/api/paas/v4"})
    data = res.json()["data"]
    assert data["ok"] is True
    assert "可达" in (data["note"] or "")
    assert data["error"] is None


def test_probe_star_model_auth_failure_still_fails() -> None:
    STATE["is_admin"] = True
    STATE["probe_request"] = True
    STATE["upstream_status"] = 401
    res = post("/v1/admin/ai/providers/probe", {"provider": "zhipu", "model": "*"})
    data = res.json()["data"]
    assert data["ok"] is False
    assert "HTTP 401" in data["error"]["message"]


def test_provider_keys_overview_requires_admin() -> None:
    res = client.get(
        "/v1/admin/ai/providers/keys",
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403


def test_provider_keys_overview_lists_masked_only() -> None:
    STATE["is_admin"] = True
    STATE["secrets"] = [
        {"provider_name": "zhipu", "key_ciphertext": "v1.x.y", "key_last4": "9876"},
    ]
    res = client.get(
        "/v1/admin/ai/providers/keys",
        headers={"authorization": f"Bearer {JWT}"},
    )
    data = res.json()["data"]
    assert data == [{"provider": "zhipu", "last4": "9876"}]
    assert "v1.x.y" not in res.text


def test_can_analyze_hit_returns_products_without_submission() -> None:
    STATE["model_text"] = '{"brand":"飞鹤","series":"星飞帆","stage":3,"confidence":0.9}'
    # 注入匹配命中：在 supabase handler 上补一条 milk_products GET 分支
    original = supabase_module._transport
    supabase_module._transport = httpx.MockTransport(_hit_handler)
    try:
        res = post("/v1/ai/analyze", {"scene": "can", "image_base64": "a" * 64})
    finally:
        supabase_module._transport = original
    data = res.json()["data"]
    assert len(data["matched"]) == 1
    assert "submission_id" not in data


def _hit_handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/auth/v1/user":
        return httpx.Response(200, json={"id": USER_ID})
    if path == "/rest/v1/ai_providers":
        return httpx.Response(200, json=[])
    if path == "/rest/v1/ai_configs":
        return httpx.Response(200, json=[STATE["config"]])
    if path == "/rest/v1/ai_prompt_templates":
        return httpx.Response(200, json=[STATE["prompt"]])
    if path == "/rest/v1/ai_usage_logs" and request.method == "GET":
        return httpx.Response(200, json=[], headers={"content-range": "*/0"})
    if path == "/rest/v1/ai_usage_logs" and request.method == "POST":
        return httpx.Response(201, json=[{"id": "u"}])
    if path == "/rest/v1/milk_products":
        return httpx.Response(200, json=[{"id": "p1", "brand": "飞鹤", "name": "星飞帆", "stage": 3}])
    if path.startswith("/rest/v1/"):
        return httpx.Response(201, json=[{"id": "row"}])
    return httpx.Response(200, json=[])
