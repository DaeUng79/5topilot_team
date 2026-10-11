from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor, require_admin
from app.core.db import get_db
from app.core.permissions import require_project_role
from app.modules.committee.models import Draw
from app.modules.evaluations.models import ScoreSheet
from app.modules.evaluations.service import SIGN_METHOD, sheet_hash, validate_scores
from app.modules.projects.criteria import effective_criteria
from app.modules.projects.service import get_project
from app.modules.results.policies import CURRENT_POLICY, POLICIES, aggregate
from app.modules.results.state import ensure_not_sealed

router = APIRouter(tags=["evaluations"])
DB = Annotated[Session, Depends(get_db)]
User = Annotated[Actor, Depends(current_actor)]


class ScoreEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vendor_id: str
    criterion_id: str
    score: float = Field(ge=0, le=100, allow_inf_nan=False)


class SheetSave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0)
    scores: list[ScoreEntry] = Field(max_length=10000)
    opinion: str = Field(default="", max_length=4000)


class SheetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    evaluator_id: str
    scores: list[ScoreEntry]
    opinion: str
    status: Literal["draft", "submitted"]
    version: int
    submitted_at: str | None
    # 저장 시점의 확정 기준 버전. 0은 미확정 템플릿, None은 0002 이전 행.
    criteria_version: int | None = None
    # 제출 시 기록. 본인 확인 문구 동의 + 내용 해시(attestation-v1). 법적 전자서명이 아니다.
    signed_at: str | None = None
    sheet_hash: str | None = None
    sign_method: str | None = None


class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    attested: Literal[True]


class TechnicalAverage(BaseModel):
    vendor_id: str
    technical_average: float


class ResultsRead(BaseModel):
    status: Literal["collecting", "technical_complete"]
    expected: int
    submitted: int
    averages: list[TechnicalAverage]
    calculation: str


def require_assigned(db: Session, project_id: str, actor: Actor):
    """선정된 본위원만. 본인확인 세션은 토큰의 사업에만 유효하다(core/permissions)."""
    return require_project_role(db, project_id, actor, {"evaluator"})


def ensure_criteria_version(sheet: ScoreSheet, current: int):
    """평가표가 다른 기준 버전으로 작성됐으면 저장·제출을 막는다(EVAL-01, DOC-04).

    새 기준과 기존 평가표의 처리 규칙은 미합의라 보수적으로 거절한다.
    0002 이전 행(None)은 현재 버전을 채택한다.
    """
    if sheet.criteria_version is not None and sheet.criteria_version != current:
        raise HTTPException(
            409,
            f"평가기준이 v{sheet.criteria_version}에서 v{current}로 바뀌었습니다. "
            "간사에게 평가표 처리 방법을 확인하세요.",
        )


def my_sheet(db: Session, project_id: str, actor_id: str):
    return db.scalar(
        select(ScoreSheet).where(
            ScoreSheet.project_id == project_id,
            ScoreSheet.evaluator_id == actor_id,
        )
    )


@router.get(
    "/projects/{project_id}/evaluations/me",
    response_model=SheetRead | None,
    operation_id="get_my_sheet",
)
def get_my_sheet(project_id: str, db: DB, actor: User):
    require_assigned(db, project_id, actor)
    return my_sheet(db, project_id, actor.id)


@router.put(
    "/projects/{project_id}/evaluations/me", response_model=SheetRead, operation_id="save_my_sheet"
)
def save_my_sheet(project_id: str, body: SheetSave, db: DB, actor: User):
    project = require_assigned(db, project_id, actor)
    ensure_not_sealed(db, project_id)
    criteria, criteria_version = effective_criteria(db, project)
    scores = [s.model_dump() for s in body.scores]
    validate_scores(project, scores, criteria=criteria)
    sheet = my_sheet(db, project_id, actor.id)
    if sheet is None:
        if body.expected_version != 0:
            raise HTTPException(409, "평가표 버전이 다릅니다. 다시 불러오세요.")
        sheet = ScoreSheet(
            project_id=project_id,
            evaluator_id=actor.id,
            scores=scores,
            opinion=body.opinion,
            criteria_version=criteria_version,
        )
        db.add(sheet)
    else:
        ensure_criteria_version(sheet, criteria_version)
        result = db.execute(
            update(ScoreSheet)
            .where(
                ScoreSheet.id == sheet.id,
                ScoreSheet.version == body.expected_version,
                ScoreSheet.status == "draft",
            )
            .values(
                scores=scores,
                opinion=body.opinion,
                version=ScoreSheet.version + 1,
                criteria_version=criteria_version,
            )
        )
        if result.rowcount != 1:
            raise HTTPException(409, "제출 후 수정 불가 또는 다른 창에서 변경됨. 다시 불러오세요.")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "동시 저장 충돌입니다. 다시 불러오세요.") from None
    db.refresh(sheet)
    return sheet


@router.post(
    "/projects/{project_id}/evaluations/me/submit",
    response_model=SheetRead,
    operation_id="submit_my_sheet",
)
def submit_my_sheet(project_id: str, body: SubmitRequest, db: DB, actor: User):
    project = require_assigned(db, project_id, actor)
    ensure_not_sealed(db, project_id)
    criteria, criteria_version = effective_criteria(db, project)
    sheet = my_sheet(db, project_id, actor.id)
    if sheet is None:
        raise HTTPException(422, "먼저 평가표를 저장하세요.")
    ensure_criteria_version(sheet, criteria_version)
    validate_scores(project, sheet.scores, complete=True, criteria=criteria)
    signed_at = datetime.now(UTC).isoformat()
    result = db.execute(
        update(ScoreSheet)
        .where(
            ScoreSheet.id == sheet.id,
            ScoreSheet.version == body.expected_version,
            ScoreSheet.status == "draft",
        )
        .values(
            status="submitted",
            submitted_at=signed_at,
            version=ScoreSheet.version + 1,
            criteria_version=criteria_version,
            signed_at=signed_at,
            sheet_hash=sheet_hash(
                project_id, actor.id, sheet.scores, sheet.opinion, criteria_version
            ),
            sign_method=SIGN_METHOD,
        )
    )
    if result.rowcount != 1:
        raise HTTPException(409, "이미 제출했거나 버전이 다릅니다. 다시 불러오세요.")
    db.commit()
    db.refresh(sheet)
    return sheet


@router.get(
    "/projects/{project_id}/results", response_model=ResultsRead, operation_id="get_results"
)
def get_results(project_id: str, db: DB, _: Annotated[Actor, Depends(require_admin)]):
    project = get_project(db, project_id)
    draw = db.scalar(select(Draw).where(Draw.project_id == project_id))
    selected = draw.selected_ids if draw else []
    sheets = db.scalars(
        select(ScoreSheet).where(
            ScoreSheet.project_id == project_id,
            ScoreSheet.evaluator_id.in_(selected),
            ScoreSheet.status == "submitted",
        )
    ).all()
    complete = bool(selected) and len(sheets) == len(selected)
    return ResultsRead(
        status="technical_complete" if complete else "collecting",
        expected=len(selected),
        submitted=len(sheets),
        averages=aggregate(CURRENT_POLICY, project, sheets) if complete else [],
        calculation=(
            f"{CURRENT_POLICY}: {POLICIES[CURRENT_POLICY].description} 확정은 results 모듈."
        ),
    )
