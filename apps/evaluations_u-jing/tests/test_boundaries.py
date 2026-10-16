from __future__ import annotations

import asyncio
import copy
import json
import sqlite3
from uuid import uuid4

import pytest
from committee_app.v2_core import ModuleError, digest, packed
from db import DTO, Store, insert
from fastapi import FastAPI
from fastapi.testclient import TestClient
from run_web import setup
from sync_service import deliver_outbox, receive_document_snapshot
from test_workflow import PID, admin, call, png, ready


def filled(client: TestClient, session: DTO) -> DTO:
    sheets = call(client, "SCO-01", {"session_id": session["id"]})["sheets"]
    for sheet in sheets:
        call(
            client,
            "SCO-02",
            {
                "session_id": session["id"],
                "sheet_id": sheet["id"],
                "version": sheet["version"],
                "entries": [
                    {"criterion_id": e["criterion_id"], "score": 0, "comment": None}
                    for e in sheet["entries"]
                ],
            },
        )
    return call(client, "SCO-03", {"session_id": session["id"]})


def test_zero_scores_signature_invalidated_by_edit_and_ownership(
    app: FastAPI, store: Store
) -> None:
    _manager, clients, session = ready(app)
    review = filled(clients[0], session)
    assert not review["missing"] and all(
        t["total_score"] == 0 for t in review["totals"]
    )
    signature = call(
        clients[0],
        "SCO-04",
        {
            "session_id": session["id"],
            "purpose": "EVALUATION",
            "payload_sha256": review["payload_sha256"],
            "image": png(),
            "consent": True,
            "consent_text_version": "signature-v2",
        },
    )
    sheet = call(clients[0], "SCO-01", {"session_id": session["id"]})["sheets"][0]
    change = {
        "session_id": session["id"],
        "sheet_id": sheet["id"],
        "version": sheet["version"],
        "entries": [
            {"criterion_id": e["criterion_id"], "score": 10000, "comment": "변경"}
            for e in sheet["entries"]
        ],
    }
    call(clients[1], "SCO-02", change, 404)
    call(clients[0], "SCO-02", change)
    call(
        clients[0],
        "SCO-05",
        {
            "session_id": session["id"],
            "signature_id": signature["id"],
            "payload_sha256": review["payload_sha256"],
        },
        409,
    )
    call(
        clients[0],
        "ATT-01",
        {
            "consent": True,
            "consent_version": "attendance-v2",
            "status": "DECLINED",
            "version": 1,
        },
        409,
    )
    with store.connect(write=True) as c:
        with pytest.raises(sqlite3.IntegrityError):
            c.execute(
                "DELETE FROM session_participants WHERE session_id=?", (session["id"],)
            )
        with pytest.raises(sqlite3.IntegrityError):
            c.execute(
                "UPDATE signatures SET payload_sha256=? WHERE id=?",
                ("changed", signature["id"]),
            )
        with pytest.raises(sqlite3.IntegrityError):
            c.execute(
                "UPDATE ref_approved_criteria_items SET snapshot_sha256=? WHERE id=?",
                ("changed", "demo-criterion-0"),
            )


def test_permission_change_revokes_sessions_and_retries_are_private(
    app: FastAPI, store: Store
) -> None:
    manager = admin(app)
    root = admin(app, "super-demo")
    users = call(root, "ADM-01")["items"]
    user = next(u for u in users if u["username"] == "web-demo")
    call(
        root,
        "ADM-05",
        {"admin_id": user["id"], "version": user["version"], "permission_codes": []},
    )
    call(manager, "PRJ-01", {}, 401)
    manager = admin(app)
    call(manager, "PRJ-01", {}, 403)
    fields = {
        "department_id": "web-demo-dept",
        "name": "비공개 연락처 검사",
        "contact_organization": "기관",
        "contact_department": "부서",
        "contact_position": "담당",
        "contact_name": "담당자",
        "contact_phone": "01077776666",
        "contact_email": "private@example.test",
    }
    key = str(uuid4())
    project = call(root, "PRJ-02", fields, key=key)
    assert call(root, "PRJ-02", fields, key=key) == project
    call(root, "PRJ-02", fields | {"name": "다른 본문"}, 409, key=key)
    with store.connect("admin") as c:
        cached = c.execute(
            "SELECT response_json FROM idempotency_records WHERE request_key=?", (key,)
        ).fetchone()[0]
        assert (
            "01077776666" not in cached
            and "private@example.test" not in cached
            and "cipher" in json.loads(cached)
        )


