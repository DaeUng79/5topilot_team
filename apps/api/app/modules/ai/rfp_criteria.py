"""제안요청서 평가기준 파싱 결과 읽기 어댑터 (DaeUng79 documents 모듈 연계).

apps/documents_daeung/step4_ai_criteria.py가 SQLite(documents.sqlite3)의 criteria_results에 저장한
result_json을 읽어 평가 설정 화면이 쓰는 모양(RfpCriteriaRead)으로 바꾼다. 파싱·AI 생성은 여기서
하지 않고 저장된 결과만 읽기 전용으로 조회한다. step 모듈을 import하지 않으므로 openai·streamlit
의존성이 API에 들어오지 않는다. 사업 ↔ 문서 연결은 같은 DB의 project_documents(project_id =
심사임당 사업 ID)를 쓴다. DB 파일이 없거나 연결된 결과가 없으면 상태(status)로 알리고, 데모 인증이
켜진 로컬·CI에서는 테스트용 예시 자료(rfp_sample.json)를 돌려줄 수 있다.

구분: 원문 평가표의 행(template_source=request_document)만 공식 기준(origin=rfp)이다. 총괄표로 AI가
만든 초안(generated_from_summary)과 supplemental_items(보완 항목)는 AI 제안(origin=ai)으로 표시하며
화면은 이를 자동 반영하지 않는다. 저장 결과에는 행별 원문 페이지가 없어 출처는 문서명·행 ID로 적는다
(행별 페이지는 DaeUng79 결과에 추가되면 그대로 전달한다).
"""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app.core.config import settings

REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_DB = REPO_ROOT / "apps" / "documents_daeung" / "documents.sqlite3"
SAMPLE_PATH = Path(__file__).with_name("rfp_sample.json")
OFFICIAL_SOURCE = "request_document"

Status = Literal["ready", "sample", "not_connected", "not_found"]
Origin = Literal["rfp", "ai"]


class RfpSource(BaseModel):
    document_id: str
    filename: str | None
    revision: str | None
    template_source: str | None
    model: str | None
    created_at: str | None
    result_id: str | None


class RfpItem(BaseModel):
    row_id: str
    division: str | None  # 평가부문
    division_score: int | None
    name: str  # 평가항목
    description: str | None  # 평가기준
    elements: list[str]  # 평가요소
    score: int  # 배점
    origin: Origin
    source_ref: str  # 문서ID:행ID. 같은 결과를 다시 반영해도 중복되지 않게 맞추는 키
    source_label: str  # 화면 표시용 출처


class RfpSupplementalItem(BaseModel):
    name: str
    description: str | None
    elements: list[str]
    source_id: str | None
    source_quote: str | None
    origin: Literal["ai"] = "ai"


class RfpCriteriaRead(BaseModel):
    status: Status
    notice: str
    official: bool
    is_sample: bool
    total_score: int
    source: RfpSource | None
    items: list[RfpItem]
    supplemental: list[RfpSupplementalItem]


NOT_CONNECTED = (
    "제안요청서 파싱 결과 저장소(documents.sqlite3)에 연결되지 않았습니다. "
    "DaeUng79 문서 화면에서 문서를 파싱·저장한 뒤 다시 시도하세요."
)
NOT_FOUND = (
    "이 사업에 연결된 제안요청서 평가기준 결과가 없습니다. 문서 화면에서 문서를 사업에 연결하고 "
    "정성적 평가기준을 생성한 뒤 다시 시도하세요."
)


def database_path() -> Path:
    return Path(settings.documents_db_path) if settings.documents_db_path else DEFAULT_DB


def _empty(status: Status, notice: str) -> RfpCriteriaRead:
    return RfpCriteriaRead(
        status=status,
        notice=notice,
        official=False,
        is_sample=False,
        total_score=0,
        source=None,
        items=[],
        supplemental=[],
    )


def _strings(values) -> list[str]:
    return [str(v).strip() for v in (values or []) if str(v).strip()][:10]


