import hashlib
import json
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.committee.models import Candidate, Draw
from app.modules.projects.service import get_project


def conduct_draw(
    db: Session, project_id: str, ids: list[str], seats: int, reserves: int, actor: str
):
    get_project(db, project_id, lock=True)
    if db.scalar(select(Draw).where(Draw.project_id == project_id)):
        raise HTTPException(
            409, "이미 추첨한 사업입니다. 초기 버전에서는 재추첨을 허용하지 않습니다."
        )
    if len(set(ids)) != len(ids) or len(ids) < seats + reserves:
        raise HTTPException(422, "중복 없는 후보가 본위원+예비위원 수 이상이어야 합니다.")
    candidates = db.scalars(
        select(Candidate)
        .where(Candidate.id.in_(ids), Candidate.active.is_(True))
        .order_by(Candidate.id)
    ).all()
    if len(candidates) != len(ids):
        raise HTTPException(422, "존재하지 않거나 비활성화된 후보입니다.")
    snapshot = [
        {"id": c.id, "name": c.name, "organization": c.organization, "specialty": c.specialty}
        for c in candidates
    ]
    digest = hashlib.sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    sampled = secrets.SystemRandom().sample([c.id for c in candidates], seats + reserves)
    draw = Draw(
        project_id=project_id,
        candidate_snapshot=snapshot,
        selected_ids=sampled[:seats],
        reserve_ids=sampled[seats:],
        snapshot_sha256=digest,
        method="system-random-sample-v1",
        actor_id=actor,
        created_at=datetime.now(UTC).isoformat(),
    )
    db.add(draw)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "동시 추첨 요청이 먼저 확정되었습니다.") from None
    db.refresh(draw)
    return draw
