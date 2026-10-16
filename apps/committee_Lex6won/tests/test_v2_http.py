"""Browser boundary tests use isolated SQLite and synthetic identities only."""

from uuid import uuid4

from fastapi.testclient import TestClient

from committee_app.v2_core import Runtime
from committee_app.v2_http import WebSettings, create_app
from tests.test_modules_v2 import candidate
from tests.test_modules_v2 import runtime as runtime

PREFIX = "/committee-v2/api"
HEADERS = {"X-Committee-Client": "v2-web"}
ACCESS = "test-access-code-with-at-least-32-characters"


def client_for(rt: Runtime) -> TestClient:
    return TestClient(create_app(rt, WebSettings("admin-a", ACCESS)), headers=HEADERS)


def login(client: TestClient) -> None:
    assert client.post(PREFIX + "/session", json={"access_code": ACCESS}).status_code == 200


def action(client: TestClient, name: str, payload: dict, key: str = "") -> dict:
    response = client.post(
        PREFIX + "/actions/" + name,
        json=payload,
        headers={"Idempotency-Key": key or str(uuid4())},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_web_session_and_boundary(runtime: Runtime) -> None:
    with client_for(runtime) as client:
        assert client.get("/committee-v2/").status_code == 200
        assert client.get(PREFIX + "/bootstrap").status_code == 401
        assert client.post(PREFIX + "/session", json={"access_code": "wrong"}).status_code == 401
        assert (
            client.post(
                PREFIX + "/session",
                json={"access_code": ACCESS},
                headers={"Origin": "https://evil.example"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                PREFIX + "/session",
                json={"access_code": ACCESS},
                headers={"X-Committee-Client": ""},
            ).status_code
            == 403
        )
        assert (
            client.get(PREFIX + "/bootstrap", headers={"Host": "evil.example"}).status_code == 403
        )
        login(client)
        cookie = next(c for c in client.cookies.jar if c.name == "committee_v2_session")
        assert cookie.has_nonstandard_attr("HttpOnly")
        data = client.get(PREFIX + "/bootstrap").json()["data"]
        assert [p["id"] for p in data["projects"]] == ["project-a"]
        assert "password_hash" not in str(data)
        assert client.get(PREFIX + "/projects/project-b").status_code == 403
        assert (
            client.post(
                PREFIX + "/actions/COM-05",
                json=candidate(1) | {"actor_id": "admin-b"},
                headers={"Idempotency-Key": "bad-actor"},
            ).status_code
            == 422
        )
        assert client.delete(PREFIX + "/session").status_code == 200
        assert client.get(PREFIX + "/bootstrap").status_code == 401


def test_http_draw_contacts_confirm_and_reload(runtime: Runtime) -> None:
    with client_for(runtime) as client:
        login(client)
        for i in range(1, 22):
            first = action(client, "COM-05", candidate(i), f"create-{i}")
            assert action(client, "COM-05", candidate(i), f"create-{i}")["id"] == first["id"]
        assert action(client, "COM-01", {"department_id": "dept-a"})["total"] == 21
        action(
            client,
            "DRAW-01",
            {
                "project_id": "project-a",
                "selection_mode": "POOL_RANDOM",
                "target_count": 7,
                "reserve_count": 2,
                "quotas": [{"specialty_id": "AI", "final_count": 7}],
            },
        )
        action(client, "DRAW-02", {"project_id": "project-a", "rule_version": 1})
        state = client.get(PREFIX + "/projects/project-a").json()["data"]
        assert len(state["items"]) == 21
        assert state["quotas"][0]["final_count"] == 7
        members = []
        for i, nominee in enumerate(state["items"][:9]):
            updated = action(
                client,
                "ROS-03",
                {
                    "project_id": "project-a",
                    "nominee_id": nominee["id"],
                    "version": nominee["version"],
                    "contact_status": "AVAILABLE",
                },
            )
            member = {
                "nominee_id": nominee["id"],
                "version": updated["version"],
                "member_kind": "PRIMARY" if i < 7 else "RESERVE",
            }
            if i >= 7:
                member["reserve_order"] = i - 6
            members.append(member)
        confirmed = action(
            client,
            "ROS-05",
            {
                "project_id": "project-a",
                "rule_version": 1,
                "members": members,
            },
            "confirm-once",
        )
        assert confirmed["sync_status"] == "PENDING"
        reloaded = client.get(PREFIX + "/projects/project-a").json()["data"]
        assert reloaded["roster"]["id"] == confirmed["id"]
        assert len(reloaded["assignments"]) == 9
        assert reloaded["handoff"]["status"] == "PENDING"
        assert "login_lookup_hmac" not in str(reloaded)
        assert "payload_json" not in str(reloaded)
        exported = client.post(
            PREFIX + "/actions/ROS-06",
            json={
                "project_id": "project-a",
                "roster_id": confirmed["id"],
            },
        )
        assert exported.status_code == 200
        assert exported.content.startswith(b"PK")
        assert (
            client.post(
                PREFIX + "/actions/DRAW-02",
                json={
                    "project_id": "project-a",
                    "rule_version": 1,
                },
                headers={"Idempotency-Key": "new-draw"},
            ).status_code
            == 409
        )


def test_multipart_preview_commit_and_limits(runtime: Runtime) -> None:
    from candidate_import import HEADERS as COLUMNS
    from committee_app.v2_excel import export_xlsx

    raw = export_xlsx(
        "test.xlsx",
        COLUMNS,
        [
            ["가상위원", "가상기관", "부서", "직위", "AI", "01012345678", ""],
        ],
    ).content
    with client_for(runtime) as client:
        login(client)
        response = client.post(
            PREFIX + "/imports/preview",
            files={
                "file": ("test.xlsx", raw),
            },
            data={"department_id": "dept-a", "scope": "DEPARTMENT_POOL"},
            headers={"Idempotency-Key": "preview"},
        )
        assert response.status_code == 200, response.text
        preview = response.json()["data"]
        assert preview["can_commit"]
        assert "01012345678" not in response.text
        result = action(client, "COM-04", {"preview_id": preview["id"], "version": 1})
        assert result["count"] == 1
        assert client.post(PREFIX + "/actions/COM-05", json=candidate(2)).status_code == 422
        assert (
            client.post(
                PREFIX + "/actions/COM-01", content=b"x", headers={"Content-Length": "9000000"}
            ).status_code
            == 413
        )
        assert (
            client.post(
                PREFIX + "/actions/COM-01",
                content="broken",
                headers={"Content-Type": "application/json"},
            ).status_code
            == 422
        )
