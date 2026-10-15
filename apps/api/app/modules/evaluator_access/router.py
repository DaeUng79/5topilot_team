from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor
from app.core.db import get_db
from app.core.permissions import current_draw, require_project_role
from app.core.session import issue_session_token
from app.modules.committee.models import Candidate
from app.modules.evaluator_access import service
from app.modules.projects.criteria import current_confirmation, effective_criteria
from app.modules.projects.models import Project
from app.modules.projects.router import ProjectRead
from app.modules.projects.service import get_project

router = APIRouter(tags=["evaluator-access"])
DB = Annotated[Session, Depends(get_db)]
User = Annotated[Actor, Depends(current_actor)]
# 세션 발급 방식. local_admin_password는 관리자 로컬 로그인(modules/auth)이 쓴다.
SessionMethod = Literal["birth_date", "local_master_code", "local_admin_password"]


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    candidate_id: str = Field(min_length=1, max_length=36)
    # 등록된 생년월일 6자리(YYMMDD).
    birth_date: str = Field(pattern=r"^\d{6}$")


class EvaluatorLoginRequest(BaseModel):
    """접근 링크 없이 로그인 화면에서 들어올 때. 등록된 이름과 생년월일 6자리(YYMMDD)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    birth_date: str = Field(pattern=r"^\d{6}$")


class SessionActor(BaseModel):
    role: Literal["admin", "evaluator"]
    id: str
    # 평가위원: 접근 링크 본인확인은 사업 하나, 로그인 화면 본인확인은 None(선정된 모든 사업).
    # 관리자는 None.
    project_id: str | None
    # 화면 표시용 이름. 관리자는 "사업관리자", 평가위원은 등록된 이름.
    name: str | None = None


class SessionRead(BaseModel):
    token: str
    expires_at: str
    method: SessionMethod
    actor: SessionActor


class ContextProject(BaseModel):
    id: str
    name: str
    department: str


class ContextCandidate(BaseModel):
    id: str
    name: str


class AccessContextRead(BaseModel):
    project: ContextProject
    candidate: ContextCandidate
    criteria_version: int


def candidate_name(db: Session, candidate_id: str) -> str:
    candidate = db.get(Candidate, candidate_id)
    return candidate.name if candidate else candidate_id


def display_name(db: Session, actor: Actor) -> str:
    return "사업관리자" if actor.role == "admin" else candidate_name(db, actor.id)


def brief_read(db: Session, project: Project) -> ProjectRead:
    """채점 화면용 ProjectRead. criteria는 확정 스냅샷(없으면 시작용 템플릿), 재검토 중 409."""
    criteria, _version = effective_criteria(db, project)
    return ProjectRead(
        id=project.id,
        name=project.name,
        department=project.department,
        criteria=criteria,
        vendor_ids=project.vendor_ids,
        vendors=project.vendors,
        technical_total_score=project.technical_total_score,
    )


@router.get(
    "/projects/{project_id}/evaluator-access/context",
    response_model=AccessContextRead,
    operation_id="get_access_context",
)
def get_context(
    project_id: str, candidate_id: Annotated[str, Query(min_length=1, max_length=36)], db: DB
):
    """본인확인 전 화면에 보여줄 사업명·위원명.

    사업 ID와 선정 위원 ID를 모두 아는 접근 링크로만 조회된다. 점수·기준·연락처·생년월일·
    생년월일 등록 여부는 포함하지 않는다. 실제 인증 연결 시 링크 발급·만료 정책과 함께
    재검토한다(SEC-01).
    """
    project = get_project(db, project_id)
    service.ensure_assigned(db, project_id, candidate_id)
    draw = current_draw(db, project_id)
    name = next(
        (c["name"] for c in draw.candidate_snapshot if c["id"] == candidate_id), candidate_id
    )
    confirmation = current_confirmation(db, project_id)
    return AccessContextRead(
        project=ContextProject(id=project.id, name=project.name, department=project.department),
        candidate=ContextCandidate(id=candidate_id, name=name),
        criteria_version=confirmation.version if confirmation else 0,
    )


@router.get(
    "/projects/{project_id}/evaluator-access/brief",
    response_model=ProjectRead,
    operation_id="get_evaluator_brief",
)
def get_brief(project_id: str, db: DB, actor: User):
    """채점 화면용 사업 정보. 선정 위원만."""
    project = require_project_role(db, project_id, actor, {"evaluator"})
    return brief_read(db, project)


@router.get(
    "/evaluator-access/projects",
    response_model=list[ProjectRead],
    operation_id="list_my_projects",
)
def list_my_projects(db: DB, actor: User):
    """세션의 평가위원이 본위원으로 선정된 사업 목록. 사업별 세션이면 그 사업만.

    관리자는 /projects를 쓴다.
    """
    if actor.role != "evaluator":
        raise HTTPException(403, "평가위원 세션만 조회할 수 있습니다.")
    ids = service.assigned_project_ids(db, actor.id)
    if actor.project_id is not None:
        ids = [project_id for project_id in ids if project_id == actor.project_id]
    if not ids:
        return []
    projects = db.scalars(
        select(Project).where(Project.id.in_(ids)).order_by(Project.name, Project.id)
    ).all()
    briefs = []
    for project in projects:
        try:
            briefs.append(brief_read(db, project))
        except HTTPException:
            # 기준 재검토 중인 사업은 현재 기준으로 목록에만 보이고 채점은 409로 막힌다.
            briefs.append(
                ProjectRead(
                    id=project.id,
                    name=project.name,
                    department=project.department,
                    criteria=project.criteria,
                    vendor_ids=project.vendor_ids,
                    vendors=project.vendors,
                    technical_total_score=project.technical_total_score,
                )
            )
    return briefs


@router.post(
    "/projects/{project_id}/evaluator-access/verify",
    response_model=SessionRead,
    operation_id="verify_evaluator",
)
def verify(project_id: str, body: VerifyRequest, db: DB):
    """선정 위원의 생년월일 6자리(YYMMDD)가 등록값과 일치하면 사업 범위 세션을 발급한다.

    미선정 403, 불일치 401, 10분 안 5회 실패 429. 응답·로그에 생년월일을 넣지 않는다.
    """
    get_project(db, project_id)
    method = service.verify_birth_date(db, project_id, body.candidate_id, body.birth_date)
    token, expires_at = issue_session_token(actor_id=body.candidate_id, project_id=project_id)
    return SessionRead(
        token=token,
        expires_at=expires_at,
        method=method,
        actor=SessionActor(
            role="evaluator",
            id=body.candidate_id,
            project_id=project_id,
            name=candidate_name(db, body.candidate_id),
        ),
    )


@router.post(
    "/evaluator-access/login",
    response_model=SessionRead,
    operation_id="login_evaluator",
)
def login_evaluator(body: EvaluatorLoginRequest, db: DB):
    """로그인 화면용 본인확인. 등록된 이름·생년월일이 맞고 선정된 사업이 하나라도 있으면
    모든 선정 사업에 유효한 세션을 발급한다. 불일치 401, 미선정 403, 동명이인 409, 5회 실패 429.
    """
    candidate, method = service.verify_login(db, body.name, body.birth_date)
    token, expires_at = issue_session_token(actor_id=candidate.id, project_id=None)
    return SessionRead(
        token=token,
        expires_at=expires_at,
        method=method,
        actor=SessionActor(role="evaluator", id=candidate.id, project_id=None, name=candidate.name),
    )


@router.get("/evaluator-access/me", response_model=SessionActor, operation_id="get_my_session")
def get_my_session(db: DB, actor: User):
    """현재 세션의 주체. 화면은 새로고침 때 이 응답으로 로그인 상태와 권한(role)을 다시 확인한다."""
    return SessionActor(
        role=actor.role, id=actor.id, project_id=actor.project_id, name=display_name(db, actor)
    )
