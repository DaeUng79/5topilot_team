"""평가위원 본인확인(생년월일 대조).

두 가지 입구가 있다. (1) 접근 링크: 사업·위원 ID가 정해진 상태에서 생년월일 6자리(YYMMDD)를
대조한다. (2) 로그인 화면: 등록된 이름과 생년월일로 위원을 찾고, 선정된 사업이 하나라도 있으면
모든 선정 사업에 유효한 세션을 발급한다. 문자(SMS) 발송은 쓰지 않는다.
LOCAL_MASTER_CODE는 관리자용 마스터 번호로, APP_ENV=local일 때만 선정 위원에게 통하며
화면·응답·문서 안내에 노출하지 않는다. 생년월일이 등록되지 않은 위원은 마스터 번호 외에는 들어올 수
없고, local이 아닌 환경에서는 담당자가 생년월일을 등록하기 전까지 본인확인이 닫힌다.
입력값·저장값·마스터 번호는 응답·예외 메시지·로그에 넣지 않는다. 시도 횟수 제한은 프로세스 메모리
기준이며 다중 인스턴스에서는 저장소 기반으로 바꿔야 한다.
"""

import hmac
import time
from collections.abc import Callable
from datetime import date
from typing import Literal, TypeVar

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import current_draw
from app.modules.committee.models import Candidate, Draw

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 600
# 관리자용 로컬 마스터 번호. 설정으로 바꿀 수 없고 APP_ENV=local에서만 받는다.
# 화면·응답·문서에 표시하지 않는다.
LOCAL_MASTER_CODE = "111111"
MISMATCH = "생년월일이 일치하지 않습니다."
UNREGISTERED = "등록된 생년월일이 없어 본인확인을 할 수 없습니다. 담당자에게 문의하세요."
LOGIN_MISMATCH = "이름 또는 생년월일이 일치하지 않습니다."
NOT_ASSIGNED = "선정된 평가 사업이 없어 입장할 수 없습니다. 담당자에게 문의하세요."
AMBIGUOUS = "같은 이름의 위원이 여러 명 선정되어 있습니다. 담당자가 보낸 접근 링크로 입장하세요."

VerifyMethod = Literal["birth_date", "local_master_code"]
T = TypeVar("T")

_attempts: dict[tuple[str, str], list[float]] = {}


def local_master_code_enabled() -> bool:
    return settings.app_env == "local"


def normalize_birth_date(value: str) -> str:
    """등록 입력(YYYYMMDD 또는 YYYY-MM-DD)이 실제 날짜인지 확인하고 YYYYMMDD로 돌려준다."""
    digits = value.strip().replace("-", "").replace(".", "")
    if len(digits) != 8 or not digits.isdigit():
        raise ValueError("생년월일은 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")
    try:
        parsed = date(int(digits[:4]), int(digits[4:6]), int(digits[6:]))
    except ValueError:
        raise ValueError("생년월일이 실제 날짜가 아닙니다.") from None
    if not date(1900, 1, 1) <= parsed <= date.today():
        raise ValueError("생년월일은 1900년 이후 오늘까지만 등록할 수 있습니다.")
    return digits


def ensure_assigned(db: Session, project_id: str, candidate_id: str) -> None:
    draw = current_draw(db, project_id)
    if draw is None or candidate_id not in draw.selected_ids:
        raise HTTPException(403, "이 사업의 선정된 평가위원이 아닙니다.")


def assigned_project_ids(db: Session, candidate_id: str) -> list[str]:
    """추첨 결과에 본위원으로 들어 있는 사업 ID 목록. JSON 열이라 Python에서 거른다."""
    return [
        draw.project_id for draw in db.scalars(select(Draw)) if candidate_id in draw.selected_ids
    ]


def _registered_birth_date(db: Session, candidate_id: str) -> str | None:
    candidate = db.get(Candidate, candidate_id)
    if candidate is None or not candidate.birth_date:
        return None
    return candidate.birth_date


