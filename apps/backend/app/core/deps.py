"""统一鉴权依赖：JWT 校验 / 当前用户 / 管理员判定（客户端与管理端端点共用）。"""
from typing import Any

from fastapi import HTTPException

from app.core.config import get_settings
from app.core.supabase import gotrue, postgrest


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


async def require_admin(jwt: str) -> str:
    """管理员白名单校验（管理端 /v1/admin/** 专用）；通过则返回用户 id。"""
    user_id = await current_user(jwt)
    service = get_settings().supabase_service_role_key
    res = await postgrest(
        "GET", "/admins", jwt=service,
        params={"user_id": f"eq.{user_id}", "select": "user_id", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user_id


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
