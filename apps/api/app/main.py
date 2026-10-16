from fastapi import FastAPI
from pydantic import BaseModel

from app.core.config import settings
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.committee.chair import router as chair_router
from app.modules.committee.router import router as committee_router
from app.modules.evaluations.router import router as evaluations_router
from app.modules.evaluator_access.router import router as evaluator_access_router
from app.modules.projects.criteria import router as criteria_router
from app.modules.projects.router import router as projects_router
from app.modules.projects.setup import router as setup_router
from app.modules.results.router import router as results_router

app = FastAPI(title="심사임당 팀 개발 API", version="0.1.0")


class Health(BaseModel):
    status: str = "ok"
    demo_auth: bool


@app.get("/api/v1/health", response_model=Health, operation_id="health")
def health():
    return Health(demo_auth=settings.simsaimdang_demo_auth)


for router in (
    projects_router,
    criteria_router,
    setup_router,
    committee_router,
    chair_router,
    evaluations_router,
    results_router,
    auth_router,
    evaluator_access_router,
    ai_router,
):
    app.include_router(router, prefix="/api/v1")
