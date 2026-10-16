from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

from committee_app.errors import DomainError
from committee_app.excel import HEADERS, read_candidates
from committee_app.service import CommitteeService


def workbook_bytes(rows: list[list[object]]) -> bytes:
    book = Workbook()
    sheet = book.active
    sheet.append(HEADERS)
    for row in rows:
        sheet.append(row)
    out = BytesIO()
    book.save(out)
    book.close()
    return out.getvalue()


@pytest.fixture
def service(tmp_path: Path) -> CommitteeService:
    return CommitteeService(tmp_path / "committee.db")


def candidate(index: int, field: str = "정보시스템", phone: bool = True) -> dict:
    return {
        "name": f"합성위원 {index}",
        "organization": "가상기관",
        "position": "연구원",
        "specialty": field,
        "phone": f"010-1000-{index:04d}" if phone else "",
    }


def ready(service: CommitteeService, target: int = 7) -> tuple[dict, dict]:
    for index in range(40):
        service.add_candidate(candidate(index, "데이터, 정보시스템"))
    project = service.create_project("가상 평가과제", ["정보시스템", "데이터"], target)
    return project, service.draw(project["id"], True)


def accepting(service: CommitteeService, project: dict, draw: dict) -> list[str]:
    ids = [row["id"] for row in draw["shortlist"][: project["target"]]]
    for cid in ids + reserves(project, draw):
        service.update_contact(project["id"], cid, "참여 가능", "참석 확인", 0)
    return ids


def reserves(project: dict, draw: dict) -> list[str]:
    return [row["id"] for row in draw["shortlist"][project["target"] : project["target"] + 3]]


def test_department_workbook_drafts_and_multiple_fields() -> None:
    raw = workbook_bytes(
        [
            [
                1,
                "가상기관",
                "교수",
                "",
                "",
                "가상지역",
                "교수",
                "",
                "AI, 데이터",
                "",
                "",
                "Y",
                "Y",
                "지난 과제",
            ]
        ]
    )
    rows = read_candidates(raw, "", "pool.xlsx")
    assert set(rows[0]["fields"]) == {"인공지능", "데이터"}
    assert rows[0]["name"] == ""
    assert rows[0]["active"] is False
    assert rows[0]["legacy_project"] == "지난 과제"


@pytest.mark.parametrize("bad", [b"not an xlsx", b"", b"PK\x03\x04broken"])
def test_invalid_workbook_rejected(bad: bytes) -> None:
    with pytest.raises(DomainError):
        read_candidates(bad, "", "pool.xlsx")


def test_formula_and_duplicate_phone_rejected(service: CommitteeService) -> None:
    with pytest.raises(DomainError):
        read_candidates(
            workbook_bytes(
                [[1, "가상기관", "", "=1+1", "", "", "", "", "데이터", "", "", "", "", ""]]
            ),
            "",
            "pool.xlsx",
        )
    service.add_candidate(candidate(1))
    with pytest.raises(DomainError) as error:
        service.add_candidate(candidate(2) | {"phone": "01010000001"})
    assert error.value.status == 409


def test_import_commit_atomic_replay_and_persistence(service: CommitteeService) -> None:
    raw = workbook_bytes(
        [
            [
                i,
                "가상기관",
                "교수",
                f"합성위원 {i}",
                "",
                "",
                "교수",
                "",
                "정보시스템",
                f"0101000{i:04d}",
                "",
                "",
                "",
                "",
            ]
            for i in range(3)
        ]
    )
    preview = service.import_preview(raw, "", "pool.xlsx")
    assert len(service.list_candidates()) == 0
    committed = service.commit_import(preview["id"])
    assert committed["registered"] == 3
    with pytest.raises(DomainError) as error:
        service.commit_import(preview["id"])
    assert error.value.status == 409
    assert len(CommitteeService(service.db.path).list_candidates()) == 3


