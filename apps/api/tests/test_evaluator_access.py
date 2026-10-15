"""SEC-01: 평가위원 본인확인(생년월일 대조)·세션, 사업별 권한, 로컬 마스터 번호 환경 제한·비노출."""

from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import session as session_module
from app.core.config import Settings, settings
from app.modules.committee.models import Candidate
from app.modules.evaluator_access import service

ROOT = Path(__file__).resolve().parents[3]
REGISTERED = "19871223"  # 저장 형식 YYYYMMDD(합성 자료)
YYMMDD = "871223"  # 화면 입력 형식
WRONG = "000000"
MASTER = service.LOCAL_MASTER_CODE
NON_LOCAL_ENVS = ("ci", "preview", "production")


@pytest.fixture
def access_env(monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "app_env", "local")
    service.reset_attempts()


def register(client, admin, name, birth_date=None):
    body = {"name": name, "organization": "테스트 기관", "specialty": "정보시스템"}
    if birth_date is not None:
        body["birth_date"] = birth_date
    response = client.post("/api/v1/committee/candidates", headers=admin, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def draw(client, admin, project, candidate_ids, seats, reserves=0):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": candidate_ids, "seats": seats, "reserves": reserves},
    )
    assert response.status_code == 201, response.text
    return response.json()


def project_with(client, admin, candidate_ids, seats, reserves=0, name="본인확인 사업"):
    project = client.post(
        "/api/v1/projects", headers=admin, json={"name": name, "department": "검증팀"}
    ).json()
    return project, draw(client, admin, project, candidate_ids, seats, reserves)


def verify(client, project_id, candidate_id, birth_date=YYMMDD):
    return client.post(
        f"/api/v1/projects/{project_id}/evaluator-access/verify",
        json={"candidate_id": candidate_id, "birth_date": birth_date},
    )


def context(client, project_id, candidate_id):
    return client.get(
        f"/api/v1/projects/{project_id}/evaluator-access/context",
        params={"candidate_id": candidate_id},
    )


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def core(criteria):
    """응답의 선택 출처 필드(null)를 빼고 id·name·max_score만 비교한다."""
    return [{k: c[k] for k in ("id", "name", "max_score")} for c in criteria]


def test_registered_birth_date_issues_project_scoped_session(
    client, admin, access_env, monkeypatch
):
    member = register(client, admin, "가상위원 A", "1987-12-23")["id"]
    project, _ = project_with(client, admin, [member], seats=1)
    response = verify(client, project["id"], member)
    assert response.status_code == 200, response.text
    for secret in (REGISTERED, YYMMDD, '"birth_date":'):
        assert secret not in response.text
    body = response.json()
    assert body["method"] == "birth_date"
    assert body["actor"] == {
        "role": "evaluator",
        "id": member,
        "project_id": project["id"],
        "name": "가상위원 A",
    }
    headers = bearer(body["token"])
    me = client.get("/api/v1/evaluator-access/me", headers=headers).json()
    assert me == {
        "role": "evaluator",
        "id": member,
        "project_id": project["id"],
        "name": "가상위원 A",
    }
    sheet_url = f"/api/v1/projects/{project['id']}/evaluations/me"
    assert client.get(sheet_url, headers=headers).status_code == 200
    assert client.get("/api/v1/projects", headers=headers).status_code == 403
    # 같은 위원이 선정된 다른 사업이라도 세션은 발급된 사업에만 유효하다.
    other, _ = project_with(client, admin, [member], seats=1, name="다른 사업")
    other_url = f"/api/v1/projects/{other['id']}/evaluations/me"
    assert client.get(other_url, headers=headers).status_code == 403
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", False)
    assert client.get(sheet_url, headers=headers).status_code == 200
    assert client.get("/api/v1/projects", headers=admin).status_code == 503
    # 생년월일 대조는 환경과 무관하게 동작한다.
    for env in NON_LOCAL_ENVS:
        monkeypatch.setattr(settings, "app_env", env)
        assert verify(client, project["id"], member).status_code == 200, env


def test_wrong_birth_date_and_lockout_for_registered(client, admin, access_env):
    member = register(client, admin, "가상위원 A", REGISTERED)["id"]
    project, _ = project_with(client, admin, [member], seats=1)
    rejected = verify(client, project["id"], member, WRONG)
    assert rejected.status_code == 401 and rejected.json()["detail"] == service.MISMATCH
    assert '"birth_date":' not in rejected.text and MASTER not in rejected.text
    assert verify(client, project["id"], member, "12345").status_code == 422
    assert verify(client, project["id"], member, "87122a").status_code == 422
    assert verify(client, "missing-project", member).status_code == 404
    # 지금까지 실패 1회. 422·404는 판정 전 단계라 횟수에 들어가지 않는다.
    for _ in range(service.MAX_ATTEMPTS - 1):
        assert verify(client, project["id"], member, WRONG).status_code == 401
    assert verify(client, project["id"], member).status_code == 429
    service.reset_attempts()
    assert verify(client, project["id"], member).status_code == 200


