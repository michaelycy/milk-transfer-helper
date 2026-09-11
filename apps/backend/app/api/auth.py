"""鉴权与账户接口：匿名登录 / 微信登录 / 刷新 / 登出 / 当前用户 / 资料 / 手机号（H6/H7）。

微信登录移植自 supabase/functions/wechat-login（FR-H1）：
code2session → 按 openid 找/建正式账号 → 匿名数据无损迁移 → 签发会话。
"""
import hashlib
import time
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.secret_box import SecretBox
from app.core.supabase import gotrue, postgrest, wechat_code2session

router = APIRouter(prefix="/v1/auth", tags=["auth"])

_wx_token_cache: tuple[str, float] = ("", 0.0)
PHONE_CONSENT_VERSION = "2026-09"


class ProfileBody(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    avatar_url: str | None = Field(default=None, max_length=500)


class PhoneBindBody(BaseModel):
    phone_code: str = Field(min_length=1, max_length=64)
    consent_version: str = PHONE_CONSENT_VERSION


async def _wx_access_token() -> str:
    """小程序接口调用凭证（稳定 token），进程内缓存至过期前 5 分钟。"""
    global _wx_token_cache
    token, expires_at = _wx_token_cache
    if token and time.monotonic() < expires_at:
        return token
    import httpx

    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wechat_appid,
                "secret": settings.wechat_secret,
            },
        )
    body = res.json()
    token = str(body.get("access_token") or "")
    if not token:
        raise HTTPException(status_code=502, detail=f"获取微信凭证失败：{body.get('errmsg')}")
    _wx_token_cache = (token, time.monotonic() + int(body.get("expires_in", 7200)) - 300)
    return token


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


