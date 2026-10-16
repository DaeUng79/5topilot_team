"""결과 확정 상태 조회와 변경 차단. 순환 import를 피하기 위해 모델만 의존한다.

- confirmed: 위원장이 결과를 봉인함. 이후 평가기준·평가표 변경은 거절한다.
- closed: 간사가 사업 완료·보관 처리함(CLOSE-01). 조회만 가능하다.
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.results.models import ResultConfirmation


def get_confirmation(db: Session, project_id: str) -> ResultConfirmation | None:
    return db.scalar(select(ResultConfirmation).where(ResultConfirmation.project_id == project_id))


def ensure_not_sealed(db: Session, project_id: str) -> None:
    """결과가 확정·완료된 사업의 평가기준·평가표 변경을 막는다."""
    confirmation = get_confirmation(db, project_id)
    if confirmation is None:
        return
    if confirmation.status == "closed":
        raise HTTPException(409, "사업이 완료·보관되어 변경할 수 없습니다.")
    raise HTTPException(409, "결과가 확정되어 평가기준과 평가표를 변경할 수 없습니다.")
