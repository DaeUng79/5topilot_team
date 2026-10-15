"""EVAL-01·DOC-03·DOC-04 연계: 평가기준 확정 기록의 버전·재검토·권한."""

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.projects.criteria import current_confirmation, effective_criteria
from app.modules.projects.models import Project


def actor(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def core(criteria):
    """응답의 선택 출처 필드(null)를 빼고 id·name·max_score만 비교한다."""
    return [{k: c[k] for k in ("id", "name", "max_score")} for c in criteria]


def draw(client, admin, project, candidates):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": 2, "reserves": 1},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_confirm_creates_versions_and_syncs_project(client, admin, setup_project):
    project, _ = setup_project
    url = f"/api/v1/projects/{project['id']}/criteria"
    assert client.get(url + "/confirmation", headers=admin).json() is None
    first = client.post(url + "/confirm", headers=admin, json={"expected_version": 0})
    assert first.status_code == 201, first.text
    assert first.json()["version"] == 1
    assert first.json()["status"] == "confirmed"
    assert first.json()["criteria"] == project["criteria"]
    assert first.json()["confirmed_by"] == "local-admin"
    stale = client.post(url + "/confirm", headers=admin, json={"expected_version": 0})
    assert stale.status_code == 409
    revised = [
        {"id": "understanding", "name": "사업 이해도", "max_score": 40},
        {"id": "methodology", "name": "수행 방법론", "max_score": 60},
    ]
    second = client.post(
        url + "/confirm",
        headers=admin,
        json={
            "expected_version": 1,
            "criteria": revised,
            "source_document_id": "doc-synthetic-1",
            "source_revision": "rev-2",
        },
    )
    assert second.status_code == 201, second.text
    assert second.json()["version"] == 2
    assert second.json()["source_revision"] == "rev-2"
    current = client.get(url + "/confirmation", headers=admin).json()
    assert current["version"] == 2 and core(current["criteria"]) == revised
    projects = client.get("/api/v1/projects", headers=admin).json()
    assert core(next(p for p in projects if p["id"] == project["id"])["criteria"]) == revised
    duplicate = client.post(
        url + "/confirm",
        headers=admin,
        json={"expected_version": 2, "criteria": [revised[0], revised[0]]},
    )
    assert duplicate.status_code == 422
    empty = client.post(
        url + "/confirm", headers=admin, json={"expected_version": 2, "criteria": []}
    )
    assert empty.status_code == 422


def test_review_flag_permissions_and_effective_criteria(client, admin, setup_project, test_engine):
    project, candidates = setup_project
    url = f"/api/v1/projects/{project['id']}/criteria"
    missing = client.post(url + "/confirmation/review", headers=admin, json={"reason": "x"})
    assert missing.status_code == 404
    with Session(test_engine) as db:
        criteria, version = effective_criteria(db, db.get(Project, project["id"]))
        assert version == 0 and criteria == core(project["criteria"])
    client.post(url + "/confirm", headers=admin, json={"expected_version": 0})
    result = draw(client, admin, project, candidates)
    member, reserve = actor(result["selected_ids"][0]), actor(result["reserve_ids"][0])
    assert client.get(url + "/confirmation", headers=member).status_code == 200
    assert client.get(url + "/confirmation", headers=reserve).status_code == 403
    assert client.get(url + "/confirmation").status_code == 401
    assert (
        client.post(url + "/confirm", headers=member, json={"expected_version": 1}).status_code
        == 403
    )
    flag_url = url + "/confirmation/review"
    assert client.post(flag_url, headers=member, json={"reason": "x"}).status_code == 403
    with Session(test_engine) as db:
        criteria, version = effective_criteria(db, db.get(Project, project["id"]))
        assert version == 1
    flagged = client.post(flag_url, headers=admin, json={"reason": "원본 revision 변경"})
    assert flagged.status_code == 200 and flagged.json()["status"] == "needs_review"
    with Session(test_engine) as db:
        with pytest.raises(HTTPException) as exc:
            effective_criteria(db, db.get(Project, project["id"]))
        assert exc.value.status_code == 409
        assert current_confirmation(db, project["id"]).version == 1
    reconfirmed = client.post(url + "/confirm", headers=admin, json={"expected_version": 1})
    assert reconfirmed.status_code == 201 and reconfirmed.json()["version"] == 2
