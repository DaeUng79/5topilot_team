from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor
from app.core.db import get_db
from app.core.permissions import require_project_role
from app.modules.results.report import build_report, close_project
from app.modules.results.service import confirm_results, summarize
from app.modules.results.state import get_confirmation

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
    # 0007: 위원장 자필 서명. 서명 시각은 confirmed_at. 0007 이전 기록은 None.
    sign_method: str | None = None
    signer_name: str | None = None
    signature_sha256: str | None = None
    signature_image: str | None = None


class ReportCriterion(BaseModel):
    id: str
    name: str
    max_score: int


class ReportProject(BaseModel):
    id: str
    name: str
    department: str


class ReportSheet(BaseModel):
    evaluator_id: str
    name: str
    submitted_at: str | None
    signed_at: str | None
    sign_method: str | None
    sheet_hash: str | None
    criteria_version: int | None
    integrity: Literal["intact", "mismatch", "missing"]
    vendor_totals: dict[str, float]
    opinion: str


class DocumentRevisionRef(BaseModel):
    vendor_id: str
    document_id: str
    source_revision: str


class ReportRead(BaseModel):
    project: ReportProject
    confirmation: ConfirmationRead
    generated_at: str
    policy_version: str
    criteria_version: int
    criteria: list[ReportCriterion]
    vendor_ids: list[str]
    averages: list[VendorAverage]
    rankings: list[Ranking]
    sheets: list[ReportSheet]
    document_revisions: list[DocumentRevisionRef]
    snapshot_intact: bool
    # 위원장 서명 이미지 해시 재검증. 서명 없는 기록(0007 이전)은 None.
    signature_intact: bool | None
    notices: list[str]


class ConfirmRequest(BaseModel):
    """위원장 최종 서명·확정(RES-03). 확인 동의와 화면에서 작성한 자필 서명 이미지가 모두 있어야
    봉인한다.

    signature_image는 PNG data URL(data:image/png;base64,…)이며 서버가 형식·크기를 검증해 해시와
    함께 저장한다. 법적 효력이 있는 전자서명이 아니며 로컬 시연용이다.
    """

    model_config = ConfigDict(extra="forbid")
    reviewed: Literal[True]
    signature_image: str = Field(min_length=30, max_length=400_000)


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
def confirm(project_id: str, body: ConfirmRequest, db: DB, actor: User):
    project = require_project_role(db, project_id, actor, {"chair"}, lock=True)
    return confirm_results(db, project, actor.id, body.signature_image)


@router.get(
    "/projects/{project_id}/results/report",
    response_model=ReportRead,
    operation_id="get_results_report",
)
def get_report(project_id: str, db: DB, actor: User):
    project = require_project_role(db, project_id, actor, {"admin", "chair"})
    return build_report(db, project)


@router.post(
    "/projects/{project_id}/results/close",
    response_model=ConfirmationRead,
    operation_id="close_project",
)
def close(project_id: str, db: DB, actor: User):
    project = require_project_role(db, project_id, actor, {"admin"}, lock=True)
    return close_project(db, project, actor.id)