@router.patch("/profile")
async def update_profile(
    body: ProfileBody,
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """用户资料（FR-H6）：昵称 ≤ 20 字、头像 URL；仅本人。"""
    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    patch: dict[str, Any] = {}
    if body.nickname is not None:
        patch["nickname"] = body.nickname.strip()
    if body.avatar_url is not None:
        patch["avatar"] = body.avatar_url
    if not patch:
        return {"status": 200, "body": {"updated": False}}
    settings = get_settings()
    res = await postgrest(
        "PATCH", "/users", jwt=settings.supabase_service_role_key,
        params={"id": f"eq.{uid}"}, json_body=patch, prefer="return=representation",
    )
    rows = res.data if isinstance(res.data, list) else []
    if res.status >= 400 or not rows:
        raise HTTPException(status_code=502, detail="资料更新失败")
    row = rows[0]
    return {"status": 200, "body": {"nickname": row.get("nickname"), "avatar": row.get("avatar")}}


def require_jwt_token(authorization: str | None) -> str:
    from app.core.deps import require_jwt

    return require_jwt(authorization)


async def _current(token: str) -> str:
    from app.core.deps import current_user

    return await current_user(token)


@router.post("/phone/bind")
async def bind_phone(
    body: PhoneBindBody,
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """手机号绑定（FR-H7）：微信快捷授权 code 换号 → 哈希指纹唯一 + AES-GCM 密文存储。

    完整手机号不出后端；响应仅含脱敏展示。绑定行为与单独同意分别留痕。
    """
    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    settings = get_settings()

    access = await _wx_access_token()
    import httpx

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            "https://api.weixin.qq.com/wxa/business/getuserphonenumber",
            params={"access_token": access},
            json={"code": body.phone_code},
        )
    info = (res.json() or {}).get("phone_info") or {}
    phone = str(info.get("purePhoneNumber") or "")
    if not phone:
        raise HTTPException(status_code=400, detail="手机号授权无效或已过期")

    phone_hash = hashlib.sha256(phone.encode()).hexdigest()
    conflict = await postgrest(
        "GET", "/users", jwt=settings.supabase_service_role_key,
        params={"phone_hash": f"eq.{phone_hash}", "select": "id", "limit": "1"},
    )
    crows = conflict.data if isinstance(conflict.data, list) else []
    if crows and str(crows[0]["id"]) != uid:
        raise HTTPException(status_code=409, detail="该手机号已绑定其他账号")

    master = settings.ai_key_master_secret  # 与供应商密钥共用主密钥（NFR-2：密文+指纹）
    if not master or len(master) < 16:
        raise HTTPException(status_code=400, detail="主密钥未配置，暂不能绑定手机号")
    cipher = SecretBox(master).encrypt(phone)
    await postgrest(
        "PATCH", "/users", jwt=settings.supabase_service_role_key,
        params={"id": f"eq.{uid}"},
        json_body={"phone_hash": phone_hash, "phone_cipher": cipher},
    )
    # 单独同意留痕（FR-H2/H7）
    await postgrest(
        "POST", "/privacy_consents", jwt=token,
        json_body={"consent_type": "phone", "policy_version": body.consent_version},
    )
    return {"status": 200, "body": {"phone_masked": phone[:3] + "****" + phone[-4:]}}


@router.post("/phone/unbind")
async def unbind_phone(
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """解绑手机号：指纹与密文同步清除（FR-H7）。"""
    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    await postgrest(
        "PATCH", "/users", jwt=get_settings().supabase_service_role_key,
        params={"id": f"eq.{uid}"}, json_body={"phone_hash": None, "phone_cipher": None},
    )
    return {"status": 200, "body": {"unbound": True}}


@router.get("/profile")
async def get_profile(
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """用户资料（FR-H6/H7）：users 行 + 手机号脱敏展示（密文解密不出后端）。"""
    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    settings = get_settings()
    res = await postgrest(
        "GET", "/users", jwt=settings.supabase_service_role_key,
        params={"id": f"eq.{uid}", "select": "id,nickname,avatar,phone_cipher,created_at", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        return {"status": 200, "body": {"nickname": None, "avatar": None, "phone_masked": None}}
    row = rows[0]
    phone_masked = None
    cipher = row.get("phone_cipher")
    if cipher:
        from app.core.secret_box import try_decrypt_stored

        plain = try_decrypt_stored(str(cipher))
        if plain:
            phone_masked = plain[:3] + "****" + plain[-4:]
    return {
        "status": 200,
        "body": {
            "id": str(row.get("id")),
            "nickname": row.get("nickname"),
            "avatar": row.get("avatar"),
            "phone_masked": phone_masked,
            "created_at": row.get("created_at"),
        },
    }


@router.post("/deactivate")
async def deactivate_account(
    payload: dict[str, Any],
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """账号注销（FR-H2）：级联删除 auth 账号与全部业务数据；二次确认在客户端完成。"""
    if not payload.get("confirm"):
        raise HTTPException(status_code=400, detail="缺少确认参数")
    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    res = await gotrue("DELETE", f"/admin/users/{uid}", service_role=True)
    if res.status >= 400:
        raise HTTPException(status_code=502, detail="注销失败，请稍后重试")
    return {"status": 200, "body": {"deleted": True}}


@router.post("/avatar")
async def upload_avatar(
    payload: dict[str, Any],
    jwt_header: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """头像上传（FR-H6）：base64 数据 → avatars 桶（路径含 user_id，公开读、本人写）。"""
    import base64

    token = require_jwt_token(jwt_header)
    uid = await _current(token)
    data_url = str(payload.get("data") or "")
    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="仅支持图片数据")
    try:
        b64 = data_url.split(",", 1)[1]
        raw = base64.b64decode(b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="图片数据无效") from exc
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片超过 2MB，请压缩后重试")
    import httpx

    settings = get_settings()
    path = f"avatars/{uid}/avatar.png"
    url = f"{settings.supabase_url}/storage/v1/object/{path}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        up = await client.post(
            url,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
            content=raw,
        )
    if up.status_code >= 400:
        raise HTTPException(status_code=502, detail="头像上传失败")
    public_url = f"{settings.supabase_url}/storage/v1/object/public/{path}"
    await postgrest(
        "PATCH", "/users", jwt=settings.supabase_service_role_key,
        params={"id": f"eq.{uid}"}, json_body={"avatar": public_url},
    )
    return {"status": 200, "body": {"avatar": public_url}}
