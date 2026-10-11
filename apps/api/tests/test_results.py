"""RES-01 공개 시점, RES-02 정책 버전, RES-03 위원장 확정·서명 기록.

EVAL-03의 개인 제출과 사업 결과 확정이 별도 상태임도 함께 확인한다.
"""

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions
from app.modules.evaluations.models import ScoreSheet
from app.modules.results import policies

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "synthetic"


def actor(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def draw_members(client, admin, project, candidates, seats=2):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": seats, "reserves": 1},
    )
    assert response.status_code == 201, response.text
    return response.json()


def scores_for(project, per_vendor_ratio):
    return [
        {
            "vendor_id": vendor,
            "criterion_id": c["id"],
            "score": round(c["max_score"] * per_vendor_ratio[vendor], 2),
        }
        for vendor in project["vendor_ids"]
        for c in project["criteria"]
    ]


def save_and_submit(client, headers, base, scores):
    saved = client.put(
        base + "/evaluations/me", headers=headers, json={"expected_version": 0, "scores": scores}
    )
    assert saved.status_code == 200, saved.text
    submitted = client.post(
        base + "/evaluations/me/submit",
        headers=headers,
        json={"expected_version": saved.json()["version"], "attested": True},
    )
    assert submitted.status_code == 200, submitted.text
    return submitted.json()