def convert(result: dict, *, is_sample: bool = False) -> RfpCriteriaRead:
    """step4 result_json을 화면용 구조로 바꾼다. 항목·배점은 그대로 두고 출처·구분만 덧붙인다."""
    document_id = str(result.get("document_id") or ("sample-rfp" if is_sample else ""))
    filename = result.get("reference_filename")
    template_source = result.get("template_source")
    official = template_source == OFFICIAL_SOURCE
    origin: Origin = "rfp" if official else "ai"
    items: list[RfpItem] = []
    for row in result.get("rows") or []:
        name = str(row.get("evaluation_item") or "").strip()
        if not name:
            continue
        row_id = str(row.get("row_id") or f"R{len(items) + 1:02d}")
        items.append(
            RfpItem(
                row_id=row_id,
                division=row.get("evaluation_division") or None,
                division_score=row.get("division_score"),
                name=name,
                description=(row.get("evaluation_criteria") or "").strip() or None,
                elements=_strings(row.get("evaluation_elements") or row.get("reference_elements")),
                score=int(row.get("score") or 0),
                origin=origin,
                source_ref=f"{document_id}:{row_id}",
                source_label=f"{filename or document_id} · {row_id} · "
                + ("원문 평가표" if official else "AI 초안 배점"),
            )
        )
    supplemental = [
        RfpSupplementalItem(
            name=str(item.get("evaluation_item")).strip(),
            description=(item.get("evaluation_criteria") or "").strip() or None,
            elements=_strings(item.get("evaluation_elements")),
            source_id=item.get("source_id"),
            source_quote=item.get("source_quote"),
        )
        for item in result.get("supplemental_items") or []
        if str(item.get("evaluation_item") or "").strip()
    ]
    notice = (
        "제안요청서 원문 평가표에서 읽은 항목·배점입니다."
        if official
        else "원문에 평가표가 없어 요구사항 총괄표로 AI가 만든 초안 배점입니다. "
        "공식 기준이 아니므로 검토 후 선택해서 반영하세요."
    )
    if is_sample:
        notice = "테스트용 예시 자료입니다. 실제 제안요청서 파싱 결과가 아닙니다. " + notice
    created = result.get("created_at")
    return RfpCriteriaRead(
        status="sample" if is_sample else "ready",
        notice=notice,
        official=official,
        is_sample=is_sample,
        total_score=int(result.get("total_score") or sum(item.score for item in items)),
        source=RfpSource(
            document_id=document_id,
            filename=filename,
            revision=result.get("source_revision"),
            template_source=template_source,
            model=result.get("model"),
            created_at=str(created) if created is not None else None,
            result_id=result.get("_id"),
        ),
        items=items,
        supplemental=supplemental,
    )


def load_sample() -> RfpCriteriaRead:
    return convert(json.loads(SAMPLE_PATH.read_text(encoding="utf-8")), is_sample=True)


def _latest_result(path: Path, project_id: str) -> dict | None:
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)) as connection:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if not {"criteria_results", "project_documents"} <= tables:
            return None
        row = connection.execute(
            "SELECT c.result_json FROM project_documents p "
            "JOIN criteria_results c ON c.document_id = p.document_id "
            "WHERE p.project_id = ? ORDER BY c.created_at DESC LIMIT 1",
            (project_id,),
        ).fetchone()
    return json.loads(row[0]) if row else None


def load_for_project(project_id: str, *, sample: bool = False) -> RfpCriteriaRead:
    """사업에 연결된 최신 파싱 결과. sample=True면 데모 인증이 켜진 환경에서만 예시 자료를 준다."""
    if sample:
        if not settings.simsaimdang_demo_auth:
            return _empty("not_connected", NOT_CONNECTED)
        return load_sample()
    path = database_path()
    if not path.is_file():
        return _empty("not_connected", NOT_CONNECTED)
    try:
        result = _latest_result(path, project_id)
    except (sqlite3.Error, ValueError, TypeError):
        return _empty("not_connected", NOT_CONNECTED + " (저장소를 읽지 못했습니다.)")
    if result is None:
        return _empty("not_found", NOT_FOUND)
    try:
        return convert(result)
    except (TypeError, ValueError):
        return _empty("not_found", NOT_FOUND + " (저장된 결과 형식을 읽지 못했습니다.)")
