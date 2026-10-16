from __future__ import annotations

import base64
import struct
import zlib
from uuid import uuid4

from db import DTO, Store
from fastapi import FastAPI
from fastapi.testclient import TestClient

HEADERS = {"X-Simsa-Client": "v2-web"}
PID = "demo-evaluation"


def call(
    client: TestClient,
    action: str,
    body: DTO | None = None,
    expected: int = 200,
    key: str | None = None,
) -> DTO:
    response = client.post(
        "/api/v2/actions/" + action,
        json=body or {},
        headers=HEADERS | {"Idempotency-Key": key or str(uuid4())},
    )
    assert response.status_code == expected, (
        action,
        response.status_code,
        response.text,
    )
    return response.json().get("data", response.json())


def admin(app: FastAPI, username: str = "web-demo") -> TestClient:
    client = TestClient(app)
    call(client, "AUTH-01", {"username": username, "password": "DemoOnly!2026"})
    return client


def png() -> str:
    def chunk(name: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + name
            + data
            + struct.pack(">I", zlib.crc32(name + data))
        )

    raw = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
        + chunk(
            b"IDAT",
            zlib.compress(b"\0" + b"\x00\x00\x00" * 2 + b"\0" + b"\xff\xff\xff" * 2),
        )
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(raw).decode()


def ready(app: FastAPI) -> tuple[TestClient, list[TestClient], DTO]:
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
            "minimum_attendees": 7,
            "approve_policy": True,
        },
    )
    evaluators = []
    for i in range(1, 8):
        client = TestClient(app)
        call(
            client,
            "AUTH-02",
            {"project_id": PID, "name": f"가상위원{i:02d}", "last4": f"{i:04d}"},
        )
        call(client, "ATT-01", {"consent": True, "consent_version": "attendance-v2"})
        evaluators.append(client)
    state = call(manager, "ATT-02", {"project_id": PID})
    session = call(
        manager,
        "ATT-03",
        {
            "session_id": session["id"],
            "version": session["version"],
            "attendance_ids": [a["attendance_id"] for a in state["assignments"]],
        },
    )
    participants = call(manager, "ATT-02", {"project_id": PID})["participants"]
    first_id = evaluators[0].get("/api/v2/bootstrap").json()["data"]["actor"]["id"]
    chair = next(p for p in participants if p["assignment_id"] == first_id)
    session = call(
        manager,
        "ATT-04",
        {
            "session_id": session["id"],
            "version": session["version"],
            "participant_id": chair["id"],
        },
    )
    session = call(
        manager, "ATT-05", {"session_id": session["id"], "version": session["version"]}
    )
    return manager, evaluators, session


def test_full_evaluation_with_locks_signatures_ties_report(
    app: FastAPI, store: Store
) -> None:
    manager, clients, session = ready(app)
    sid = session["id"]
    call(
        manager,
        "PRJ-07",
        {"project_id": PID, "vendor_id": "demo-vendor-0", "version": 1},
        409,
    )
    call(clients[0], "RES-02", {"session_id": sid}, 409)
    call(clients[1], "RES-02", {"session_id": sid}, 403)
    for i, client in enumerate(clients):
        data = call(client, "SCO-01", {"session_id": sid})
        review = call(client, "SCO-03", {"session_id": sid})
        assert len(review["missing"]) == 6
        for sheet in data["sheets"]:
            command = {
                "session_id": sid,
                "sheet_id": sheet["id"],
                "version": sheet["version"],
                "entries": [
                    {
                        "criterion_id": e["criterion_id"],
                        "score": (20 + i) * 10000,
                        "comment": "가상 평가",
                    }
                    for e in sheet["entries"]
                ],
            }
            invalid = command | {
                "entries": [e | {"score": 1} for e in command["entries"]]
            }
            call(client, "SCO-02", invalid, 422)
            key = str(uuid4())
            saved = call(client, "SCO-02", command, key=key)
            assert call(client, "SCO-02", command, key=key) == saved
            call(client, "SCO-02", command, 409)
        review = call(client, "SCO-03", {"session_id": sid})
        assert review["missing"] == []
        sig = call(
            client,
            "SCO-04",
            {
                "session_id": sid,
                "purpose": "EVALUATION",
                "payload_sha256": review["payload_sha256"],
                "consent": True,
                "consent_text_version": "signature-v2",
                "image": png(),
            },
        )
        call(
            client,
            "SCO-05",
            {"session_id": sid, "signature_id": sig["id"], "payload_sha256": "wrong"},
            409,
        )
        call(
            client,
            "SCO-05",
            {
                "session_id": sid,
                "signature_id": sig["id"],
                "payload_sha256": review["payload_sha256"],
            },
        )
        call(client, "SCO-02", command | {"version": saved["version"]}, 409)
    assert "items" not in call(manager, "RES-01", {"session_id": sid})
    result = call(clients[0], "RES-02", {"session_id": sid})
    assert [r["average_decimal"] for r in result["items"]] == ["69.00", "69.00"]
    assert [r["rank"] for r in result["items"]] == [1, 1]
    assert all(r["included_count"] == 5 for r in result["items"])
    assert len([r for r in result["inputs"] if r["exclusion"] == "LOWEST"]) == 2
    assert len([r for r in result["inputs"] if r["exclusion"] == "HIGHEST"]) == 2
    run = result["run"]["id"]
    sig = call(
        clients[0],
        "RES-03",
        {
            "session_id": sid,
            "result_run_id": run,
            "purpose": "CHAIR_RESULT",
            "payload_sha256": result["payload_sha256"],
            "consent": True,
            "consent_text_version": "signature-v2",
            "image": png(),
        },
    )
    call(manager, "RES-05", {"session_id": sid}, 409)
    call(
        clients[0],
        "RES-04",
        {
            "session_id": sid,
            "result_run_id": run,
            "signature_id": sig["id"],
            "payload_sha256": result["payload_sha256"],
        },
    )
    report = manager.post(
        "/api/v2/actions/RES-05", json={"session_id": sid}, headers=HEADERS
    )
    assert (
        report.status_code == 200
        and "69.00" in report.text
        and "data:image/png;base64," in report.text
    )
    assert (
        call(manager, "PRJ-05", {"project_id": PID})["project"]["status"] == "COMPLETED"
    )
    for db in ("admin", "evaluation"):
        with store.connect(db) as c:
            assert c.execute("PRAGMA foreign_key_check").fetchall() == []


