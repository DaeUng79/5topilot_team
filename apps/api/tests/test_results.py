"""RES-01 공개 시점, RES-02 정책 버전, RES-03 위원장 확정·서명 기록.

EVAL-03의 개인 제출과 사업 결과 확정이 별도 상태임도 함께 확인한다.
"""

import base64
import hashlib
import struct
import zlib
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.evaluations.models import ScoreSheet
from app.modules.results import policies

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "synthetic"


def actor(candidate_id):
    return {"Authorization": f"Bearer local-evaluator:{candidate_id}"}


def draw_members(client, admin, project, candidates, seats=2):
    response = client.post(
        f"/api/v1/projects/{project['id']}/committee/draw",
        headers=admin,
        json={"candidate_ids": [c["id"] for c in candidates], "seats": seats, "reserves": 1},
    )
    assert response.status_code == 201, response.text
    return response.json()


def scores_for(project, per_vendor_ratio):
    return [
        {
            "vendor_id": vendor,
            "criterion_id": c["id"],
            "score": round(c["max_score"] * per_vendor_ratio[vendor], 2),
        }
        for vendor in project["vendor_ids"]
        for c in project["criteria"]
    ]


def save_and_submit(client, headers, base, scores):
    saved = client.put(
        base + "/evaluations/me", headers=headers, json={"expected_version": 0, "scores": scores}
    )
    assert saved.status_code == 200, saved.text
    submitted = client.post(
        base + "/evaluations/me/submit",
        headers=headers,
        json={"expected_version": saved.json()["version"], "attested": True},
    )
    assert submitted.status_code == 200, submitted.text
    return submitted.json()


def confirm_criteria(client, admin, base):
    response = client.post(base + "/criteria/confirm", headers=admin, json={"expected_version": 0})
    assert response.status_code == 201, response.text


