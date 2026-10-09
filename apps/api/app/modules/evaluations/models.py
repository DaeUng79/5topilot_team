from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ScoreSheet(Base):
    __tablename__ = "evaluation_sheets"
    __table_args__ = (UniqueConstraint("project_id", "evaluator_id", name="uq_sheet_member"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    evaluator_id: Mapped[str] = mapped_column(ForeignKey("committee_candidates.id"))
    scores: Mapped[list] = mapped_column(JSON)
    opinion: Mapped[str] = mapped_column(String(4000), default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    submitted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
