"""家庭共享（FR-H3）：邀请接受（被邀请人侧唯一需要服务端的动作）。

邀请码是一次性凭证且 family_invites 的 RLS 仅 owner 可见，被邀请人无法直查——
接受动作必须经服务端以 service_role 校验（pending + 未过期 + 未达上限）后落成员行。
"""
from datetime import UTC
from typing import Annotated, Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.deps import current_user, require_jwt
from app.core.supabase import postgrest

router = APIRouter(prefix="/v1/family", tags=["family"])


class AcceptBody(BaseModel):
    invite_code: str = Field(min_length=4, max_length=32)


@router.post("/accept")
async def accept_invite(
    body: AcceptBody,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """凭邀请短码加入宝宝档案：幂等（已是成员直接成功）；过期/撤销/不存在一律 4xx。"""
    token = require_jwt(jwt)
    uid = await current_user(token)
    service = get_settings().supabase_service_role_key
    code = body.invite_code.strip().upper()

    res = await postgrest(
        "GET", "/family_invites", jwt=service,
        params={"invite_code": f"eq.{code}", "select": "*", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        raise HTTPException_NOT_FOUND("邀请码不存在")
    invite = rows[0]
    if invite["status"] == "accepted":
        raise HTTPException_BAD("邀请已被使用")
    if invite["status"] != "pending":
        raise HTTPException_BAD("邀请已失效")
    from datetime import datetime

    expires = datetime.fromisoformat(str(invite["expires_at"]))
    if expires < datetime.now(UTC):
        raise HTTPException_BAD("邀请已过期")

    baby_id = str(invite["baby_id"])
    # 幂等：已是 active 成员直接成功
    member = await postgrest(
        "GET", "/baby_members", jwt=service,
        params={"baby_id": f"eq.{baby_id}", "user_id": f"eq.{uid}", "select": "*", "limit": "1"},
    )
    mrows = member.data if isinstance(member.data, list) else []
    if mrows and mrows[0].get("status") == "active":
        await postgrest(
            "PATCH", "/family_invites", jwt=service,
            params={"id": f"eq.{invite['id']}"},
            json_body={"status": "accepted", "accepted_by": uid},
        )
        baby = await _baby_info(service, baby_id)
        return {"status": 200, "data": {"baby": baby, "role": mrows[0]["role"], "already": True}, "error": None}

    # 上限/owner 唯一由 DB 触发器与部分唯一索引强制；角色取邀请时指定的 editor/viewer
    ins = await postgrest(
        "POST", "/baby_members", jwt=service,
        json_body={
            "baby_id": baby_id,
            "user_id": uid,
            "role": invite["role"],
            "invited_by": invite["invited_by"],
        },
        prefer="return=representation",
    )
    if ins.status >= 400:
        detail = ins.data if isinstance(ins.data, dict) else {}
        msg = str(detail.get("message") or "")
        if "最多" in msg:
            raise HTTPException_BAD("该宝宝成员已满（上限 5 人）")
        raise HTTPException_BAD("加入失败，请稍后重试")
    await postgrest(
        "PATCH", "/family_invites", jwt=service,
        params={"id": f"eq.{invite['id']}"},
        json_body={"status": "accepted", "accepted_by": uid},
    )
    baby = await _baby_info(service, baby_id)
    return {"status": 200, "data": {"baby": baby, "role": invite["role"], "already": False}, "error": None}


@router.get("/members")
async def list_members(
    baby_id: str,
    jwt: Annotated[str | None, Header(alias="authorization")] = None,
) -> dict[str, Any]:
    """成员名册（FR-H3 最小披露）：仅成员可见，仅返回昵称/头像/角色，不暴露其他用户字段。"""
    token = require_jwt(jwt)
    uid = await current_user(token)
    service = get_settings().supabase_service_role_key
    chk = await postgrest(
        "POST", "/rpc/is_baby_member", jwt=token,
        json_body={"target_baby": baby_id, "min_role": "viewer"},
    )
    if chk.data is not True:
        raise HTTPException_NOT_FOUND("无权查看该家庭")
    res = await postgrest(
        "GET", "/baby_members", jwt=service,
        params={
            "baby_id": f"eq.{baby_id}", "status": "eq.active",
            "select": "id,user_id,role,created_at", "order": "created_at",
        },
    )
    rows = res.data if isinstance(res.data, list) else []
    ids = ",".join(str(r["user_id"]) for r in rows) or "00000000-0000-0000-0000-000000000000"
    users = await postgrest(
        "GET", "/users", jwt=service,
        params={"id": f"in.({ids})", "select": "id,nickname,avatar"},
    )
    profiles = {str(u["id"]): u for u in (users.data if isinstance(users.data, list) else [])}
    return {
        "status": 200,
        "data": [
            {
                "id": str(r["user_id"]),
                "role": r["role"],
                "is_self": str(r["user_id"]) == uid,
                "joined_at": r["created_at"],
                "nickname": (profiles.get(str(r["user_id"])) or {}).get("nickname"),
                "avatar": (profiles.get(str(r["user_id"])) or {}).get("avatar"),
            }
            for r in rows
        ],
        "error": None,
    }


async def _baby_info(service: str, baby_id: str) -> dict[str, Any]:
    res = await postgrest(
        "GET", "/babies", jwt=service,
        params={"id": f"eq.{baby_id}", "select": "id,nickname,gender,birth_date", "limit": "1"},
    )
    rows = res.data if isinstance(res.data, list) else []
    return rows[0] if rows else {"id": baby_id}


def HTTPException_NOT_FOUND(detail: str) -> Any:
    from fastapi import HTTPException

    return HTTPException(status_code=404, detail=detail)


def HTTPException_BAD(detail: str) -> Any:
    from fastapi import HTTPException

    return HTTPException(status_code=400, detail=detail)
