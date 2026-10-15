"""로그인·권한 분리: 관리자 로컬 로그인(아이디/비밀번호), 평가위원 이름·생년월일 로그인,
세션별 접근 범위(관리자 API 차단, 배정된 사업만), 평가항목 배점 합계 100점 규칙."""

import pytest

from app.core.config import settings
from app.modules.evaluator_access import service


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "app_env", "local")
    service.reset_attempts()
    yield
    service.reset_attempts()


def login_admin(client, username="admin", password="admin"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def login_evaluator(client, name, birth_date):
    return client.post(
        "/api/v1/evaluator-access/login", json={"name": name, "birth_date": birth_date}
    )


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, admin, name, birth_date=None):
    body = {"name": name, "organization": "테스트 기관", "specialty": "정보시스템"}
    if birth_date is not None:
        body["birth_date"] = birth_date
    response = client.post("/api/v1/committee/candidates", headers=admin, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def create_project(client, admin, name):
    response = client.post(
        "/api/v1/projects", headers=admin, json={"name": name, "department": "검증팀"}
    )
    assert response.status_code == 201, response.text
    return response.json()


def draw(client, admin, project_id, candidate_ids, seats, reserves=0):
    response = client.post(
        f"/api/v1/projects/{project_id}/committee/draw",
        headers=admin,
        json={"candidate_ids": candidate_ids, "seats": seats, "reserves": reserves},
    )
    assert response.status_code == 201, response.text
    return response.json()


def full_scores(project, value=5):
    return [
        {"vendor_id": v, "criterion_id": c["id"], "score": value}
        for v in project["vendor_ids"]
        for c in project["criteria"]
    ]


def test_admin_login_issues_admin_session(client, admin, auth_env):
    response = login_admin(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["method"] == "local_admin_password"
    assert body["actor"] == {
        "role": "admin",
        "id": "admin",
        "project_id": None,
        "name": "사업관리자",
    }
    assert '"password"' not in response.text
    headers = bearer(body["token"])
    assert client.get("/api/v1/projects", headers=headers).status_code == 200
    assert client.get("/api/v1/evaluator-access/me", headers=headers).json() == body["actor"]
    created = client.post(
        "/api/v1/projects", headers=headers, json={"name": "로그인 사업", "department": "검증팀"}
    )
    assert created.status_code == 201
    assert (
        client.get(f"/api/v1/projects/{created.json()['id']}/setup", headers=headers).status_code
        == 200
    )
    # 관리자 세션은 평가위원용 사업 목록을 쓰지 않는다.
    assert client.get("/api/v1/evaluator-access/projects", headers=headers).status_code == 403


def test_admin_login_rejects_bad_credentials_and_locks(client, auth_env):
    assert login_admin(client, "admin", "wrong").status_code == 401
    assert login_admin(client, "root", "admin").status_code == 401
    assert login_admin(client, "", "admin").status_code == 422
    for _ in range(service.MAX_ATTEMPTS - 1):
        assert login_admin(client, "admin", "wrong").status_code == 401
    assert login_admin(client).status_code == 429
    service.reset_attempts()
    assert login_admin(client).status_code == 200


def test_admin_login_closed_without_demo_auth(client, auth_env, monkeypatch):
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", False)
    assert login_admin(client).status_code == 503


def test_evaluator_login_scopes_to_assigned_projects(client, admin, auth_env):
    member = register(client, admin, "로그인위원", "1987-12-23")
    other = register(client, admin, "다른위원", "1975-03-05")
    unassigned = register(client, admin, "미선정위원", "1990-07-15")
    project_a = create_project(client, admin, "A 사업")
    project_b = create_project(client, admin, "B 사업")
    create_project(client, admin, "C 사업")
    draw(client, admin, project_a["id"], [member["id"], other["id"]], seats=2)
    draw(client, admin, project_b["id"], [other["id"]], seats=1)

    assert login_evaluator(client, "미선정위원", "900715").status_code == 403
    assert login_evaluator(client, "로그인위원", "000000").status_code == 401
    assert login_evaluator(client, "없는위원", "871223").status_code == 401
    assert login_evaluator(client, "로그인위원", "87122a").status_code == 422
    response = login_evaluator(client, "로그인위원", "871223")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["method"] == "birth_date"
    assert body["actor"] == {
        "role": "evaluator",
        "id": member["id"],
        "project_id": None,
        "name": "로그인위원",
    }
    assert "871223" not in response.text and '"birth_date":' not in response.text
    headers = bearer(body["token"])
    assert client.get("/api/v1/evaluator-access/me", headers=headers).json() == body["actor"]

    # 배정된 사업만 목록에 나온다. B(미선정)·C(추첨 전)는 보이지 않는다.
    mine = client.get("/api/v1/evaluator-access/projects", headers=headers)
    assert mine.status_code == 200, mine.text
    assert [p["id"] for p in mine.json()] == [project_a["id"]]
    assert mine.json()[0]["vendors"] and mine.json()[0]["criteria"]

    # 관리자 API는 메뉴를 숨기는 것과 별개로 서버가 403으로 막는다.
    for path in (
        "/api/v1/projects",
        "/api/v1/committee/candidates",
        f"/api/v1/projects/{project_a['id']}/committee/draw",
        f"/api/v1/projects/{project_a['id']}/setup",
        f"/api/v1/projects/{project_a['id']}/results",
        f"/api/v1/projects/{project_a['id']}/results/summary",
        f"/api/v1/projects/{project_a['id']}/results/report",
        "/api/v1/ai/status",
    ):
        assert client.get(path, headers=headers).status_code == 403, path
    assert (
        client.post(
            "/api/v1/projects", headers=headers, json={"name": "x", "department": "y"}
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/v1/projects/{project_a['id']}/setup/vendors",
            headers=headers,
            json={"vendors": [{"name": "x"}]},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/projects/{project_a['id']}/criteria/confirm",
            headers=headers,
            json={"expected_version": 0},
        ).status_code
        == 403
    )

    # 배정 사업의 평가표는 작성·제출할 수 있고, 미배정 사업은 403이다.
    base = f"/api/v1/projects/{project_a['id']}"
    assert client.get(f"{base}/evaluations/me", headers=headers).status_code == 200
    assert (
        client.get(
            f"/api/v1/projects/{project_b['id']}/evaluations/me", headers=headers
        ).status_code
        == 403
    )
    brief = client.get(f"{base}/evaluator-access/brief", headers=headers)
    assert brief.status_code == 200, brief.text
    saved = client.put(
        f"{base}/evaluations/me",
        headers=headers,
        json={"expected_version": 0, "scores": full_scores(brief.json()), "opinion": "의견"},
    )
    assert saved.status_code == 200, saved.text
    submitted = client.post(
        f"{base}/evaluations/me/submit",
        headers=headers,
        json={"expected_version": saved.json()["version"], "attested": True},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["sheet_hash"]

    # 접근 링크(사업별) 세션은 그 사업만 목록에 나온다.
    scoped = client.post(
        f"/api/v1/projects/{project_b['id']}/evaluator-access/verify",
        json={"candidate_id": other["id"], "birth_date": "750305"},
    )
    assert scoped.status_code == 200, scoped.text
    listed = client.get("/api/v1/evaluator-access/projects", headers=bearer(scoped.json()["token"]))
    assert [p["id"] for p in listed.json()] == [project_b["id"]]
    assert unassigned["id"] not in [p["id"] for p in listed.json()]


def test_evaluator_login_same_name_master_code_and_lockout(client, admin, auth_env, monkeypatch):
    first = register(client, admin, "동명위원", "1987-12-23")
    second = register(client, admin, "동명위원", "1975-03-05")
    project = create_project(client, admin, "동명 사업")
    draw(client, admin, project["id"], [first["id"], second["id"]], seats=2)
    # 생년월일로 동명이인을 구분한다.
    assert login_evaluator(client, "동명위원", "871223").json()["actor"]["id"] == first["id"]
    assert login_evaluator(client, "동명위원", "750305").json()["actor"]["id"] == second["id"]
    # 마스터 번호는 동명이인이 모두 선정이면 구분할 수 없다.
    assert login_evaluator(client, "동명위원", service.LOCAL_MASTER_CODE).status_code == 409

    unregistered = register(client, admin, "미등록위원")
    other_project = create_project(client, admin, "미등록 사업")
    draw(client, admin, other_project["id"], [unregistered["id"]], seats=1)
    assert login_evaluator(client, "미등록위원", "000000").status_code == 401
    ok = login_evaluator(client, "미등록위원", service.LOCAL_MASTER_CODE)
    assert ok.status_code == 200, ok.text
    assert ok.json()["method"] == "local_master_code"
    assert service.LOCAL_MASTER_CODE not in ok.text
    for env in ("ci", "preview", "production"):
        monkeypatch.setattr(settings, "app_env", env)
        assert login_evaluator(client, "미등록위원", service.LOCAL_MASTER_CODE).status_code == 401
    monkeypatch.setattr(settings, "app_env", "local")
    # 같은 이름 기준 5회 실패 뒤 429.
    service.reset_attempts()
    for _ in range(service.MAX_ATTEMPTS):
        assert login_evaluator(client, "미등록위원", "000000").status_code == 401
    assert login_evaluator(client, "미등록위원", service.LOCAL_MASTER_CODE).status_code == 429


def test_total_score_must_be_100_to_score_or_confirm(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    setup = client.get(f"{base}/setup", headers=admin).json()
    assert setup["total_score"] == 100 and setup["required_total_score"] == 100
    # 합계 80으로 저장은 되지만(편집 중간 상태), 채점 시작과 확정은 거절된다.
    short = [{"name": "항목 1", "max_score": 50}, {"name": "항목 2", "max_score": 30}]
    saved = client.put(f"{base}/setup/criteria", headers=admin, json={"criteria": short})
    assert saved.status_code == 200 and saved.json()["total_score"] == 80
    selected = draw(client, admin, project["id"], [c["id"] for c in candidates], seats=1)[
        "selected_ids"
    ]
    headers = {"Authorization": f"Bearer local-evaluator:{selected[0]}"}
    brief = client.get(f"{base}/evaluator-access/brief", headers=headers).json()
    blocked = client.put(
        f"{base}/evaluations/me",
        headers=headers,
        json={"expected_version": 0, "scores": full_scores(brief), "opinion": ""},
    )
    assert blocked.status_code == 409 and "100점" in blocked.json()["detail"]
    confirm = client.post(f"{base}/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert confirm.status_code == 422 and "100점" in confirm.json()["detail"]
    explicit = client.post(
        f"{base}/criteria/confirm",
        headers=admin,
        json={"expected_version": 0, "criteria": [{"id": "only", "name": "단일", "max_score": 90}]},
    )
    assert explicit.status_code == 422
    # 100점으로 맞추면 채점·확정이 된다.
    fixed = [{"name": "항목 1", "max_score": 50}, {"name": "항목 2", "max_score": 50}]
    assert (
        client.put(f"{base}/setup/criteria", headers=admin, json={"criteria": fixed}).status_code
        == 200
    )
    brief = client.get(f"{base}/evaluator-access/brief", headers=headers).json()
    assert (
        client.put(
            f"{base}/evaluations/me",
            headers=headers,
            json={"expected_version": 0, "scores": full_scores(brief), "opinion": ""},
        ).status_code
        == 200
    )
    confirmed = client.post(f"{base}/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert confirmed.status_code == 201, confirmed.text
