"""管理端专用接口（/v1/admin/**，FR-J12）：运行日志只读查询。

路径契约见 docs/spec/05-api-guidelines.md §2——管理端能力与 C 端物理隔离，
鉴权 = 用户 JWT（GoTrue）+ admins 白名单；数据经 service_role 读取 api_logs。
"""
import datetime as dt
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, Query
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import require_admin, require_jwt
from app.core.supabase import postgrest

router = APIRouter(prefix="/v1/admin", tags=["admin"])


class ApiLogRow(BaseModel):
    request_id: str
    method: str
    path: str
    status: int
    level: str
    duration_ms: int | None = None
    user_id: str | None = None
    message: str | None = None
    created_at: str | None = None


def _parse_count(content_range: str | None) -> int | None:
    """Content-Range: 0-49/173 → 173"""
    if not content_range or "/" not in content_range:
        return None
    total = content_range.rsplit("/", 1)[-1]
    return int(total) if total.isdigit() else None


@router.get("/logs")
async def query_logs(
    level: Annotated[Literal["info", "warn", "error"] | None, Query()] = None,
    path: Annotated[str | None, Query(max_length=100)] = None,
    request_id: Annotated[str | None, Query(max_length=64)] = None,
    since: Annotated[dt.datetime | None, Query()] = None,
    until: Annotated[dt.datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """运行日志检索（时间倒序 + 总数）：request_id 精确、路径模糊、级别/时间窗过滤。"""
    token = require_jwt(jwt)
    await require_admin(token)

    params: dict[str, str] = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if level:
        params["level"] = f"eq.{level}"
    if path:
        params["path"] = f"ilike.*{path}*"
    if request_id:
        params["request_id"] = f"eq.{request_id}"
    if since and until:
        params["created_at"] = f"gte.{since.isoformat()},lt.{until.isoformat()}"
    elif since:
        params["created_at"] = f"gte.{since.isoformat()}"
    elif until:
        params["created_at"] = f"lt.{until.isoformat()}"

    res = await postgrest(
        "GET", "/api_logs",
        jwt=get_settings().supabase_service_role_key,
        params=params,
        prefer="count=exact",
    )
    error = None
    data: Any = res.data
    count = _parse_count(res.headers.get("content-range"))
    if res.status >= 400:
        error = {"message": f"HTTP {res.status}"}
        data = None
    return {"status": res.status, "data": data, "error": error, "count": count}
