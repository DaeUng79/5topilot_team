from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.modules.committee.models import Candidate, Draw
from app.modules.committee.service import conduct_draw
from app.modules.evaluator_access.service import normalize_birth_date
from app.modules.projects.service import get_project

router = APIRouter(tags=["committee"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[Actor, Depends(require_admin)]


class CandidateBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    organization: str = Field(min_length=1, max_length=200)
    specialty: str = Field(min_length=1, max_length=100)


class CandidateCreate(CandidateBase):
    # 본인확인용 생년월일(선택). YYYYMMDD 또는 YYYY-MM-DD로 받아 YYYYMMDD로 저장한다.
    # 쓰기 전용이며 CandidateRead·추첨 스냅샷에는 포함하지 않는다(evaluator_access, u-jing).
    birth_date: str | None = Field(default=None, max_length=10)

    @field_validator("birth_date")
    @classmethod
    def _normalize_birth_date(cls, value: str | None) -> str | None:
        return normalize_birth_date(value) if value else None


class CandidateRead(CandidateBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    active: bool


class CandidateSnapshot(BaseModel):
    id: str
    name: str
    organization: str
    specialty: str


class DrawCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_ids: list[str] = Field(min_length=1, max_length=1000)
    seats: int = Field(ge=1, le=30)
    reserves: int = Field(ge=0, le=30)


class DrawRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    candidate_snapshot: list[CandidateSnapshot]
    selected_ids: list[str]
    reserve_ids: list[str]
    snapshot_sha256: str
    method: str
    actor_id: str
    created_at: str


@router.get(
    "/committee/candidates", response_model=list[CandidateRead], operation_id="list_candidates"
)
def list_candidates(db: DB, _: Admin):
    return db.scalars(select(Candidate).order_by(Candidate.name, Candidate.id)).all()


@router.post(
    "/committee/candidates",
    response_model=CandidateRead,
    status_code=201,
    operation_id="create_candidate",
)
def create_candidate(body: CandidateCreate, db: DB, _: Admin):
    candidate = Candidate(**body.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.get(
    "/projects/{project_id}/committee/draw", response_model=DrawRead | None, operation_id="get_draw"
)
def get_draw(project_id: str, db: DB, _: Admin):
    get_project(db, project_id)
    return db.scalar(select(Draw).where(Draw.project_id == project_id))


@router.post(
    "/projects/{project_id}/committee/draw",
    response_model=DrawRead,
    status_code=201,
    operation_id="create_draw",
)
def create_draw(project_id: str, body: DrawCreate, db: DB, actor: Admin):
    return conduct_draw(db, project_id, body.candidate_ids, body.seats, body.reserves, actor.id)
