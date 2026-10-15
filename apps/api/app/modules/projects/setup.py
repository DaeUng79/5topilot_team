"""사업별 평가 설정(평가항목·평가 대상 업체) 편집.

관리자(간사)만 편집한다. 저장 위치는 기존 projects.criteria·vendor_ids와 0004의 vendors(표시명)라서
채점·취합·확정 코드는 바뀌지 않는다. 평가표는 이 설정(항목 수 × 업체 수)에 맞춰 자동 구성된다.

잠금 규칙 (의도적으로 보수적이다):
- 결과가 확정·완료되면 모두 잠근다(CLOSE-01, results/state).
- 평가위원이 평가표를 하나라도 저장하면 "평가 시작"으로 보고 평가항목·업체를 모두 잠근다.
- 평가기준이 확정 기록(projects/criteria.py)으로 고정되면 평가항목은 이 API로 바꾸지 않는다.
  확정 흐름의 버전 관리(재검토 → 재확정)를 우회하지 않기 위해서다. 업체는 확정 대상이 아니라서
  열어 둔다.
추첨 완료만으로는 잠그지 않는다. 위원이 링크를 받은 뒤 설정이 바뀌면 다음 저장이 422로 거절되어
다시 불러온다.
"""

from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.modules.evaluations.models import ScoreSheet
from app.modules.projects.criteria import current_confirmation, project_total
from app.modules.projects.models import Project
from app.modules.projects.router import Criterion, Vendor, resolve_vendors
from app.modules.projects.service import get_project
from app.modules.results.state import get_confirmation

