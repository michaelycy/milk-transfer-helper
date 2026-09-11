"""微信登录（FR-H1 / /auth/wechat）测试：GoTrue 新版要求用户带 email/phone 的回归覆盖。"""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import supabase as supabase_module
from app.core.config import get_settings
from app.main import app

JWT = "test.jwt.token"
OPENID = "oX9abc-DEF123"
USER_ID = "wx-user-uuid"
HASHED = "hashed-token-1"
SESSION = {"access_token": "at", "refresh_token": "rt"}

STATE: dict = {}


@pytest.fixture(autouse=True)
def _env_and_transport(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", "https://stub.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("WECHAT_APPID", "wx-app")
    monkeypatch.setenv("WECHAT_SECRET", "wx-secret")
    get_settings.cache_clear()
    STATE.clear()
    STATE.update({
        "openid": OPENID,
        "users_rows": [],  # users 表按 openid 查询的结果
        "create_status": 200,
        "create_body": {"id": USER_ID, "email": f"{OPENID}@wechat.local"},
        "created_bodies": [],
        "grant_calls": 0,
        "grant_fail_times": 0,
        "password_reset": False,
    })

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/sns/jscode2session":
            return httpx.Response(200, json={"openid": STATE["openid"], "session_key": "sk"})
        if path == "/rest/v1/users" and request.method == "GET":
            openid = str(request.url.params.get("openid", "")).removeprefix("eq.")
            rows = [r for r in STATE["users_rows"] if r.get("openid") == openid]
            return httpx.Response(200, json=rows)
        if path == "/rest/v1/users" and request.method == "POST":
            return httpx.Response(201, json=[])
        if path == "/rest/v1/feed_records" and request.method == "PATCH":
            return httpx.Response(204)
        if path == "/auth/v1/user" and request.method == "GET":
            if request.headers.get("authorization", "").endswith("bad-token"):
                return httpx.Response(401, json={"msg": "Invalid JWT"})
            return httpx.Response(200, json={"id": USER_ID, "email": "x@wechat.local"})
        if path == "/auth/v1/admin/users" and request.method == "POST":
            import json as _json
            STATE["created_bodies"].append(_json.loads(request.content.decode()))
            return httpx.Response(STATE["create_status"], json=STATE["create_body"])
        if path.startswith("/auth/v1/admin/users/") and request.method == "DELETE":
            return httpx.Response(200, json={"id": "deleted"})
        if path == "/auth/v1/token" and request.method == "POST":
            import json as _json
            STATE["grant_calls"] += 1
            if STATE["grant_fail_times"] >= STATE["grant_calls"]:
                return httpx.Response(400, json={"error": "invalid_grant", "msg": "Invalid login credentials"})
            return httpx.Response(200, json=SESSION)
        if path.startswith("/auth/v1/admin/users/") and request.method == "PUT":
            STATE["password_reset"] = True
            return httpx.Response(200, json={"id": "updated"})
        return httpx.Response(200, json={})

    supabase_module._transport = httpx.MockTransport(handler)
    yield
    supabase_module._transport = None
    get_settings.cache_clear()


client = TestClient(app)


def wechat(body: dict) -> httpx.Response:
    return client.post("/auth/wechat", json=body)


def test_wechat_login_happy_path_creates_user_with_email() -> None:
    """GoTrue 新版要求 email：创建必须携带确定性 email {openid}@wechat.local（回归）。"""
    res = wechat({"code": "wx-code"})
    assert res.status_code == 200  # 信封风格：HTTP 200 + 内层 status
    assert res.json()["status"] == 200
    assert res.json()["body"]["session"] == SESSION
    created = STATE["created_bodies"][0]
    assert created["email"] == f"{OPENID}@wechat.local"
    assert created["password"]  # 创建即带派生密码（password grant 会话签发）
    assert created["email_confirm"] is True
    assert created["user_metadata"]["openid"] == OPENID


def test_wechat_login_existing_user_skips_create() -> None:
    STATE["users_rows"] = [{"id": "existing-uuid", "openid": OPENID}]
    res = wechat({"code": "wx-code"})
    assert res.json()["status"] == 200
    assert STATE["created_bodies"] == []  # 不再创建
    assert res.json()["body"]["session"] == SESSION


def test_wechat_login_missing_code() -> None:
    res = wechat({})
    assert res.json()["status"] == 400


def test_wechat_login_code2session_failure() -> None:
    STATE["openid"] = ""
    res = wechat({"code": "bad-code"})
    assert res.json()["status"] == 401
    assert res.json()["body"]["error"] == "wechat auth failed"


def test_wechat_login_create_error_surfaces_detail() -> None:
    """create 失败必须带回上游细节（此前吞成 create failed 无法排查）。"""
    STATE["create_status"] = 500
    STATE["create_body"] = {"code": 500, "msg": "db error"}
    res = wechat({"code": "wx-code"})
    body = res.json()["body"]
    assert res.json()["status"] == 500
    assert body["error"] == "create failed"
    assert "db error" in json_dumps(body["detail"])


def test_wechat_login_grant_self_heals_via_password_reset() -> None:
    """已有用户密码失配（如 service_role 轮换）→ 重置派生密码后自愈重试。"""
    STATE["users_rows"] = [{"id": USER_ID, "openid": OPENID}]
    STATE["grant_fail_times"] = 1
    res = wechat({"code": "wx-code"})
    assert res.json()["status"] == 200
    assert STATE["password_reset"] is True
    assert res.json()["body"]["session"] == SESSION


def test_wechat_login_grant_failure_surfaces_detail() -> None:
    STATE["grant_fail_times"] = 99  # 永远失败
    res = wechat({"code": "wx-code"})
    assert res.json()["status"] == 500
    assert res.json()["body"]["error"] == "session failed"


def json_dumps(v) -> str:
    import json
    return json.dumps(v, ensure_ascii=False)


def test_auth_me_with_authorization_header() -> None:
    """JWT 走 Authorization 头；响应体为用户对象本身（setSession 直接消费）。"""
    res = client.get("/auth/me", headers={"authorization": f"Bearer {JWT}"})
    assert res.status_code == 200
    assert res.json()["id"] == USER_ID


def test_auth_me_missing_token_401() -> None:
    res = client.get("/auth/me")
    assert res.status_code == 401


def test_auth_me_invalid_token_passthrough_401() -> None:
    res = client.get("/auth/me", headers={"authorization": "Bearer bad-token"})
    assert res.status_code == 401


def test_auth_me_jwt_query_param_compat() -> None:
    res = client.get("/auth/me", params={"jwt": JWT})
    assert res.status_code == 200
    assert res.json()["id"] == USER_ID
