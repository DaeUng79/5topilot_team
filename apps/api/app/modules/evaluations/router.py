from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor, require_admin
from app.core.db import get_db
from app.modules.committee.models import Draw
from app.modules.evaluations.models import ScoreSheet
from app.modules.evaluations.service import technical_averages, validate_scores
from app.modules.projects.service import get_project

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
    project = get_project(db, project_id)
    draw = db.scalar(select(Draw).where(Draw.project_id == project_id))
    if actor.role != "evaluator" or not draw or actor.id not in draw.selected_ids:
        raise HTTPException(403, "이 사업의 선정된 평가위원만 채점할 수 있습니다.")
    return project


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
    scores = [s.model_dump() for s in body.scores]
    validate_scores(project, scores)
    sheet = my_sheet(db, project_id, actor.id)
    if sheet is None:
        if body.expected_version != 0:
            raise HTTPException(409, "평가표 버전이 다릅니다. 다시 불러오세요.")
        sheet = ScoreSheet(
            project_id=project_id, evaluator_id=actor.id, scores=scores, opinion=body.opinion
        )
        db.add(sheet)
    else:
        result = db.execute(
            update(ScoreSheet)
            .where(
                ScoreSheet.id == sheet.id,
                ScoreSheet.version == body.expected_version,
                ScoreSheet.status == "draft",
            )
            .values(scores=scores, opinion=body.opinion, version=ScoreSheet.version + 1)
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
    sheet = my_sheet(db, project_id, actor.id)
    if sheet is None:
        raise HTTPException(422, "먼저 평가표를 저장하세요.")
    validate_scores(project, sheet.scores, complete=True)
    result = db.execute(
        update(ScoreSheet)
        .where(
            ScoreSheet.id == sheet.id,
            ScoreSheet.version == body.expected_version,
            ScoreSheet.status == "draft",
        )
        .values(
            status="submitted",
            submitted_at=datetime.now(UTC).isoformat(),
            version=ScoreSheet.version + 1,
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
        averages=technical_averages(project, sheets) if complete else [],
        calculation="선정위원 전원 단순평균, 소수 둘째 자리 반올림. 가격/순위/최종확정은 미구현.",
    )
