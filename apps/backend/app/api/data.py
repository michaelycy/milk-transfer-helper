"""数据接口：白名单表透传 PostgREST（用户 JWT 随行，RLS 生效）。"""
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.supabase import postgrest

router = APIRouter(prefix="/v1", tags=["data"])

# 表白名单：read / insert / update / delete 四类开关（ articles 等运营表对客户端只读 ）
TABLE_POLICY: dict[str, dict[str, bool]] = {
    "babies": {"read": True, "insert": True, "update": True, "delete": True},
    "feed_records": {"read": True, "insert": True, "update": True, "delete": True},
    "symptom_logs": {"read": True, "insert": True, "update": True, "delete": True},
    "weight_logs": {"read": True, "insert": True, "delete": True},
    "transfer_plans": {"read": True, "insert": True, "update": True, "delete": True},
    "alerts": {"read": True, "insert": True, "update": True, "delete": False},
    "favorites": {"read": True, "insert": True, "delete": True},
    "articles": {"read": True, "insert": False, "update": False, "delete": False},
    "milk_products": {"read": True, "insert": False, "update": False, "delete": False},
    "plan_templates": {"read": True, "insert": False, "update": False, "delete": False},
    "analytics_events": {"read": False, "insert": True, "update": False, "delete": False},
}

ALLOWED_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is", "or"}
ALLOWED_RPCS = {"get_record_stats", "increment_read_count"}


class Filter(BaseModel):
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is", "or"]
    col: str = Field(pattern=r"^[a-z_][a-z0-9_]*$")
    value: str  # 逗号分隔的多值（in）或 or 的完整表达式也以字符串承载


class OrderItem(BaseModel):
    col: str = Field(pattern=r"^[a-z_][a-z0-9_]*$")
    ascending: bool = True


class QueryBody(BaseModel):
    table: str
    select: str = "*"
    filters: list[Filter] = []
    order: list[OrderItem] = []
    limit: int | None = Field(default=None, ge=1)
    range_from: int | None = Field(default=None, ge=0)
    range_to: int | None = Field(default=None, ge=0)
    count: bool = False
    single: Literal["none", "one", "maybe"] = "none"


class MutationBody(QueryBody):
    values: dict[str, Any]
    on_conflict: str | None = None


class RpcBody(BaseModel):
    args: dict[str, Any] = {}


def _require_table(table: str, action: "Literal['read', 'insert', 'update', 'delete']") -> None:
    policy = TABLE_POLICY.get(table)
    if not policy or not policy.get(action):
        raise HTTPException(status_code=403, detail=f"table {table} 不允许 {action} 操作")


def _filter_params(filters: list[Filter]) -> dict[str, str]:
    params: dict[str, str] = {}
    for f in filters:
        if f.op not in ALLOWED_OPS:
            raise HTTPException(status_code=400, detail=f"不支持的操作符 {f.op}")
        if f.op == "or":
            expr = f.value if f.value.startswith("(") else f"({f.value})"
            params["or"] = expr
        else:
            params[f.col] = f"{f.op}.{f.value}"
    return params


def _order_param(orders: list[OrderItem]) -> str | None:
    if not orders:
        return None
    return ",".join(f"{o.col}.{('asc' if o.ascending else 'desc')}" for o in orders)


def _parse_count(content_range: str | None) -> int | None:
    """Content-Range: 0-19/42 → 42"""
    if not content_range or "/" not in content_range:
        return None
    total = content_range.rsplit("/", 1)[-1]
    return int(total) if total.isdigit() else None


def _envelope(
    status: int, data: object, error: dict | None, count: int | None = None
) -> dict[str, Any]:
    return {"status": status, "data": data, "error": error, "count": count}


