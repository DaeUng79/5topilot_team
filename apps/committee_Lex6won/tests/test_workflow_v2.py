from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from committee_app.errors import DomainError
from committee_app.main import Settings, create_app
from committee_app.service import CommitteeService
from tests.test_committee import candidate

PDF = b"%PDF-1.4\n% synthetic proposal\n%%EOF"
P = "/api/v1/committee"
H = {"X-Committee-Client": "local-ui"}


@pytest.mark.parametrize("target", [7, 8, 9])
def test_proposal_to_reserves_and_shared_device_login(tmp_path: Path, target: int) -> None:
    app = create_app(
        Settings(db_path=tmp_path / "flow.db", local_admin=True, verification_mode="demo")
    )
    with TestClient(app, headers=H) as admin, TestClient(app, headers=H) as visitor:
        admin.post(P + "/local/session")
        for i in range(30):
            row = candidate(i, "데이터, AI") | {"email": f"member{i}@example.test"}
            assert admin.post(P + "/candidates", json=row).status_code == 201
        response = admin.post(
            P + "/proposals", files={"file": ("proposal.pdf", PDF)}, data={"name": "제안서 평가"}
        )
        assert response.status_code == 201
        project = response.json()
        pid = project["id"]
        base = P + "/projects/" + pid
        assert project["configured"] is False
        assert admin.post(base + "/draw", json={"reviewed": True}).status_code == 422
        duplicate = admin.post(P + "/proposals", files={"file": ("proposal.pdf", PDF)})
        assert duplicate.status_code == 409
        assert len(admin.get(P + "/projects").json()) == 1
        configured = admin.put(
            base + "/criteria",
            json={"fields": ["AI", "데이터"], "target": target, "expected_version": 0},
        )
        assert configured.status_code == 200
        assert admin.get(base + "/pool").json()["eligible"] == 30
        drawn = admin.post(base + "/draw", json={"reviewed": True}).json()
        assert len(drawn["shortlist"]) == target * 3
        assert (
            admin.put(
                base + "/criteria", json={"fields": ["AI"], "target": 7, "expected_version": 1}
            ).status_code
            == 409
        )
        ids = [c["id"] for c in drawn["shortlist"]]
        finals, reserves = ids[:target], ids[target : target + 3]
        for cid in finals + reserves:
            assert (
                admin.put(
                    base + "/contacts/" + cid,
                    json={"status": "참여 가능", "note": "", "expected_version": 0},
                ).status_code
                == 200
            )
        version = admin.get(base + "/draw").json()["version"]
        for bad in (reserves[:2], reserves[:2] + [finals[0]], [reserves[0]] * 3):
            assert (
                admin.post(
                    base + "/finalize",
                    json={"candidate_ids": finals, "reserve_ids": bad, "expected_version": version},
                ).status_code
                == 422
            )
        result = admin.post(
            base + "/finalize",
            json={"candidate_ids": finals, "reserve_ids": reserves, "expected_version": version},
        )
        assert result.status_code == 200
        assert result.json()["reserve_ids"] == reserves
        assert result.json()["assigned_at"]
        rows = {c["id"]: c for c in admin.get(P + "/candidates").json()}
        first, second, reserve = rows[finals[0]], rows[finals[1]], rows[reserves[0]]
        assert visitor.get(P + "/candidates").status_code == 401
        for person, contact in ((first, first["phone"]), (second, second["email"].upper())):
            login = visitor.post(
                P + "/auth/demo-login",
                json={"project_id": pid, "name": person["name"], "contact": contact},
            )
            assert login.status_code == 200
            assert "token" not in login.json()
            assert (
                visitor.get(P + "/auth/me", params={"project_id": pid}).json()["candidate_id"]
                == person["id"]
            )
        denied = visitor.post(
            P + "/auth/demo-login",
            json={"project_id": pid, "name": reserve["name"], "contact": reserve["phone"]},
        )
        assert denied.status_code == 403
        # A failed login on a shared PC must also remove the previous person's session.
        assert visitor.get(P + "/auth/me", params={"project_id": pid}).status_code == 403
        visitor.post(
            P + "/auth/demo-login",
            json={"project_id": pid, "name": first["name"], "contact": first["phone"]},
        )
        assert visitor.post(P + "/auth/logout").status_code == 200
        assert visitor.get(P + "/auth/me", params={"project_id": pid}).status_code == 403
        visitor.post(
            P + "/auth/demo-login",
            json={"project_id": pid, "name": first["name"], "contact": first["phone"]},
        )
        assert (
            visitor.post(
                P + "/auth/demo-login", json={"project_id": pid, "name": first["name"]}
            ).status_code
            == 422
        )
        assert visitor.get(P + "/auth/me", params={"project_id": pid}).status_code == 403
        assert visitor.get(base + "/proposal").status_code == 401
        assert admin.get(base + "/proposal").content == PDF
    reopened = CommitteeService(tmp_path / "flow.db")
    assert reopened.get_draw(pid)["reserve_ids"] == reserves
    with pytest.raises(DomainError):
        reopened.update_candidate(reserves[0], {"name": "changed"}, 0)


