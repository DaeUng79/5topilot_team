"""인증 주체 판정.

1) 본인확인 뒤 서버가 발급한 평가위원 세션 토큰(core/session.py).
2) 로컬 개발 전용 opt-in 토큰(`local-admin`, `local-evaluator:<id>`).
   SIMSAIMDANG_DEMO_AUTH=true일 때만 받는다.
관리자·위원장의 실제 인증(JWT/SSO)은 제공자 결정 후 1)과 같은 자리에 추가한다.
"""

from typing import Annotated, Literal

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings
from app.core.session import verify_session_token

bearer = HTTPBearer(auto_error=False)


class Actor(BaseModel):
    role: Literal["admin", "evaluator"]
    id: str
    # 본인확인 세션은 사업 하나에만 유효하다. 데모 토큰은 None(모든 사업, 추첨 결과로 다시 판정).
    project_id: str | None = None


def current_actor(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Actor:
    token = credentials.credentials if credentials else ""
    if claims := verify_session_token(token):
        return Actor(role=claims.role, id=claims.id, project_id=claims.project_id)
    if not settings.simsaimdang_demo_auth:
        raise HTTPException(503, "인증 연결 전입니다. 로컬 개발에서만 DEMO_AUTH를 활성화하세요.")
    if token == "local-admin":
        return Actor(role="admin", id="local-admin")
    if token.startswith("local-evaluator:") and token.removeprefix("local-evaluator:"):
        return Actor(role="evaluator", id=token.removeprefix("local-evaluator:"))
    raise HTTPException(401, "유효한 로컬 개발 토큰이 필요합니다.")


def require_admin(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
    if actor.role != "admin":
        raise HTTPException(403, "관리자만 실행할 수 있습니다.")
    return actor
