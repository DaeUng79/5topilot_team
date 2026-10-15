"""제안요청서 반영: 파싱 결과 읽기 어댑터(DaeUng79 documents SQLite 연계·예시 자료), 사업별 총배점,
빈 평가표/샘플 복사 선택, 평가항목 출처 정보 저장, 같은 결과 재반영 시 중복 없음."""

import json
import sqlite3
from pathlib import Path

from app.core.config import settings
from app.modules.ai import rfp_criteria

SAMPLE = json.loads(rfp_criteria.SAMPLE_PATH.read_text(encoding="utf-8"))


def evaluator(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def documents_db(path: Path, project_id: str, result: dict, document_id="doc-1"):
    """DaeUng79 step2/step4 스키마의 최소 부분만 가진 테스트용 documents.sqlite3."""
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL,
                created_at TEXT NOT NULL);
            CREATE TABLE project_documents (project_id TEXT NOT NULL, document_id TEXT NOT NULL,
                added_at TEXT NOT NULL, PRIMARY KEY (project_id, document_id));
            CREATE TABLE criteria_results (result_id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
                source_revision TEXT NOT NULL, source_requirements_id TEXT NOT NULL,
                reference_revision TEXT NOT NULL, criteria_version TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL, result_json TEXT NOT NULL);
            """
        )
        connection.execute(
            "INSERT INTO projects VALUES (?, ?, ?)", (project_id, "사업", "2026-10-15")
        )
        connection.execute(
            "INSERT INTO project_documents VALUES (?, ?, ?)",
            (project_id, document_id, "2026-10-15"),
        )
        connection.execute(
            "INSERT INTO criteria_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                result["_id"],
                document_id,
                "rev-1",
                "req-1",
                "rev-1",
                "qualitative-criteria-v7",
                "model",
                result["created_at"],
                json.dumps(result, ensure_ascii=False),
            ),
        )


def rfp(client, admin, project_id, sample=False):
    return client.get(
        f"/api/v1/projects/{project_id}/rfp-criteria",
        headers=admin,
        params={"sample": "true"} if sample else None,
    )


def test_sample_when_documents_db_is_absent(client, admin, setup_project, tmp_path, monkeypatch):
    project, candidates = setup_project
    monkeypatch.setattr(settings, "documents_db_path", str(tmp_path / "missing.sqlite3"))
    response = rfp(client, admin, project["id"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "not_connected" and body["items"] == []
    sample = rfp(client, admin, project["id"], sample=True).json()
    assert (
        sample["status"] == "sample" and sample["is_sample"] is True and sample["official"] is True
    )
    assert [i["name"] for i in sample["items"]] == [r["evaluation_item"] for r in SAMPLE["rows"]]
    assert sample["total_score"] == 100 and sum(i["score"] for i in sample["items"]) == 100
    assert all(
        i["origin"] == "rfp" and i["source_ref"].endswith(i["row_id"]) for i in sample["items"]
    )
    assert [s["name"] for s in sample["supplemental"]] == [
        s["evaluation_item"] for s in SAMPLE["supplemental_items"]
    ]
    assert all(s["origin"] == "ai" and s["source_quote"] for s in sample["supplemental"])
    assert "예시" in sample["notice"]
    # 관리자만 조회한다.
    assert rfp(client, evaluator(candidates[0]["id"]), project["id"]).status_code == 403
    assert client.get("/api/v1/projects/no-such/rfp-criteria", headers=admin).status_code == 404
    # 데모 인증이 꺼지면 예시 자료도 주지 않는다.
    monkeypatch.setattr(settings, "simsaimdang_demo_auth", False)
    assert rfp_criteria.load_for_project(project["id"], sample=True).status == "not_connected"


def test_reads_latest_result_linked_to_project(client, admin, setup_project, tmp_path, monkeypatch):
    project, _ = setup_project
    db_path = tmp_path / "documents.sqlite3"
    documents_db(db_path, project["id"], SAMPLE)
    monkeypatch.setattr(settings, "documents_db_path", str(db_path))
    body = rfp(client, admin, project["id"]).json()
    assert body["status"] == "ready" and body["is_sample"] is False and body["official"] is True
    assert body["source"]["document_id"] == "sample-rfp-document"
    assert body["source"]["filename"] == SAMPLE["reference_filename"]
    assert body["items"][0]["source_ref"] == "sample-rfp-document:R01"
    assert body["items"][0]["division"] == "전략 및 방법론"
    assert body["items"][0]["elements"] == SAMPLE["rows"][0]["evaluation_elements"]
    assert "예시" not in body["notice"]
    # 연결되지 않은 사업은 not_found.
    other = client.post(
        "/api/v1/projects", headers=admin, json={"name": "미연결", "department": "검증팀"}
    ).json()
    assert rfp(client, admin, other["id"]).json()["status"] == "not_found"
    # 총괄표로 AI가 만든 초안은 공식 기준이 아니다(origin=ai).
    draft = {
        **SAMPLE,
        "_id": "draft-result",
        "template_source": "generated_from_summary",
        "created_at": "2026-10-16T00:00:00+00:00",
    }
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "INSERT INTO criteria_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "draft-result",
                "doc-1",
                "rev-1",
                "req-1",
                "rev-1",
                "v7",
                "model",
                draft["created_at"],
                json.dumps(draft, ensure_ascii=False),
            ),
        )
    latest = rfp(client, admin, project["id"]).json()
    assert latest["source"]["result_id"] == "draft-result"  # 최신 결과
    assert latest["official"] is False and all(i["origin"] == "ai" for i in latest["items"])
    assert "AI" in latest["notice"]


def test_total_score_and_empty_start_are_per_project(client, admin, setup_project):
    project, candidates = setup_project
    created = client.post(
        "/api/v1/projects",
        headers=admin,
        json={
            "name": "빈 평가표 사업",
            "department": "검증팀",
            "technical_total_score": 120,
            "criteria_source": "empty",
        },
    )
    assert created.status_code == 201, created.text
    empty = created.json()
    assert empty["criteria"] == [] and empty["technical_total_score"] == 120
    assert project["technical_total_score"] == 100 and len(project["criteria"]) == 7
    base = f"/api/v1/projects/{empty['id']}"
    setup = client.get(f"{base}/setup", headers=admin).json()
    assert (
        setup["criteria"] == []
        and setup["total_score"] == 0
        and setup["required_total_score"] == 120
    )
    # 총배점 변경·빈 목록 저장 허용.
    changed = client.put(
        f"{base}/setup/total-score", headers=admin, json={"technical_total_score": 80}
    )
    assert changed.status_code == 200 and changed.json()["required_total_score"] == 80
    assert (
        client.put(f"{base}/setup/criteria", headers=admin, json={"criteria": []}).status_code
        == 200
    )
    assert (
        client.put(
            f"{base}/setup/total-score", headers=admin, json={"technical_total_score": 0}
        ).status_code
        == 422
    )
    # 채점 시작·확정은 사업 총배점(80)과 같아야 한다.
    client.put(
        f"{base}/setup/criteria",
        headers=admin,
        json={"criteria": [{"name": "항목", "max_score": 50}, {"name": "항목 2", "max_score": 50}]},
    )
    draw = client.post(
        f"{base}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": 1, "reserves": 0},
    ).json()
    headers = evaluator(draw["selected_ids"][0])
    brief = client.get(f"{base}/evaluator-access/brief", headers=headers).json()
    assert brief["technical_total_score"] == 80
    scores = [
        {"vendor_id": v, "criterion_id": c["id"], "score": 1}
        for v in brief["vendor_ids"]
        for c in brief["criteria"]
    ]
    blocked = client.put(
        f"{base}/evaluations/me", headers=headers, json={"expected_version": 0, "scores": scores}
    )
    assert blocked.status_code == 409 and "80점" in blocked.json()["detail"]
    assert (
        client.post(
            f"{base}/criteria/confirm", headers=admin, json={"expected_version": 0}
        ).status_code
        == 422
    )
    client.put(f"{base}/setup/total-score", headers=admin, json={"technical_total_score": 100})
    assert (
        client.put(
            f"{base}/evaluations/me",
            headers=headers,
            json={"expected_version": 0, "scores": scores},
        ).status_code
        == 200
    )
    # 평가표가 저장되면 총배점도 잠긴다.
    assert (
        client.put(
            f"{base}/setup/total-score", headers=admin, json={"technical_total_score": 90}
        ).status_code
        == 409
    )


def test_rfp_metadata_round_trip_and_idempotent_apply(client, admin, setup_project):
    project, _ = setup_project
    base = f"/api/v1/projects/{project['id']}"
    sample = rfp(client, admin, project["id"], sample=True).json()

    # 화면이 하는 변환: 파싱 항목 → 평가항목(출처 정보 포함).
    # 같은 결과를 두 번 반영해도 ID가 유지된다.
    def as_criteria(items, existing=()):
        by_ref = {c.get("source_ref"): c["id"] for c in existing if c.get("source_ref")}
        return [
            {
                "id": by_ref.get(i["source_ref"]),
                "name": i["name"],
                "max_score": i["score"],
                "division": i["division"],
                "description": i["description"],
                "elements": i["elements"],
                "origin": i["origin"],
                "source_ref": i["source_ref"],
                "source_label": i["source_label"],
            }
            for i in items
        ]

    first = client.put(
        f"{base}/setup/criteria", headers=admin, json={"criteria": as_criteria(sample["items"])}
    )
    assert first.status_code == 200, first.text
    saved = first.json()["criteria"]
    assert [c["name"] for c in saved] == [i["name"] for i in sample["items"]]
    assert saved[0]["origin"] == "rfp" and saved[0]["source_ref"] == "sample-rfp-document:R01"
    assert saved[0]["division"] == "전략 및 방법론" and len(saved[0]["elements"]) == 3
    assert saved[0]["source_label"].endswith("원문 평가표")
    assert first.json()["total_score"] == 100
    second = client.put(
        f"{base}/setup/criteria",
        headers=admin,
        json={"criteria": as_criteria(sample["items"], saved)},
    )
    assert [c["id"] for c in second.json()["criteria"]] == [c["id"] for c in saved]
    assert len(second.json()["criteria"]) == len(sample["items"])
    # 사업 목록·브리프·확정에도 출처 정보가 그대로 남고, 수동 항목은 origin 없이 저장된다.
    listed = next(
        p for p in client.get("/api/v1/projects", headers=admin).json() if p["id"] == project["id"]
    )
    assert listed["criteria"][0]["source_ref"] == "sample-rfp-document:R01"
    manual = client.put(
        f"{base}/setup/criteria",
        headers=admin,
        json={"criteria": [*saved[:4], {"name": "가격 적정성", "max_score": 25}]},
    ).json()["criteria"]
    assert manual[-1]["origin"] is None and manual[-1]["source_ref"] is None
    confirmed = client.post(f"{base}/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.json()["criteria"][0]["source_ref"] == "sample-rfp-document:R01"
    assert (
        "source_ref" not in confirmed.json()["criteria"][-1]
        or confirmed.json()["criteria"][-1]["source_ref"] is None
    )