def test_import_conflict_has_no_partial_registration(service: CommitteeService) -> None:
    raw = workbook_bytes(
        [
            [
                i,
                "가상기관",
                "",
                f"합성위원 {i}",
                "",
                "",
                "",
                "",
                "데이터",
                f"0101000{i:04d}",
                "",
                "",
                "",
                "",
            ]
            for i in range(2)
        ]
    )
    preview = service.import_preview(raw, "", "pool.xlsx")
    service.add_candidate(candidate(0))
    with pytest.raises(DomainError):
        service.commit_import(preview["id"])
    assert len(service.list_candidates()) == 1


@pytest.mark.parametrize("target", [7, 8, 9])
def test_union_draw_three_times_and_no_duplicate(service: CommitteeService, target: int) -> None:
    project, draw = ready(service, target)
    ids = [row["id"] for row in draw["shortlist"]]
    assert draw["pool_count"] == 40
    assert len(ids) == 3 * target
    assert len(set(ids)) == len(ids)
    assert draw["method"] == "system-random-sample-v1"
    assert service.get_draw(project["id"])["snapshot_sha256"] == draw["snapshot_sha256"]
    with pytest.raises(DomainError) as error:
        service.draw(project["id"], True)
    assert error.value.status == 409


def test_shortage_and_unreviewed_do_not_draw(service: CommitteeService) -> None:
    service.add_candidate(candidate(1))
    project = service.create_project("부족 과제", ["정보시스템"], 7)
    for reviewed in [False, True]:
        with pytest.raises(DomainError):
            service.draw(project["id"], reviewed)
    assert service.get_draw(project["id"]) is None


def test_concurrent_draw_one_winner(service: CommitteeService) -> None:
    for index in range(30):
        service.add_candidate(candidate(index))
    project = service.create_project("동시 추첨", ["정보시스템"], 7)

    def attempt() -> int:
        try:
            service.draw(project["id"], True)
            return 201
        except DomainError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(lambda _: attempt(), range(2))) == [201, 409]


