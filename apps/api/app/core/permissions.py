"""사업 단위 권한 판정. 요청 본문의 사용자 ID를 믿지 않고 인증된 Actor와 서버 기록으로만 판정한다.

- admin: 데모 토큰 또는 (후속) 기관 인증을 통과한 관리자(간사).
- evaluator: 해당 사업 추첨 결과(committee_draws.selected_ids)에 있는 본위원. 본인확인 세션은
  토큰에 적힌 사업에만 유효하다.
- chair: 위원장. 지정 출처는 위원 기능(COM-03, Lex6won) 연계 대상이며 연결 전에는 항상 미지정이다.
"""

from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import Actor
from app.modules.committee.models import Draw
from app.modules.projects.models import Project
from app.modules.projects.service import get_project

FORBIDDEN_MESSAGES = {
    frozenset({"evaluator"}): "이 사업의 선정된 평가위원만 채점할 수 있습니다.",
    frozenset({"admin"}): "관리자만 실행할 수 있습니다.",
    frozenset({"chair"}): "이 사업의 위원장만 실행할 수 있습니다.",
}


def current_draw(db: Session, project_id: str) -> Draw | None:
    return db.scalar(select(Draw).where(Draw.project_id == project_id))


def chair_id(db: Session, project_id: str, draw: Draw | None = None) -> str | None:
    """위원장 ID. committee_draws에 위원장 정보가 생기기 전까지는 None(미지정)."""
    draw = draw if draw is not None else current_draw(db, project_id)
    return getattr(draw, "chair_id", None) if draw is not None else None


def project_roles(db: Session, project_id: str, actor: Actor) -> set[str]:
    roles: set[str] = set()
    if actor.role == "admin":
        roles.add("admin")
    if actor.role == "evaluator":
        if actor.project_id is not None and actor.project_id != project_id:
            return roles
        draw = current_draw(db, project_id)
        if draw is not None and actor.id in draw.selected_ids:
            roles.add("evaluator")
            if chair_id(db, project_id, draw) == actor.id:
                roles.add("chair")
    return roles


def require_project_role(
    db: Session,
    project_id: str,
    actor: Actor,
    allowed: Iterable[str],
    *,
    lock: bool = False,
) -> Project:
    """사업이 있고 actor가 allowed 중 하나의 역할을 가지면 Project를 돌려주고, 아니면 403/404."""
    project = get_project(db, project_id, lock=lock)
    allowed_set = frozenset(allowed)
    if not project_roles(db, project_id, actor) & allowed_set:
        raise HTTPException(
            403, FORBIDDEN_MESSAGES.get(allowed_set, "이 사업에 대한 권한이 없습니다.")
        )
    return project
