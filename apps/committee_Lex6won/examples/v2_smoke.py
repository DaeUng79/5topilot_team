"""Run from the module directory: python examples/v2_smoke.py (temporary synthetic DB)."""

import asyncio
import json
import secrets
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from committee_app.v2_core import Context, Runtime, now  # noqa: E402
from committee_app.v2_gateway import dispatch_action  # noqa: E402
from committee_app.v2_handoff import pending_events  # noqa: E402


async def demonstrate(folder: Path) -> None:
    runtime = Runtime(
        folder / "admin.sqlite3",
        pii_key=secrets.token_bytes(32),
        lookup_key=secrets.token_bytes(32),
        auth_key=secrets.token_bytes(32),
    )
    await runtime.initialize(development_parents=True)
    with runtime.connect(write=True) as conn:
        runtime.insert(
            conn,
            "departments",
            {
                "id": "demo-dept",
                "organization_name": "가상기관",
                "name": "가상부서",
                "code": "DEMO",
                "active": 1,
            },
        )
        runtime.insert(
            conn,
            "admin_users",
            {
                "id": "demo-admin",
                "department_id": "demo-dept",
                "username": "synthetic-only",
                "password_hash": "not-a-login-account",
                "role": "DEPARTMENT_ADMIN",
                "display_name": "가상관리자",
                "active": 1,
                "password_changed_at": now(),
            },
        )
        runtime.insert(
            conn,
            "projects",
            {
                "id": "demo-project",
                "department_id": "demo-dept",
                "name": "가상사업",
                "contact_organization": "가상기관",
                "contact_department": "가상부서",
                "contact_position": "가상직책",
                "contact_name": "가상담당자",
                "contact_phone_cipher": b"synthetic",
                "status": "PREPARING",
                "created_by": "demo-admin",
            },
        )
        runtime.insert(
            conn,
            "specialties",
            {"id": "AI", "code": "AI", "name": "인공지능", "aliases_json": '["AI"]', "active": 1},
        )
    for i in range(1, 22):
        await dispatch_action(
            Context("demo-admin", str(uuid4())),
            "COM-05",
            {
                "department_id": "demo-dept",
                "name": f"가상위원{i}",
                "organization_name": "가상소속",
                "phone": f"010{i:08d}",
                "specialty_ids": ["AI"],
            },
            runtime=runtime,
        )
    await dispatch_action(
        Context("demo-admin", str(uuid4())),
        "DRAW-01",
        {
            "project_id": "demo-project",
            "selection_mode": "POOL_RANDOM",
            "target_count": 7,
            "reserve_count": 0,
            "quotas": [{"specialty_id": "AI", "final_count": 7}],
        },
        runtime=runtime,
    )
    result = await dispatch_action(
        Context("demo-admin", str(uuid4())),
        "DRAW-02",
        {"project_id": "demo-project", "rule_version": 1},
        runtime=runtime,
    )
    assert isinstance(result, dict)
    chosen = result["data"]["members"][:7]
    for member in chosen:
        await dispatch_action(
            Context("demo-admin", str(uuid4())),
            "ROS-03",
            {
                "project_id": "demo-project",
                "nominee_id": member["nominee_id"],
                "version": 1,
                "contact_status": "AVAILABLE",
            },
            runtime=runtime,
        )
    result = await dispatch_action(
        Context("demo-admin", str(uuid4())),
        "ROS-05",
        {
            "project_id": "demo-project",
            "rule_version": 1,
            "members": [
                {"nominee_id": m["nominee_id"], "version": 2, "member_kind": "PRIMARY"}
                for m in chosen
            ],
        },
        runtime=runtime,
    )
    assert isinstance(result, dict)
    events = await pending_events(Context("demo-admin"), runtime=runtime)
    with runtime.connect() as conn:
        assert not conn.execute("PRAGMA foreign_key_check").fetchall()
    print(
        json.dumps(
            {
                "candidates": 21,
                "shortlist": 21,
                "primary": len(result["data"]["assignments"]),
                "outbox_events": len(events),
                "sync_status": result["data"]["sync_status"],
                "foreign_keys_valid": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    with TemporaryDirectory(prefix="committee-v2-") as folder:
        asyncio.run(demonstrate(Path(folder)))
