import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.committee.models import Candidate, Draw
from app.modules.committee.service import conduct_draw


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


def complete_scores(project, multiplier=1):
    return [
        {"vendor_id": v, "criterion_id": c["id"], "score": c["max_score"] * multiplier}
        for v in project["vendor_ids"]
        for c in project["criteria"]
    ]


def test_register_draw_evaluate_submit_collect(client, admin, setup_project):
    project, candidates = setup_project
    draw = draw_members(client, admin, project, candidates)
    assert len(set(draw["selected_ids"] + draw["reserve_ids"])) == 3
    assert (
        draw["snapshot_sha256"]
        == hashlib.sha256(
            json.dumps(
                draw["candidate_snapshot"],
                sort_keys=True,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode()
        ).hexdigest()
    )
    base = f"/api/v1/projects/{project['id']}"
    for i, member in enumerate(draw["selected_ids"]):
        saved = client.put(
            base + "/evaluations/me",
            headers=actor(member),
            json={
                "expected_version": 0,
                "scores": complete_scores(project, 1 if i == 0 else 0.5),
            },
        )
        assert saved.status_code == 200, saved.text
        response = client.post(
            base + "/evaluations/me/submit",
            headers=actor(member),
            json={"expected_version": saved.json()["version"], "attested": True},
        )
        assert response.status_code == 200
        assert response.json()["submitted_at"]
        results = client.get(base + "/results", headers=admin).json()
        assert results["submitted"] == i + 1
        if i == 0:
            assert results["averages"] == []
    assert results["status"] == "technical_complete"
    assert [r["technical_average"] for r in results["averages"]] == [75, 75, 75]


def test_auth_and_unassigned_access(client, admin, setup_project, monkeypatch):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    assert client.get("/api/v1/projects").status_code == 401
    assert (
        client.get(base + "/evaluations/me", headers=actor(candidates[0]["id"])).status_code == 403
    )
    draw = draw_members(client, admin, project, candidates)
    reserve = actor(draw["reserve_ids"][0])
    assert client.get(base + "/evaluations/me", headers=reserve).status_code == 403
    assert client.get(base + "/results", headers=actor(draw["selected_ids"][0])).status_code == 403
    assert client.get(base + "/evaluations/me", headers=admin).status_code == 403
    assert (
        client.post(
            "/api/v1/committee/candidates",
            headers=reserve,
            json={
                "name": "x",
                "organization": "x",
                "specialty": "x",
            },
        ).status_code
        == 403
    )
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", False)
    assert client.get("/api/v1/projects", headers=admin).status_code == 503


def test_draw_invalid_pool_and_redraw(client, admin, setup_project, test_engine):
    project, candidates = setup_project
    url = f"/api/v1/projects/{project['id']}/committee/draw"
    first = candidates[0]["id"]
    for pool in ([first, first], [first, "missing"], [first]):
        assert (
            client.post(
                url,
                headers=admin,
                json={
                    "candidate_ids": pool,
                    "seats": 2,
                    "reserves": 0,
                },
            ).status_code
            == 422
        )
    with Session(test_engine) as db:
        db.get(Candidate, first).active = False
        db.commit()
    assert (
        client.post(
            url,
            headers=admin,
            json={
                "candidate_ids": [c["id"] for c in candidates],
                "seats": 2,
                "reserves": 0,
            },
        ).status_code
        == 422
    )
    draw_members(client, admin, project, candidates[1:])
    assert (
        client.post(
            url,
            headers=admin,
            json={
                "candidate_ids": [c["id"] for c in candidates[1:]],
                "seats": 1,
                "reserves": 0,
            },
        ).status_code
        == 409
    )


def test_drafts_missing_scores_stale_version_and_immutable_submission(client, admin, setup_project):
    project, candidates = setup_project
    draw = draw_members(client, admin, project, candidates)
    headers = actor(draw["selected_ids"][0])
    url = f"/api/v1/projects/{project['id']}/evaluations/me"
    scores = complete_scores(project)
    saved = client.put(url, headers=headers, json={"expected_version": 0, "scores": scores[:-1]})
    assert saved.status_code == 200
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 1, "attested": True}
        ).status_code
        == 422
    )
    assert (
        client.put(url, headers=headers, json={"expected_version": 0, "scores": scores}).status_code
        == 409
    )
    assert (
        client.put(url, headers=headers, json={"expected_version": 1, "scores": scores}).json()[
            "version"
        ]
        == 2
    )
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 1, "attested": True}
        ).status_code
        == 409
    )
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 2, "attested": False}
        ).status_code
        == 422
    )
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 2, "attested": True}
        ).status_code
        == 200
    )
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 3, "attested": True}
        ).status_code
        == 409
    )
    assert (
        client.put(url, headers=headers, json={"expected_version": 3, "scores": []}).status_code
        == 409
    )
    assert len(client.get(url, headers=headers).json()["scores"]) == 21


@pytest.mark.parametrize(
    "bad",
    [
        {"score": 16},
        {"score": -1},
        {"score": 1.001},
        {"vendor_id": "missing"},
        {"criterion_id": "missing"},
    ],
)
def test_invalid_scores(client, admin, setup_project, bad):
    project, candidates = setup_project
    draw = draw_members(client, admin, project, candidates)
    score = complete_scores(project)[0] | bad
    assert (
        client.put(
            f"/api/v1/projects/{project['id']}/evaluations/me",
            headers=actor(draw["selected_ids"][0]),
            json={"expected_version": 0, "scores": [score]},
        ).status_code
        == 422
    )


def test_duplicate_scores_rejected_and_zero_counts_as_filled(client, admin, setup_project):
    project, candidates = setup_project
    draw = draw_members(client, admin, project, candidates, seats=1)
    headers = actor(draw["selected_ids"][0])
    url = f"/api/v1/projects/{project['id']}/evaluations/me"
    scores = complete_scores(project, 0)
    assert (
        client.put(
            url,
            headers=headers,
            json={
                "expected_version": 0,
                "scores": scores + [scores[0]],
            },
        ).status_code
        == 422
    )
    assert (
        client.put(url, headers=headers, json={"expected_version": 0, "scores": scores}).status_code
        == 200
    )
    assert (
        client.post(
            url + "/submit", headers=headers, json={"expected_version": 1, "attested": True}
        ).status_code
        == 200
    )
    results = client.get(f"/api/v1/projects/{project['id']}/results", headers=admin).json()
    assert all(r["technical_average"] == 0 for r in results["averages"])


def test_postgres_concurrent_draw_has_one_winner(client, admin, setup_project, test_engine):
    if test_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock integration is run in CI")
    project, candidates = setup_project

    def attempt():
        with Session(test_engine) as db:
            try:
                conduct_draw(db, project["id"], [c["id"] for c in candidates], 2, 1, "test")
                return 201
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: attempt(), range(2))) == [201, 409]
    with Session(test_engine) as db:
        assert len(db.scalars(select(Draw).where(Draw.project_id == project["id"])).all()) == 1
