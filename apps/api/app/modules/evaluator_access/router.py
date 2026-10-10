from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor
from app.core.db import get_db
from app.core.permissions import current_draw, require_project_role
from app.core.session import issue_session_token
from app.modules.evaluator_access import service
from app.modules.projects.criteria import current_confirmation, effective_criteria
from app.modules.projects.router import ProjectRead
from app.modules.projects.service import get_project

router = APIRouter(tags=["evaluator-access"])
DB = Annotated[Session, Depends(get_db)]


class CodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    candidate_id: str = Field(min_length=1, max_length=36)


class CodeRequestRead(BaseModel):
    channel: Literal["demo", "sms", "email"]
    expires_in: int
    notice: str


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    candidate_id: str = Field(min_length=1, max_length=36)
    code: str = Field(pattern=r"^\d{6}$")


class SessionActor(BaseModel):
    role: Literal["admin", "evaluator"]
    id: str
    project_id: str | None


class SessionRead(BaseModel):
    token: str
    expires_at: str
    channel: Literal["demo"]
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


@router.get(
    "/projects/{project_id}/evaluator-access/context",
    response_model=AccessContextRead,
    operation_id="get_access_context",
)
def get_context(
    project_id: str, candidate_id: Annotated[str, Query(min_length=1, max_length=36)], db: DB
):
    """본인확인 전 화면에 보여줄 사업명·위원명.

    사업 ID와 선정 위원 ID를 모두 아는 접근 링크로만 조회된다. 점수·기준·연락처는 포함하지
    않는다. 실제 인증 연결 시 링크 발급·만료 정책과 함께 재검토한다(SEC-01).
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
def get_brief(project_id: str, db: DB, actor: Annotated[Actor, Depends(current_actor)]):
    """채점 화면용 사업 정보. 선정 위원만.

    criteria는 확정 스냅샷이며 없으면 시작용 템플릿, 재검토 중이면 409.
    """
    project = require_project_role(db, project_id, actor, {"evaluator"})
    criteria, _version = effective_criteria(db, project)
    return ProjectRead(
        id=project.id,
        name=project.name,
        department=project.department,
        criteria=criteria,
        vendor_ids=project.vendor_ids,
    )


@router.post(
    "/projects/{project_id}/evaluator-access/request-code",
    response_model=CodeRequestRead,
    status_code=202,
    operation_id="request_verification_code",
)
def request_code(project_id: str, body: CodeRequest, db: DB):
    get_project(db, project_id)
    service.ensure_assigned(db, project_id, body.candidate_id)
    channel = service.sender().send(project_id=project_id, candidate_id=body.candidate_id)
    return CodeRequestRead(
        channel=channel,
        expires_in=service.CODE_TTL_SECONDS,
        notice="개발용 본인확인입니다. 실제 인증이 아니며 코드는 응답에 포함되지 않습니다.",
    )


@router.post(
    "/projects/{project_id}/evaluator-access/verify",
    response_model=SessionRead,
    operation_id="verify_evaluator",
)
def verify(project_id: str, body: VerifyRequest, db: DB):
    get_project(db, project_id)
    service.verify_demo_code(db, project_id, body.candidate_id, body.code)
    token, expires_at = issue_session_token(actor_id=body.candidate_id, project_id=project_id)
    return SessionRead(
        token=token,
        expires_at=expires_at,
        channel="demo",
        actor=SessionActor(role="evaluator", id=body.candidate_id, project_id=project_id),
    )


@router.get("/evaluator-access/me", response_model=SessionActor, operation_id="get_my_session")
def get_my_session(actor: Annotated[Actor, Depends(current_actor)]):
    return SessionActor(role=actor.role, id=actor.id, project_id=actor.project_id)
