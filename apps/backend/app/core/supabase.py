"""Supabase HTTP 访问封装：PostgREST / GoTrue，全部走 httpx。

约定：
- 用户请求：携带小程序端透传的用户 JWT（Bearer），行级隔离由数据库 RLS 强制；
- 服务端管理操作（建号/删号/数据迁移/生成登录链接）：service_role，仅限本模块内部使用。
"""
import httpx

from app.core.config import get_settings

# 测试注入 MockTransport 用
_transport: httpx.AsyncBaseTransport | None = None


class PostgrestResult:
    def __init__(self, status: int, data: object, headers: dict[str, str]) -> None:
        self.status = status
        self.data = data
        self.headers = headers


class GoTrueResult:
    def __init__(self, status: int, body: dict) -> None:
        self.status = status
        self.body = body


def _client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        base_url=settings.supabase_url,
        transport=_transport,
        timeout=15.0,
        headers={"apikey": settings.supabase_anon_key},
    )


async def postgrest(
    method: str,
    path: str,
    *,
    jwt: str,
    params: dict[str, str] | None = None,
    json_body: object | None = None,
    prefer: str | None = None,
    accept: str | None = None,
) -> PostgrestResult:
    """以用户身份调用 PostgREST（RLS 生效）。"""
    headers: dict[str, str] = {"Authorization": f"Bearer {jwt}"}
    if prefer:
        headers["Prefer"] = prefer
    if accept:
        headers["Accept"] = accept
    async with _client() as client:
        res = await client.request(
            method, f"/rest/v1{path}", params=params, json=json_body, headers=headers
        )
    try:
        data: object = res.json()
    except ValueError:
        data = None
    return PostgrestResult(res.status_code, data, dict(res.headers))


async def gotrue(
    method: str,
    path: str,
    *,
    json_body: object | None = None,
    jwt: str | None = None,
    service_role: bool = False,
) -> GoTrueResult:
    """调用 GoTrue 认证服务。service_role=True 时用管理密钥。"""
    settings = get_settings()
    key = settings.supabase_service_role_key if service_role else settings.supabase_anon_key
    headers: dict[str, str] = {"apikey": key, "Authorization": f"Bearer {key}"}
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    async with _client() as client:
        res = await client.request(method, f"/auth/v1{path}", json=json_body, headers=headers)
    try:
        body: dict = res.json()
    except ValueError:
        body = {}
    return GoTrueResult(res.status_code, body)


async def wechat_code2session(code: str) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": settings.wechat_appid,
                "secret": settings.wechat_secret,
                "js_code": code,
                "grant_type": "authorization_code",
            },
        )
    return res.json()
