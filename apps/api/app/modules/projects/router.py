from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.modules.projects.models import DEFAULT_TOTAL_SCORE, Project

router = APIRouter(tags=["projects"])


class Criterion(BaseModel):
    id: str
    name: str
    max_score: int
    # 출처 정보(선택). 제안요청서 반영·AI 제안 항목을 구분하고 같은 결과를 다시 반영할 때
    # 짝을 맞추는 데 쓴다.
    # 채점·집계 규칙에는 쓰지 않는다.
    division: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    elements: list[str] | None = Field(default=None, max_length=10)
    origin: Literal["manual", "rfp", "ai"] | None = None
    source_ref: str | None = Field(default=None, max_length=200)
    source_label: str | None = Field(default=None, max_length=300)


class Vendor(BaseModel):
    id: str
    name: str


def default_vendor_name(vendor_id: str) -> str:
    """표시명이 저장되지 않은 시작용 업체 ID(vendor-a)의 이름. 종전 화면 표기(A사)와 같다."""
    return vendor_id.removeprefix("vendor-").upper() + "사"


def resolve_vendors(vendor_ids: list[str], vendors) -> list[dict]:
    """vendor_ids 순서대로 표시명을 붙인다. 저장된 이름이 없는 ID는 시작용 이름을 쓴다."""
    names: dict[str, str | None] = {}
    for vendor in vendors or []:
        if isinstance(vendor, dict):
            names[vendor.get("id", "")] = vendor.get("name")
        else:
            names[getattr(vendor, "id", "")] = getattr(vendor, "name", None)
    return [{"id": vid, "name": names.get(vid) or default_vendor_name(vid)} for vid in vendor_ids]


class ProjectBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=100)


class ProjectCreate(ProjectBase):
    # 기술평가 총배점(사업마다 다를 수 있다). 평가항목 배점 합계가 이 값과 같아야 채점을 시작한다.
    technical_total_score: int = Field(default=DEFAULT_TOTAL_SCORE, ge=1, le=1000)
    # template: 샘플 평가항목 복사(기본). empty: 빈 평가표로 시작(직접 입력 또는 제안요청서 반영).
    criteria_source: Literal["template", "empty"] = "template"


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    criteria: list[Criterion]
    vendor_ids: list[str]
    technical_total_score: int
    # 0004: 업체 표시명. vendor_ids 순서를 따르며 저장된 이름이 없으면 시작용 이름(A사·B사·C사)이다.
    vendors: list[Vendor]

    @model_validator(mode="before")
    @classmethod
    def _resolve_vendors(cls, data):
        """ORM 행이든 dict든 vendors를 vendor_ids 순서의 표시명 목록으로 채운다."""
        if isinstance(data, dict):
            vendors = resolve_vendors(data.get("vendor_ids") or [], data.get("vendors"))
            total = data.get("technical_total_score") or DEFAULT_TOTAL_SCORE
            return {**data, "vendors": vendors, "technical_total_score": total}
        values = {name: getattr(data, name, None) for name in cls.model_fields}
        values["vendors"] = resolve_vendors(values["vendor_ids"] or [], values["vendors"])
        values["technical_total_score"] = values["technical_total_score"] or DEFAULT_TOTAL_SCORE
        return values


@router.get("/projects", response_model=list[ProjectRead], operation_id="list_projects")
def list_projects(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Actor, Depends(require_admin)],
):
    return db.scalars(select(Project).order_by(Project.name, Project.id)).all()


@router.post(
    "/projects", response_model=ProjectRead, status_code=201, operation_id="create_project"
)
def create_project(
    body: ProjectCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Actor, Depends(require_admin)],
):
    project = Project(
        name=body.name,
        department=body.department,
        technical_total_score=body.technical_total_score,
    )
    if body.criteria_source == "empty":
        project.criteria = []
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
