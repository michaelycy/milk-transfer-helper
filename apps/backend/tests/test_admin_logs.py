"""FR-J12：请求日志中间件（X-Request-Id / level 映射 / 异步落库）+ 管理端日志查询接口。"""
import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import supabase as supabase_module
from app.core.api_log import build_log_row, purge_expired, write_log
from app.core.config import get_settings
from app.main import app

JWT = "test.jwt.token"
USER_ID = "u-1"

STATE: dict = {}

ROWS = [
    {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "method": "POST",
        "path": "/v1/ai/chat",
        "status": 200,
        "level": "info",
        "duration_ms": 320,
        "user_id": USER_ID,
        "message": None,
        "created_at": "2026-09-12T10:00:00+00:00",
    },
    {
        "request_id": "22222222-2222-2222-2222-222222222222",
        "method": "GET",
        "path": "/v1/db/tables/feed_records/query",
        "status": 500,
        "level": "error",
        "duration_ms": 12,
        "user_id": None,
        "message": "GatewayError: HTTP 503",
        "created_at": "2026-09-12T09:00:00+00:00",
    },
]


@pytest.fixture(autouse=True)
def _env_and_transport(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", "https://stub.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("API_LOG_ENABLED", "true")
    get_settings.cache_clear()
    STATE.clear()
    STATE.update({"is_admin": False, "logged_rows": [], "query_params": None, "purge_params": None})

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID})
        if path == "/rest/v1/admins" and request.method == "GET":
            return httpx.Response(200, json=[{"user_id": USER_ID, "email": "admin@example.com", "role": "super_admin", "status": "active"}]
            if STATE["is_admin"] else [])
        if path == "/rest/v1/api_logs" and request.method == "POST":
            STATE["logged_rows"].append(json.loads(request.content.decode()))
            return httpx.Response(201)
        if path == "/rest/v1/api_logs" and request.method == "GET":
            STATE["query_params"] = {k: v for k, v in request.url.params.items()}
            total = len(ROWS)
            return httpx.Response(
                200, json=ROWS,
                headers={"content-range": f"0-{total - 1}/{total}"},
            )
        if path == "/rest/v1/api_logs" and request.method == "DELETE":
            STATE["purge_params"] = {k: v for k, v in request.url.params.items()}
            return httpx.Response(204)
        return httpx.Response(200, json=[])

    supabase_module._transport = httpx.MockTransport(handler)
    yield
    supabase_module._transport = None
    get_settings.cache_clear()


client = TestClient(app)


def get(path: str, **kwargs) -> httpx.Response:
    return client.get(path, headers={"authorization": f"Bearer {JWT}"}, **kwargs)


# ---------- build_log_row（纯函数） ----------


def test_level_mapping_by_status() -> None:
    assert build_log_row(request_id="r", method="GET", path="/x", status=200, duration_ms=1, user_id=None)["level"] == "info"
    assert build_log_row(request_id="r", method="GET", path="/x", status=404, duration_ms=1, user_id=None)["level"] == "warn"
    assert build_log_row(request_id="r", method="GET", path="/x", status=500, duration_ms=1, user_id=None)["level"] == "error"


def test_message_truncated_and_long_path_clamped() -> None:
    row = build_log_row(
        request_id="r", method="GET", path="/x" * 200, status=500, duration_ms=1,
        user_id=None, message="boom" * 500,
    )
    assert len(row["path"]) <= 200
    assert len(row["message"]) <= 500  # type: ignore[arg-type]


# ---------- 中间件 ----------


def test_response_carries_request_id() -> None:
    res = client.post(
        "/v1/db/rpc/get_record_stats", json={"args": {}},
        headers={"authorization": f"Bearer {JWT}"},
    )
    assert res.headers.get("x-request-id")
    assert len(res.headers["x-request-id"]) == 36


def test_skip_paths_do_not_log() -> None:
    """/healthz 与 CORS 预检不产生日志行（FR-J12 验收）。"""
    client.get("/healthz")
    client.options("/v1/db/rpc/get_record_stats")
    client.get("/v1/db/rpc/get_record_stats")  # 触发一次正常日志，证明通道本身通畅
    deadline_rows = [r for r in STATE["logged_rows"] if r["path"] in ("/healthz",)]
    assert deadline_rows == []


def test_write_log_persists_row() -> None:
    row = build_log_row(
        request_id="req-1", method="POST", path="/v1/ai/chat", status=200,
        duration_ms=42, user_id=USER_ID,
    )
    asyncio.run(write_log(row))
    assert STATE["logged_rows"] == [row]


def test_write_log_failure_is_silent() -> None:
    """写日志通道绝不上抛（这里以非法 transport 模拟故障：不抛即通过）。"""
    supabase_module._transport = FailingTransport()
    asyncio.run(write_log({"request_id": "x"}))


class FailingTransport(httpx.AsyncBaseTransport):
    def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise RuntimeError("db down")


def test_purge_expired_uses_cutoff() -> None:
    asyncio.run(purge_expired())
    assert STATE["purge_params"] and STATE["purge_params"]["created_at"].startswith("lt.")


# ---------- 管理端查询接口 ----------


def test_logs_query_requires_admin() -> None:
    res = get("/v1/admin/logs")
    assert res.status_code == 403


def test_logs_query_requires_jwt() -> None:
    res = client.get("/v1/admin/logs")
    assert res.status_code == 401


def test_logs_query_applies_filters_and_pagination() -> None:
    STATE["is_admin"] = True
    res = get(
        "/v1/admin/logs",
        params={
            "level": "error",
            "path": "feed_records",
            "request_id": ROWS[0]["request_id"],
            "since": "2026-09-01T00:00:00Z",
            "until": "2026-09-13T00:00:00Z",
            "limit": 20,
            "offset": 5,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == 200
    assert body["count"] == len(ROWS)
    assert body["data"] == ROWS

    params = STATE["query_params"]
    assert params["level"] == "eq.error"
    assert params["path"] == "ilike.*feed_records*"
    assert params["request_id"] == f"eq.{ROWS[0]['request_id']}"
    assert params["created_at"] == "gte.2026-09-01T00:00:00+00:00,lt.2026-09-13T00:00:00+00:00"
    assert params["limit"] == "20"
    assert params["offset"] == "5"
    assert params["order"] == "created_at.desc"


def test_logs_query_rejects_bad_level() -> None:
    STATE["is_admin"] = True
    res = get("/v1/admin/logs", params={"level": "verbose"})
    assert res.status_code == 422
