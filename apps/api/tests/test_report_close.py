"""RES-03 리포트 재현·증빙 검증, CLOSE-01 사업 완료·보관과 완료 후 변경 차단."""

from sqlalchemy import select
from sqlalchemy.orm import Session
from test_results import (  # pytest가 tests/를 sys.path에 넣는다
    actor,
    confirm_criteria,
    draw_members,
    save_and_submit,
    scores_for,
)

from app.core import permissions
from app.modules.evaluations.models import ScoreSheet


def sealed_project(client, admin, setup_project, monkeypatch):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    monkeypatch.setattr(permissions, "chair_id", lambda db, project_id, draw=None: selected[0])
    ratios = [dict(zip(project["vendor_ids"], [1, 0.5, 0])), {v: 1 for v in project["vendor_ids"]}]
    for member, ratio in zip(selected, ratios):
        save_and_submit(client, actor(member), base, scores_for(project, ratio))
    confirmed = client.post(base + "/results/confirm", headers=actor(selected[0]))
    assert confirmed.status_code == 201, confirmed.text
    return project, selected, base, confirmed.json()


def test_report_is_rebuilt_from_snapshot_with_integrity(client, admin, setup_project, monkeypatch):
    project, selected, base, confirmation = sealed_project(
        client, admin, setup_project, monkeypatch
    )
    report_url = base + "/results/report"
    assert client.get(report_url, headers=actor(selected[1])).status_code == 403
    first = client.get(report_url, headers=admin)
    assert first.status_code == 200, first.text
    report = first.json()
    assert report["confirmation"]["id"] == confirmation["id"]
    assert report["snapshot_intact"] is True
    assert report["policy_version"] == "trimmed_mean_v1" and report["criteria_version"] == 1
    assert [c["id"] for c in report["criteria"]] == [c["id"] for c in project["criteria"]]
    assert [r["rank"] for r in report["rankings"]] == [1, 2, 3]
    assert [a["technical_average"] for a in report["averages"]] == [80, 60, 40]
    assert {s["evaluator_id"] for s in report["sheets"]} == set(selected)
    for sheet in report["sheets"]:
        assert sheet["integrity"] == "intact" and len(sheet["sheet_hash"]) == 64
        assert sheet["sign_method"] == "attestation-v1" and sheet["name"].startswith("가상위원")
        assert set(sheet["vendor_totals"]) == set(project["vendor_ids"])
    assert report["document_revisions"] == []
    assert any("전자서명이 아닙니다" in n for n in report["notices"])
    second = client.get(report_url, headers=actor(selected[0])).json()
    assert {k: v for k, v in second.items() if k != "generated_at"} == {
        k: v for k, v in report.items() if k != "generated_at"
    }, "리포트는 저장하지 않고 같은 스냅샷에서 다시 만들어진다"


def test_report_flags_tampered_sheet_and_blocks_close(
    client, admin, setup_project, monkeypatch, test_engine
):
    project, selected, base, _ = sealed_project(client, admin, setup_project, monkeypatch)
    with Session(test_engine) as db:
        sheet = db.scalar(
            select(ScoreSheet).where(
                ScoreSheet.project_id == project["id"], ScoreSheet.evaluator_id == selected[1]
            )
        )
        sheet.opinion = "확정 이후 몰래 고친 의견"
        db.commit()
    report = client.get(base + "/results/report", headers=admin).json()
    flagged = next(s for s in report["sheets"] if s["evaluator_id"] == selected[1])
    assert flagged["integrity"] == "mismatch" and report["snapshot_intact"] is True
    assert any("변경된 평가표" in n for n in report["notices"])
    blocked = client.post(base + "/results/close", headers=admin)
    assert blocked.status_code == 409 and "증빙" in blocked.json()["detail"]


def test_close_requires_confirmation_then_freezes_everything(
    client, admin, setup_project, monkeypatch
):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    early = client.post(base + "/results/close", headers=admin)
    assert early.status_code == 409 and "확정한 뒤" in early.json()["detail"]
    assert client.get(base + "/results/report", headers=admin).status_code == 409

    project, selected, base, _ = sealed_project(client, admin, (project, candidates), monkeypatch)
    sealed_sheet = client.put(
        base + "/evaluations/me",
        headers=actor(selected[0]),
        json={"expected_version": 2, "scores": []},
    )
    assert sealed_sheet.status_code == 409 and "확정" in sealed_sheet.json()["detail"]
    sealed_criteria = client.post(
        base + "/criteria/confirm", headers=admin, json={"expected_version": 1}
    )
    assert sealed_criteria.status_code == 409
    assert client.post(base + "/results/close", headers=actor(selected[0])).status_code == 403

    closed = client.post(base + "/results/close", headers=admin)
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed" and closed.json()["closed_by"] == "local-admin"
    assert closed.json()["closed_at"]
    assert client.post(base + "/results/close", headers=admin).status_code == 409
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["status"] == "closed" and summary["confirmation"]["status"] == "closed"
    frozen_sheet = client.put(
        base + "/evaluations/me",
        headers=actor(selected[1]),
        json={"expected_version": 2, "scores": []},
    )
    assert frozen_sheet.status_code == 409 and "완료·보관" in frozen_sheet.json()["detail"]
    frozen_review = client.post(
        base + "/criteria/confirmation/review", headers=admin, json={"reason": "x"}
    )
    assert frozen_review.status_code == 409
    assert client.post(base + "/results/confirm", headers=actor(selected[0])).status_code == 409
    report = client.get(base + "/results/report", headers=admin)
    assert report.status_code == 200 and report.json()["confirmation"]["status"] == "closed"
