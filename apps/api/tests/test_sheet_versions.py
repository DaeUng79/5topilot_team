"""EVAL-01 기준 버전 고정, EVAL-02 동시 편집, EVAL-03 제출 잠금 우회 차단."""

from concurrent.futures import ThreadPoolExecutor

import pytest


def actor(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def draw_members(client, admin, project, candidates, seats=2, reserves=1):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": seats, "reserves": reserves},
    )
    assert response.status_code == 201, response.text
    return response.json()


def complete_scores(project, criteria=None, value=None):
    criteria = criteria or project["criteria"]
    return [
        {
            "vendor_id": vendor,
            "criterion_id": c["id"],
            "score": c["max_score"] if value is None else value,
        }
        for vendor in project["vendor_ids"]
        for c in criteria
    ]


def test_sheet_pins_confirmed_criteria_version(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    selected = draw_members(client, admin, project, candidates, seats=3)["selected_ids"]
    first, second, third = (actor(member) for member in selected)
    sheet_url = base + "/evaluations/me"
    saved = client.put(
        sheet_url, headers=first, json={"expected_version": 0, "scores": complete_scores(project)}
    )
    assert saved.status_code == 200 and saved.json()["criteria_version"] == 0
    assert client.get(sheet_url, headers=first).json()["criteria_version"] == 0

    confirm = client.post(base + "/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert confirm.status_code == 201
    stale = client.put(
        sheet_url, headers=first, json={"expected_version": 1, "scores": complete_scores(project)}
    )
    assert stale.status_code == 409 and "평가기준" in stale.json()["detail"]
    blocked = client.post(
        sheet_url + "/submit", headers=first, json={"expected_version": 1, "attested": True}
    )
    assert blocked.status_code == 409

    saved2 = client.put(
        sheet_url, headers=second, json={"expected_version": 0, "scores": complete_scores(project)}
    )
    assert saved2.status_code == 200 and saved2.json()["criteria_version"] == 1
    submitted = client.post(
        sheet_url + "/submit", headers=second, json={"expected_version": 1, "attested": True}
    )
    assert submitted.status_code == 200 and submitted.json()["criteria_version"] == 1

    review = client.post(
        base + "/criteria/confirmation/review", headers=admin, json={"reason": "revision"}
    )
    assert review.status_code == 200
    during_review = client.put(
        sheet_url, headers=third, json={"expected_version": 0, "scores": complete_scores(project)}
    )
    assert during_review.status_code == 409 and "재검토" in during_review.json()["detail"]

    narrowed = [{"id": "understanding", "name": "사업 이해도", "max_score": 5}]
    reconfirm = client.post(
        base + "/criteria/confirm",
        headers=admin,
        json={"expected_version": 1, "criteria": narrowed},
    )
    assert reconfirm.status_code == 201 and reconfirm.json()["version"] == 2
    too_high = client.put(
        sheet_url,
        headers=third,
        json={"expected_version": 0, "scores": complete_scores(project, narrowed, value=10)},
    )
    assert too_high.status_code == 422
    fits = client.put(
        sheet_url,
        headers=third,
        json={"expected_version": 0, "scores": complete_scores(project, narrowed, value=5)},
    )
    assert fits.status_code == 200 and fits.json()["criteria_version"] == 2
    done = client.post(
        sheet_url + "/submit", headers=third, json={"expected_version": 1, "attested": True}
    )
    assert done.status_code == 200 and len(done.json()["scores"]) == 3
    assert client.get(sheet_url, headers=second).json()["criteria_version"] == 1


def test_two_tabs_stale_version_and_locked_after_submit(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    member = actor(draw_members(client, admin, project, candidates)["selected_ids"][0])
    url = base + "/evaluations/me"
    scores = complete_scores(project)
    first = client.put(url, headers=member, json={"expected_version": 0, "scores": scores})
    assert first.status_code == 200 and first.json()["version"] == 1
    tab_a = client.get(url, headers=member).json()
    tab_b = client.get(url, headers=member).json()
    assert tab_a["version"] == tab_b["version"] == 1
    saved_a = client.put(
        url,
        headers=member,
        json={"expected_version": tab_a["version"], "scores": scores, "opinion": "A"},
    )
    assert saved_a.status_code == 200 and saved_a.json()["version"] == 2
    stale_b = client.put(
        url,
        headers=member,
        json={"expected_version": tab_b["version"], "scores": scores, "opinion": "B"},
    )
    assert stale_b.status_code == 409
    assert client.get(url, headers=member).json()["opinion"] == "A"
    reloaded_b = client.get(url, headers=member).json()
    submitted = client.post(
        url + "/submit",
        headers=member,
        json={"expected_version": reloaded_b["version"], "attested": True},
    )
    assert submitted.status_code == 200 and submitted.json()["status"] == "submitted"
    late_a = client.post(
        url + "/submit", headers=member, json={"expected_version": 2, "attested": True}
    )
    assert late_a.status_code == 409
    assert (
        client.put(url, headers=member, json={"expected_version": 3, "scores": scores}).status_code
        == 409
    )
    assert client.get(url, headers=member).json()["opinion"] == "A"


def test_postgres_parallel_save_and_submit_have_single_winner(
    client, admin, setup_project, test_engine
):
    if test_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL 병렬 저장·제출 검증은 CI에서 실행")
    project, candidates = setup_project
    member = actor(draw_members(client, admin, project, candidates)["selected_ids"][0])
    url = f"/api/v1/projects/{project['id']}/evaluations/me"
    scores = complete_scores(project)
    assert (
        client.put(url, headers=member, json={"expected_version": 0, "scores": scores}).status_code
        == 200
    )

    def save(opinion):
        return client.put(
            url,
            headers=member,
            json={"expected_version": 1, "scores": scores, "opinion": opinion},
        ).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sorted(pool.map(save, ["a", "b", "c", "d"])) == [200, 409, 409, 409]
    version = client.get(url, headers=member).json()["version"]
    assert version == 2

    def submit(_):
        return client.post(
            url + "/submit", headers=member, json={"expected_version": version, "attested": True}
        ).status_code

    with ThreadPoolExecutor(max_workers=3) as pool:
        assert sorted(pool.map(submit, range(3))) == [200, 409, 409]
    final = client.get(url, headers=member).json()
    assert final["status"] == "submitted" and final["version"] == version + 1
