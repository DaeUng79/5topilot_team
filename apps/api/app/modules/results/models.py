from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ResultConfirmation(Base):
    """사업 단위 결과 확정 기록. 사업당 1건. 개인 평가표 제출(evaluation_sheets)과 구별한다.

    status: confirmed(위원장 확인) → closed(사업 완료·보관). 수집 중에는 행이 없다.
    result_snapshot은 확정 시점의 집계 결과 전체이고 result_sha256은 그 해시다.
    """

    __tablename__ = "result_confirmations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    policy_version: Mapped[str] = mapped_column(String(40))
    criteria_version: Mapped[int] = mapped_column(Integer)
    result_sha256: Mapped[str] = mapped_column(String(64))
    result_snapshot: Mapped[dict] = mapped_column(JSON)
    expected: Mapped[int] = mapped_column(Integer)
    submitted: Mapped[int] = mapped_column(Integer)
    confirmed_by: Mapped[str] = mapped_column(String(100))
    confirmed_at: Mapped[str] = mapped_column(String(40))
    closed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    closed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
