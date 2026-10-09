"""Explicit opt-in local identities. Replace this dependency with verified JWT/SSO."""

from typing import Annotated, Literal

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)


class Actor(BaseModel):
    role: Literal["admin", "evaluator"]
    id: str


def current_actor(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Actor:
    if not settings.simsaimdang_demo_auth:
        raise HTTPException(503, "인증 연결 전입니다. 로컬 개발에서만 DEMO_AUTH를 활성화하세요.")
    token = credentials.credentials if credentials else ""
    if token == "local-admin":
        return Actor(role="admin", id="local-admin")
    if token.startswith("local-evaluator:") and token.removeprefix("local-evaluator:"):
        return Actor(role="evaluator", id=token.removeprefix("local-evaluator:"))
    raise HTTPException(401, "유효한 로컬 개발 토큰이 필요합니다.")


def require_admin(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
    if actor.role != "admin":
        raise HTTPException(403, "관리자만 실행할 수 있습니다.")
    return actor
