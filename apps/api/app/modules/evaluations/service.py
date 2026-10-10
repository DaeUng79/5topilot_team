from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException

from app.modules.projects.models import Project


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
