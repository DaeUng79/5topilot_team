"""Persistent behavior for fields and controls present in the approved UI."""

import sqlite3

import pytest
from fastapi.testclient import TestClient
from test_workflow import PID, admin, call, png, ready


def test_department_lifecycle_and_password_reset(app, store):
    root = admin(app, "super-demo")
    manager = admin(app)
    call(
        manager,
        "ADM-DEPT-SAVE",
        {"code": "NO-001", "organization_name": "기관", "name": "부서"},
        403,
    )
    department = call(
        root,
        "ADM-DEPT-SAVE",
        {"code": "QA-001", "organization_name": "가상기관", "name": "검증부서"},
    )
    user = call(
        root,
        "ADM-02",
        {
            "department_id": department["id"],
            "username": "originaltester",
            "display_name": "검증계정",
            "password": "OriginalTest!2026",
        },
    )
    reset = call(
        root, "ADM-RESET", {"admin_id": user["id"], "version": user["version"]}
    )
    client = TestClient(app)
    actor = call(
        client,
        "AUTH-01",
        {"username": "originaltester", "password": reset["temporary_password"]},
    )
    assert actor["must_change_password"] is True
    call(client, "PRJ-01", {}, 423)
    assert client.get("/committee-v2/api/projects/demo-evaluation").status_code == 423
    call(
        client,
        "AUTH-04",
        {"current_password": "incorrect", "new_password": "ChangedPass!2026"},
        422,
    )
    call(
        client,
        "AUTH-04",
        {
            "current_password": reset["temporary_password"],
            "new_password": "ChangedPass!2026",
        },
    )
    assert (
        call(
            client,
            "AUTH-01",
            {"username": "originaltester", "password": "ChangedPass!2026"},
        )["must_change_password"]
        is False
    )
    department = call(
        root,
        "ADM-DEPT-STATE",
        {
            "department_id": department["id"],
            "version": department["version"],
            "state": "INACTIVE",
        },
    )
    assert client.get("/api/v2/bootstrap").status_code == 401
    call(
        client,
        "AUTH-01",
        {"username": "originaltester", "password": "ChangedPass!2026"},
        401,
    )
    department = call(
        root,
        "ADM-DEPT-STATE",
        {
            "department_id": department["id"],
            "version": department["version"],
            "state": "ACTIVE",
        },
    )
    call(
        client,
        "AUTH-01",
        {"username": "originaltester", "password": "ChangedPass!2026"},
    )
    call(
        root,
        "ADM-DEPT-STATE",
        {
            "department_id": department["id"],
            "version": department["version"],
            "state": "DELETED",
        },
    )
    assert department["id"] not in {
        d["id"] for d in call(root, "ADM-DEPT-LIST")["items"]
    }
    with store.connect("admin") as c:
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []


def test_original_date_and_locked_contact_fields(app):
    manager, _clients, _session = ready(app)
    project = call(manager, "PRJ-05", {"project_id": PID})["project"]
    fields = {
        k: project[k]
        for k in (
            "name",
            "contact_organization",
            "contact_department",
            "contact_position",
            "contact_name",
            "contact_phone",
            "contact_email",
        )
    }
    updated = call(
        manager,
        "PRJ-03",
        fields
        | {
            "project_id": PID,
            "version": project["version"],
            "contact_phone": "010-1111-2222",
        },
    )
    assert updated["contact_phone"] == "010-1111-2222"
    call(
        manager,
        "PRJ-03",
        fields
        | {"project_id": PID, "version": updated["version"], "name": "변경 금지"},
        409,
    )
    fresh = call(
        manager,
        "PRJ-02",
        fields | {"department_id": "web-demo-dept", "evaluation_date": "2026-11-05"},
    )
    assert (
        call(manager, "PRJ-05", {"project_id": fresh["id"]})["project"][
            "evaluation_date"
        ]
        == "2026-11-05"
    )
    call(
        manager,
        "PRJ-03",
        fields
        | {
            "project_id": fresh["id"],
            "version": fresh["version"],
            "evaluation_date": "2026-02-30",
        },
        422,
    )
    assert (
        call(manager, "PRJ-05", {"project_id": fresh["id"]})["project"]["version"]
        == fresh["version"]
    )