def test_contact_version_final_counts_members_and_lock(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    with pytest.raises(DomainError):
        service.update_contact(project["id"], ids[0], "참여 불가", "", 0)
    latest = service.get_draw(project["id"])
    for invalid in [ids[:-1], ids[:-1] + [ids[0]], ids[:-1] + ["not-in-draw"]]:
        with pytest.raises(DomainError):
            service.finalize(project["id"], invalid, latest["version"], reserves(project, draw))
    finalized = service.finalize(project["id"], ids, latest["version"], reserves(project, draw))
    assert finalized["final_ids"] == ids
    with pytest.raises(DomainError):
        service.update_contact(project["id"], ids[0], "제척", "관계 있음", 1)
    with pytest.raises(DomainError):
        service.finalize(project["id"], ids, finalized["version"], reserves(project, draw))
    assigned = service.assign(project["id"])
    assert len(assigned["assignments"]) == 7
    assert len(service.assign(project["id"])["assignments"]) == 7


def test_declined_or_inactive_cannot_be_finalized(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    item = next(c for c in service.list_candidates() if c["id"] == ids[0])
    service.update_candidate(ids[0], {"enabled": False}, item["version"])
    with pytest.raises(DomainError):
        service.finalize(
            project["id"], ids, service.get_draw(project["id"])["version"], reserves(project, draw)
        )


def test_demo_auth_expiry_reuse_and_project_scope(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    service.finalize(
        project["id"], ids, service.get_draw(project["id"])["version"], reserves(project, draw)
    )
    service.assign(project["id"])
    item = next(c for c in service.list_candidates() if c["id"] == ids[0])
    with pytest.raises(DomainError) as error:
        service.issue_otp(project["id"], item["name"], item["phone"], "disabled")
    assert error.value.status == 503
    issued = service.issue_otp(project["id"], item["name"], item["phone"], "demo")
    verified = service.verify_otp(issued["request_id"], issued["demo_code"])
    assert service.verification(verified["token"], project["id"])["verification_mode"] == "demo"
    with pytest.raises(DomainError):
        service.verify_otp(issued["request_id"], issued["demo_code"])

    with service.db.connect(write=True) as conn:
        conn.execute("UPDATE otp_requests SET expires_at=0")
    with pytest.raises(DomainError):
        service.verify_otp(issued["request_id"], issued["demo_code"])
    with pytest.raises(DomainError):
        service.verification(verified["token"], "other-project")


def test_demo_code_attempt_limit(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    service.finalize(
        project["id"], ids, service.get_draw(project["id"])["version"], reserves(project, draw)
    )
    service.assign(project["id"])
    item = next(c for c in service.list_candidates() if c["id"] == ids[0])
    issued = service.issue_otp(project["id"], item["name"], item["phone"], "demo")
    wrong = "000000" if issued["demo_code"] != "000000" else "999999"
    for _ in range(5):
        with pytest.raises(DomainError):
            service.verify_otp(issued["request_id"], wrong)
    with pytest.raises(DomainError):
        service.verify_otp(issued["request_id"], issued["demo_code"])


def test_phone_change_requires_recontact_and_preserves_snapshot(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    old = next(c for c in service.list_candidates() if c["id"] == ids[0])
    service.update_candidate(ids[0], {"phone": "01000009999"}, old["version"])
    latest = service.get_draw(project["id"])
    assert latest["snapshot_sha256"] == draw["snapshot_sha256"]
    assert next(c for c in latest["contacts"] if c["candidate_id"] == ids[0])["status"] == "미연락"
    assert (
        next(c for c in latest["current_candidates"] if c["id"] == ids[0])["phone"] == "01000009999"
    )
    with pytest.raises(DomainError):
        service.finalize(project["id"], ids, latest["version"], reserves(project, draw))


def test_unused_code_expiration(service: CommitteeService) -> None:
    project, draw = ready(service)
    ids = accepting(service, project, draw)
    service.finalize(
        project["id"], ids, service.get_draw(project["id"])["version"], reserves(project, draw)
    )
    service.assign(project["id"])
    item = next(c for c in service.list_candidates() if c["id"] == ids[0])
    issued = service.issue_otp(project["id"], item["name"], item["phone"], "demo")
    with service.db.connect(write=True) as conn:
        conn.execute("UPDATE otp_requests SET expires_at=0 WHERE id=?", (issued["request_id"],))
    with pytest.raises(DomainError):
        service.verify_otp(issued["request_id"], issued["demo_code"])


def test_concurrent_import_commit_one_winner(service: CommitteeService) -> None:
    raw = workbook_bytes(
        [
            [
                i,
                "가상기관",
                "",
                f"합성위원 {i}",
                "",
                "",
                "",
                "",
                "데이터",
                f"0100000{i:04d}",
                "",
                "",
                "",
                "",
            ]
            for i in range(3)
        ]
    )
    previews = [service.import_preview(raw, "", "test.xlsx") for _ in range(2)]

    def attempt(preview: dict) -> int:
        try:
            service.commit_import(preview["id"])
            return 200
        except DomainError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(attempt, previews)) == [200, 409]
    assert len(service.list_candidates()) == 3


def test_demo_seed_uses_separate_database_and_is_idempotent(tmp_path: Path) -> None:
    from committee_app.demo import seed_demo

    work = CommitteeService(tmp_path / "work.db")
    work.add_candidate(candidate(999))
    demo_path = tmp_path / "demo.db"
    seed_demo(demo_path)
    seed_demo(demo_path)
    demo = CommitteeService(demo_path)
    assert len(demo.list_candidates()) == 48
    assert len(work.list_candidates()) == 1
    project = demo.list_projects()[0]
    assert demo.preview_pool(project["id"])["eligible"] == 27
