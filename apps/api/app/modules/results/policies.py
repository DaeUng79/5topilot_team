"""집계 정책. 정책은 버전 이름으로 고정되고, 승인되지 않은 정책은 집계에 쓸 수 없다(RES-02).

- trimmed_mean_v1 (현행): 제안사별로 위원별 총점(항목 합계) 중 최고 1개·최저 1개를 제외한 평균.
  위원이 2명 이하면 제외할 것이 없어 전체 평균. 동점 최고(최저)는 1개만 제외. Decimal·ROUND_HALF_UP·
  소수 둘째 자리. 2026-10-11 u-jing 지시로 승인, PM(Lex6won) 확인 대기.
- technical_mean_v1: PR #1의 단순평균. 기록·비교용으로 유지하며 현행 집계에는 쓰지 않는다.
가격점수·최종 순위 산식은 정책 확정 후 별도 버전으로 추가한다. 순위는 기술 평균 내림차순이며
동점은 같은 순위를 쓰고 다음 순위를 건너뛴다(표시용, 정책 승인 전).
"""

from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException

from app.modules.evaluations.service import technical_averages
from app.modules.projects.models import Project

Aggregator = Callable[[Project, list], list[dict]]
MIN_MEMBERS_FOR_TRIM = 3


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


def trimmed_mean_v1(project: Project, sheets) -> list[dict]:
    averages = []
    for vendor_id in project.vendor_ids:
        totals = sorted(_vendor_totals(sheets, vendor_id))
        if len(totals) >= MIN_MEMBERS_FOR_TRIM:
            totals = totals[1:-1]
        mean = (sum(totals, Decimal(0)) / len(totals)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        averages.append({"vendor_id": vendor_id, "technical_average": float(mean)})
    return averages


POLICIES: dict[str, Policy] = {
    "trimmed_mean_v1": Policy(
        "trimmed_mean_v1",
        True,
        "제안사별 위원 총점에서 최고·최저 1개씩 제외한 평균(위원 3명 이상, 2명 이하는 전체 평균), "
        "소수 둘째 자리 반올림. 가격·최종 순위 산식 미포함.",
        trimmed_mean_v1,
    ),
    "technical_mean_v1": Policy(
        "technical_mean_v1",
        True,
        "선정위원 전원 기술점수 단순평균, 소수 둘째 자리 반올림(PR #1 시작용, 비교·기록용).",
        technical_mean_v1,
    ),
}
CURRENT_POLICY = "trimmed_mean_v1"


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
