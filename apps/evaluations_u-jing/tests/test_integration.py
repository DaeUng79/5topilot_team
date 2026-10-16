from __future__ import annotations

import json
from uuid import uuid4

import pytest
from committee_app.v2_core import ModuleError, digest, now
from db import DTO, Store
from integration_contracts import apply_event


def event(
    name: str, payload: DTO, version: int = 1, identity: str | None = None
) -> DTO:
    return {
        "event_id": identity or str(uuid4()),
        "contract_name": name,
        "schema_version": 2,
        "aggregate_id": payload.get("id", payload.get("project_id")),
        "aggregate_version": version,
        "payload": payload,
        "payload_sha256": digest(payload),
    }


def test_named_document_contracts_pending_parent_and_ack(store: Store) -> None:
    pin = {
        "project_id": "p1",
        "upload_revision": 1,
        "document_id": "a" * 64,
        "parse_revision": "b" * 64,
    }
    items = [
        {
            "id": "real-contract-item",
            "project_id": "p1",
            "approved_criteria_version_id": "approved-contract",
            "parent_id": None,
            "code": "C1",
            "title": "가상 기준",
            "description": None,
            "is_scorable": 1,
            "max_score": 1000000,
            "score_step": 10000,
            "sort_order": 1,
        }
    ]
    criteria = {
        "id": "approved-contract",
        "project_id": "p1",
        "approval_no": 1,
        "rfp_pin": pin,
        "status": "APPROVED",
        "approved_at": now(),
        "total_max_score": 1000000,
        "items": items,
        "snapshot_sha256": digest(items),
    }
    approved = event("criteria.approved", criteria)
    assert apply_event(store, approved, "documents")["status"] == "PENDING_PARENT"
    bound = event("rfp.bound", pin)
    assert apply_event(store, bound, "documents")["status"] == "APPLIED"
    assert apply_event(store, approved, "documents")["status"] == "APPLIED"
    assert apply_event(store, approved, "documents")["status"] == "DUPLICATE"
    with store.connect() as c:
        row = c.execute(
            "SELECT rfp_binding_id FROM ref_approved_criteria_versions WHERE id='approved-contract'"
        ).fetchone()
        assert row[0] == digest(pin)
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []
    proposal = {
        "project_id": "demo-evaluation",
        "vendor_id": "demo-vendor-0",
        "proposal_upload_id": "external-proposal",
        "upload_revision": 2,
        "document_id": "c" * 64,
        "parse_revision": "d" * 64,
        "format": "PDF",
    }
    assert (
        apply_event(store, event("proposal.ready", proposal), "documents")["status"]
        == "APPLIED"
    )


def test_snapshot_no_backward_overwrite_and_error_is_durable(store: Store) -> None:
    payload = {
        "project_id": "p1",
        "department_id": "web-demo-dept",
        "name": "가상 사업 수정",
        "status": "PREPARING",
        "version": 2,
        "is_deleted": 0,
    }
    assert (
        apply_event(store, event("project.snapshot", payload, 2), "admin")["status"]
        == "APPLIED"
    )
    stale = event("project.snapshot", payload | {"version": 1}, 1)
    with pytest.raises(ModuleError):
        apply_event(store, stale, "admin")
    with store.connect() as c:
        assert (
            c.execute(
                "SELECT source_version FROM ref_projects WHERE id='p1'"
            ).fetchone()[0]
            == 2
        )
        assert (
            c.execute(
                "SELECT status FROM sync_inbox WHERE event_id=?", (stale["event_id"],)
            ).fetchone()[0]
            == "REJECTED"
        )
    with store.connect("admin") as c:
        pending = c.execute(
            "SELECT contract_name,payload_json FROM sync_outbox WHERE destination='documents' AND status='PENDING'"
        ).fetchall()
        assert {r[0] for r in pending} == {
            "project.snapshot",
            "admin.projection",
            "vendor.snapshot",
        }
        assert all("password_hash" not in json.loads(r[1]) for r in pending)
