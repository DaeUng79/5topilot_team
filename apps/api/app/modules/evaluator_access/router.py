from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import Actor, current_actor
from app.core.db import get_db
from app.core.session import issue_session_token
from app.modules.evaluator_access import service
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
