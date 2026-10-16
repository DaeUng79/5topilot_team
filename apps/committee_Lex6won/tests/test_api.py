import secrets
from io import BytesIO
from pathlib import Path

import msoffcrypto
import pytest
from fastapi.testclient import TestClient

from committee_app.errors import DomainError
from committee_app.excel import MAX_BYTES, read_candidates
from committee_app.main import Settings, create_app
from tests.test_committee import candidate, workbook_bytes

PREFIX = "/api/v1/committee"
HEADERS = {"X-Committee-Client": "local-ui"}


def client_at(tmp_path: Path, *, demo: bool = False, local: bool = True) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                db_path=tmp_path / "api.db",
                local_admin=local,
                verification_mode="demo" if demo else "disabled",
            )
        ),
        headers=HEADERS,
    )


def test_admin_boundary_host_origin_and_size(tmp_path: Path) -> None:
    with client_at(tmp_path) as client:
        assert client.get(PREFIX + "/health").json()["production_auth"] is False
        assert client.get(PREFIX + "/candidates").status_code == 401
        assert client.post(PREFIX + "/local/session").status_code == 200
        assert client.get(PREFIX + "/candidates").json() == []
        assert (
            client.get(PREFIX + "/candidates", headers={"Host": "evil.example"}).status_code == 403
        )
        assert (
            client.post(
                PREFIX + "/projects", headers={"Origin": "https://evil.example"}, json={}
            ).status_code
            == 403
        )
        assert (
            client.post(
                PREFIX + "/projects", headers={"X-Committee-Client": ""}, json={}
            ).status_code
            == 403
        )
        assert (
            client.post(
                PREFIX + "/projects", headers={"Content-Length": str(MAX_BYTES * 2)}, content=b""
            ).status_code
            == 413
        )
        assert client.get("/").status_code == 200
        assert client.get("/assets/app.js").status_code == 200
        assert "no-store" in client.get(PREFIX + "/candidates").headers["cache-control"]
    with client_at(tmp_path, local=False) as client:
        assert client.post(PREFIX + "/local/session").status_code == 503


def test_upload_commit_update_and_reload(tmp_path: Path) -> None:
    raw = workbook_bytes(
        [
            [
                1,
                "가상기관",
                "교수",
                "",
                "",
                "",
                "교수",
                "",
                "AI, 데이터",
                "",
                "",
                "Y",
                "Y",
                "과거 과제",
            ]
        ]
    )
    with client_at(tmp_path) as client:
        client.post(PREFIX + "/local/session")
        preview = client.post(
            PREFIX + "/imports/preview", files={"file": ("test.xlsx", raw)}, data={"password": ""}
        )
        assert preview.status_code == 200
        assert preview.json()["drafts"] == 1
        preview_id = preview.json()["id"]
        assert client.post(PREFIX + f"/imports/{preview_id}/commit").json()["registered"] == 1
        assert client.post(PREFIX + f"/imports/{preview_id}/commit").status_code == 409
        item = client.get(PREFIX + "/candidates").json()[0]
        assert not item["active"]
        updated = client.put(
            PREFIX + "/candidates/" + item["id"],
            json={"name": "합성위원", "phone": "01000009999", "expected_version": item["version"]},
        )
        assert updated.status_code == 200
        assert updated.json()["active"] is True
        assert (
            client.put(
                PREFIX + "/candidates/" + item["id"],
                json={"name": "다른 합성 이름", "expected_version": 0},
            ).status_code
            == 409
        )
        assert (
            client.post(PREFIX + "/imports/preview", files={"file": ("test.xlsx", raw)}).status_code
            == 409
        )
    with client_at(tmp_path) as client:
        client.post(PREFIX + "/local/session")
        assert client.get(PREFIX + "/candidates").json()[0]["name"] == "합성위원"


