"""평가위원 본인확인.

현재는 로컬 개발용 데모 코드(settings.demo_verify_code)만 지원한다. 문자·메일 발송은 CodeSender
인터페이스로 자리만 두었고, 실제 채널은 연락처 저장(Lex6won, committee)과 발송 서비스가
정해진 뒤 연결한다.
코드는 응답·로그에 노출하지 않는다. 시도 횟수 제한은 프로세스 메모리 기준이며 다중 인스턴스에서는
저장소 기반으로 바꿔야 한다.
"""

import hmac
import time
from typing import Protocol

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import current_draw

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 600
CODE_TTL_SECONDS = 300


class CodeSender(Protocol):
    """실제 발송 채널이 구현할 인터페이스. 반환값은 채널 이름."""

    def send(self, *, project_id: str, candidate_id: str) -> str: ...


class NotConnectedSender:
    def send(self, *, project_id: str, candidate_id: str) -> str:
        raise HTTPException(
            503,
            "인증번호 발송 채널이 연결되지 않았습니다. "
            "로컬 개발에서는 DEMO_VERIFY_CODE를 사용하세요.",
        )


class DemoSender:
    """발송하지 않는다. 사용자는 .env의 DEMO_VERIFY_CODE를 직접 입력한다."""

    def send(self, *, project_id: str, candidate_id: str) -> str:
        return "demo"


_attempts: dict[tuple[str, str], list[float]] = {}


def sender() -> CodeSender:
    return DemoSender() if settings.demo_verify_code else NotConnectedSender()


def ensure_assigned(db: Session, project_id: str, candidate_id: str) -> None:
    draw = current_draw(db, project_id)
    if draw is None or candidate_id not in draw.selected_ids:
        raise HTTPException(403, "이 사업의 선정된 평가위원이 아닙니다.")


def _recent_attempts(key: tuple[str, str], now: float) -> list[float]:
    return [t for t in _attempts.get(key, []) if now - t < WINDOW_SECONDS]


def verify_demo_code(db: Session, project_id: str, candidate_id: str, code: str) -> None:
    if not settings.demo_verify_code:
        raise HTTPException(
            503, "데모 본인확인이 꺼져 있습니다. 로컬 개발에서만 DEMO_VERIFY_CODE를 설정하세요."
        )
    key = (project_id, candidate_id)
    now = time.time()
    recent = _recent_attempts(key, now)
    if len(recent) >= MAX_ATTEMPTS:
        raise HTTPException(429, "시도 횟수를 초과했습니다. 10분 후 다시 시도하세요.")
    try:
        ensure_assigned(db, project_id, candidate_id)
        if not hmac.compare_digest(code.encode(), settings.demo_verify_code.encode()):
            raise HTTPException(401, "인증번호가 올바르지 않거나 만료되었습니다.")
    except HTTPException:
        _attempts[key] = recent + [now]
        raise
    _attempts.pop(key, None)


def reset_attempts() -> None:
    _attempts.clear()
