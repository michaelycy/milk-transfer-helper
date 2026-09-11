import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import supabase as supabase_module
from app.core.config import get_settings
from app.main import app

JWT = "test.jwt.token"

# 捕获透传给 PostgREST 的请求头，防回归：Authorization 必须是单层 Bearer
forwarded: dict[str, str] = {}


@pytest.fixture(autouse=True)
def _env_and_transport(monkeypatch: pytest.MonkeyPatch):
    """注入测试环境变量与 PostgREST MockTransport。"""
    monkeypatch.setenv("SUPABASE_URL", "https://stub.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("API_LOG_ENABLED", "false")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        forwarded["authorization"] = request.headers.get("authorization", "")
        if request.url.path == "/rest/v1/feed_records" and request.method == "GET":
            return httpx.Response(
                200,
                json=[{"id": "r1", "baby_id": "b1"}],
                headers={"content-range": "0-1/42"},
            )
        if request.url.path == "/rest/v1/babies" and request.method == "POST":
            return httpx.Response(201, json=[{"id": "b-new"}])
        if request.url.path == "/rest/v1/rpc/get_record_stats":
            return httpx.Response(200, json={"total": 3, "days": 2})
        return httpx.Response(200, json=[])

    supabase_module._transport = httpx.MockTransport(handler)
    yield
    supabase_module._transport = None
    get_settings.cache_clear()


client = TestClient(app)


def test_healthz() -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_query_passthrough_with_filters_and_count() -> None:
    res = client.post(
        "/v1/db/tables/feed_records/query",
        json={
            "select": "*",
            "filters": [{"op": "eq", "col": "baby_id", "value": "b1"}],
            "order": [{"col": "feed_time", "ascending": False}],
            "count": True,
        },
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == 200
    assert body["data"] == [{"id": "r1", "baby_id": "b1"}]
    assert body["count"] == 42
    assert body["error"] is None
    # 回归：透传给 PostgREST 的 Authorization 不能出现 "Bearer Bearer" 双前缀
    assert forwarded["authorization"] == f"Bearer {JWT}"


def test_query_rejects_unknown_table() -> None:
    res = client.post(
        "/v1/db/tables/secrets/query",
        json={"filters": []},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403


def test_query_requires_jwt() -> None:
    res = client.post("/v1/db/tables/babies/query", json={"filters": []})
    assert res.status_code == 401


def test_insert_maps_single_row() -> None:
    res = client.post(
        "/v1/db/tables/babies/insert",
        json={"values": {"nickname": "宝宝"}, "single": "one"},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["data"] == {"id": "b-new"}
    assert body["error"] is None


def test_insert_privacy_consent_append_only() -> None:
    """隐私同意留痕（H2/H7）：登录/绑定手机号走网关留痕，只追加、无改删。"""
    res = client.post(
        "/v1/db/tables/privacy_consents/insert",
        json={"values": {"consent_type": "login", "policy_version": "2026-09"}},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == 200
    assert body["error"] is None

    res = client.post(
        "/v1/db/tables/privacy_consents/update",
        json={
            "values": {"policy_version": "2027-01"},
            "filters": [{"op": "eq", "col": "consent_type", "value": "login"}],
        },
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403

    res = client.post(
        "/v1/db/tables/privacy_consents/delete",
        json={"filters": [{"op": "eq", "col": "consent_type", "value": "login"}]},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403


def test_rpc_whitelist() -> None:
    res = client.post(
        "/v1/db/rpc/get_record_stats",
        json={"args": {}},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 200
    assert res.json()["data"] == {"total": 3, "days": 2}


def test_rpc_rejects_unknown_function() -> None:
    res = client.post(
        "/v1/db/rpc/dangerous_fn",
        json={"args": {}},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.status_code == 403
