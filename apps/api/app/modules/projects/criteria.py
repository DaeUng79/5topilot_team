"""평가기준 확정 기록.

projects.criteria(JSON)는 편집 중인 기준이고, 이 모듈은 사람이 확정한 시점의 스냅샷·버전·
확정자·출처 revision을 남긴다(DOC-03). 원본 revision이 바뀌면 needs_review로 표시해 기존
확정을 그대로 재사용하지 않는다(DOC-04). 평가표는 저장 시점의 확정 버전을 기록한다(EVAL-01).
확정 권한은 현재 관리자(간사)이며 위원장·기획 승인 절차는 Lex6won과 협의 후 추가한다.
문서 ID·revision 필드는 DaeUng79의 문서 계약을 그대로 담는 문자열이다.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.auth import Actor, current_actor, require_admin
from app.core.db import Base, get_db
from app.core.permissions import require_project_role
from app.modules.projects.models import Project
from app.modules.projects.service import get_project
from app.modules.results.state import ensure_not_sealed

Status = Literal["confirmed", "needs_review", "superseded"]


class CriteriaConfirmation(Base):
    __tablename__ = "criteria_confirmations"
    __table_args__ = (UniqueConstraint("project_id", "version", name="uq_criteria_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    version: Mapped[int] = mapped_column(Integer)
    criteria: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    confirmed_by: Mapped[str] = mapped_column(String(100))
    confirmed_at: Mapped[str] = mapped_column(String(40))
    source_document_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_revision: Mapped[str | None] = mapped_column(String(100), nullable=True)
    review_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)


def current_confirmation(db: Session, project_id: str) -> CriteriaConfirmation | None:
    return db.scalar(
        select(CriteriaConfirmation)
        .where(
            CriteriaConfirmation.project_id == project_id,
            CriteriaConfirmation.status != "superseded",
        )
        .order_by(CriteriaConfirmation.version.desc())
    )


def effective_criteria(db: Session, project: Project) -> tuple[list[dict], int]:
    """채점에 쓸 (기준 목록, 버전). 확정이 없으면 시작용 템플릿과 버전 0.

    버전 0 평가표는 결과 확정(results) 단계에서 거절된다. 재검토 중이면 채점을 막는다.
    """
    confirmation = current_confirmation(db, project.id)
    if confirmation is None:
        return project.criteria, 0
    if confirmation.status == "needs_review":
        raise HTTPException(
            409, "평가기준이 재검토 중입니다. 간사가 다시 확정한 뒤 채점할 수 있습니다."
        )
    return confirmation.criteria, confirmation.version


router = APIRouter(tags=["criteria"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[Actor, Depends(require_admin)]
User = Annotated[Actor, Depends(current_actor)]


class CriterionIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    max_score: int = Field(ge=1, le=100)


class CriteriaConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_version: int = Field(ge=0, description="현재 확정 버전(없으면 0). 다르면 409.")
    criteria: list[CriterionIn] | None = Field(
        default=None, min_length=1, max_length=100, description="생략하면 사업의 현재 기준을 확정"
    )
    source_document_id: str | None = Field(default=None, max_length=100)
    source_revision: str | None = Field(default=None, max_length=100)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=1, max_length=500)


class CriteriaConfirmationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    version: int
    status: Status
    criteria: list[CriterionIn]
    confirmed_by: str
    confirmed_at: str
    source_document_id: str | None
    source_revision: str | None
    review_reason: str | None


@router.get(
    "/projects/{project_id}/criteria/confirmation",
    response_model=CriteriaConfirmationRead | None,
    operation_id="get_criteria_confirmation",
)
def get_confirmation(project_id: str, db: DB, actor: User):
    require_project_role(db, project_id, actor, {"admin", "evaluator"})
    return current_confirmation(db, project_id)


@router.post(
    "/projects/{project_id}/criteria/confirm",
    response_model=CriteriaConfirmationRead,
    status_code=201,
    operation_id="confirm_criteria",
)
def confirm_criteria(project_id: str, body: CriteriaConfirm, db: DB, actor: Admin):
    project = get_project(db, project_id, lock=True)
    ensure_not_sealed(db, project_id)
    current = current_confirmation(db, project_id)
    current_version = current.version if current else 0
    if body.expected_version != current_version:
        raise HTTPException(409, "평가기준 버전이 다릅니다. 다시 불러오세요.")
    criteria = [c.model_dump() for c in body.criteria] if body.criteria else list(project.criteria)
    if len({c["id"] for c in criteria}) != len(criteria):
        raise HTTPException(422, "평가항목 ID가 중복됩니다.")
    confirmation = CriteriaConfirmation(
        project_id=project_id,
        version=current_version + 1,
        criteria=criteria,
        confirmed_by=actor.id,
        confirmed_at=datetime.now(UTC).isoformat(),
        source_document_id=body.source_document_id,
        source_revision=body.source_revision,
    )
    if current is not None:
        current.status = "superseded"
    project.criteria = criteria
    db.add(confirmation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "동시 확정 요청이 먼저 처리되었습니다.") from None
    db.refresh(confirmation)
    return confirmation


@router.post(
    "/projects/{project_id}/criteria/confirmation/review",
    response_model=CriteriaConfirmationRead,
    operation_id="flag_criteria_review",
)
def flag_review(project_id: str, body: ReviewRequest, db: DB, _: Admin):
    get_project(db, project_id)
    ensure_not_sealed(db, project_id)
    current = current_confirmation(db, project_id)
    if current is None:
        raise HTTPException(404, "확정된 평가기준이 없습니다.")
    current.status = "needs_review"
    current.review_reason = body.reason
    db.commit()
    db.refresh(current)
    return current
