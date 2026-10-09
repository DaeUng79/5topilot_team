from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.modules.projects.models import Project

router = APIRouter(tags=["projects"])


class Criterion(BaseModel):
    id: str
    name: str
    max_score: int


class ProjectCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=100)


class ProjectRead(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    criteria: list[Criterion]
    vendor_ids: list[str]


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
    project = Project(**body.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