@router.post("/query")
async def query(body: QueryBody, jwt: Annotated[str | None, Header(alias="authorization")] = None) -> dict:
    _require_table(body.table, "read")
    token = _require_jwt(jwt)
    params = {"select": body.select, **_filter_params(body.filters)}
    order = _order_param(body.order)
    if order:
        params["order"] = order
    if body.limit is not None:
        params["limit"] = str(body.limit)
    if body.range_from is not None and body.range_to is not None:
        params["offset"] = str(body.range_from)
        params["limit"] = str(body.range_to - body.range_from + 1)

    prefer = "count=exact" if body.count else None
    accept = (
        "application/vnd.pgrst.object+json"
        if body.single == "one"
        else "application/json"
    )
    res = await postgrest(
        "GET", f"/{body.table}", jwt=token, params=params, prefer=prefer, accept=accept
    )

    error = None
    data = res.data
    count = _parse_count(res.headers.get("content-range")) if body.count else None
    if res.status >= 400:
        error = _as_error(res.data) or {"message": f"HTTP {res.status}"}
        data = None
    elif body.single == "maybe":
        data = res.data if isinstance(res.data, dict) else None
    return _envelope(res.status, data, error, count)


@router.post("/insert")
async def insert(body: MutationBody, jwt: Annotated[str | None, Header(alias="authorization")] = None) -> dict:
    _require_table(body.table, "insert")
    token = _require_jwt(jwt)
    params = {"select": body.select}
    if body.on_conflict:
        params["on_conflict"] = body.on_conflict
    prefer = (
        "resolution=merge-duplicates,return=representation"
        if body.on_conflict
        else "return=representation"
    )
    res = await postgrest(
        "POST",
        f"/{body.table}",
        jwt=token,
        params=params,
        json_body=body.values,
        prefer=prefer,
    )
    error = None
    data = res.data
    if res.status >= 400:
        error = _as_error(res.data) or {"message": f"HTTP {res.status}"}
        data = None
    elif body.single == "one":
        if isinstance(res.data, list):
            data = res.data[0] if res.data else None
        else:
            data = res.data
    return _envelope(res.status, data, error)


@router.post("/update")
async def update(body: MutationBody, jwt: Annotated[str | None, Header(alias="authorization")] = None) -> dict:
    _require_table(body.table, "update")
    token = _require_jwt(jwt)
    if not body.filters:
        raise HTTPException(status_code=400, detail="update 必须携带过滤条件")
    res = await postgrest(
        "PATCH",
        f"/{body.table}",
        jwt=token,
        params=_filter_params(body.filters),
        json_body=body.values,
        prefer="return=representation",
    )
    error = None
    data = res.data
    if res.status >= 400:
        error = _as_error(res.data) or {"message": f"HTTP {res.status}"}
        data = None
    return _envelope(res.status, data, error)


@router.post("/delete")
async def delete_rows(
    body: QueryBody, jwt: Annotated[str | None, Header(alias="authorization")] = None
) -> dict:
    _require_table(body.table, "delete")
    token = _require_jwt(jwt)
    if not body.filters:
        raise HTTPException(status_code=400, detail="delete 必须携带过滤条件")
    res = await postgrest(
        "DELETE", f"/{body.table}", jwt=token, params=_filter_params(body.filters)
    )
    error = _as_error(res.data) if res.status >= 400 else None
    return _envelope(res.status, None, error)


@router.post("/rpc/{fn_name}")
async def rpc(
    fn_name: str, body: RpcBody, jwt: Annotated[str | None, Header(alias="authorization")] = None
) -> dict:
    if fn_name not in ALLOWED_RPCS:
        raise HTTPException(status_code=403, detail=f"RPC {fn_name} 不在白名单")
    token = _require_jwt(jwt)
    res = await postgrest("POST", f"/rpc/{fn_name}", jwt=token, json_body=body.args)
    error = _as_error(res.data) if res.status >= 400 else None
    data = None if res.status >= 400 else res.data
    return _envelope(res.status, data, error)


def _require_jwt(authorization: str | None) -> str:
    """校验并剥掉 Bearer 前缀，返回裸 token（postgrest() 内层会统一再包装）。"""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="缺少会话凭证")
    return token


def _as_error(data: object) -> dict | None:
    if isinstance(data, dict):
        return {
            "message": str(data.get("message", "")),
            "code": data.get("code"),
            "details": data.get("details"),
            "hint": data.get("hint"),
        }
    return {"message": str(data)}
