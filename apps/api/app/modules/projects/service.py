from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.projects.models import Project


def get_project(db: Session, project_id: str, *, lock: bool = False) -> Project:
    statement = select(Project).where(Project.id == project_id)
    project = db.scalar(statement.with_for_update() if lock else statement)
    if project is None:
        raise HTTPException(404, "사업을 찾을 수 없습니다.")
    return project