def confirm_criteria(client, admin, base):
    response = client.post(base + "/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert response.status_code == 201, response.text


@pytest.fixture
def chair_is_first_selected(monkeypatch):
    def set_chair(selected_ids):
        monkeypatch.setattr(
            permissions, "chair_id", lambda db, project_id, draw=None: selected_ids[0]
        )

    return set_chair


def test_summary_hides_averages_until_all_submitted_and_checks_roles(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    first, second = actor(selected[0]), actor(selected[1])
    url = base + "/results/summary"
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "collecting"
    assert summary["expected"] == 2 and summary["submitted"] == 0
    assert summary["averages"] == [] and summary["rankings"] == []
    assert [m["status"] for m in summary["members"]] == ["none", "none"]
    assert summary["chair_id"] is None and summary["confirmable"] is False
    assert summary["policy_version"] == "trimmed_mean_v1" and summary["criteria_version"] == 1
    assert client.get(url, headers=first).status_code == 403
    assert client.get(url).status_code == 401

    full = {v: 1 for v in project["vendor_ids"]}
    sheet = save_and_submit(client, first, base, scores_for(project, full))
    assert sheet["signed_at"] == sheet["submitted_at"]
    assert len(sheet["sheet_hash"]) == 64 and sheet["sign_method"] == "attestation-v1"
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "collecting" and summary["submitted"] == 1
    assert summary["averages"] == [], "전원 제출 전에는 평균을 공개하지 않음"
    member = next(m for m in summary["members"] if m["evaluator_id"] == selected[0])
    assert (
        member["status"] == "submitted" and member["signed_at"] and member["criteria_version"] == 1
    )

    ratios = dict(zip(project["vendor_ids"], [1, 0.5, 0]))
    save_and_submit(client, second, base, scores_for(project, ratios))
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "technical_complete" and summary["submitted"] == 2
    assert [a["technical_average"] for a in summary["averages"]] == [80, 60, 40]
    assert [(r["rank"], r["vendor_id"]) for r in summary["rankings"]] == [
        (1, project["vendor_ids"][0]),
        (2, project["vendor_ids"][1]),
        (3, project["vendor_ids"][2]),
    ]
    assert summary["confirmable"] is False, "위원장 미지정이면 확정 불가"


def test_confirm_requires_chair_completion_and_seals_once(
    client, admin, setup_project, chair_is_first_selected
):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    first, second = actor(selected[0]), actor(selected[1])
    confirm_url = base + "/results/confirm"
    assert client.post(confirm_url, headers=first).status_code == 403, "위원장 미지정"
    chair_is_first_selected(selected)
    assert client.post(confirm_url, headers=admin).status_code == 403
    assert client.post(confirm_url, headers=second).status_code == 403
    early = client.post(confirm_url, headers=first)
    assert early.status_code == 409 and "전원 제출" in early.json()["detail"]

    full = {v: 1 for v in project["vendor_ids"]}
    save_and_submit(client, first, base, scores_for(project, full))
    save_and_submit(client, second, base, scores_for(project, full))
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["confirmable"] is True and summary["chair_id"] == selected[0]
    assert next(m for m in summary["members"] if m["is_chair"])["evaluator_id"] == selected[0]

    confirmed = client.post(confirm_url, headers=first)
    assert confirmed.status_code == 201, confirmed.text
    body = confirmed.json()
    assert body["status"] == "confirmed" and body["policy_version"] == "trimmed_mean_v1"
    assert body["criteria_version"] == 1 and len(body["result_sha256"]) == 64
    assert body["confirmed_by"] == selected[0] and body["expected"] == body["submitted"] == 2
    assert client.post(confirm_url, headers=first).status_code == 409
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["status"] == "confirmed" and summary["confirmable"] is False
    assert summary["confirmation"]["id"] == body["id"]
    assert client.get(base + "/results/confirmation", headers=admin).json()["id"] == body["id"]
    assert client.get(base + "/results/confirmation", headers=first).status_code == 200
    assert client.get(base + "/results/confirmation", headers=second).status_code == 403
    assert client.get(base + "/results", headers=admin).json()["status"] == "technical_complete"


def test_confirm_rejects_unconfirmed_mixed_or_changed_criteria(
    client, admin, setup_project, chair_is_first_selected
):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    chair_is_first_selected(selected)
    first, second = actor(selected[0]), actor(selected[1])
    full = {v: 1 for v in project["vendor_ids"]}
    save_and_submit(client, first, base, scores_for(project, full))
    save_and_submit(client, second, base, scores_for(project, full))
    unconfirmed = client.post(base + "/results/confirm", headers=first)
    assert unconfirmed.status_code == 409 and "버전 1 이상" in unconfirmed.json()["detail"]

    other = client.post(
        "/api/v1/projects", headers=admin, json={"name": "혼합 버전 사업", "department": "x"}
    ).json()
    other_base = f"/api/v1/projects/{other['id']}"
    selected_other = draw_members(client, admin, other, candidates)["selected_ids"]
    chair_is_first_selected(selected_other)
    one, two = actor(selected_other[0]), actor(selected_other[1])
    save_and_submit(client, one, other_base, scores_for(other, full))
    confirm_criteria(client, admin, other_base)
    save_and_submit(client, two, other_base, scores_for(other, full))
    mixed = client.post(other_base + "/results/confirm", headers=one)
    assert mixed.status_code == 409 and "서로 다릅니다" in mixed.json()["detail"]

    third = client.post(
        "/api/v1/projects", headers=admin, json={"name": "기준 변경 사업", "department": "x"}
    ).json()
    third_base = f"/api/v1/projects/{third['id']}"
    confirm_criteria(client, admin, third_base)
    selected_third = draw_members(client, admin, third, candidates)["selected_ids"]
    chair_is_first_selected(selected_third)
    for member in selected_third:
        save_and_submit(client, actor(member), third_base, scores_for(third, full))
    reconfirm = client.post(
        third_base + "/criteria/confirm", headers=admin, json={"expected_version": 1}
    )
    assert reconfirm.status_code == 201
    changed = client.post(third_base + "/results/confirm", headers=actor(selected_third[0]))
    assert changed.status_code == 409 and "변경" in changed.json()["detail"]


def test_confirm_detects_tampered_sheet(
    client, admin, setup_project, test_engine, chair_is_first_selected
):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    chair_is_first_selected(selected)
    full = {v: 1 for v in project["vendor_ids"]}
    for member in selected:
        save_and_submit(client, actor(member), base, scores_for(project, full))
    with Session(test_engine) as db:
        target = db.scalar(
            select(ScoreSheet).where(
                ScoreSheet.project_id == project["id"], ScoreSheet.evaluator_id == selected[1]
            )
        )
        target.scores = [{**s, "score": 0} for s in target.scores]
        db.commit()
    tampered = client.post(base + "/results/confirm", headers=actor(selected[0]))
    assert tampered.status_code == 409 and "해시" in tampered.json()["detail"]
    assert tampered.json()["detail"].endswith(selected[1])


def test_policies_registry_and_ranking():
    with pytest.raises(HTTPException) as exc:
        policies.aggregate("unknown", None, [])
    assert exc.value.status_code == 409
    assert policies.CURRENT_POLICY == "trimmed_mean_v1"
    assert policies.POLICIES["trimmed_mean_v1"].approved
    assert policies.rank(
        [
            {"vendor_id": "b", "technical_average": 75.0},
            {"vendor_id": "a", "technical_average": 75.0},
            {"vendor_id": "c", "technical_average": 10.0},
        ]
    ) == [
        {"rank": 1, "vendor_id": "a", "technical_average": 75.0},
        {"rank": 1, "vendor_id": "b", "technical_average": 75.0},
        {"rank": 3, "vendor_id": "c", "technical_average": 10.0},
    ]


def test_summary_trims_highest_and_lowest_totals_with_three_members(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates, seats=3)["selected_ids"]
    a, b, c = project["vendor_ids"]
    ratios = [{a: 1, b: 1, c: 0}, {a: 0.5, b: 1, c: 0}, {a: 0.75, b: 1, c: 1}]
    for member, ratio in zip(selected, ratios):
        save_and_submit(client, actor(member), base, scores_for(project, ratio))
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["policy_version"] == "trimmed_mean_v1"
    assert {x["vendor_id"]: x["technical_average"] for x in summary["averages"]} == {
        a: 60.0,  # [80, 40, 60] → 80·40 제외
        b: 80.0,  # [80, 80, 80] → 동점이라도 1개씩만 제외
        c: 0.0,  # [0, 0, 80] → 80·0 제외
    }
    legacy = client.get(base + "/results", headers=admin).json()
    assert legacy["averages"] == summary["averages"]
    assert legacy["calculation"].startswith("trimmed_mean_v1")