def test_disabled_login_and_invalid_proposals(tmp_path: Path) -> None:
    app = create_app(Settings(db_path=tmp_path / "blocked.db", local_admin=True))
    with TestClient(app, headers=H) as client:
        assert (
            client.post(
                P + "/auth/demo-login",
                json={"project_id": "x", "name": "합성위원", "contact": "x@example.test"},
            ).status_code
            == 503
        )
        client.post(P + "/local/session")
        for name, raw in [("fake.pdf", b"not pdf"), ("run.html", PDF), ("empty.pdf", b"")]:
            assert client.post(P + "/proposals", files={"file": (name, raw)}).status_code == 422
        assert client.get(P + "/projects").json() == []


def test_v1_database_migration_preserves_candidates_and_projects(tmp_path: Path) -> None:
    import json
    import sqlite3

    from committee_app.db import SCHEMA
    from committee_app.excel import prepare_candidate

    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        payload = prepare_candidate(candidate(1))
        payload.pop("email")
        conn.execute(
            "INSERT INTO candidates VALUES (?,?,?,?,?,?,?)",
            ("legacy-candidate", json.dumps(payload), payload["phone"], 1, 0, None, "2026-10-13"),
        )
        conn.execute(
            "INSERT INTO projects VALUES (?,?,?,?,?)",
            ("legacy-project", "legacy", '["AI"]', 7, "2026-10-13"),
        )
    service = CommitteeService(path)
    assert service.list_candidates()[0]["id"] == "legacy-candidate"
    assert service.list_candidates()[0]["email"] == ""
    assert service.get_project("legacy-project")["configured"] == 1
    assert CommitteeService(path).get_project("legacy-project")["name"] == "legacy"
    with service.db.connect() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2


def test_email_only_candidate_unique_and_login_attempt_limit(tmp_path: Path) -> None:
    app = create_app(
        Settings(db_path=tmp_path / "email.db", local_admin=True, verification_mode="demo")
    )
    with TestClient(app, headers=H) as client:
        client.post(P + "/local/session")
        body = candidate(1, phone=False) | {"email": "Only@Example.test"}
        created = client.post(P + "/candidates", json=body)
        assert created.status_code == 201
        assert created.json()["email"] == "only@example.test"
        assert created.json()["auth_ready"] is True
        assert client.post(P + "/candidates", json=body).status_code == 409
        body["email"] = "invalid@"
        assert client.post(P + "/candidates", json=body).status_code == 422
        attempt = {"project_id": "missing", "name": "synthetic", "contact": "x@example.test"}
        for _ in range(10):
            assert client.post(P + "/auth/demo-login", json=attempt).status_code == 403
        assert client.post(P + "/auth/demo-login", json=attempt).status_code == 429


def test_lan_evaluator_host_does_not_grant_admin_session(tmp_path: Path) -> None:
    app = create_app(
        Settings(
            db_path=tmp_path / "lan.db",
            local_admin=True,
            verification_mode="demo",
            public_origin="http://192.168.1.10:5187",
        )
    )
    with TestClient(
        app, headers=H, base_url="http://192.168.1.10:5187", client=("192.168.1.20", 55000)
    ) as tablet:
        assert tablet.get("/").status_code == 200
        assert tablet.get(P + "/health").json()["login_origin"] == "http://192.168.1.10:5187"
        assert tablet.post(P + "/local/session").status_code == 403
        assert tablet.get(P + "/candidates").status_code == 401
        assert tablet.get("/", headers={"Host": "unapproved.example"}).status_code == 403