def tiny_png(pixel: bytes = b"\x00\x00\x00\x00") -> bytes:
    """1×1 RGBA PNG(합성 서명 이미지). Pillow 없이 IHDR·IDAT·CRC를 직접 만든다."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)

    header = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    body = zlib.compress(b"\x00" + pixel)
    chunks = chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    return b"\x89PNG\r\n\x1a\n" + chunks


def data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


SIGNATURE_PNG = tiny_png()
SIGNATURE = data_url(SIGNATURE_PNG)
# 위원장 최종 서명·확정 본문. 확인 동의나 서명 이미지가 없으면 422.
SIGNED = {"reviewed": True, "signature_image": SIGNATURE}


def assign_chair(client, admin, base, chair_id, reason=""):
    """사업관리자가 본위원 중 위원장을 지정한다(committee/chair.py)."""
    response = client.put(
        base + "/committee/chair", headers=admin, json={"chair_id": chair_id, "reason": reason}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_summary_hides_averages_until_all_submitted_and_checks_roles(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    first, second = actor(selected[0]), actor(selected[1])
    url = base + "/results/summary"
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "collecting"
    assert summary["expected"] == 2 and summary["submitted"] == 0
    assert summary["averages"] == [] and summary["rankings"] == []
    assert [m["status"] for m in summary["members"]] == ["none", "none"]
    assert summary["chair_id"] is None and summary["confirmable"] is False
    assert summary["policy_version"] == "trimmed_mean_v1" and summary["criteria_version"] == 1
    assert client.get(url, headers=first).status_code == 403
    assert client.get(url).status_code == 401

    full = {v: 1 for v in project["vendor_ids"]}
    sheet = save_and_submit(client, first, base, scores_for(project, full))
    assert sheet["signed_at"] == sheet["submitted_at"]
    assert len(sheet["sheet_hash"]) == 64 and sheet["sign_method"] == "attestation-v1"
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "collecting" and summary["submitted"] == 1
    assert summary["averages"] == [], "전원 제출 전에는 평균을 공개하지 않음"
    member = next(m for m in summary["members"] if m["evaluator_id"] == selected[0])
    assert (
        member["status"] == "submitted" and member["signed_at"] and member["criteria_version"] == 1
    )

    ratios = dict(zip(project["vendor_ids"], [1, 0.5, 0]))
    save_and_submit(client, second, base, scores_for(project, ratios))
    summary = client.get(url, headers=admin).json()
    assert summary["status"] == "technical_complete" and summary["submitted"] == 2
    assert [a["technical_average"] for a in summary["averages"]] == [100, 75, 50]
    assert [(r["rank"], r["vendor_id"]) for r in summary["rankings"]] == [
        (1, project["vendor_ids"][0]),
        (2, project["vendor_ids"][1]),
        (3, project["vendor_ids"][2]),
    ]
    assert summary["confirmable"] is False, "위원장 미지정이면 확정 불가"


def test_confirm_requires_chair_completion_and_seals_once(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    first, second = actor(selected[0]), actor(selected[1])
    confirm_url = base + "/results/confirm"
    unassigned = client.post(confirm_url, headers=first, json=SIGNED)
    assert unassigned.status_code == 403, "위원장 미지정"
    assign_chair(client, admin, base, selected[0])
    assert client.post(confirm_url, headers=admin, json=SIGNED).status_code == 403
    assert client.post(confirm_url, headers=second, json=SIGNED).status_code == 403
    early = client.post(confirm_url, headers=first, json=SIGNED)
    assert early.status_code == 409 and "전원 제출" in early.json()["detail"]

    full = {v: 1 for v in project["vendor_ids"]}
    save_and_submit(client, first, base, scores_for(project, full))
    save_and_submit(client, second, base, scores_for(project, full))
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["confirmable"] is True and summary["chair_id"] == selected[0]
    assert next(m for m in summary["members"] if m["is_chair"])["evaluator_id"] == selected[0]

    assert client.post(confirm_url, headers=first).status_code == 422, "확인 동의 없음"
    assert client.post(confirm_url, headers=first, json={"reviewed": False}).status_code == 422
    confirmed = client.post(confirm_url, headers=first, json=SIGNED)
    assert confirmed.status_code == 201, confirmed.text
    body = confirmed.json()
    assert body["status"] == "confirmed" and body["policy_version"] == "trimmed_mean_v1"
    assert body["criteria_version"] == 1 and len(body["result_sha256"]) == 64
    assert body["confirmed_by"] == selected[0] and body["expected"] == body["submitted"] == 2
    assert body["sign_method"] == "chair-handwritten-v1" and body["signature_image"] == SIGNATURE
    assert body["signature_sha256"] == hashlib.sha256(SIGNATURE_PNG).hexdigest()
    assert body["signer_name"].startswith("가상위원")
    assert client.post(confirm_url, headers=first, json=SIGNED).status_code == 409
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["status"] == "confirmed" and summary["confirmable"] is False
    assert summary["confirmation"]["id"] == body["id"]
    assert client.get(base + "/results/confirmation", headers=admin).json()["id"] == body["id"]
    assert client.get(base + "/results/confirmation", headers=first).status_code == 200
    assert client.get(base + "/results/confirmation", headers=second).status_code == 403
    assert client.get(base + "/results", headers=admin).json()["status"] == "technical_complete"


def test_confirm_rejects_unconfirmed_mixed_or_changed_criteria(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    assign_chair(client, admin, base, selected[0])
    first, second = actor(selected[0]), actor(selected[1])
    full = {v: 1 for v in project["vendor_ids"]}
    save_and_submit(client, first, base, scores_for(project, full))
    save_and_submit(client, second, base, scores_for(project, full))
    unconfirmed = client.post(base + "/results/confirm", headers=first, json=SIGNED)
    assert unconfirmed.status_code == 409 and "버전 1 이상" in unconfirmed.json()["detail"]

    other = client.post(
        "/api/v1/projects", headers=admin, json={"name": "혼합 버전 사업", "department": "x"}
    ).json()
    other_base = f"/api/v1/projects/{other['id']}"
    selected_other = draw_members(client, admin, other, candidates)["selected_ids"]
    assign_chair(client, admin, other_base, selected_other[0])
    one, two = actor(selected_other[0]), actor(selected_other[1])
    save_and_submit(client, one, other_base, scores_for(other, full))
    confirm_criteria(client, admin, other_base)
    save_and_submit(client, two, other_base, scores_for(other, full))
    mixed = client.post(other_base + "/results/confirm", headers=one, json=SIGNED)
    assert mixed.status_code == 409 and "서로 다릅니다" in mixed.json()["detail"]

    third = client.post(
        "/api/v1/projects", headers=admin, json={"name": "기준 변경 사업", "department": "x"}
    ).json()
    third_base = f"/api/v1/projects/{third['id']}"
    confirm_criteria(client, admin, third_base)
    selected_third = draw_members(client, admin, third, candidates)["selected_ids"]
    assign_chair(client, admin, third_base, selected_third[0])
    for member in selected_third:
        save_and_submit(client, actor(member), third_base, scores_for(third, full))
    reconfirm = client.post(
        third_base + "/criteria/confirm", headers=admin, json={"expected_version": 1}
    )
    assert reconfirm.status_code == 201
    changed = client.post(
        third_base + "/results/confirm", headers=actor(selected_third[0]), json=SIGNED
    )
    assert changed.status_code == 409 and "변경" in changed.json()["detail"]


def test_confirm_detects_tampered_sheet(client, admin, setup_project, test_engine):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    assign_chair(client, admin, base, selected[0])
    full = {v: 1 for v in project["vendor_ids"]}
    for member in selected:
        save_and_submit(client, actor(member), base, scores_for(project, full))
    with Session(test_engine) as db:
        target = db.scalar(
            select(ScoreSheet).where(
                ScoreSheet.project_id == project["id"], ScoreSheet.evaluator_id == selected[1]
            )
        )
        target.scores = [{**s, "score": 0} for s in target.scores]
        db.commit()
    tampered = client.post(base + "/results/confirm", headers=actor(selected[0]), json=SIGNED)
    assert tampered.status_code == 409 and "해시" in tampered.json()["detail"]
    assert tampered.json()["detail"].endswith(selected[1])


def test_policies_registry_and_ranking():
    with pytest.raises(HTTPException) as exc:
        policies.aggregate("unknown", None, [])
    assert exc.value.status_code == 409
    assert policies.CURRENT_POLICY == "trimmed_mean_v1"
    assert policies.POLICIES["trimmed_mean_v1"].approved
    assert policies.rank(
        [
            {"vendor_id": "b", "technical_average": 75.0},
            {"vendor_id": "a", "technical_average": 75.0},
            {"vendor_id": "c", "technical_average": 10.0},
        ]
    ) == [
        {"rank": 1, "vendor_id": "a", "technical_average": 75.0},
        {"rank": 1, "vendor_id": "b", "technical_average": 75.0},
        {"rank": 3, "vendor_id": "c", "technical_average": 10.0},
    ]


def test_summary_trims_highest_and_lowest_totals_with_three_members(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates, seats=3)["selected_ids"]
    a, b, c = project["vendor_ids"]
    ratios = [{a: 1, b: 1, c: 0}, {a: 0.5, b: 1, c: 0}, {a: 0.75, b: 1, c: 1}]
    for member, ratio in zip(selected, ratios):
        save_and_submit(client, actor(member), base, scores_for(project, ratio))
    summary = client.get(base + "/results/summary", headers=admin).json()
    assert summary["policy_version"] == "trimmed_mean_v1"
    assert {x["vendor_id"]: x["technical_average"] for x in summary["averages"]} == {
        a: 75.0,  # [100, 50, 75] → 100·50 제외
        b: 100.0,  # [100, 100, 100] → 동점이라도 1개씩만 제외
        c: 0.0,  # [0, 0, 100] → 100·0 제외
    }
    legacy = client.get(base + "/results", headers=admin).json()
    assert legacy["averages"] == summary["averages"]
    assert legacy["calculation"].startswith("trimmed_mean_v1")


def test_confirm_requires_valid_handwritten_signature(client, admin, setup_project):
    project, candidates = setup_project
    base = f"/api/v1/projects/{project['id']}"
    confirm_criteria(client, admin, base)
    selected = draw_members(client, admin, project, candidates)["selected_ids"]
    assign_chair(client, admin, base, selected[0])
    full = {v: 1 for v in project["vendor_ids"]}
    for member in selected:
        save_and_submit(client, actor(member), base, scores_for(project, full))
    url = base + "/results/confirm"
    chair = actor(selected[0])
    assert client.post(url, headers=chair, json={"reviewed": True}).status_code == 422, "서명 없음"
    bad = {
        "jpeg": "data:image/jpeg;base64," + base64.b64encode(SIGNATURE_PNG).decode(),
        "base64": "data:image/png;base64,***not-base64***",
        "not-png": data_url(b"GIF89a" + b"\x00" * 40),
        "too-big": data_url(SIGNATURE_PNG + b"\x00" * 300_001),
        "too-wide": data_url(SIGNATURE_PNG[:16] + struct.pack(">II", 2001, 1) + SIGNATURE_PNG[24:]),
    }
    for name, image in bad.items():
        body = {"reviewed": True, "signature_image": image}
        assert client.post(url, headers=chair, json=body).status_code == 422, name
    assert client.get(base + "/results/confirmation", headers=admin).json() is None
    sealed = client.post(url, headers=chair, json=SIGNED)
    assert sealed.status_code == 201, sealed.text
    stored = client.get(base + "/results/confirmation", headers=admin).json()
    assert stored["signature_image"] == SIGNATURE
    assert stored["signature_sha256"] == hashlib.sha256(SIGNATURE_PNG).hexdigest()
    assert stored["sign_method"] == "chair-handwritten-v1"
    assert stored["signer_name"].startswith("가상위원")
    report = client.get(base + "/results/report", headers=admin).json()
    assert report["signature_intact"] is True
    assert report["confirmation"]["signature_image"] == SIGNATURE
    assert any("자필 서명" in n for n in report["notices"])
