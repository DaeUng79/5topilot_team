from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import Actor, require_admin

router = APIRouter(tags=["ai"])


class AIStatus(BaseModel):
    status: Literal["not_connected"] = "not_connected"
    detail: str = "Python/AI 담당자가 이 모듈에서 문서 처리 어댑터를 연결합니다."


@router.get("/ai/status", response_model=AIStatus, operation_id="get_ai_status")
def get_ai_status(_: Annotated[Actor, Depends(require_admin)]):
    return AIStatus()