def test_whole_flow_and_demo_auth_api(tmp_path: Path) -> None:
    with client_at(tmp_path, demo=True) as admin:
        admin.post(PREFIX + "/local/session")
        for i in range(30):
            assert (
                admin.post(PREFIX + "/candidates", json=candidate(i, "데이터, AI")).status_code
                == 201
            )
        created = admin.post(
            PREFIX + "/projects",
            json={"name": "가상 과제", "fields": ["AI", "데이터"], "target": 7},
        )
        assert created.status_code == 201
        pid = created.json()["id"]
        base = PREFIX + "/projects/" + pid
        assert admin.get(PREFIX + "/projects").json()[0]["id"] == pid
        assert admin.get(base + "/pool").json() == {"eligible": 30, "required": 21, "shortage": 0}
        assert admin.get(base + "/draw").json() is None
        assert admin.post(base + "/draw", json={"reviewed": False}).status_code == 422
        drawn = admin.post(base + "/draw", json={"reviewed": True})
        assert drawn.status_code == 201
        assert admin.post(base + "/draw", json={"reviewed": True}).status_code == 409
        ids = [c["id"] for c in drawn.json()["shortlist"][:7]]
        reserve_ids = [c["id"] for c in drawn.json()["shortlist"][7:10]]
        assert admin.post(base + "/assign").status_code == 409
        for cid in ids + reserve_ids:
            assert (
                admin.put(
                    base + "/contacts/" + cid,
                    json={"status": "참여 가능", "note": "통화 완료", "expected_version": 0},
                ).status_code
                == 200
            )
        version = admin.get(base + "/draw").json()["version"]
        assert (
            admin.post(
                base + "/finalize",
                json={
                    "candidate_ids": ids,
                    "reserve_ids": reserve_ids,
                    "expected_version": version - 1,
                },
            ).status_code
            == 409
        )
        assert (
            admin.post(
                base + "/finalize",
                json={
                    "candidate_ids": ids,
                    "reserve_ids": reserve_ids,
                    "expected_version": version,
                },
            ).status_code
            == 200
        )
        assert len(admin.post(base + "/assign").json()["assignments"]) == 7
        assert admin.get(PREFIX + "/audit").json()
        item = next(c for c in admin.get(PREFIX + "/candidates").json() if c["id"] == ids[0])
        request = admin.post(
            PREFIX + "/auth/request",
            json={"project_id": pid, "name": item["name"], "phone": item["phone"]},
        )
        assert request.status_code == 200
        issued = request.json()
        assert (
            admin.post(
                PREFIX + "/auth/request",
                json={"project_id": pid, "name": item["name"], "phone": item["phone"]},
            ).status_code
            == 429
        )
        assert (
            admin.post(
                PREFIX + "/auth/verify",
                json={"request_id": issued["request_id"], "code": issued["demo_code"]},
            ).status_code
            == 200
        )
        me = admin.get(PREFIX + "/auth/me", params={"project_id": pid}).json()
        assert me["candidate_id"] == ids[0]
        assert me["production_verified"] is False
        assert admin.get(PREFIX + "/auth/me", params={"project_id": "other"}).status_code == 403
        assert (
            admin.post(
                PREFIX + "/auth/verify",
                json={"request_id": issued["request_id"], "code": issued["demo_code"]},
            ).status_code
            == 403
        )
        outsider = next(c for c in drawn.json()["shortlist"] if c["id"] not in ids)
        assert (
            admin.post(
                PREFIX + "/auth/request",
                json={"project_id": pid, "name": outsider["name"], "phone": outsider["phone"]},
            ).status_code
            == 403
        )
        assert admin.get(PREFIX + "/openapi.json").status_code == 404


def test_production_auth_disabled_and_validation_does_not_echo(tmp_path: Path) -> None:
    with client_at(tmp_path) as client:
        secret = secrets.token_hex(16)
        response = client.post(
            PREFIX + "/auth/request",
            json={"project_id": "unknown", "name": "합성위원", "phone": "01000009999"},
        )
        assert response.status_code == 503
        response = client.post(PREFIX + "/auth/verify", json={"request_id": "test", "code": secret})
        assert response.status_code == 422
        assert secret not in response.text
        assert (
            client.post(
                PREFIX + "/auth/verify", json={"request_id": "test", "code": "123456"}
            ).status_code
            == 503
        )
        assert client.get(PREFIX + "/auth/me", params={"project_id": "unknown"}).status_code == 503


def test_encrypted_workbook_password_and_no_password_in_rows() -> None:
    password = secrets.token_urlsafe(16)
    raw = workbook_bytes(
        [
            [
                1,
                "가상기관",
                "교수",
                "합성위원",
                "",
                "",
                "",
                "",
                "정보시스템",
                "01000009999",
                "",
                "",
                "",
                "",
            ]
        ]
    )
    office = msoffcrypto.OfficeFile(BytesIO(raw))
    encrypted = BytesIO()
    office.encrypt(password, encrypted)
    rows = read_candidates(encrypted.getvalue(), password, "protected.xlsx")
    assert rows[0]["name"] == "합성위원"
    assert password not in str(rows)

    for wrong in ["", secrets.token_urlsafe(16)]:
        with pytest.raises(DomainError):
            read_candidates(encrypted.getvalue(), wrong, "protected.xlsx")


def test_work_and_demo_sessions_do_not_overwrite_each_other(tmp_path: Path) -> None:
    work = create_app(Settings(db_path=tmp_path / "work.db", local_admin=True, port=5187))
    demo = create_app(Settings(db_path=tmp_path / "demo.db", local_admin=True, port=5188))
    with TestClient(work, headers=HEADERS) as first, TestClient(demo, headers=HEADERS) as second:
        assert first.post(PREFIX + "/local/session").status_code == 200
        assert second.post(PREFIX + "/local/session").status_code == 200
        first.cookies.update(second.cookies)
        second.cookies.update(first.cookies)
        assert first.get(PREFIX + "/candidates").status_code == 200
        assert second.get(PREFIX + "/candidates").status_code == 200
        assert first.cookies.get("committee_admin_5187")
        assert first.cookies.get("committee_admin_5188")
