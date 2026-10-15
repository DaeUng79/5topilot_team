"""사업별 평가 설정(평가항목·업체) 편집: 관리자 권한, 순서·표시명 저장, 입력 검증,
평가 시작 뒤 잠금, 설정에 맞춘 평가표 자동 구성(항목 수 × 업체 수)."""

import pytest


def evaluator(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def draw(client, admin, project, candidates, seats=1, reserves=1):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": seats, "reserves": reserves},
    )
    assert response.status_code == 201, response.text
    return response.json()


def listed_project(client, admin, project_id):
    return next(
        p for p in client.get("/api/v1/projects", headers=admin).json() if p["id"] == project_id
    )


FIVE = [{"name": f"항목 {i}", "max_score": 20} for i in range(1, 6)]
FOUR = [{"name": f"업체 {i}"} for i in range(1, 5)]


def test_setup_shows_template_with_derived_vendor_names(client, admin, setup_project):
    project, _ = setup_project
    body = client.get(f"/api/v1/projects/{project['id']}/setup", headers=admin).json()
    assert body["criteria"] == project["criteria"]
    assert body["total_score"] == 100 and body["required_total_score"] == 100
    # 0004 이전 행·시작용 템플릿(vendors NULL)은 종전 화면 표기(A사·B사·C사)를 유지한다.
    assert body["vendors"] == [
        {"id": "vendor-a", "name": "A사"},
        {"id": "vendor-b", "name": "B사"},
        {"id": "vendor-c", "name": "C사"},
    ]
    assert project["vendors"] == body["vendors"]  # 사업 목록(ProjectRead)도 같은 표시명을 준다
    assert body["criteria_version"] == 0
    assert body["criteria_editable"] is True and body["criteria_lock_reason"] is None
    assert body["vendors_editable"] is True and body["vendors_lock_reason"] is None


def test_only_admin_can_read_or_edit(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}/setup"
    headers = evaluator(candidates[0]["id"])
    assert client.get(base, headers=headers).status_code == 403
    assert (
        client.put(f"{base}/criteria", headers=headers, json={"criteria": FIVE}).status_code == 403
    )
    assert client.put(f"{base}/vendors", headers=headers, json={"vendors": FOUR}).status_code == 403
    assert client.get("/api/v1/projects/no-such-project/setup", headers=admin).status_code == 404


def test_criteria_update_keeps_order_assigns_ids_and_total(client, admin, setup_project):
    project, _ = setup_project
    url = f"/api/v1/projects/{project['id']}/setup/criteria"
    items = [{"id": "custom-1", "name": "사업 이해도", "max_score": 30}, *FIVE[:4]]
    response = client.put(url, headers=admin, json={"criteria": items})
    assert response.status_code == 200, response.text
    body = response.json()
    assert [c["name"] for c in body["criteria"]] == [c["name"] for c in items]
    assert body["criteria"][0]["id"] == "custom-1"
    generated = [c["id"] for c in body["criteria"][1:]]
    assert len(set(generated)) == 4 and all(g.startswith("crit-") for g in generated)
    assert body["total_score"] == 30 + 20 * 4
    # 순서 변경: 기존 ID를 그대로 보내면 ID와 배점이 유지된다.
    reordered = list(reversed(body["criteria"]))
    assert (
        client.put(url, headers=admin, json={"criteria": reordered}).json()["criteria"] == reordered
    )
    assert listed_project(client, admin, project["id"])["criteria"] == reordered


def test_vendor_update_stores_names_and_order(client, admin, setup_project):
    project, _ = setup_project
    url = f"/api/v1/projects/{project['id']}/setup/vendors"
    body = client.put(url, headers=admin, json={"vendors": FOUR}).json()
    assert [v["name"] for v in body["vendors"]] == [v["name"] for v in FOUR]
    ids = [v["id"] for v in body["vendors"]]
    assert len(set(ids)) == 4 and all(i.startswith("vendor-") for i in ids)
    listed = listed_project(client, admin, project["id"])
    assert listed["vendor_ids"] == ids and listed["vendors"] == body["vendors"]
    # 이름 수정·순서 변경: ID는 유지된다.
    edited = [
        {"id": ids[1], "name": "업체 2 (주)"},
        {"id": ids[0], "name": "업체 1"},
        {"id": ids[2], "name": "업체 3"},
    ]
    assert client.put(url, headers=admin, json={"vendors": edited}).json()["vendors"] == edited
    assert (
        client.get(f"/api/v1/projects/{project['id']}/setup", headers=admin).json()["vendors"]
        == edited
    )
    assert listed_project(client, admin, project["id"])["vendor_ids"] == [v["id"] for v in edited]


