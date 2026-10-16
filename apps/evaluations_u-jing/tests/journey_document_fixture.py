"""Test-only document-producer simulation. Never edits Oh Daeung's modules/DB."""

import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "committee_Lex6won"))
from committee_app.v2_core import digest, packed
from run_web import setup
from sync_service import receive_document_snapshot


async def main():
    folder, pid = Path(sys.argv[1]).resolve(), sys.argv[2]
    if not folder.is_relative_to(ROOT / "test-results"):
        raise ValueError("Only isolated test-results databases are allowed")
    store = await setup(folder, False, None)
    with store.connect() as conn:
        payload = json.loads(
            conn.execute(
                "SELECT payload_json FROM sync_inbox WHERE event_id='demo-approved-documents-v1'"
            ).fetchone()[0]
        )
    with store.connect("admin") as conn:
        vendors = conn.execute(
            "SELECT id FROM project_vendors WHERE project_id=? ORDER BY sort_order,id",
            (pid,),
        ).fetchall()
    assert len(vendors) == 2
    identities = {
        row["id"]: str(uuid4())
        for row in [
            payload["binding"],
            payload["criteria"],
            *payload["items"],
            *payload["proposals"],
        ]
    }
    for row in [
        payload["binding"],
        payload["criteria"],
        *payload["items"],
        *payload["proposals"],
    ]:
        row["project_id"] = pid
        for key in (
            "id",
            "rfp_binding_id",
            "approved_criteria_version_id",
            "parent_id",
        ):
            if row.get(key) in identities:
                row[key] = identities[row[key]]
    for proposal, vendor in zip(payload["proposals"], vendors):
        proposal["vendor_id"] = vendor["id"]
    result = receive_document_snapshot(
        store,
        {
            "event_id": str(uuid4()),
            "contract_name": "documents.approved.snapshot",
            "schema_version": 2,
            "aggregate_id": pid,
            "aggregate_version": 1,
            "payload_json": packed(payload),
            "payload_sha256": digest(payload),
        },
    )
    assert result["status"] == "APPLIED"
    print(
        "Synthetic approved document snapshot received for isolated journey test", pid
    )


if __name__ == "__main__":
    asyncio.run(main())
