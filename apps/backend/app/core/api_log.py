"""API 请求运行日志（FR-J12）：中间件落库 api_logs，供管理端 /v1/admin/logs 排查查询。

约定（docs/spec/05-api-guidelines.md §4）：
- 每请求生成 request_id（UUID）并回写响应头 X-Request-Id；
- level：5xx 或异常=error、4xx=warn、其余=info；message 仅异常摘要（≤500 字）；
- 不记录请求体/响应体/authorization（NFR-2）；/healthz 与 CORS 预检不记录；
- 写入为后台异步任务，失败仅 stderr 告警，绝不影响业务请求；
- 保留期 API_LOG_RETENTION_DAYS（默认 30 天），超期由 purge_expired() 定时清理。
"""
import asyncio
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings
from app.core.deps import bearer_of, jwt_sub
from app.core.supabase import postgrest

logger = logging.getLogger("api_log")

SKIP_PATHS = {"/healthz"}
_MESSAGE_MAX = 500

# 持有后台写日志任务的强引用，防止任务被垃圾回收
_background: set[asyncio.Task[None]] = set()


def build_log_row(
    *,
    request_id: str,
    method: str,
    path: str,
    status: int,
    duration_ms: int,
    user_id: str | None,
    message: str | None = None,
) -> dict[str, object]:
    """组装一行日志（纯函数，便于测试）；level 由状态码/异常推导。"""
    level = "error" if (status >= 500 or message) else ("warn" if status >= 400 else "info")
    return {
        "request_id": request_id,
        "method": method,
        "path": path[:200],
        "status": status,
        "level": level,
        "duration_ms": duration_ms,
        "user_id": user_id,
        "message": message[:_MESSAGE_MAX] if message else None,
    }


async def write_log(row: dict[str, object]) -> None:
    """service_role 写入 api_logs；任何失败只告警不抛出（排障通道不可拖垮业务）。"""
    try:
        res = await postgrest(
            "POST", "/api_logs",
            jwt=get_settings().supabase_service_role_key,
            json_body=row,
        )
        if res.status >= 400:
            logger.warning("api_logs 写入被拒 HTTP %s: %s", res.status, res.data)
    except Exception:  # noqa: BLE001 —— 日志通道必须零抛出
        logger.exception("api_logs 写入失败")


def fire_and_forget(row: dict[str, object]) -> None:
    """调度后台写入；宿主事件循环关闭时未决任务自然丢弃。"""
    try:
        task = asyncio.create_task(write_log(row))
        _background.add(task)
        task.add_done_callback(_background.discard)
    except RuntimeError:  # 无运行中事件循环（极端场景）：放弃本条日志
        pass


async def purge_expired() -> None:
    """删除早于保留期（API_LOG_RETENTION_DAYS，默认 30 天）的日志行。"""
    import datetime as dt

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(
        days=int(get_settings().api_log_retention_days)
    )
    res = await postgrest(
        "DELETE", "/api_logs",
        jwt=get_settings().supabase_service_role_key,
        params={"created_at": f"lt.{cutoff.isoformat()}"},
    )
    if res.status >= 400:
        logger.warning("api_logs 清理失败 HTTP %s", res.status)


class ApiLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        settings = get_settings()
        if (
            not settings.api_log_enabled
            or request.method == "OPTIONS"
            or request.url.path in SKIP_PATHS
        ):
            return await call_next(request)

        request_id = str(uuid.uuid4())
        started = time.monotonic()
        failure: str | None = None
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001 —— 记录后原样上抛交给 ServerErrorMiddleware
            failure = f"{type(exc).__name__}: {exc}"
            await write_log(
                build_log_row(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status=500,
                    duration_ms=int((time.monotonic() - started) * 1000),
                    user_id=jwt_sub(bearer_of(request.headers.get("authorization")) or ""),
                    message=failure,
                )
            )
            raise
        duration_ms = int((time.monotonic() - started) * 1000)
        response.headers["x-request-id"] = request_id
        if response.status_code >= 500:
            # 5xx 已是确定性故障：同步落库保证可查（4xx/2xx 走后台通道不阻塞响应）
            await write_log(
                build_log_row(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status=response.status_code,
                    duration_ms=duration_ms,
                    user_id=jwt_sub(bearer_of(request.headers.get("authorization")) or ""),
                )
            )
        else:
            fire_and_forget(
                build_log_row(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status=response.status_code,
                    duration_ms=duration_ms,
                    user_id=jwt_sub(bearer_of(request.headers.get("authorization")) or ""),
                )
            )
        return response
