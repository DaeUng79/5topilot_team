from uuid import uuid4

from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Candidate(Base):
    __tablename__ = "committee_candidates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    organization: Mapped[str] = mapped_column(String(200))
    specialty: Mapped[str] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 본인확인용 생년월일(YYYYMMDD, 0003 추가). 응답·스냅샷에 넣지 않는다(evaluator_access, u-jing).
    birth_date: Mapped[str | None] = mapped_column(String(8), nullable=True)


class Draw(Base):
    __tablename__ = "committee_draws"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), unique=True)
    candidate_snapshot: Mapped[list] = mapped_column(JSON)
    selected_ids: Mapped[list] = mapped_column(JSON)
    reserve_ids: Mapped[list] = mapped_column(JSON)
    snapshot_sha256: Mapped[str] = mapped_column(String(64))
    method: Mapped[str] = mapped_column(String(80))
    actor_id: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[str] = mapped_column(String(40))
    # 0006(u-jing): 평가위원장. selected_ids 중 1명 또는 NULL(미지정). 지정·변경 이력은
    # chair_history(JSON 목록, committee/chair.py). 추첨 결과(스냅샷·본위원·예비위원)는 바꾸지
    # 않는다.
    chair_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    chair_history: Mapped[list | None] = mapped_column(JSON, nullable=True)
