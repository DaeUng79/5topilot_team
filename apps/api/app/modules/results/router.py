from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor
from app.core.db import get_db
from app.core.permissions import require_project_role
from app.modules.results.service import confirm_results, get_confirmation, summarize

router = APIRouter(tags=["results"])
DB = Annotated[Session, Depends(get_db)]
User = Annotated[Actor, Depends(current_actor)]


class MemberStatus(BaseModel):
    evaluator_id: str
    name: str
    is_chair: bool
    status: Literal["none", "draft", "submitted"]
    submitted_at: str | None
    signed_at: str | None
    criteria_version: int | None


class VendorAverage(BaseModel):
    vendor_id: str
    technical_average: float


class Ranking(VendorAverage):
    rank: int


class ConfirmationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    status: Literal["confirmed", "closed"]
    policy_version: str
    criteria_version: int
    result_sha256: str
    expected: int
    submitted: int
    confirmed_by: str
    confirmed_at: str
    closed_by: str | None
    closed_at: str | None


class ResultsSummary(BaseModel):
    status: Literal["collecting", "technical_complete", "confirmed", "closed"]
    expected: int
    submitted: int
    members: list[MemberStatus]
    averages: list[VendorAverage]
    rankings: list[Ranking]
    policy_version: str
    criteria_version: int
    chair_id: str | None
    confirmable: bool
    confirmation: ConfirmationRead | None
    notices: list[str]


@router.get(
    "/projects/{project_id}/results/summary",
    response_model=ResultsSummary,
    operation_id="get_results_summary",
)
def get_results_summary(project_id: str, db: DB, actor: User):
    project = require_project_role(db, project_id, actor, {"admin", "chair"})
    return summarize(db, project)


@router.get(
    "/projects/{project_id}/results/confirmation",
    response_model=ConfirmationRead | None,
    operation_id="get_results_confirmation",
)
def get_results_confirmation(project_id: str, db: DB, actor: User):
    require_project_role(db, project_id, actor, {"admin", "chair"})
    return get_confirmation(db, project_id)


@router.post(
    "/projects/{project_id}/results/confirm",
    response_model=ConfirmationRead,
    status_code=201,
    operation_id="confirm_results",
)
def confirm(project_id: str, db: DB, actor: User):
    project = require_project_role(db, project_id, actor, {"chair"}, lock=True)
    return confirm_results(db, project, actor.id)
