"""관리자 로그인 (로컬 시연용).

아이디·비밀번호는 settings.local_admin_id/local_admin_password이며 SIMSAIMDANG_DEMO_AUTH=true일
때만 받는다. 그 플래그는 preview/production에서 켤 수 없으므로 배포 환경에서는 자동으로 닫힌다.
실제 기관 인증(JWT/SSO)은 제공자 결정 뒤 같은 자리(세션 발급)에 연결한다. 발급 토큰은
core/session의 서명 세션(role=admin, project_id=None)이고, 권한 판정은 기존 require_admin·
require_project_role이 그대로 한다. 로그아웃은 클라이언트가 토큰을 버리는 것이며 서버 폐기
목록은 없다.
"""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.session import issue_session_token
from app.modules.evaluator_access import service
from app.modules.evaluator_access.router import SessionActor, SessionRead

router = APIRouter(tags=["auth"])
DB = Annotated[Session, Depends(get_db)]
ADMIN_DISPLAY_NAME = "사업관리자"
BAD_CREDENTIALS = "아이디 또는 비밀번호가 올바르지 않습니다."


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


def _check_credentials(username: str, password: str) -> None:
    user_ok = hmac.compare_digest(username.encode(), settings.local_admin_id.encode())
    password_ok = hmac.compare_digest(password.encode(), settings.local_admin_password.encode())
    if not (user_ok and password_ok):
        raise HTTPException(401, BAD_CREDENTIALS)


@router.post("/auth/login", response_model=SessionRead, operation_id="login_admin")
def login_admin(body: AdminLoginRequest, _: DB):
    """로컬 시연용 관리자 로그인. 데모 인증이 꺼진 환경(배포) 503, 불일치 401, 5회 실패 429."""
    if not settings.simsaimdang_demo_auth:
        raise HTTPException(503, "인증 연결 전입니다. 로컬 개발에서만 DEMO_AUTH를 활성화하세요.")
    service.guarded(
        ("admin-login", body.username), lambda: _check_credentials(body.username, body.password)
    )
    token, expires_at = issue_session_token(
        actor_id=settings.local_admin_id, project_id=None, role="admin"
    )
    return SessionRead(
        token=token,
        expires_at=expires_at,
        method="local_admin_password",
        actor=SessionActor(
            role="admin", id=settings.local_admin_id, project_id=None, name=ADMIN_DISPLAY_NAME
        ),
    )
