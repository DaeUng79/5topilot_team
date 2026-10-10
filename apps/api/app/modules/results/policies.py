"""집계 정책. 정책은 버전 이름으로 고정되고, 승인되지 않은 정책은 집계에 쓸 수 없다(RES-02).

- technical_mean_v1: PR #1의 기술점수 단순평균(Decimal, ROUND_HALF_UP, 소수 둘째 자리).
  현행 승인 정책.
- trimmed_mean_draft: 디자인 캔버스의 최고·최저 1건 제외 평균. Lex6won 승인 전 초안.
가격점수·동점 처리·최종 순위 산식은 정책 확정 후 별도 버전으로 추가한다. 순위는 기술 평균
내림차순이며 동점은 같은 순위를 쓰고 다음 순위를 건너뛴다(표시용, 정책 승인 전).
"""

from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException

from app.modules.evaluations.service import technical_averages
from app.modules.projects.models import Project

Aggregator = Callable[[Project, list], list[dict]]


@dataclass(frozen=True)
class Policy:
    version: str
    approved: bool
    description: str
    aggregate: Aggregator


def _vendor_totals(sheets, vendor_id: str) -> list[Decimal]:
    return [
        sum(
            (Decimal(str(s["score"])) for s in sheet.scores if s["vendor_id"] == vendor_id),
            Decimal(0),
        )
        for sheet in sheets
    ]


def technical_mean_v1(project: Project, sheets) -> list[dict]:
    return technical_averages(project, sheets)


def trimmed_mean_draft(project: Project, sheets) -> list[dict]:
    averages = []
    for vendor_id in project.vendor_ids:
        totals = sorted(_vendor_totals(sheets, vendor_id))
        if len(totals) >= 3:
            totals = totals[1:-1]
        mean = (sum(totals, Decimal(0)) / len(totals)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        averages.append({"vendor_id": vendor_id, "technical_average": float(mean)})
    return averages


POLICIES: dict[str, Policy] = {
    "technical_mean_v1": Policy(
        "technical_mean_v1",
        True,
        "선정위원 전원 기술점수 단순평균, 소수 둘째 자리 ROUND_HALF_UP. "
        "가격·최종 순위 산식 미포함.",
        technical_mean_v1,
    ),
    "trimmed_mean_draft": Policy(
        "trimmed_mean_draft",
        False,
        "최고·최저 1건씩 제외한 평균(위원 3명 이상). 디자인 기준 초안, 승인 전.",
        trimmed_mean_draft,
    ),
}
CURRENT_POLICY = "technical_mean_v1"


def aggregate(policy_version: str, project: Project, sheets) -> list[dict]:
    policy = POLICIES.get(policy_version)
    if policy is None or not policy.approved:
        raise HTTPException(409, f"승인되지 않은 집계 정책입니다: {policy_version}")
    return policy.aggregate(project, sheets)


def rank(averages: list[dict]) -> list[dict]:
    """기술 평균 내림차순. 동점은 같은 순위(1, 1, 3)."""
    ordered = sorted(averages, key=lambda a: (-a["technical_average"], a["vendor_id"]))
    ranked, previous, current_rank = [], None, 0
    for index, entry in enumerate(ordered, 1):
        if entry["technical_average"] != previous:
            current_rank, previous = index, entry["technical_average"]
        ranked.append({"rank": current_rank, **entry})
    return ranked