def test_scope_auth_csrf_and_logout(app: FastAPI) -> None:
    outsider = admin(app, "other-demo")
    call(outsider, "PRJ-05", {"project_id": PID}, 403)
    call(outsider, "ATT-02", {"project_id": PID}, 403)
    manager = admin(app)
    call(manager, "ADM-01", {}, 403)
    response = manager.post(
        "/api/v2/actions/PRJ-01",
        json={},
        headers={"Origin": "https://evil.example", "X-Simsa-Client": "v2-web"},
    )
    assert response.status_code == 403
    assert manager.get("/data/admin.sqlite3").status_code == 404
    assert manager.get("/api/v2/bootstrap").status_code == 200
    call(manager, "AUTH-03")
    call(manager, "PRJ-01", {}, 401)


def test_common_admin_project_vendor_crud(app: FastAPI) -> None:
    root = admin(app, "super-demo")
    user = call(
        root,
        "ADM-02",
        {
            "username": "new-user",
            "password": "StrongPass!2026",
            "display_name": "가상 신규 담당",
            "department_id": "web-demo-dept",
        },
    )
    user = call(
        root,
        "ADM-03",
        {
            "admin_id": user["id"],
            "version": user["version"],
            "display_name": "수정 담당",
            "department_id": "web-demo-dept",
        },
    )
    user = call(
        root,
        "ADM-05",
        {
            "admin_id": user["id"],
            "version": user["version"],
            "permission_codes": ["MANAGE_PROJECTS"],
        },
    )
    assert user["permissions"] == ["MANAGE_PROJECTS"]
    call(root, "ADM-04", {"admin_id": user["id"], "version": user["version"]})
    assert any(
        r["username"] == "new-user" and r["active"] == 0
        for r in call(root, "ADM-01")["items"]
    )
    fields = {
        "department_id": "web-demo-dept",
        "name": "테스트 사업",
        "contact_organization": "가상기관",
        "contact_department": "부서",
        "contact_position": "담당",
        "contact_name": "담당자",
        "contact_phone": "010-0000-1111",
        "contact_email": "",
    }
    project = call(root, "PRJ-02", fields)
    pid = project["id"]
    project = call(
        root,
        "PRJ-03",
        fields
        | {"project_id": pid, "version": project["version"], "name": "수정 사업"},
    )
    vendor = call(
        root,
        "PRJ-06",
        {
            "project_id": pid,
            "display_code": "A",
            "legal_name": "가상 법인",
            "sort_order": 1,
        },
    )
    vendor = call(
        root,
        "PRJ-06",
        {
            "project_id": pid,
            "vendor_id": vendor["id"],
            "version": vendor["version"],
            "display_code": "B",
            "legal_name": "가상 법인 수정",
            "sort_order": 2,
        },
    )
    call(
        root,
        "PRJ-07",
        {"project_id": pid, "vendor_id": vendor["id"], "version": vendor["version"]},
    )
    call(
        root,
        "PRJ-04",
        {"project_id": pid, "version": project["version"], "reason": "가상 정리"},
    )
    assert pid not in [p["id"] for p in call(root, "PRJ-01")["items"]]
    assert call(root, "DASH-01")["admin_count"] >= 3
