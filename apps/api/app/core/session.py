"""서버가 서명한 세션 토큰.

평가위원 본인확인(modules/evaluator_access) 또는 관리자 로컬 로그인(modules/auth)을 통과한 뒤에만
발급된다. 평가위원 세션은 사업 하나(project_id) 또는 선정된 모든 사업(None)에 유효하고, 관리자
세션은 role=admin·project_id=None이다.
형식은 `s1.<payload>.<hmac>`이고 서명 키는 settings.session_secret이다. 외부 IdP(JWT/SSO)가
연결되면 verify_session_token 앞단에 그 검증을 두거나 이 모듈을 교체한다. 토큰에는 인증번호나
개인정보를 넣지 않는다.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from app.core.config import settings

PREFIX = "s1"


class SessionClaims(BaseModel):
    role: Literal["admin", "evaluator"]
    id: str
    project_id: str | None
    iat: int
    exp: int
    jti: str


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _signature(body: str) -> str:
    key = settings.session_secret.encode()
    return _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())


def issue_session_token(
    *,
    actor_id: str,
    project_id: str | None,
    role: Literal["admin", "evaluator"] = "evaluator",
) -> tuple[str, str]:
    """(토큰, 만료 시각 ISO 8601)을 돌려준다. 서명 키가 없으면 503."""
    if not settings.session_secret:
        raise HTTPException(503, "SESSION_SECRET이 설정되지 않아 세션을 발급할 수 없습니다.")
    now = int(time.time())
    claims = SessionClaims(
        role=role,
        id=actor_id,
        project_id=project_id,
        iat=now,
        exp=now + settings.session_ttl_minutes * 60,
        jti=secrets.token_hex(8),
    )
    body = _b64(json.dumps(claims.model_dump(), separators=(",", ":"), sort_keys=True).encode())
    return f"{PREFIX}.{body}.{_signature(body)}", datetime.fromtimestamp(
        claims.exp, UTC
    ).isoformat()


def verify_session_token(token: str) -> SessionClaims | None:
    """세션 토큰이 아니면 None, 세션 토큰인데 위조·만료면 401."""
    if not token.startswith(PREFIX + "."):
        return None
    if not settings.session_secret:
        raise HTTPException(503, "SESSION_SECRET이 설정되지 않아 세션을 확인할 수 없습니다.")
    try:
        _, body, signature = token.split(".")
    except ValueError:
        raise HTTPException(401, "세션 토큰 형식이 올바르지 않습니다.") from None
    if not hmac.compare_digest(signature, _signature(body)):
        raise HTTPException(401, "세션 토큰 서명이 올바르지 않습니다.")
    try:
        claims = SessionClaims.model_validate_json(_unb64(body))
    except (ValidationError, ValueError):
        raise HTTPException(401, "세션 토큰 내용이 올바르지 않습니다.") from None
    if claims.exp <= time.time():
        raise HTTPException(401, "세션이 만료되었습니다. 다시 본인확인하세요.")
    return claims