def test_vendor_opinion_is_persistent_and_part_of_signed_payload(app, store):
    _manager, clients, session = ready(app)
    client = clients[0]
    sheets = call(client, "SCO-01", {"session_id": session["id"]})["sheets"]
    for sheet in sheets:
        call(
            client,
            "SCO-02",
            {
                "session_id": session["id"],
                "sheet_id": sheet["id"],
                "version": sheet["version"],
                "opinion": "업체별 의견",
                "entries": [
                    {
                        "criterion_id": e["criterion_id"],
                        "score": 0,
                        "comment": e["comment"],
                    }
                    for e in sheet["entries"]
                ],
            },
        )
    before = call(client, "SCO-03", {"session_id": session["id"]})
    sheet = call(client, "SCO-01", {"session_id": session["id"]})["sheets"][0]
    assert sheet["opinion"] == "업체별 의견"
    call(
        client,
        "SCO-02",
        {
            "session_id": session["id"],
            "sheet_id": sheet["id"],
            "version": sheet["version"],
            "opinion": "수정된 의견",
            "entries": [
                {
                    "criterion_id": e["criterion_id"],
                    "score": e["score"],
                    "comment": e["comment"],
                }
                for e in sheet["entries"]
            ],
        },
    )
    assert (
        call(client, "SCO-03", {"session_id": session["id"]})["payload_sha256"]
        != before["payload_sha256"]
    )
    with store.connect(write=True) as c, pytest.raises(sqlite3.IntegrityError):
        c.execute(
            "INSERT INTO score_sheet_opinions(sheet_id,opinion) VALUES('missing','no')"
        )
    review = call(client, "SCO-03", {"session_id": session["id"]})
    signature = call(
        client,
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
    call(
        client,
        "SCO-05",
        {
            "session_id": session["id"],
            "signature_id": signature["id"],
            "payload_sha256": review["payload_sha256"],
        },
    )
    with store.connect(write=True) as c, pytest.raises(sqlite3.IntegrityError):
        c.execute(
            "UPDATE score_sheet_opinions SET opinion='changed after submission' WHERE sheet_id=?",
            (sheet["id"],),
        )


def test_missing_specialty_rolls_back_participant_lock(app, store):
    manager = admin(app)
    state = call(manager, "ATT-02", {"project_id": PID})
    session = call(
        manager,
        "ATT-00",
        {
            "project_id": PID,
            "roster_id": state["rosters"][0]["id"],
            "approved_criteria_version_id": "demo-criteria",
            "target_count": 7,
            "minimum_attendees": 5,
            "approve_policy": True,
        },
    )
    for i in range(1, 8):
        client = TestClient(app)
        call(
            client,
            "AUTH-02",
            {"project_id": PID, "name": f"가상위원{i:02d}", "last4": f"{i:04d}"},
        )
        call(client, "ATT-01", {"consent": True, "consent_version": "attendance-v2"})
    state = call(manager, "ATT-02", {"project_id": PID})
    omitted = state["assignments"][-1]
    with store.connect("admin", True) as c:
        candidate = c.execute(
            "SELECT n.candidate_id FROM committee_assignments a JOIN project_nominees n ON n.id=a.nominee_id WHERE a.id=?",
            (omitted["id"],),
        ).fetchone()[0]
        c.execute(
            "UPDATE candidate_specialties SET specialty_id='SEC' WHERE candidate_id=?",
            (candidate,),
        )
    result = call(
        manager,
        "ATT-03",
        {
            "session_id": session["id"],
            "version": session["version"],
            "attendance_ids": [a["attendance_id"] for a in state["assignments"][:-1]],
        },
        409,
    )
    assert result["error"]["code"] == "SPECIALTY_QUORUM_INVALID"
    assert call(manager, "ATT-02", {"project_id": PID})["participants"] == []