def _is_master_code(birth_date: str) -> bool:
    return local_master_code_enabled() and hmac.compare_digest(
        birth_date.encode(), LOCAL_MASTER_CODE.encode()
    )


def _matches(birth_date: str, registered: str | None) -> bool:
    """저장값(YYYYMMDD)의 뒤 6자리만 상수 시간 비교한다."""
    return bool(registered) and hmac.compare_digest(birth_date.encode(), registered[2:].encode())


def _recent_attempts(key: tuple[str, str], now: float) -> list[float]:
    return [t for t in _attempts.get(key, []) if now - t < WINDOW_SECONDS]


def guarded(key: tuple[str, str], check: Callable[[], T]) -> T:
    """check()를 실행한다. 실패(HTTPException)는 같은 key 기준 10분 안 5회까지, 이후 429."""
    now = time.time()
    recent = _recent_attempts(key, now)
    if len(recent) >= MAX_ATTEMPTS:
        raise HTTPException(429, "시도 횟수를 초과했습니다. 10분 후 다시 시도하세요.")
    try:
        result = check()
    except HTTPException:
        _attempts[key] = recent + [now]
        raise
    _attempts.pop(key, None)
    return result


def _check(db: Session, project_id: str, candidate_id: str, birth_date: str) -> VerifyMethod:
    ensure_assigned(db, project_id, candidate_id)
    # 선정 위원 확인 뒤에만 마스터 번호를 본다. 미선정·미등록자는 마스터 번호로도 들어올 수 없다.
    if _is_master_code(birth_date):
        return "local_master_code"
    registered = _registered_birth_date(db, candidate_id)
    if registered is None:
        raise HTTPException(401, UNREGISTERED)
    if not _matches(birth_date, registered):
        raise HTTPException(401, MISMATCH)
    return "birth_date"


def verify_birth_date(
    db: Session, project_id: str, candidate_id: str, birth_date: str
) -> VerifyMethod:
    """일치하면 사용한 방식을 돌려준다. 실패(403·401)는 같은 (사업, 위원) 기준 10분 안 5회면 429."""
    return guarded(
        (project_id, candidate_id), lambda: _check(db, project_id, candidate_id, birth_date)
    )


def _check_login(db: Session, name: str, birth_date: str) -> tuple[Candidate, VerifyMethod]:
    candidates = db.scalars(
        select(Candidate)
        .where(Candidate.name == name, Candidate.active.is_(True))
        .order_by(Candidate.id)
    ).all()
    assigned = [c for c in candidates if assigned_project_ids(db, c.id)]
    if _is_master_code(birth_date):
        if not candidates:
            raise HTTPException(401, LOGIN_MISMATCH)
        if not assigned:
            raise HTTPException(403, NOT_ASSIGNED)
        if len(assigned) > 1:
            raise HTTPException(409, AMBIGUOUS)
        return assigned[0], "local_master_code"
    matched = [c for c in candidates if _matches(birth_date, c.birth_date)]
    if not matched:
        raise HTTPException(401, LOGIN_MISMATCH)
    matched_assigned = [c for c in matched if c in assigned]
    if not matched_assigned:
        raise HTTPException(403, NOT_ASSIGNED)
    if len(matched_assigned) > 1:
        raise HTTPException(409, AMBIGUOUS)
    return matched_assigned[0], "birth_date"


def verify_login(db: Session, name: str, birth_date: str) -> tuple[Candidate, VerifyMethod]:
    """로그인 화면용. 이름·생년월일이 맞고 선정된 사업이 있는 위원을 돌려준다.

    불일치 401, 미선정 403, 동명이인이 모두 선정 409. 실패는 같은 이름 기준 10분 안 5회면 429.
    """
    return guarded(("login", name), lambda: _check_login(db, name, birth_date))


def reset_attempts() -> None:
    _attempts.clear()
