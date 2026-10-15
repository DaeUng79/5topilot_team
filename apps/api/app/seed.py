"""Idempotent fake fixtures for local development, never overwrite an existing project."""

from sqlalchemy.orm import Session

from app.core.db import engine
from app.modules.committee.models import Candidate
from app.modules.projects.models import Project


def seed():
    with Session(engine) as db:
        if db.get(Project, "demo-project") is None:
            db.add(
                Project(
                    id="demo-project",
                    name="정보시스템 구축 사업 (개발용)",
                    department="정보화사업팀",
                )
            )
        # 본인확인 시연용 합성 생년월일(YYYYMMDD). 3·4·5는 미등록으로 두어
        # 미등록 위원 처리(로컬 마스터 번호 외 차단)를 확인한다.
        birth_dates = {1: "19750305", 2: "19871223"}
        for i, specialty in enumerate(
            ["정보시스템", "보안", "사업관리", "데이터·AI", "법률·회계"], 1
        ):
            if db.get(Candidate, f"demo-evaluator-{i}") is None:
                db.add(
                    Candidate(
                        id=f"demo-evaluator-{i}",
                        name=f"테스트위원 {i}",
                        organization=f"가상기관 {i}",
                        specialty=specialty,
                        birth_date=birth_dates.get(i),
                    )
                )
        db.commit()


if __name__ == "__main__":
    seed()
