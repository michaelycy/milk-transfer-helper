"""统一鉴权依赖：JWT 校验 / 当前用户 / 管理员角色与权限点判定（FR-J8，双裁决·应用层为主）。

权限矩阵以 DB 端 has_permission() 为唯一裁决事实源（NFR-7）；此处矩阵为同一份常量的
Python 镜像，仅用于后端主裁决与前端渲染口径一致（一致性由测试锁定）。
"""
from typing import Any

from fastapi import HTTPException

from app.core.config import get_settings
from app.core.supabase import gotrue, postgrest

# 角色 → 权限点（默认拒绝：未列出的动作一律拒绝；与迁移 20260912120000 的
# has_permission() 保持同源，修改必须两侧同步 + pytest 一致性用例）
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "super_admin": [
        "dashboard:read",
        "milk:write",
        "article:write",
        "template:write",
        "ai:config",
        "ai:key",
        "user:read",
        "admin:manage",
        "audit:read",
    ],
    "operator": [
        "dashboard:read",
        "milk:write",
        "article:write",
        "template:write",
        "ai:config",
    ],
    "analyst": ["dashboard:read", "audit:read"],
}

ADMIN_ROLES = ("super_admin", "operator", "analyst")


def require_jwt(authorization: str | None) -> str:
    """校验并剥掉 Bearer 前缀，返回裸 token（postgrest() 内层会统一再包装）。"""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="缺少会话凭证")
    return token


async def current_user(jwt: str) -> str:
    """经 GoTrue 校验会话并返回用户 id；无效一律 401。"""
    res = await gotrue("GET", "/user", jwt=jwt)
    user = res.body.get("id") if res.status < 400 else None
    if not user:
        raise HTTPException(status_code=401, detail="会话无效")
    return str(user)


async def admin_role_of(user_id: str) -> dict[str, Any] | None:
    """service_role 读取管理员的 role/status（无行 = 非管理员）。"""
    service = get_settings().supabase_service_role_key
    res = await postgrest(
        "GET", "/admins", jwt=service,
        params={"user_id": f"eq.{user_id}", "select": "user_id,email,role,status", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    return rows[0] if rows else None


async def require_admin(jwt: str) -> str:
    """管理员校验（任一 active 角色，兼容旧调用点）；通过则返回用户 id。"""
    user_id = await current_user(jwt)
    row = await admin_role_of(user_id)
    if not row or row.get("status") != "active":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user_id


async def require_admin_permission(jwt: str, action: str) -> tuple[str, str]:
    """FR-J8 权限点校验（主裁决）：返回 (user_id, role)；无权限一律 403。"""
    user_id = await current_user(jwt)
    row = await admin_role_of(user_id)
    if not row or row.get("status") != "active":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    role = str(row.get("role") or "")
    if action not in ROLE_PERMISSIONS.get(role, []):
        raise HTTPException(status_code=403, detail=f"缺少权限：{action}")
    return user_id, role


async def write_audit(
    actor: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """管理审计（FR-J11）：只追加，写入失败仅告警、绝不影响业务响应。"""
    body: dict[str, Any] = {"actor_user_id": actor, "action": action}
    if target_type:
        body["target_type"] = target_type
    if target_id:
        body["target_id"] = target_id
    if detail is not None:
        body["detail"] = detail
    if ip:
        body["ip"] = ip
    try:
        service = get_settings().supabase_service_role_key
        await postgrest("POST", "/admin_audit_logs", jwt=service, json_body=body)
    except Exception:  # noqa: BLE001 —— 审计失败不阻塞业务
        import logging

        logging.getLogger("uvicorn.error").warning("admin_audit_logs 写入失败 action=%s", action)


def bearer_of(authorization: str | None) -> str | None:
    """宽松取 token（不做存在性校验）：日志归因等非鉴权场景使用。"""
    token = (authorization or "").removeprefix("Bearer ").strip()
    return token or None


def jwt_sub(token: str) -> str | None:
    """从 JWT 载荷解出 sub（不验签：仅日志归因用，鉴权一律走 current_user）。"""
    import base64
    import json

    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims: dict[str, Any] = json.loads(base64.urlsafe_b64decode(payload))
        sub = claims.get("sub")
        return str(sub) if sub else None
    except Exception:  # noqa: BLE001 —— 归因失败静默返回，绝不影响主流程
        return None
