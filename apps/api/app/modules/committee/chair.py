"""평가위원장 지정(COM-03의 위원장 부분).

추첨 결과(committee_draws)의 본위원(selected_ids) 중 1명을 사업관리자가 사업별 위원장으로 지정한다.
위원장 권한 판정은 core/permissions.chair_id()가 committee_draws.chair_id(0006)를 읽어 사업마다 따로
하므로 같은 사람이 다른 사업에서는 일반 위원이거나 위원장일 수 있다. 결과가 확정·완료된 뒤에는
바꿀 수 없고, 그 전의 변경은 사유와 함께 chair_history에 남긴다. 위원장 변경은 평가표·점수·제출·서명
기록을 건드리지 않는다. 추첨 로직과 committee/router.py(Lex6won)는 수정하지 않고 이 라우터를
main.py에 따로 등록한다(projects/criteria.py와 같은 방식).
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.core.permissions import current_draw
from app.modules.committee.models import Draw
from app.modules.projects.service import get_project
from app.modules.results.state import get_confirmation

router = APIRouter(tags=["committee"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[Actor, Depends(require_admin)]

NOT_DRAWN = "평가위원 추첨을 먼저 확정하세요."
NOT_SELECTED = (
    "본위원만 위원장으로 지정할 수 있습니다. 예비위원·추첨되지 않은 후보는 지정할 수 없습니다."
)
ALREADY_CHAIR = "이미 위원장으로 지정된 위원입니다."
REASON_REQUIRED = "위원장을 변경하려면 변경 사유를 입력하세요."
LOCKED_CONFIRMED = "결과가 확정되어 위원장을 변경할 수 없습니다."
LOCKED_CLOSED = "사업이 완료·보관되어 위원장을 변경할 수 없습니다."


class ChairAssign(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    chair_id: str = Field(min_length=1, max_length=36)
    # 변경 사유. 위원장이 이미 있는 사업에서 바꿀 때 필수이며 이력에 남는다.
    reason: str = Field(default="", max_length=500)


class ChairChange(BaseModel):
    chair_id: str
    previous_chair_id: str | None
    reason: str
    actor_id: str
    changed_at: str


class ChairRead(BaseModel):
    project_id: str
    # 추첨 전·미지정이면 None. 이름은 추첨 스냅샷 기준.
    chair_id: str | None
    chair_name: str | None
    history: list[ChairChange]
    # 결과 확정·완료 뒤에는 변경 불가.
    locked: bool
    lock_reason: str | None


def lock_reason(db: Session, project_id: str) -> str | None:
    confirmation = get_confirmation(db, project_id)
    if confirmation is None:
        return None
    return LOCKED_CLOSED if confirmation.status == "closed" else LOCKED_CONFIRMED


def chair_read(db: Session, project_id: str, draw: Draw | None) -> ChairRead:
    chair = draw.chair_id if draw is not None else None
    names = {c["id"]: c["name"] for c in draw.candidate_snapshot} if draw is not None else {}
    lock = lock_reason(db, project_id)
    return ChairRead(
        project_id=project_id,
        chair_id=chair,
        chair_name=names.get(chair, chair) if chair else None,
        history=[ChairChange(**entry) for entry in (draw.chair_history or [])] if draw else [],
        locked=lock is not None,
        lock_reason=lock,
    )


@router.get(
    "/projects/{project_id}/committee/chair", response_model=ChairRead, operation_id="get_chair"
)
def get_chair(project_id: str, db: DB, _: Admin):
    get_project(db, project_id)
    return chair_read(db, project_id, current_draw(db, project_id))


@router.put(
    "/projects/{project_id}/committee/chair", response_model=ChairRead, operation_id="assign_chair"
)
def assign_chair(project_id: str, body: ChairAssign, db: DB, actor: Admin):
    """본위원 중 1명을 위원장으로 지정·변경한다.

    추첨 전 409, 본위원 아님 422, 같은 위원 409, 변경 사유 없음 422, 결과 확정·완료 뒤 409.
    """
    get_project(db, project_id, lock=True)
    draw = current_draw(db, project_id)
    if draw is None:
        raise HTTPException(409, NOT_DRAWN)
    if (lock := lock_reason(db, project_id)) is not None:
        raise HTTPException(409, lock)
    if body.chair_id not in draw.selected_ids:
        raise HTTPException(422, NOT_SELECTED)
    previous = draw.chair_id
    if body.chair_id == previous:
        raise HTTPException(409, ALREADY_CHAIR)
    if previous is not None and not body.reason:
        raise HTTPException(422, REASON_REQUIRED)
    entry = {
        "chair_id": body.chair_id,
        "previous_chair_id": previous,
        "reason": body.reason,
        "actor_id": actor.id,
        "changed_at": datetime.now(UTC).isoformat(),
    }
    draw.chair_id = body.chair_id
    # JSON 열은 새 목록을 대입해야 변경이 감지된다.
    draw.chair_history = [*(draw.chair_history or []), entry]
    db.commit()
    db.refresh(draw)
    return chair_read(db, project_id, draw)