@pytest.mark.parametrize(
    ("area", "payload"),
    [
        ("criteria", {"criteria": [{"name": " ", "max_score": 10}]}),
        ("criteria", {"criteria": [{"name": "항목", "max_score": 0}]}),
        ("criteria", {"criteria": [{"name": "항목", "max_score": 101}]}),
        (
            "criteria",
            {"criteria": [{"name": "항목", "max_score": 10}, {"name": "항목", "max_score": 5}]},
        ),
        (
            "criteria",
            {
                "criteria": [
                    {"id": "x", "name": "A", "max_score": 10},
                    {"id": "x", "name": "B", "max_score": 5},
                ]
            },
        ),
        ("criteria", {"criteria": [{"name": "항목", "max_score": 10, "extra": 1}]}),
        ("vendors", {"vendors": []}),
        ("vendors", {"vendors": [{"name": ""}]}),
        ("vendors", {"vendors": [{"name": "같은 업체"}, {"name": "같은 업체"}]}),
        ("vendors", {"vendors": [{"id": "v", "name": "A"}, {"id": "v", "name": "B"}]}),
    ],
)
def test_invalid_updates_are_rejected_without_change(client, admin, setup_project, area, payload):
    project, _ = setup_project
    url = f"/api/v1/projects/{project['id']}/setup"
    before = client.get(url, headers=admin).json()
    response = client.put(f"{url}/{area}", headers=admin, json=payload)
    assert response.status_code == 422, response.text
    assert client.get(url, headers=admin).json() == before


def test_sheet_follows_setup_and_setup_locks_once_evaluation_starts(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    criteria = client.put(f"{base}/setup/criteria", headers=admin, json={"criteria": FIVE}).json()[
        "criteria"
    ]
    vendors = client.put(f"{base}/setup/vendors", headers=admin, json={"vendors": FOUR}).json()[
        "vendors"
    ]
    selected = draw(client, admin, project, candidates)["selected_ids"]
    headers = evaluator(selected[0])
    brief = client.get(f"{base}/evaluator-access/brief", headers=headers).json()
    assert brief["criteria"] == criteria and brief["vendors"] == vendors
    assert brief["vendor_ids"] == [v["id"] for v in vendors]
    # 추첨만으로는 잠기지 않는다.
    assert client.get(f"{base}/setup", headers=admin).json()["criteria_editable"] is True

    scores = [
        {"vendor_id": v["id"], "criterion_id": c["id"], "score": 10}
        for v in vendors
        for c in criteria
    ]
    assert len(scores) == 5 * 4
    saved = client.put(
        f"{base}/evaluations/me",
        headers=headers,
        json={"expected_version": 0, "scores": scores[:-1], "opinion": ""},
    )
    assert saved.status_code == 200, saved.text
    # 평가표가 하나라도 저장되면 평가항목·업체 모두 잠긴다.
    setup = client.get(f"{base}/setup", headers=admin).json()
    assert setup["criteria_editable"] is False and setup["vendors_editable"] is False
    assert "평가표 작성을 시작" in setup["criteria_lock_reason"]
    assert setup["vendors_lock_reason"] == setup["criteria_lock_reason"]
    for area, payload in (("criteria", {"criteria": FIVE}), ("vendors", {"vendors": FOUR})):
        response = client.put(f"{base}/setup/{area}", headers=admin, json=payload)
        assert response.status_code == 409, response.text
    assert client.get(f"{base}/setup", headers=admin).json()["criteria"] == criteria

    # 19칸은 미완성, 20칸(5항목 × 4업체) 전부 작성해야 제출된다.
    version = saved.json()["version"]
    incomplete = client.post(
        f"{base}/evaluations/me/submit",
        headers=headers,
        json={"expected_version": version, "attested": True},
    )
    assert incomplete.status_code == 422
    full = client.put(
        f"{base}/evaluations/me",
        headers=headers,
        json={"expected_version": version, "scores": scores, "opinion": ""},
    )
    assert full.status_code == 200, full.text
    submitted = client.post(
        f"{base}/evaluations/me/submit",
        headers=headers,
        json={"expected_version": full.json()["version"], "attested": True},
    )
    assert submitted.status_code == 200, submitted.text
    results = client.get(f"{base}/results", headers=admin).json()
    assert results["status"] == "technical_complete"
    assert {r["vendor_id"]: r["technical_average"] for r in results["averages"]} == {
        v["id"]: 50.0 for v in vendors
    }


def test_confirmed_criteria_lock_criteria_but_not_vendors(client, admin, setup_project):
    project, _ = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirmed = client.post(f"{base}/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert confirmed.status_code == 201, confirmed.text
    setup = client.get(f"{base}/setup", headers=admin).json()
    assert setup["criteria_version"] == 1
    assert setup["criteria_editable"] is False and "v1" in setup["criteria_lock_reason"]
    assert setup["vendors_editable"] is True and setup["vendors_lock_reason"] is None
    assert (
        client.put(f"{base}/setup/criteria", headers=admin, json={"criteria": FIVE}).status_code
        == 409
    )
    assert (
        client.put(f"{base}/setup/vendors", headers=admin, json={"vendors": FOUR}).status_code
        == 200
    )