router = APIRouter(tags=["project-setup"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[Actor, Depends(require_admin)]


class CriterionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str | None = Field(
        default=None, min_length=1, max_length=50, description="생략하면 서버가 새 ID를 만든다."
    )
    name: str = Field(min_length=1, max_length=100)
    max_score: int = Field(ge=1, le=100)
    # 출처 정보(선택). 제안요청서 반영·AI 제안 항목을 구분하고 같은 결과를 다시 반영할 때
    # 짝을 맞추는 데 쓴다.
    # 채점·집계 규칙에는 쓰지 않는다.
    division: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    elements: list[str] | None = Field(default=None, max_length=10)
    origin: Literal["manual", "rfp", "ai"] | None = None
    source_ref: str | None = Field(default=None, max_length=200)
    source_label: str | None = Field(default=None, max_length=300)


class CriteriaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 빈 목록도 허용한다(빈 평가표로 시작한 사업). 채점 시작은 배점 합계 검사가 막는다.
    criteria: list[CriterionDraft] = Field(
        max_length=100, description="표시 순서대로 전체 목록을 보낸다."
    )


class TotalScoreUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    technical_total_score: int = Field(ge=1, le=1000)


class VendorDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str | None = Field(
        default=None, min_length=1, max_length=50, description="생략하면 서버가 새 ID를 만든다."
    )
    name: str = Field(min_length=1, max_length=200)


class VendorsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vendors: list[VendorDraft] = Field(
        min_length=1, max_length=50, description="표시 순서대로 전체 목록을 보낸다."
    )


class ProjectSetupRead(BaseModel):
    project_id: str
    name: str
    department: str
    criteria: list[Criterion]
    vendors: list[Vendor]
    total_score: int
    # 평가 시작·확정에 필요한 배점 합계. 설정 저장은 중간 상태를 허용하고 화면이 경고한다.
    required_total_score: int
    criteria_version: int
    criteria_editable: bool
    criteria_lock_reason: str | None
    vendors_editable: bool
    vendors_lock_reason: str | None


def evaluation_started(db: Session, project_id: str) -> bool:
    """평가표가 하나라도 저장됐으면 평가 시작으로 본다."""
    return (
        db.scalar(select(ScoreSheet.id).where(ScoreSheet.project_id == project_id).limit(1))
        is not None
    )


def lock_reasons(db: Session, project_id: str) -> tuple[str | None, str | None]:
    """(평가항목 잠금 사유, 업체 잠금 사유). None이면 편집할 수 있다."""
    sealed = get_confirmation(db, project_id)
    if sealed is not None:
        reason = (
            "사업이 완료·보관되어 변경할 수 없습니다."
            if sealed.status == "closed"
            else "결과가 확정되어 평가항목과 업체를 변경할 수 없습니다."
        )
        return reason, reason
    if evaluation_started(db, project_id):
        reason = "평가위원이 평가표 작성을 시작해 평가항목과 업체를 변경할 수 없습니다."
        return reason, reason
    confirmation = current_confirmation(db, project_id)
    if confirmation is not None:
        return (
            f"평가기준이 v{confirmation.version}으로 확정되어 있습니다. "
            "변경하려면 재검토 표시 뒤 다시 확정하세요.",
            None,
        )
    return None, None


def new_id(prefix: str, taken: set[str]) -> str:
    while True:
        candidate = f"{prefix}-{uuid4().hex[:8]}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate


def ensure_unique(items: list[dict], label: str) -> None:
    if len({item["id"] for item in items}) != len(items):
        raise HTTPException(422, f"{label} ID가 중복됩니다.")
    if len({item["name"] for item in items}) != len(items):
        raise HTTPException(422, f"{label}명이 중복됩니다.")


def read_setup(db: Session, project: Project) -> ProjectSetupRead:
    criteria_lock, vendors_lock = lock_reasons(db, project.id)
    confirmation = current_confirmation(db, project.id)
    return ProjectSetupRead(
        project_id=project.id,
        name=project.name,
        department=project.department,
        criteria=project.criteria,
        vendors=resolve_vendors(project.vendor_ids, project.vendors),
        total_score=sum(c["max_score"] for c in project.criteria),
        required_total_score=project_total(project),
        criteria_version=confirmation.version if confirmation else 0,
        criteria_editable=criteria_lock is None,
        criteria_lock_reason=criteria_lock,
        vendors_editable=vendors_lock is None,
        vendors_lock_reason=vendors_lock,
    )


@router.get(
    "/projects/{project_id}/setup",
    response_model=ProjectSetupRead,
    operation_id="get_project_setup",
)
def get_setup(project_id: str, db: DB, _: Admin):
    return read_setup(db, get_project(db, project_id))


@router.put(
    "/projects/{project_id}/setup/criteria",
    response_model=ProjectSetupRead,
    operation_id="update_project_criteria",
)
def update_criteria(project_id: str, body: CriteriaUpdate, db: DB, _: Admin):
    project = get_project(db, project_id, lock=True)
    reason, _vendors_reason = lock_reasons(db, project_id)
    if reason is not None:
        raise HTTPException(409, reason)
    taken = {c.id for c in body.criteria if c.id}
    criteria = [
        {**c.model_dump(exclude_none=True), "id": c.id or new_id("crit", taken)}
        for c in body.criteria
    ]
    ensure_unique(criteria, "평가항목")
    project.criteria = criteria
    db.commit()
    db.refresh(project)
    return read_setup(db, project)


@router.put(
    "/projects/{project_id}/setup/total-score",
    response_model=ProjectSetupRead,
    operation_id="update_project_total_score",
)
def update_total_score(project_id: str, body: TotalScoreUpdate, db: DB, _: Admin):
    """기술평가 총배점. 평가항목과 같은 잠금 규칙을 따른다."""
    project = get_project(db, project_id, lock=True)
    reason, _vendors_reason = lock_reasons(db, project_id)
    if reason is not None:
        raise HTTPException(409, reason)
    project.technical_total_score = body.technical_total_score
    db.commit()
    db.refresh(project)
    return read_setup(db, project)


@router.put(
    "/projects/{project_id}/setup/vendors",
    response_model=ProjectSetupRead,
    operation_id="update_project_vendors",
)
def update_vendors(project_id: str, body: VendorsUpdate, db: DB, _: Admin):
    project = get_project(db, project_id, lock=True)
    _criteria_reason, reason = lock_reasons(db, project_id)
    if reason is not None:
        raise HTTPException(409, reason)
    taken = {v.id for v in body.vendors if v.id}
    vendors = [{"id": v.id or new_id("vendor", taken), "name": v.name} for v in body.vendors]
    ensure_unique(vendors, "업체")
    project.vendors = vendors
    project.vendor_ids = [v["id"] for v in vendors]
    db.commit()
    db.refresh(project)
    return read_setup(db, project)
