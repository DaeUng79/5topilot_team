import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException

from app.modules.projects.models import Project

# 제출 확인 기록 방식. 본인 확인 문구 동의 + 평가표 해시이며 법적 전자서명이 아니다(RES-03).
SIGN_METHOD = "attestation-v1"


def sheet_hash(
    project_id: str,
    evaluator_id: str,
    scores: list[dict],
    opinion: str,
    criteria_version: int | None,
) -> str:
    """제출 시점 평가표 내용의 SHA-256. 리포트·결과 확정에서 변조 여부를 다시 계산해 비교한다."""
    payload = {
        "project_id": project_id,
        "evaluator_id": evaluator_id,
        "criteria_version": criteria_version,
        "opinion": opinion,
        "scores": sorted(
            (
                {
                    "vendor_id": s["vendor_id"],
                    "criterion_id": s["criterion_id"],
                    "score": str(s["score"]),
                }
                for s in scores
            ),
            key=lambda s: (s["vendor_id"], s["criterion_id"]),
        ),
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def verify_sheet_hash(sheet) -> bool:
    if not sheet.sheet_hash:
        return False
    expected = sheet_hash(
        sheet.project_id, sheet.evaluator_id, sheet.scores, sheet.opinion, sheet.criteria_version
    )
    return expected == sheet.sheet_hash


def validate_scores(
    project: Project,
    scores: list[dict],
    *,
    complete: bool = False,
    criteria: list[dict] | None = None,
):
    """criteria를 주면 그 확정 스냅샷으로, 없으면 사업의 현재 기준으로 검증한다."""
    limits = {
        c["id"]: c["max_score"] for c in (criteria if criteria is not None else project.criteria)
    }
    found = set()
    for entry in scores:
        key = (entry["vendor_id"], entry["criterion_id"])
        value = Decimal(str(entry["score"]))
        if key in found or key[0] not in project.vendor_ids or key[1] not in limits:
            raise HTTPException(422, "중복 또는 알 수 없는 업체/평가항목입니다.")
        if not value.is_finite() or value < 0 or value > limits[key[1]]:
            raise HTTPException(422, "점수는 0 이상 배점 이하여야 합니다.")
        if value != value.quantize(Decimal("0.01")):
            raise HTTPException(422, "점수는 소수 둘째 자리까지 입력하세요.")
        found.add(key)
    if complete and len(found) != len(project.vendor_ids) * len(limits):
        raise HTTPException(422, "모든 업체의 모든 기술항목을 작성해야 제출할 수 있습니다.")


def technical_averages(project: Project, sheets) -> list[dict]:
    return [
        {
            "vendor_id": vendor,
            "technical_average": float(
                (
                    sum(
                        (
                            sum(
                                (
                                    Decimal(str(s["score"]))
                                    for s in sheet.scores
                                    if s["vendor_id"] == vendor
                                ),
                                Decimal(0),
                            )
                            for sheet in sheets
                        ),
                        Decimal(0),
                    )
                    / len(sheets)
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            ),
        }
        for vendor in project.vendor_ids
    ]
