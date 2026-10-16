from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import Actor, require_admin
from app.core.db import get_db
from app.modules.ai.rfp_criteria import RfpCriteriaRead, load_for_project
from app.modules.projects.service import get_project

router = APIRouter(tags=["ai"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[Actor, Depends(require_admin)]


class AIStatus(BaseModel):
    status: Literal["not_connected"] = "not_connected"
    detail: str = "Python/AI 담당자가 이 모듈에서 문서 처리 어댑터를 연결합니다."


@router.get("/ai/status", response_model=AIStatus, operation_id="get_ai_status")
def get_ai_status(_: Annotated[Actor, Depends(require_admin)]):
    return AIStatus()


@router.get(
    "/projects/{project_id}/rfp-criteria",
    response_model=RfpCriteriaRead,
    operation_id="get_rfp_criteria",
)
def get_rfp_criteria(project_id: str, db: DB, _: Admin, sample: bool = False):
    """사업에 연결된 제안요청서 평가기준 파싱 결과(저장본, 읽기 전용).

    미리보기용이며 평가기준을 바꾸지 않는다. 반영은 평가 설정 화면에서 검토한 뒤
    PUT /projects/{id}/setup/criteria 로 한다.
    sample=true는 데모 인증 환경에서 테스트용 예시 자료를 준다.
    """
    get_project(db, project_id)
    return load_for_project(project_id, sample=sample)
