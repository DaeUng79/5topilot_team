from uuid import uuid4

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# 사업별 기술평가 총배점의 기본값. 사업마다 technical_total_score로 바꿀 수 있다(0005).
DEFAULT_TOTAL_SCORE = 100
# 새 사업의 시작용 평가항목(샘플 복사). 합계는 DEFAULT_TOTAL_SCORE와 같다.
# 이미 등록된 사업(demo-project 포함)의 기준은 바꾸지 않는다.
DEFAULT_CRITERIA = [
    {"id": "understanding", "name": "사업 이해도", "max_score": 15},
    {"id": "methodology", "name": "수행 방법론", "max_score": 20},
    {"id": "technology", "name": "기술 적용 방안", "max_score": 20},
    {"id": "security", "name": "보안 대책", "max_score": 10},
    {"id": "schedule", "name": "일정 관리", "max_score": 10},
    {"id": "staffing", "name": "투입 인력", "max_score": 15},
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
    # 0004: 업체 표시명 [{"id", "name"}]. NULL이면 vendor_ids로 시작용 이름(A사·B사·C사)을 만든다.
    vendors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 0005: 사업별 기술평가 총배점. NULL이면 DEFAULT_TOTAL_SCORE(100).
    technical_total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
