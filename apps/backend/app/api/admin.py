"""管理端专用接口（/v1/admin/**，FR-J9/J10/J11/J12）。

路径契约见 docs/spec/05-api-guidelines.md §2——管理端能力与 C 端物理隔离，
鉴权 = 用户 JWT（GoTrue）+ admins 角色×权限点（FR-J8 主裁决，DB has_permission 同源矩阵）；
数据经 service_role 读取，绕过 RLS 的每一条路径必须先过权限依赖（NFR-7）。
"""
import datetime as dt
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import (
    ROLE_PERMISSIONS,
    admin_role_of,
    require_admin,
    require_admin_permission,
    require_jwt,
    write_audit,
)
from app.core.supabase import gotrue, postgrest

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


def _embed_count(row: dict, rel: str) -> int:
    """PostgREST 内嵌聚合（rel(count)）→ 整数。"""
    v = row.get(rel)
    if isinstance(v, list) and v and isinstance(v[0], dict):
        return int(v[0].get("count") or 0)
    if isinstance(v, dict):
        return int(v.get("count") or 0)
    return 0


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


# ---------- FR-J8：当前管理员身份与权限点（前端菜单/路由守卫渲染依据） ----------
@router.get("/me")
async def me(
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    token = require_jwt(jwt)
    user_id = await require_admin_permission(token, "dashboard:read")
    row = await admin_role_of(user_id)
    role = str((row or {}).get("role") or "")
    return {
        "status": 200,
        "data": {
            "user_id": user_id,
            "email": (row or {}).get("email"),
            "role": role,
            "permissions": ROLE_PERMISSIONS.get(role, []),
        },
        "error": None,
    }


# ---------- FR-J9：管理员账号管理（admin:manage，仅 super_admin） ----------
class InviteBody(BaseModel):
    email: str
    role: str = "operator"


class AdminPatchBody(BaseModel):
    role: str | None = None
    status: str | None = None


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("/admins")
async def list_admins(
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    await require_admin_permission(require_jwt(jwt), "admin:manage")
    res = await postgrest(
        "GET", "/admins",
        jwt=get_settings().supabase_service_role_key,
        params={"select": "user_id,email,role,status,created_at", "order": "created_at"},
    )
    rows = res.data if isinstance(res.data, list) else []
    return {"status": 200, "data": rows, "error": None}


@router.post("/admins/invite")
async def invite_admin(
    body: InviteBody,
    request: Request,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    actor, _ = await require_admin_permission(require_jwt(jwt), "admin:manage")
    email = body.email.strip().lower()
    if body.role not in ("super_admin", "operator", "analyst"):
        raise HTTPException(status_code=400, detail="非法角色")
    # 已在管理员表 → 幂等返回
    existing = await postgrest(
        "GET", "/admins", jwt=get_settings().supabase_service_role_key,
        params={"email": f"eq.{email}", "select": "user_id,email,role,status", "limit": "1"},
    )
    erows = existing.data if isinstance(existing.data, list) else []
    if erows:
        return {"status": 200, "data": erows[0], "error": None}
    # 邮箱邀请（service_role）；已注册但邀请失败时尽力按邮箱定位账号
    inv = await gotrue("POST", "/admin/invite", service_role=True, json_body={"email": email})
    user_id = ""
    if inv.status < 400 and isinstance(inv.body, dict):
        user_id = str(inv.body.get("id") or "")
    else:
        listing = await gotrue(
            "GET", "/admin/users", service_role=True,
        )
        candidates = listing.body.get("users", []) if isinstance(listing.body, dict) else []
        for u in candidates:
            if str(u.get("email", "")).lower() == email:
                user_id = str(u.get("id") or "")
                break
        if not user_id:
            raise HTTPException(
                status_code=409,
                detail="邀请邮件发送失败且未能定位已有账号；请在 Supabase Dashboard 建号后重试",
            )
    created = await postgrest(
        "POST", "/admins", jwt=get_settings().supabase_service_role_key,
        json_body={"user_id": user_id, "email": email, "role": body.role},
        prefer="resolution=merge-duplicates,return=representation",
    )
    rows = created.data if isinstance(created.data, list) else []
    row = rows[0] if rows else None
    await write_audit(actor, "admin.invite", "admins", user_id, {"email": email, "role": body.role}, _client_ip(request))
    return {"status": 200, "data": row, "error": None}


@router.patch("/admins/{target_user_id}")
async def update_admin(
    target_user_id: str,
    body: AdminPatchBody,
    request: Request,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    actor, _ = await require_admin_permission(require_jwt(jwt), "admin:manage")
    if target_user_id == actor:
        raise HTTPException(status_code=400, detail="不能修改自己的角色或状态")
    patch: dict[str, Any] = {}
    if body.role is not None:
        if body.role not in ("super_admin", "operator", "analyst"):
            raise HTTPException(status_code=400, detail="非法角色")
        patch["role"] = body.role
    if body.status is not None:
        if body.status not in ("active", "disabled"):
            raise HTTPException(status_code=400, detail="非法状态")
        patch["status"] = body.status
    if not patch:
        raise HTTPException(status_code=400, detail="无可更新字段")
    # 最后一个 active super_admin 保护由 DB 触发器兜底（迁移 20260912120000）
    res = await postgrest(
        "PATCH", "/admins", jwt=get_settings().supabase_service_role_key,
        params={"user_id": f"eq.{target_user_id}"},
        json_body=patch, prefer="return=representation",
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        raise HTTPException(status_code=404, detail="管理员不存在")
    await write_audit(actor, "admin.update", "admins", target_user_id, patch, _client_ip(request))
    return {"status": 200, "data": rows[0], "error": None}


@router.delete("/admins/{target_user_id}")
async def remove_admin(
    target_user_id: str,
    request: Request,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    actor, _ = await require_admin_permission(require_jwt(jwt), "admin:manage")
    if target_user_id == actor:
        raise HTTPException(status_code=400, detail="不能移除自己")
    res = await postgrest(
        "DELETE", "/admins", jwt=get_settings().supabase_service_role_key,
        params={"user_id": f"eq.{target_user_id}"},
    )
    if res.status >= 400:
        raise HTTPException(status_code=502, detail="删除失败（最后一个超级管理员受 DB 触发器保护）")
    await write_audit(actor, "admin.remove", "admins", target_user_id, None, _client_ip(request))
    return {"status": 200, "data": {"removed": target_user_id}, "error": None}


# ---------- FR-J10：C 端用户只读查询（user:read，仅 super_admin；每次查询留痕） ----------
def mask_openid(openid: str | None) -> str | None:
    if not openid:
        return None
    if len(openid) <= 8:
        return openid[:2] + "…" + openid[-2:]
    return openid[:4] + "…" + openid[-4:]


@router.get("/users")
async def query_users(
    request: Request,
    openid: Annotated[str | None, Query(max_length=64)] = None,
    since: Annotated[dt.datetime | None, Query()] = None,
    until: Annotated[dt.datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    actor, _ = await require_admin_permission(require_jwt(jwt), "user:read")
    params: dict[str, str] = {
        "select": "id,openid,nickname,created_at,babies(count),feed_records(count),transfer_plans(count)",
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if openid:
        params["openid"] = f"eq.{openid}"
    if since:
        params["created_at"] = f"gte.{since.isoformat()}"
    if until:
        params["created_at"] = f"lt.{until.isoformat()}"
    res = await postgrest(
        "GET", "/users", jwt=get_settings().supabase_service_role_key,
        params=params, prefer="count=exact",
    )
    rows = res.data if isinstance(res.data, list) else []
    data = [
        {
            "id": str(r.get("id")),
            "openid_masked": mask_openid(str(r.get("openid") or "")),
            "nickname": r.get("nickname"),
            "created_at": r.get("created_at"),
            "baby_count": _embed_count(r, "babies"),
            "record_count": _embed_count(r, "feed_records"),
            "plan_count": _embed_count(r, "transfer_plans"),
        }
        for r in rows
    ]
    await write_audit(
        actor, "users.query", "users", None,
        {"openid": bool(openid), "since": str(since) if since else None}, _client_ip(request),
    )
    error = {"message": f"HTTP {res.status}"} if res.status >= 400 else None
    return {"status": res.status, "data": data, "error": error, "count": _parse_count(res.headers.get("content-range"))}


@router.get("/users/{user_id}")
async def user_profile(
    user_id: str,
    request: Request,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    actor, _ = await require_admin_permission(require_jwt(jwt), "user:read")
    service = get_settings().supabase_service_role_key
    res = await postgrest(
        "GET", "/users", jwt=service,
        params={"user_id": f"eq.{user_id}", "select": "id,openid,nickname,created_at,phone_hash", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        raise HTTPException(status_code=404, detail="用户不存在")
    row = rows[0]
    feeds = await postgrest(
        "GET", "/feed_records", jwt=service,
        params={"user_id": f"eq.{user_id}", "select": "id", "limit": "1"}, prefer="count=exact",
    )
    events = await postgrest(
        "GET", "/analytics_events", jwt=service,
        params={"user_id": f"eq.{user_id}", "select": "occurred_at", "order": "occurred_at.desc", "limit": "1"},
    )
    ev_rows = events.data if isinstance(events.data, list) else []
    await write_audit(actor, "users.profile", "users", user_id, None, _client_ip(request))
    return {
        "status": 200,
        "data": {
            "id": str(row.get("id")),
            "openid_masked": mask_openid(str(row.get("openid") or "")),
            "nickname": row.get("nickname"),
            "created_at": row.get("created_at"),
            "phone_bound": bool(row.get("phone_hash")),
            "record_count": _parse_count(feeds.headers.get("content-range")) or 0,
            "last_active": (ev_rows[0] or {}).get("occurred_at") if ev_rows else None,
        },
        "error": None,
    }


# ---------- FR-J11：操作审计查询（audit:read；analyst 可查看以形成监督） ----------
@router.get("/audit-logs")
async def query_audit_logs(
    action: Annotated[str | None, Query(max_length=50)] = None,
    actor: Annotated[str | None, Query(max_length=64)] = None,
    since: Annotated[dt.datetime | None, Query()] = None,
    until: Annotated[dt.datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    await require_admin_permission(require_jwt(jwt), "audit:read")
    params: dict[str, str] = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if action:
        params["action"] = f"eq.{action}"
    if actor:
        params["actor_user_id"] = f"eq.{actor}"
    if since and until:
        params["created_at"] = f"gte.{since.isoformat()},lt.{until.isoformat()}"
    elif since:
        params["created_at"] = f"gte.{since.isoformat()}"
    elif until:
        params["created_at"] = f"lt.{until.isoformat()}"
    res = await postgrest(
        "GET", "/admin_audit_logs", jwt=get_settings().supabase_service_role_key,
        params=params, prefer="count=exact",
    )
    error = {"message": f"HTTP {res.status}"} if res.status >= 400 else None
    return {"status": res.status, "data": res.data, "error": error, "count": _parse_count(res.headers.get("content-range"))}
