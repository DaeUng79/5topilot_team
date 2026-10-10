"""contracts/examples와 tests/fixtures가 현재 API 모델·계산 함수와 일치하는지 검증한다.

예제·fixture는 사람이 작성한 합성 자료다. 이 테스트가 실패하면 자료가 아니라 계약이 바뀐 것인지
먼저 확인하고, 계약 변경이면 예제를 갱신하면서 소비자(화면)에게 알린다.
"""

import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.modules.evaluations import router as evaluations_router
from app.modules.evaluations.service import technical_averages, validate_scores
from app.modules.evaluator_access import router as access_router
from app.modules.projects import criteria as criteria_module
from app.modules.projects import router as projects_router
from app.modules.projects.models import Project

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = ROOT / "contracts" / "examples"
FIXTURES = ROOT / "tests" / "fixtures" / "synthetic"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


OPENAPI = read_json(ROOT / "contracts" / "openapi.json")
INDEX = read_json(EXAMPLES / "index.json")
OPERATION_IDS = {
    operation["operationId"]
    for operations in OPENAPI["paths"].values()
    for operation in operations.values()
}
MODELS: dict[str, type[BaseModel]] = {
    name: obj
    for module in (evaluations_router, projects_router, access_router, criteria_module)
    for name, obj in vars(module).items()
    if isinstance(obj, type) and issubclass(obj, BaseModel)
}


def all_keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in all_keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in all_keys(v)}
    return set()


def test_every_example_file_is_indexed():
    indexed = {entry["path"] for entry in INDEX["examples"]}
    on_disk = {
        p.relative_to(EXAMPLES).as_posix()
        for p in EXAMPLES.rglob("*.json")
        if p.name != "index.json"
    }
    assert on_disk == indexed


@pytest.mark.parametrize("entry", INDEX["examples"], ids=lambda e: e["path"])
def test_example_matches_contract(entry):
    data = read_json(EXAMPLES / entry["path"])
    for forbidden in entry.get("must_not_contain", []):
        assert forbidden not in all_keys(data), f"{entry['path']}에 {forbidden} 키가 있으면 안 됨"
    if entry.get("draft"):
        assert entry["schema"] not in MODELS, "구현된 모델이면 draft 표시를 지우고 operation을 연결"
        return
    assert entry["operation"] in OPERATION_IDS
    schema = entry["schema"]
    if schema is None:
        assert data is None
    elif schema == "ErrorDetail":
        assert isinstance(data["detail"], str) and data["detail"]
    elif schema == "HTTPValidationError":
        assert schema in OPENAPI["components"]["schemas"]
        assert isinstance(data["detail"], list) and data["detail"]
    else:
        assert schema in OPENAPI["components"]["schemas"]
        MODELS[schema].model_validate(data)


def fixture(name: str):
    return read_json(FIXTURES / name)


def project_a() -> Project:
    data = next(p for p in fixture("project_demo.json")["projects"] if p["id"] == "fx-project-a")
    projects_router.ProjectRead.model_validate(data)
    return Project(**data)


class SheetStub:
    """technical_averages()가 읽는 속성만 가진 평가표 대체물."""

    def __init__(self, scores: list[dict]):
        self.scores = scores


def test_fixture_projects_and_evaluators_match_models():
    for data in fixture("project_demo.json")["projects"]:
        projects_router.ProjectRead.model_validate(data)
    evaluators = fixture("evaluators.json")
    candidate_ids = {c["id"] for c in evaluators["candidates"]}
    for draw in evaluators["draws"]:
        assert set(draw["selected_ids"] + draw["reserve_ids"]) <= candidate_ids
        assert not set(draw["selected_ids"]) & set(draw["reserve_ids"])
    assert set(evaluators["unassigned_ids"]) <= candidate_ids


def test_fixture_sheets_follow_current_validation_rules():
    project = project_a()
    sheets = fixture("sheets.json")
    for sheet in sheets["complete"]:
        validate_scores(project, sheet["scores"], complete=True)
        totals = {
            vendor: float(sum(s["score"] for s in sheet["scores"] if s["vendor_id"] == vendor))
            for vendor in project.vendor_ids
        }
        assert totals == {k: float(v) for k, v in sheet["vendor_totals"].items()}
    validate_scores(project, sheets["incomplete"]["scores"])
    with pytest.raises(HTTPException) as exc:
        validate_scores(project, sheets["incomplete"]["scores"], complete=True)
    assert exc.value.status_code == 422
    for bad in sheets["invalid"]:
        with pytest.raises(HTTPException) as exc:
            validate_scores(project, bad["scores"])
        assert exc.value.status_code == 422, bad["reason"]


APPROVED_CASES = [
    c for c in fixture("expected_results.json")["cases"] if c["policy"] == "technical_mean_v1"
]


@pytest.mark.parametrize("case", APPROVED_CASES, ids=lambda c: c["case"])
def test_expected_results_match_current_calculation(case):
    project = project_a()
    by_id = {s["id"]: s for s in fixture("sheets.json")["complete"]}
    sheets = [SheetStub(by_id[sheet_id]["scores"]) for sheet_id in case["sheet_ids"]]
    got = {r["vendor_id"]: r["technical_average"] for r in technical_averages(project, sheets)}
    assert got == case["expected"]


def test_unapproved_policies_are_marked_and_not_the_current_one():
    cases = fixture("expected_results.json")["cases"]
    assert APPROVED_CASES, "현행 정책 사례가 하나 이상 필요"
    for case in cases:
        if case["policy"] != "technical_mean_v1":
            assert case["approved"] is False
