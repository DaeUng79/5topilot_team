"""SEC-01: 평가위원 본인확인·세션, 사업별 권한, 데모 수단의 배포 차단."""

import pytest
from pydantic import ValidationError

from app.core import session as session_module
from app.core.config import Settings, settings
from app.modules.evaluator_access import service

CODE = "000000"


@pytest.fixture
def access_env(monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "demo_verify_code", CODE)
    service.reset_attempts()


def draw(client, admin, project, candidates, seats=2, reserves=1):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": seats, "reserves": reserves},
    )
    assert response.status_code == 201, response.text
    return response.json()


def verify(client, project_id, candidate_id, code=CODE):
    return client.post(
        f"/api/v1/projects/{project_id}/evaluator-access/verify",
        json={"candidate_id": candidate_id, "code": code},
    )


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_verify_issues_project_scoped_session(
    client, admin, setup_project, access_env, monkeypatch
):
    project, candidates = setup_project
    member = draw(client, admin, project, candidates)["selected_ids"][0]
    response = verify(client, project["id"], member)
    assert response.status_code == 200, response.text
    assert CODE not in response.text and '"code"' not in response.text
    body = response.json()
    assert body["channel"] == "demo"
    assert body["actor"] == {"role": "evaluator", "id": member, "project_id": project["id"]}
    headers = bearer(body["token"])
    me = client.get("/api/v1/evaluator-access/me", headers=headers).json()
    assert me == {"role": "evaluator", "id": member, "project_id": project["id"]}
    sheet_url = f"/api/v1/projects/{project['id']}/evaluations/me"
    assert client.get(sheet_url, headers=headers).status_code == 200
    assert client.get("/api/v1/projects", headers=headers).status_code == 403
    other = client.post(
        "/api/v1/projects", headers=admin, json={"name": "다른 사업", "department": "x"}
    ).json()
    draw(client, admin, other, candidates, seats=3, reserves=1)
    other_url = f"/api/v1/projects/{other['id']}/evaluations/me"
    assert client.get(other_url, headers=headers).status_code == 403
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", False)
    assert client.get(sheet_url, headers=headers).status_code == 200
    assert client.get("/api/v1/projects", headers=admin).status_code == 503


def test_verify_rejections_and_lockout(client, admin, setup_project, access_env, monkeypatch):
    project, candidates = setup_project
    result = draw(client, admin, project, candidates)
    member, reserve = result["selected_ids"][0], result["reserve_ids"][0]
    assert verify(client, project["id"], reserve).status_code == 403
    assert verify(client, project["id"], member, "999999").status_code == 401
    assert verify(client, project["id"], member, "12345").status_code == 422
    assert verify(client, "missing-project", member).status_code == 404
    for _ in range(service.MAX_ATTEMPTS - 1):
        assert verify(client, project["id"], member, "999999").status_code == 401
    assert verify(client, project["id"], member).status_code == 429
    service.reset_attempts()
    assert verify(client, project["id"], member).status_code == 200
    monkeypatch.setattr(settings, "demo_verify_code", "")
    assert verify(client, project["id"], member).status_code == 503


def test_request_code_channel(client, admin, setup_project, access_env, monkeypatch):
    project, candidates = setup_project
    result = draw(client, admin, project, candidates)
    url = f"/api/v1/projects/{project['id']}/evaluator-access/request-code"
    response = client.post(url, json={"candidate_id": result["selected_ids"][0]})
    assert response.status_code == 202 and response.json()["channel"] == "demo"
    assert CODE not in response.text
    assert client.post(url, json={"candidate_id": result["reserve_ids"][0]}).status_code == 403
    monkeypatch.setattr(settings, "demo_verify_code", "")
    assert client.post(url, json={"candidate_id": result["selected_ids"][0]}).status_code == 503


def test_session_token_tamper_expiry_and_missing_secret(
    client, admin, setup_project, access_env, monkeypatch
):
    project, candidates = setup_project
    member = draw(client, admin, project, candidates)["selected_ids"][0]
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
        {"app_env": "production", "demo_verify_code": "000000"},
        {"app_env": "preview", "demo_verify_code": "000000"},
        {"demo_verify_code": "12345"},
        {"demo_verify_code": "abcdef"},
    ],
)
def test_settings_reject_demo_outside_local(overrides):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)


def test_settings_allow_demo_locally_and_clean_production():
    local = Settings(
        _env_file=None, app_env="local", simsaimdang_demo_auth=True, demo_verify_code="000000"
    )
    assert local.demo_verify_code == "000000"
    production = Settings(_env_file=None, app_env="production", session_secret="x")
    assert not production.simsaimdang_demo_auth and production.demo_verify_code == ""


def test_access_context_and_brief(client, admin, setup_project, access_env):
    project, candidates = setup_project
    result = draw(client, admin, project, candidates)
    member, reserve = result["selected_ids"][0], result["reserve_ids"][0]
    url = f"/api/v1/projects/{project['id']}/evaluator-access/context"
    context = client.get(url, params={"candidate_id": member})
    assert context.status_code == 200, context.text
    assert context.json()["project"] == {
        "id": project["id"],
        "name": project["name"],
        "department": project["department"],
    }
    assert context.json()["candidate"]["id"] == member
    assert context.json()["candidate"]["name"].startswith("가상위원")
    assert context.json()["criteria_version"] == 0
    assert set(context.json()) == {"project", "candidate", "criteria_version"}
    assert client.get(url, params={"candidate_id": reserve}).status_code == 403
    assert client.get(url).status_code == 422
    assert (
        client.get(
            "/api/v1/projects/missing/evaluator-access/context", params={"candidate_id": member}
        ).status_code
        == 404
    )

    brief_url = f"/api/v1/projects/{project['id']}/evaluator-access/brief"
    assert client.get(brief_url).status_code == 401
    assert client.get(brief_url, headers=admin).status_code == 403
    token = verify(client, project["id"], member).json()["token"]
    brief = client.get(brief_url, headers=bearer(token))
    assert brief.status_code == 200, brief.text
    assert brief.json()["criteria"] == project["criteria"]
    assert brief.json()["vendor_ids"] == project["vendor_ids"]
    narrowed = [{"id": "understanding", "name": "사업 이해도", "max_score": 5}]
    confirmed = client.post(
        f"/api/v1/projects/{project['id']}/criteria/confirm",
        headers=admin,
        json={"expected_version": 0, "criteria": narrowed},
    )
    assert confirmed.status_code == 201
    assert client.get(brief_url, headers=bearer(token)).json()["criteria"] == narrowed
    assert client.get(url, params={"candidate_id": member}).json()["criteria_version"] == 1
