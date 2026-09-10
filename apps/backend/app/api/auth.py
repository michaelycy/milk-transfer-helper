"""鉴权接口：匿名登录 / 微信登录 / 刷新 / 登出 / 当前用户。

微信登录移植自 supabase/functions/wechat-login（FR-H1）：
code2session → 按 openid 找/建正式账号 → 匿名数据无损迁移 → 签发会话。
"""
from typing import Any

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.supabase import gotrue, postgrest, wechat_code2session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/anonymous")
async def anonymous() -> dict[str, Any]:
    """匿名登录：GoTrue signup 空载荷即创建匿名用户并返回会话。"""
    res = await gotrue("POST", "/signup", json_body={})
    return {"status": res.status, "body": res.body}


@router.post("/wechat")
async def wechat(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    code = str(payload.get("code", ""))
    anonymous_user_id = payload.get("anonymousUserId")
    if not code:
        return {"status": 400, "body": {"error": "missing code"}}

    # 1. code2session 换 openid
    wx = await wechat_code2session(code)
    openid = wx.get("openid")
    if not openid:
        return {"status": 401, "body": {"error": "wechat auth failed", "detail": wx}}

    # 2. 按 openid 找已有用户；没有则建号 + 迁移匿名数据（幂等）
    existing = await postgrest(
        "GET",
        "/users",
        jwt=settings.supabase_service_role_key,
        params={"select": "id", "openid": f"eq.{openid}", "limit": "1"},
    )
    rows = existing.data if isinstance(existing.data, list) else []
    if rows:
        user_id = str(rows[0]["id"])
    else:
        created = await gotrue(
            "POST",
            "/admin/users",
            service_role=True,
            json_body={"user_metadata": {"provider": "wechat", "openid": openid}},
        )
        if created.status >= 400:
            return {"status": 500, "body": {"error": created.body.get("message", "create failed")}}
        user_id = str(created.body["id"])
        await postgrest(
            "POST",
            "/users",
            jwt=settings.supabase_service_role_key,
            json_body={"id": user_id, "openid": openid},
            prefer="resolution=merge-duplicates",
        )
        if anonymous_user_id:
            for table in settings.migrate_tables:
                await postgrest(
                    "PATCH",
                    f"/{table}",
                    jwt=settings.supabase_service_role_key,
                    params={"user_id": f"eq.{anonymous_user_id}"},
                    json_body={"user_id": user_id},
                )
            await gotrue(
                "DELETE", f"/admin/users/{anonymous_user_id}", service_role=True
            )

    # 3. magiclink 签发会话（与 Edge Function 同款机制）
    email = f"{user_id}@wechat.local"
    link = await gotrue(
        "POST",
        "/admin/generate_link",
        service_role=True,
        json_body={"type": "magiclink", "email": email},
    )
    if link.status >= 400 or not link.body.get("properties"):
        return {"status": 500, "body": {"error": "sign-in failed"}}
    hashed_token = link.body["properties"]["hashed_token"]
    verify = await gotrue(
        "POST", "/verify", json_body={"type": "magiclink", "email": email, "token": hashed_token}
    )
    session = verify.body.get("session") or verify.body
    if verify.status >= 400 or not session.get("access_token"):
        return {"status": 500, "body": {"error": "session failed"}}
    return {"status": 200, "body": {"session": session}}


@router.post("/refresh")
async def refresh(payload: dict[str, Any]) -> dict[str, Any]:
    res = await gotrue("POST", "/token?grant_type=refresh_token", json_body=payload)
    return {"status": res.status, "body": res.body}


@router.post("/logout")
async def logout(payload: dict[str, Any]) -> dict[str, Any]:
    access_token = str(payload.get("access_token", ""))
    if access_token:
        await gotrue("POST", "/logout?scope=global", jwt=access_token)
    return {"status": 204, "body": {}}


@router.get("/me")
async def me(jwt: str) -> dict[str, Any]:
    res = await gotrue("GET", "/user", jwt=jwt)
    return {"status": res.status, "body": res.body}
