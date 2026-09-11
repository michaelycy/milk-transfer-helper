"""FastAPI 应用入口：健康检查 + 鉴权 + 数据透传 + 管理端接口。"""
import asyncio
import contextlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin as admin_api
from app.api import ai as ai_api
from app.api import auth as auth_api
from app.api import data as data_api
from app.api import family as family_api
from app.core.api_log import ApiLogMiddleware, logger, purge_expired

_retention_task: asyncio.Task | None = None


async def _retention_loop() -> None:
    """api_logs 保留期清理（FR-J12）：启动即清一次，此后每 6 小时一轮。"""
    while True:
        try:
            await purge_expired()
        except Exception:  # noqa: BLE001 —— 清理失败只告警，不终止循环
            logger.exception("api_logs 保留期清理异常")
        await asyncio.sleep(6 * 3600)


@contextlib.asynccontextmanager
async def _lifespan(app: FastAPI):
    global _retention_task
    _retention_task = asyncio.create_task(_retention_loop())
    yield
    _retention_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await _retention_task


app = FastAPI(title="转奶日记 API", version="0.1.0", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# 请求日志（FR-J12）：置于 CORS 内侧，记录业务请求；写入失败不影响响应
app.add_middleware(ApiLogMiddleware)

app.include_router(auth_api.router)
app.include_router(data_api.router)
app.include_router(ai_api.router)
app.include_router(ai_api.admin_router)
app.include_router(admin_api.router)
app.include_router(family_api.router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