def test_master_code_opens_every_selected_evaluator_only_in_local(
    client, admin, access_env, monkeypatch
):
    registered = register(client, admin, "가상위원 A", REGISTERED)["id"]
    unregistered = register(client, admin, "가상위원 B")["id"]
    project, _ = project_with(client, admin, [registered, unregistered], seats=2)
    for member in (registered, unregistered):
        accepted = verify(client, project["id"], member, MASTER)
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["method"] == "local_master_code"
        assert '"birth_date":' not in accepted.text
    # local이 아니면 마스터 번호는 어떤 위원에게도 통하지 않는다.
    for env in NON_LOCAL_ENVS:
        monkeypatch.setattr(settings, "app_env", env)
        service.reset_attempts()
        blocked = verify(client, project["id"], registered, MASTER)
        assert blocked.status_code == 401 and blocked.json()["detail"] == service.MISMATCH
        blocked = verify(client, project["id"], unregistered, MASTER)
        assert blocked.status_code == 401 and blocked.json()["detail"] == service.UNREGISTERED
        assert MASTER not in blocked.text


def test_unregistered_without_master_code_is_rejected_everywhere(
    client, admin, access_env, monkeypatch
):
    member = register(client, admin, "가상위원 B")["id"]  # 생년월일 미등록
    project, _ = project_with(client, admin, [member], seats=1)
    for env in ("local", *NON_LOCAL_ENVS):
        monkeypatch.setattr(settings, "app_env", env)
        service.reset_attempts()
        for attempt in (WRONG, YYMMDD):
            blocked = verify(client, project["id"], member, attempt)
            assert blocked.status_code == 401, (env, attempt)
            assert blocked.json()["detail"] == service.UNREGISTERED
            assert MASTER not in blocked.text


def test_unselected_or_unknown_candidates_are_blocked(client, admin, access_env):
    registered = register(client, admin, "가상위원 A", REGISTERED)["id"]
    unregistered = register(client, admin, "가상위원 B")["id"]
    project, result = project_with(client, admin, [registered, unregistered], seats=1, reserves=1)
    reserve = result["reserve_ids"][0]
    outsider = register(client, admin, "가상위원 C", REGISTERED)["id"]  # 등록만 되고 추첨에 없음
    for candidate_id in (reserve, outsider, "no-such-candidate"):
        for attempt in (YYMMDD, MASTER):
            assert verify(client, project["id"], candidate_id, attempt).status_code == 403
        assert context(client, project["id"], candidate_id).status_code == 403
    no_draw = client.post(
        "/api/v1/projects", headers=admin, json={"name": "추첨 전", "department": "검증팀"}
    ).json()
    assert verify(client, no_draw["id"], registered).status_code == 403
    assert verify(client, no_draw["id"], unregistered, MASTER).status_code == 403


def test_master_code_is_never_exposed(client, admin, access_env):
    member = register(client, admin, "가상위원 B")["id"]
    project, _ = project_with(client, admin, [member], seats=1)
    response = context(client, project["id"], member)
    assert response.status_code == 200
    # 접근 안내에는 생년월일 등록 여부·본인확인 방식 힌트가 없다.
    assert set(response.json()) == {"project", "candidate", "criteria_version"}
    assert MASTER not in response.text and "birth_date" not in response.text
    assert MASTER not in client.get("/openapi.json").text
    for path in (
        ROOT / "contracts" / "openapi.json",
        *sorted((ROOT / "contracts" / "examples").rglob("*.json")),
        *sorted((ROOT / "apps" / "web" / "src" / "features" / "evaluator").glob("*.tsx")),
    ):
        assert MASTER not in path.read_text(encoding="utf-8"), path


def test_session_token_tamper_expiry_and_missing_secret(client, admin, access_env, monkeypatch):
    member = register(client, admin, "가상위원 A", REGISTERED)["id"]
    project, _ = project_with(client, admin, [member], seats=1)
    token = verify(client, project["id"], member).json()["token"]
    url = f"/api/v1/projects/{project['id']}/evaluations/me"
    prefix, body, signature = token.split(".")
    flipped = "A" if signature[0] != "A" else "B"
    assert (
        client.get(url, headers=bearer(f"{prefix}.{body}.{flipped}{signature[1:]}")).status_code
        == 401
    )
    assert client.get(url, headers=bearer("s1.broken")).status_code == 401
    assert client.get(url, headers=bearer("s1.bm90LWpzb24.x")).status_code == 401
    real_time = session_module.time.time
    later = real_time() + settings.session_ttl_minutes * 60 + 1
    monkeypatch.setattr(session_module.time, "time", lambda: later)
    response = client.get(url, headers=bearer(token))
    assert response.status_code == 401 and "만료" in response.json()["detail"]
    monkeypatch.setattr(session_module.time, "time", real_time)
    monkeypatch.setattr(settings, "session_secret", "")
    assert verify(client, project["id"], member).status_code == 503
    assert client.get(url, headers=bearer(token)).status_code == 503
    assert client.get(url, headers=admin).status_code == 403


