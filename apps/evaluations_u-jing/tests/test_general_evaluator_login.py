from fastapi.testclient import TestClient
from test_workflow import PID, admin, call, ready


def test_general_login_resolves_invitation_without_recording_attendance(app):
    client = TestClient(app)
    actor = call(client, "AUTH-02", {"name": "가상위원01", "last4": "0001"})
    assert actor["project_id"] == PID
    boot = client.get("/api/v2/bootstrap").json()["data"]
    assert boot["attendance"] == []
    assert boot["participants"] == []
    assert boot["projects"][0]["contact_name"] == "가상담당자"
    assert boot["member_kind"] == "PRIMARY"


def test_no_public_roster_or_uninvited_pool_login(app):
    client = TestClient(app)
    for name, last4 in [("없는위원", "9999"), ("가상위원27", "0027")]:
        result = call(client, "AUTH-02", {"name": name, "last4": last4}, 401)
        assert "projects" not in result
        assert "가상사업" not in str(result)
    assert client.get("/api/v2/bootstrap").status_code == 401


def test_multiple_projects_require_explicit_choice_and_recheck_credentials(app):
    manager = admin(app)
    project = call(
        manager,
        "PRJ-02",
        {
            "department_id": "web-demo-dept",
            "name": "두 번째 초청 사업",
            "contact_name": "담당",
            "contact_organization": "기관",
            "contact_department": "부서",
            "contact_position": "담당",
            "contact_phone": "01012345678",
            "evaluation_date": "2026-11-05",
        },
    )
    pid = project["id"]
    state = manager.get("/committee-v2/api/projects/" + PID).json()["data"]
    rule = call(
        manager,
        "DRAW-01",
        {
            "project_id": pid,
            "selection_mode": "DIRECT",
            "target_count": 7,
            "reserve_count": 0,
            "quotas": [],
            "version": 0,
        },
    )
    members = []
    for item in state["items"]:
        nominee = call(
            manager, "ROS-02", {"project_id": pid, "candidate_id": item["candidate_id"]}
        )
        nominee = call(
            manager,
            "ROS-03",
            {
                "project_id": pid,
                "nominee_id": nominee["id"],
                "version": nominee["version"],
                "contact_status": "AVAILABLE",
                "contact_note": "테스트",
            },
        )
        members.append(
            {
                "nominee_id": nominee["id"],
                "version": nominee["version"],
                "member_kind": "PRIMARY",
            }
        )
    call(
        manager,
        "ROS-05",
        {"project_id": pid, "rule_version": rule["version"], "members": members},
    )
    client = TestClient(app)
    selection = call(client, "AUTH-02", {"name": "가상위원01", "last4": "0001"})
    assert selection["selection_required"] is True
    assert {p["id"] for p in selection["projects"]} == {PID, pid}
    assert client.get("/api/v2/bootstrap").status_code == 401
    call(
        client,
        "AUTH-02",
        {"project_id": pid, "name": "가상위원01", "last4": "0002"},
        401,
    )
    actor = call(
        client, "AUTH-02", {"project_id": pid, "name": "가상위원01", "last4": "0001"}
    )
    assert actor["project_id"] == pid
    boot = client.get("/api/v2/bootstrap").json()["data"]
    assert boot["projects"][0]["evaluation_date"] == "2026-11-05"


def test_shell_permissions_are_scoped_to_actual_participant_and_chair(app):
    _, evaluators, session = ready(app)
    first = evaluators[0].get("/api/v2/bootstrap").json()["data"]
    other = evaluators[1].get("/api/v2/bootstrap").json()["data"]
    assert first["participants"][0]["id"] == session["chair_participant_id"]
    assert other["participants"][0]["id"] != session["chair_participant_id"]
    assert len(other["participants"]) == 1