def test_synced_document_replay_conflict_and_restart(store: Store) -> None:
    with store.connect() as c:
        original = dict(
            c.execute(
                "SELECT * FROM sync_inbox WHERE event_id='demo-approved-documents-v1'"
            ).fetchone()
        )
    assert receive_document_snapshot(store, original)["status"] == "DUPLICATE"
    changed = copy.deepcopy(original)
    payload = json.loads(changed["payload_json"])
    payload["criteria"]["approval_no"] = 99
    changed["payload_json"] = packed(payload)
    changed["payload_sha256"] = digest(payload)
    with pytest.raises(ModuleError, match="이벤트 충돌"):
        receive_document_snapshot(store, changed)
    broken = original | {"event_id": str(uuid4()), "payload_sha256": "corrupt"}
    with pytest.raises(ModuleError, match="해시"):
        receive_document_snapshot(store, broken)
    reopened = asyncio.run(setup(store.evaluation_path.parent, True, None))
    deliver_outbox(reopened)
    with reopened.connect() as c:
        assert (
            c.execute("SELECT COUNT(*) FROM ref_committee_assignments").fetchone()[0]
            == 7
        )
        assert (
            c.execute("SELECT COUNT(*) FROM ref_approved_criteria_items").fetchone()[0]
            == 3
        )
    with reopened.connect("admin") as c:
        assert (
            c.execute(
                "SELECT COUNT(*) FROM sync_outbox WHERE contract_name='roster.confirmed' AND status='SENT'"
            ).fetchone()[0]
            == 1
        )


def test_login_is_not_attendance_and_invalid_policy(app: FastAPI) -> None:
    client = TestClient(app)
    call(client, "AUTH-02", {"project_id": PID, "name": "가상위원01", "last4": "0001"})
    assert client.get("/api/v2/bootstrap").json()["data"]["attendance"] == []
    call(client, "ATT-01", {"consent": False, "consent_version": "attendance-v2"}, 422)
    manager = admin(app)
    state = call(manager, "ATT-02", {"project_id": PID})
    body = {
        "project_id": PID,
        "roster_id": state["rosters"][0]["id"],
        "approved_criteria_version_id": "demo-criteria",
        "target_count": 7,
        "minimum_attendees": 3,
        "approve_policy": False,
    }
    call(manager, "ATT-00", body, 422)
    call(
        manager, "ATT-00", body | {"approve_policy": True, "minimum_attendees": 2}, 422
    )
    session = call(
        manager, "ATT-00", body | {"approve_policy": True, "minimum_attendees": 7}
    )
    call(
        manager,
        "ATT-03",
        {
            "session_id": session["id"],
            "version": session["version"],
            "attendance_ids": [],
        },
        409,
    )
    call(
        manager,
        "ATT-05",
        {"session_id": session["id"], "version": session["version"]},
        409,
    )


def test_integrated_committee_gateway_and_static_boundaries(app: FastAPI) -> None:
    manager = admin(app)
    bootstrap = manager.get("/committee-v2/api/bootstrap").json()["data"]
    assert bootstrap["shared_auth_connected"]
    state = manager.get("/committee-v2/api/projects/" + PID).json()["data"]
    assert state["handoff"]["status"] == "SENT" and len(state["assignments"]) == 7
    assert "login_lookup_hmac" not in json.dumps(state)
    result = call(
        manager,
        "COM-01",
        {"department_id": "web-demo-dept", "scope": "DEPARTMENT_POOL"},
    )
    assert result["total"] == 27
    for url in [
        "/",
        "/src/bindings/common.js",
        "/src/screens/dept-admin/PM-00-login/binding.js",
        "/committee-v2/",
    ]:
        assert manager.get(url).status_code == 200
    for url in (
        "/src/app.js",
        "/src/screens/dept-admin/PM-05-attendance-chair/screen.js",
        "/prototypes/unapproved_web/index.html",
    ):
        assert manager.get(url).status_code == 404
    for url in [
        "/src/../../evaluations_u-jing/data/integrated-demo/keys.bin",
        "/data/keys.bin",
        "/contracts/schema_v2.json",
    ]:
        assert manager.get(url).status_code == 404
    call(manager, "DOC-01", {}, 501)


def test_database_rejects_cross_session_relations(store: Store) -> None:
    with store.connect(write=True) as c:
        with pytest.raises(sqlite3.IntegrityError):
            insert(
                c,
                "attendance_records",
                {
                    "project_id": PID,
                    "assignment_id": "missing-assignment",
                    "status": "CONFIRMED",
                    "consent_version": "attendance-v2",
                },
            )
        with pytest.raises(sqlite3.IntegrityError):
            insert(
                c,
                "evaluation_sessions",
                {
                    "project_id": PID,
                    "round_no": 1,
                    "roster_id": "missing",
                    "approved_criteria_version_id": "demo-criteria",
                    "status": "OPEN",
                    "target_count": 6,
                    "minimum_attendees": 2,
                    "aggregation_policy_json": "{}",
                },
            )
