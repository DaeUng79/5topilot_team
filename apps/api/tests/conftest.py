import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.main import app


@pytest.fixture(scope="session")
def test_engine(tmp_path_factory):
    # TEST_DATABASE_URL must point to a disposable test database, not development/production.
    url = os.environ.get("TEST_DATABASE_URL") or (
        "sqlite:///" + (tmp_path_factory.mktemp("db") / "test.db").as_posix()
    )
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "DATABASE_URL": url},
    )
    engine = create_engine(
        url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}
    )
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    yield engine
    engine.dispose()


@pytest.fixture
def client(test_engine, monkeypatch):
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", True)

    def override_db():
        with Session(test_engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin():
    return {"Authorization": "Bearer local-admin"}


@pytest.fixture
def setup_project(client, admin):
    project = client.post(
        "/api/v1/projects", headers=admin, json={"name": "통합 테스트", "department": "개발팀"}
    ).json()
    candidates = [
        client.post(
            "/api/v1/committee/candidates",
            headers=admin,
            json={
                "name": f"가상위원 {i}",
                "organization": "테스트 기관",
                "specialty": "정보시스템",
            },
        ).json()
        for i in range(4)
    ]
    return project, candidates
