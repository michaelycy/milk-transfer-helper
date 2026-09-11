"""鉴权接口：匿名登录 / 微信登录 / 刷新 / 登出 / 当前用户。

微信登录移植自 supabase/functions/wechat-login（FR-H1）：
code2session → 按 openid 找/建正式账号 → 匿名数据无损迁移 → 签发会话。
"""
import hashlib
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query

from app.core.config import get_settings
from app.core.supabase import gotrue, postgrest, wechat_code2session

router = APIRouter(prefix="/v1/auth", tags=["auth"])


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

    # 2. 按 openid 找已有用户；没有则建号 + 迁移匿名数据（幂等）。
    #    GoTrue 新版要求用户必须带 email 或 phone：使用确定性 email {openid}@wechat.local；
    #    会话签发走 password grant（项目开启 Mailer autoconfirm 后 magiclink 不再返回 OTP），
    #    密码由 openid + service_role 派生、不落任何存储。
    email = f"{openid}@wechat.local"
    password = hashlib.sha256(
        f"wechat-login:{openid}:{settings.supabase_service_role_key}".encode()
    ).hexdigest()[:32]
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
            json_body={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"provider": "wechat", "openid": openid},
            },
        )
        if created.status >= 400:
            body = created.body if isinstance(created.body, dict) else {}
            msg = str(body.get("msg") or body.get("message") or body.get("error") or "")
            # 幂等恢复：auth 用户已存在（此前建号成功但 users 行缺失）→ 明确报错便于排查
            if created.status == 422 and ("already" in msg or "registered" in msg or "exists" in msg):
                return {
                    "status": 500,
                    "body": {"error": "create failed", "detail": "user exists but users row missing"},
                }
            return {"status": 500, "body": {"error": "create failed", "detail": body}}
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

    # 3. password grant 签发会话；失败时重置派生密码后自愈重试一次
    grant = await gotrue(
        "POST",
        "/token?grant_type=password",
        json_body={"email": email, "password": password},
    )
    if grant.status >= 400 and user_id:
        await gotrue(
            "PUT",
            f"/admin/users/{user_id}",
            service_role=True,
            json_body={"password": password},
        )
        grant = await gotrue(
            "POST",
            "/token?grant_type=password",
            json_body={"email": email, "password": password},
        )
    if grant.status >= 400:
        body = grant.body if isinstance(grant.body, dict) else {}
        return {"status": 500, "body": {"error": "session failed", "detail": body}}
    return {"status": 200, "body": {"session": grant.body}}


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
async def me(
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
    jwt_query: Annotated[str | None, Query(alias="jwt")] = None,
) -> dict[str, Any]:
    """校验会话并返回用户对象（小程序 setSession 专用：JWT 走 Authorization 头）。

    兼容旧 ?jwt= 查询参数；会话无效时透传 GoTrue 状态码（401 等），不以 200 信封返回。
    响应体为 GoTrue 用户对象本身（调用方直接当作 user 使用）。
    """
    token = (jwt_header or "").removeprefix("Bearer ").strip() or (jwt_query or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="缺少会话凭证")
    res = await gotrue("GET", "/user", jwt=token)
    if res.status >= 400:
        raise HTTPException(status_code=res.status, detail=res.body)
    return res.body
