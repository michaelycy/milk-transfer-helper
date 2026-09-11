"""FR-J8 权限矩阵一致性：Python 常量（deps.ROLE_PERMISSIONS）与 DB has_permission() 同源锁定。

修改任一侧必须同步另一侧，本用例失败即提示两侧漂移。
"""
import re
from pathlib import Path

from app.core.deps import ROLE_PERMISSIONS

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
MIGRATION = next(MIGRATIONS.glob("20260912120000_*.sql"))


def _sql_matrix() -> dict[str, set[str]]:
    sql = MIGRATION.read_text(encoding="utf-8")
    body = re.search(
        r"create or replace function public\.has_permission.*?\$\$(.*?)\$\$", sql, re.DOTALL
    ).group(1)  # type: ignore[union-attr]
    matrix: dict[str, set[str]] = {}

    def capture(role: str, segment: str) -> set[str]:
        m = re.search(rf"'{role}' and action in \(([^)]*)\)", segment)
        return set(re.findall(r"'([a-z:]+)'", m.group(1))) if m else set()

    matrix["operator"] = capture("operator", body)
    matrix["analyst"] = capture("analyst", body)
    matrix["super_admin"] = set()
    for actions in matrix.values():
        matrix["super_admin"] |= actions
    matrix["super_admin"] |= {"user:read", "admin:manage", "ai:key"}
    return matrix


def test_matrix_matches_sql():
    sql_matrix = _sql_matrix()
    for role, actions in ROLE_PERMISSIONS.items():
        assert set(actions) == sql_matrix[role], f"{role} 权限点漂移：py={set(actions)} sql={sql_matrix[role]}"


def test_default_deny():
    all_actions = {a for actions in ROLE_PERMISSIONS.values() for a in actions}
    assert all_actions == {
        "dashboard:read",
        "milk:write",
        "article:write",
        "template:write",
        "ai:config",
        "ai:key",
        "user:read",
        "admin:manage",
        "audit:read",
    }
    # analyst 只读：不持有任何 write/config/manage 权限点
    assert not [a for a in ROLE_PERMISSIONS["analyst"] if "write" in a or "manage" in a]
