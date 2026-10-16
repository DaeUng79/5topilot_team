"""Regression cases for the user's four screen corrections."""

from test_workflow import admin, call


def project_fields():
    return {
        "name": "직접 입력 사업",
        "contact_organization": "검증기관",
        "contact_department": "새로운 직접입력부서",
        "contact_name": "가상담당자",
        "contact_position": "담당",
        "contact_phone": "01012345678",
        "contact_email": "",
    }


def test_free_department_creates_or_reuses_department_atomically(app, store):
    root = admin(app, "super-demo")
    first = call(root, "PRJ-02", project_fields())
    second = call(root, "PRJ-02", project_fields() | {"name": "두 번째 사업"})
    assert first["department_id"] == second["department_id"]
    with store.connect("admin") as c:
        assert (
            c.execute(
                "SELECT name FROM departments WHERE id=?", (first["department_id"],)
            ).fetchone()[0]
            == project_fields()["contact_department"]
        )
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []
    call(
        root,
        "PRJ-02",
        project_fields()
        | {"contact_department": "실패시 롤백", "contact_phone": "invalid"},
        422,
    )
    with store.connect("admin") as c:
        assert (
            c.execute("SELECT 1 FROM departments WHERE name='실패시 롤백'").fetchone()
            is None
        )


def test_department_admin_cannot_create_another_department_from_project(app, store):
    call(admin(app), "PRJ-02", project_fields(), 403)
    with store.connect("admin") as c:
        assert (
            c.execute(
                "SELECT 1 FROM departments WHERE name=?",
                (project_fields()["contact_department"],),
            ).fetchone()
            is None
        )


def test_supervisor_pool_reads_each_department_without_cross_department_access(app):
    root = admin(app, "super-demo")
    departments = call(root, "ADM-DEPT-LIST")["items"]
    other = next(d for d in departments if d["id"] != "web-demo-dept")
    own = call(
        root, "COM-01", {"department_id": "web-demo-dept", "scope": "DEPARTMENT_POOL"}
    )
    assert own["total"] > 0
    call(root, "COM-01", {"department_id": other["id"], "scope": "DEPARTMENT_POOL"})
    call(
        admin(app),
        "COM-01",
        {"department_id": other["id"], "scope": "DEPARTMENT_POOL"},
        403,
    )
