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
