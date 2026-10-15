"""COM-03 위원장 지정(u-jing 구현분)과 RES-03 위원장 최종 확인 조건.

사업관리자가 추첨 결과의 본위원 중 1명을 사업별 위원장으로 지정하고, 그 위원장만 전원 제출·서명 뒤
결과를 확인·봉인한다. 추첨 로직과 selected_ids는 그대로 쓰며 위원장 변경은 점수·제출 기록을 건드리지
않는다.
"""

from test_results import (  # pytest가 tests/를 sys.path에 넣는다
    SIGNED,
    actor,
    assign_chair,
    confirm_criteria,
    draw_members,
    save_and_submit,
    scores_for,
)


def chair_url(base):
    return base + "/committee/chair"


def submit_all(client, project, base, members):
    full = {v: 1 for v in project["vendor_ids"]}
    for member in members:
        save_and_submit(client, actor(member), base, scores_for(project, full))


def my_sheets(client, base, members):
    return {m: client.get(base + "/evaluations/me", headers=actor(m)).json() for m in members}


def test_only_one_selected_member_can_be_chair(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    url = chair_url(base)
    assert client.get(url, headers=admin).json() == {
        "project_id": project["id"],
        "chair_id": None,
        "chair_name": None,
        "history": [],
        "locked": False,
        "lock_reason": None,
    }
    not_drawn = client.put(url, headers=admin, json={"chair_id": candidates[0]["id"]})
    assert not_drawn.status_code == 409 and "추첨" in not_drawn.json()["detail"]

    draw = draw_members(client, admin, project, candidates)
    selected, reserve = draw["selected_ids"], draw["reserve_ids"][0]
    unselected = next(c["id"] for c in candidates if c["id"] not in selected + [reserve])
    for bad in (reserve, unselected, "missing"):
        rejected = client.put(url, headers=admin, json={"chair_id": bad})
        assert rejected.status_code == 422 and "본위원만" in rejected.json()["detail"], bad
    evaluator = actor(selected[0])
    assert client.put(url, headers=evaluator, json={"chair_id": selected[0]}).status_code == 403
    assert client.put(url, headers=admin, json={"chair_id": selected[0], "x": 1}).status_code == 422

    assigned = client.put(url, headers=admin, json={"chair_id": selected[0]})
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert body["chair_id"] == selected[0] and body["chair_name"].startswith("가상위원")
    assert body["locked"] is False and body["lock_reason"] is None
    (entry,) = body["history"]
    assert entry["chair_id"] == selected[0] and entry["previous_chair_id"] is None
    assert entry["actor_id"] == "local-admin" and entry["reason"] == "" and entry["changed_at"]
    assert client.get(url, headers=admin).json() == body
    assert client.get(url, headers=evaluator).status_code == 403
    again = client.put(url, headers=admin, json={"chair_id": selected[0]})
    assert again.status_code == 409 and "이미" in again.json()["detail"]
    # 추첨 결과(본위원·예비위원·스냅샷 해시)는 그대로다.
    after = client.get(base + "/committee/draw", headers=admin).json()
    assert after["selected_ids"] == selected and after["reserve_ids"] == draw["reserve_ids"]
    assert after["snapshot_sha256"] == draw["snapshot_sha256"]
    # 사업당 위원장 1명: 요약의 위원장 표시도 1명.
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["chair_id"] == selected[0]
    assert [m["evaluator_id"] for m in summary["members"] if m["is_chair"]] == [selected[0]]


def test_chair_role_is_scoped_per_project(client, admin, setup_project):
    project_a, candidates = setup_project
    project_b = client.post(
        "/api/v1/projects", headers=admin, json={"name": "사업 B", "department": "x"}
    ).json()
    base_a, base_b = (f"/api/v1/projects/{p['id']}" for p in (project_a, project_b))
    one, two = (c["id"] for c in candidates[:2])
    for base in (base_a, base_b):
        drawn = client.post(
            base + "/committee/draw",
            headers=admin,
            json={"candidate_ids": [one, two], "seats": 2, "reserves": 0},
        )
        assert drawn.status_code == 201, drawn.text
    assign_chair(client, admin, base_a, one)
    assign_chair(client, admin, base_b, two)
    # 같은 사람이 사업 A에서는 위원장, 사업 B에서는 일반 위원이다.
    assert client.get(base_a + "/results/summary", headers=actor(one)).status_code == 200
    assert client.get(base_a + "/results/summary", headers=actor(two)).status_code == 403
    assert client.get(base_b + "/results/summary", headers=actor(two)).status_code == 200
    assert client.get(base_b + "/results/summary", headers=actor(one)).status_code == 403
    denied = client.post(base_b + "/results/confirm", headers=actor(one), json=SIGNED)
    assert denied.status_code == 403
    assert client.get(chair_url(base_a), headers=admin).json()["chair_id"] == one
    assert client.get(chair_url(base_b), headers=admin).json()["chair_id"] == two
    # 채점 권한은 두 사업 모두 그대로다.
    for base in (base_a, base_b):
        for member in (one, two):
            assert client.get(base + "/evaluations/me", headers=actor(member)).status_code == 200


def test_chair_confirms_only_after_all_signed_then_result_is_sealed(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    chair, member = draw_members(client, admin, project, candidates)["selected_ids"]
    url = base + "/results/confirm"
    # 위원장 미지정: 아무도 확정 못 하고, 위원장 화면이 쓰는 요약도 403.
    assert client.post(url, headers=actor(chair), json=SIGNED).status_code == 403
    assert client.get(base + "/results/summary", headers=actor(chair)).status_code == 403
    assign_chair(client, admin, base, chair)
    assert client.get(base + "/results/summary", headers=actor(chair)).status_code == 200
    assert client.get(base + "/results/summary", headers=actor(member)).status_code == 403
    # 전원 제출 전 차단.
    early = client.post(url, headers=actor(chair), json=SIGNED)
    assert early.status_code == 409 and "전원 제출" in early.json()["detail"]
    submit_all(client, project, base, [chair])
    early = client.post(url, headers=actor(chair), json=SIGNED)
    assert early.status_code == 409 and "1명 제출" in early.json()["detail"]
    submit_all(client, project, base, [member])
    # 일반 위원·관리자는 위원장을 대신해 서명할 수 없고, 위원장도 확인 동의 없이는 안 된다.
    assert client.post(url, headers=actor(member), json=SIGNED).status_code == 403
    assert client.post(url, headers=admin, json=SIGNED).status_code == 403
    assert client.post(url, headers=actor(chair)).status_code == 422
    assert client.post(url, headers=actor(chair), json={"reviewed": False}).status_code == 422
    sealed = client.post(url, headers=actor(chair), json=SIGNED)
    assert sealed.status_code == 201, sealed.text
    body = sealed.json()
    assert body["confirmed_by"] == chair and body["confirmed_at"]
    assert len(body["result_sha256"]) == 64 and body["criteria_version"] == 1
    assert body["policy_version"] == "trimmed_mean_v1"
    # 봉인 뒤: 평가표 수정·재확정·위원장 변경 차단, 리포트는 위원장 확인 기록을 담는다.
    version = client.get(base + "/evaluations/me", headers=actor(member)).json()["version"]
    blocked = client.put(
        base + "/evaluations/me",
        headers=actor(member),
        json={"expected_version": version, "scores": []},
    )
    assert blocked.status_code == 409 and "확정" in blocked.json()["detail"]
    assert client.post(url, headers=actor(chair), json=SIGNED).status_code == 409
    change = client.put(
        chair_url(base), headers=admin, json={"chair_id": member, "reason": "확정 뒤 변경 시도"}
    )
    assert change.status_code == 409 and "확정" in change.json()["detail"]
    state = client.get(chair_url(base), headers=admin).json()
    assert state["chair_id"] == chair and state["locked"] is True
    assert "확정" in state["lock_reason"]
    report = client.get(base + "/results/report", headers=actor(chair)).json()
    assert report["confirmation"]["confirmed_by"] == chair
    assert all(s["integrity"] == "intact" for s in report["sheets"])
    assert any("전자서명이 아닙니다" in n for n in report["notices"])
    # 완료·보관 뒤에도 변경 불가.
    assert client.post(base + "/results/close", headers=admin).status_code == 200
    closed = client.put(chair_url(base), headers=admin, json={"chair_id": member, "reason": "x"})
    assert closed.status_code == 409 and "완료" in closed.json()["detail"]


def test_chair_change_keeps_scores_and_moves_permissions(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    first, second = selected
    assign_chair(client, admin, base, first)
    submit_all(client, project, base, selected)
    before = my_sheets(client, base, selected)
    no_reason = client.put(chair_url(base), headers=admin, json={"chair_id": second})
    assert no_reason.status_code == 422 and "사유" in no_reason.json()["detail"]
    assert client.get(chair_url(base), headers=admin).json()["chair_id"] == first
    changed = assign_chair(client, admin, base, second, reason="기존 위원장 일정 사유로 교체")
    assert changed["chair_id"] == second
    assert [h["chair_id"] for h in changed["history"]] == [first, second]
    assert changed["history"][1]["previous_chair_id"] == first
    assert changed["history"][1]["reason"] == "기존 위원장 일정 사유로 교체"
    # 권한 이동: 기존 위원장은 일반 위원으로 돌아가고 신규 위원장만 확정할 수 있다.
    assert client.get(base + "/results/summary", headers=actor(first)).status_code == 403
    denied = client.post(base + "/results/confirm", headers=actor(first), json=SIGNED)
    assert denied.status_code == 403
    summary = client.get(base + "/results/summary", headers=actor(second)).json()
    assert summary["chair_id"] == second and summary["confirmable"] is True
    assert [m["evaluator_id"] for m in summary["members"] if m["is_chair"]] == [second]
    # 점수·제출·서명 기록은 그대로다.
    assert my_sheets(client, base, selected) == before
    assert summary["submitted"] == 2
    assert all(m["status"] == "submitted" and m["signed_at"] for m in summary["members"])
    sealed = client.post(base + "/results/confirm", headers=actor(second), json=SIGNED)
    assert sealed.status_code == 201 and sealed.json()["confirmed_by"] == second
