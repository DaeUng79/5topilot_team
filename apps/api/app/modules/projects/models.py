from uuid import uuid4

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

DEFAULT_CRITERIA = [
    {"id": "understanding", "name": "사업 이해도", "max_score": 10},
    {"id": "methodology", "name": "수행 방법론", "max_score": 15},
    {"id": "technology", "name": "기술 적용 방안", "max_score": 15},
    {"id": "security", "name": "보안 대책", "max_score": 10},
    {"id": "schedule", "name": "일정 관리", "max_score": 10},
    {"id": "staffing", "name": "투입 인력", "max_score": 10},
    {"id": "support", "name": "유지보수·교육", "max_score": 10},
]


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    department: Mapped[str] = mapped_column(String(100))
    criteria: Mapped[list] = mapped_column(JSON, default=lambda: DEFAULT_CRITERIA)
    vendor_ids: Mapped[list] = mapped_column(
        JSON, default=lambda: ["vendor-a", "vendor-b", "vendor-c"]
    )