@pytest.mark.parametrize(
    "overrides",
    [
        {"app_env": "production", "simsaimdang_demo_auth": True},
        {"app_env": "preview", "simsaimdang_demo_auth": True},
    ],
)
def test_settings_reject_demo_auth_outside_local(overrides):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)


def test_settings_allow_demo_locally_and_clean_production():
    local = Settings(_env_file=None, app_env="local", simsaimdang_demo_auth=True)
    assert local.simsaimdang_demo_auth
    production = Settings(_env_file=None, app_env="production", session_secret="x")
    assert not production.simsaimdang_demo_auth
    assert not hasattr(production, "demo_verify_code")


def test_master_code_is_fixed_and_local_only(monkeypatch):
    assert MASTER == "111111"
    for env, expected in (
        ("local", True),
        ("ci", False),
        ("preview", False),
        ("production", False),
    ):
        monkeypatch.setattr(settings, "app_env", env)
        assert service.local_master_code_enabled() is expected


def test_request_code_endpoint_is_gone(client, admin, access_env):
    member = register(client, admin, "가상위원 A", REGISTERED)["id"]
    project, _ = project_with(client, admin, [member], seats=1)
    url = f"/api/v1/projects/{project['id']}/evaluator-access/request-code"
    assert client.post(url, json={"candidate_id": member}).status_code == 404


def test_candidate_birth_date_is_write_only_and_normalized(client, admin, access_env, test_engine):
    created = register(client, admin, "가상위원 A", "1987-12-23")
    assert "birth_date" not in created
    listed = client.get("/api/v1/committee/candidates", headers=admin)
    assert listed.status_code == 200
    assert "birth_date" not in listed.text and REGISTERED not in listed.text
    with Session(test_engine) as db:
        assert db.get(Candidate, created["id"]).birth_date == REGISTERED
    blank = register(client, admin, "가상위원 공백", "")
    with Session(test_engine) as db:
        assert db.get(Candidate, blank["id"]).birth_date is None
    for bad in ("1987-13-45", "19871223x", "871223", "18991231", "29990101", "abc"):
        response = client.post(
            "/api/v1/committee/candidates",
            headers=admin,
            json={"name": "x", "organization": "y", "specialty": "z", "birth_date": bad},
        )
        assert response.status_code == 422, bad
    project, result = project_with(client, admin, [created["id"]], seats=1)
    assert "birth_date" not in str(result) and REGISTERED not in str(result)
    stored = client.get(f"/api/v1/projects/{project['id']}/committee/draw", headers=admin)
    assert "birth_date" not in stored.text and REGISTERED not in stored.text
    assert REGISTERED not in context(client, project["id"], created["id"]).text


def test_access_context_and_brief(client, admin, setup_project, access_env):
    project, candidates = setup_project
    result = draw(client, admin, project, [c["id"] for c in candidates], seats=2, reserves=1)
    member, reserve = result["selected_ids"][0], result["reserve_ids"][0]
    response = context(client, project["id"], member)
    assert response.status_code == 200, response.text
    assert response.json()["project"] == {
        "id": project["id"],
        "name": project["name"],
        "department": project["department"],
    }
    assert response.json()["candidate"]["id"] == member
    assert response.json()["candidate"]["name"].startswith("가상위원")
    assert response.json()["criteria_version"] == 0
    assert set(response.json()) == {"project", "candidate", "criteria_version"}
    assert context(client, project["id"], reserve).status_code == 403
    url = f"/api/v1/projects/{project['id']}/evaluator-access/context"
    assert client.get(url).status_code == 422
    assert context(client, "missing", member).status_code == 404

    brief_url = f"/api/v1/projects/{project['id']}/evaluator-access/brief"
    assert client.get(brief_url).status_code == 401
    assert client.get(brief_url, headers=admin).status_code == 403
    # setup_project 위원은 생년월일 미등록이라 로컬 마스터 번호로 세션을 받는다.
    token = verify(client, project["id"], member, MASTER).json()["token"]
    brief = client.get(brief_url, headers=bearer(token))
    assert brief.status_code == 200, brief.text
    assert brief.json()["criteria"] == project["criteria"]
    assert brief.json()["vendor_ids"] == project["vendor_ids"]
    narrowed = [{"id": "understanding", "name": "사업 이해도", "max_score": 100}]
    confirmed = client.post(
        f"/api/v1/projects/{project['id']}/criteria/confirm",
        headers=admin,
        json={"expected_version": 0, "criteria": narrowed},
    )
    assert confirmed.status_code == 201
    assert core(client.get(brief_url, headers=bearer(token)).json()["criteria"]) == narrowed
    assert context(client, project["id"], member).json()["criteria_version"] == 1
