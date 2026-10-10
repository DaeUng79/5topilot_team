"""결과 취합·공개·확정.

- 취합(summary): 선정위원별 제출 상태와, 전원 제출 뒤에만 계산되는 기술 평균·순위(RES-01).
- 확정(confirm): 위원장이 전원 제출·기준 버전 일치·평가표 해시 검증을 거친 결과를 봉인한다(RES-03).
  개인 평가표 제출(evaluation_sheets)과 사업 결과 확정(result_confirmations)은 별도 상태다(EVAL-03).
위원장 지정 출처는 core/permissions.chair_id이며 위원 기능(COM-03) 연계 전까지 미지정이다.
"""

import hashlib
import json
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import permissions
from app.modules.evaluations.models import ScoreSheet
from app.modules.evaluations.service import verify_sheet_hash
from app.modules.projects.criteria import current_confirmation
from app.modules.projects.models import Project
from app.modules.results.models import ResultConfirmation
from app.modules.results.policies import CURRENT_POLICY, POLICIES, aggregate, rank


def canonical_hash(payload) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def get_confirmation(db: Session, project_id: str) -> ResultConfirmation | None:
    return db.scalar(select(ResultConfirmation).where(ResultConfirmation.project_id == project_id))


def summarize(db: Session, project: Project) -> dict:
    draw = permissions.current_draw(db, project.id)
    selected = list(draw.selected_ids) if draw else []
    names = {c["id"]: c["name"] for c in draw.candidate_snapshot} if draw else {}
    sheets = (
        db.scalars(
            select(ScoreSheet).where(
                ScoreSheet.project_id == project.id, ScoreSheet.evaluator_id.in_(selected)
            )
        ).all()
        if selected
        else []
    )
    by_member = {sheet.evaluator_id: sheet for sheet in sheets}
    submitted = [sheet for sheet in sheets if sheet.status == "submitted"]
    complete = bool(selected) and len(submitted) == len(selected)
    confirmation = get_confirmation(db, project.id)
    criteria = current_confirmation(db, project.id)
    chair = permissions.chair_id(db, project.id, draw)
    notices = [POLICIES[CURRENT_POLICY].description]
    if chair is None:
        notices.append(
            "위원장이 지정되지 않았습니다. 위원 기능(COM-03) 연계 뒤 결과 확정이 가능합니다."
        )
    if criteria is None:
        notices.append("확정된 평가기준이 없습니다(버전 0). 결과 확정 전에 기준을 확정해야 합니다.")
    elif criteria.status == "needs_review":
        notices.append("평가기준이 재검토 중입니다.")
    if confirmation is None:
        notices.append(
            "가격점수·최종 순위 산식은 정책 승인 전이며 표시 순위는 기술 평균 기준입니다."
        )
    members = [
        {
            "evaluator_id": member,
            "name": names.get(member, member),
            "is_chair": member == chair,
            "status": by_member[member].status if member in by_member else "none",
            "submitted_at": by_member[member].submitted_at if member in by_member else None,
            "signed_at": by_member[member].signed_at if member in by_member else None,
            "criteria_version": by_member[member].criteria_version if member in by_member else None,
        }
        for member in selected
    ]
    averages = aggregate(CURRENT_POLICY, project, submitted) if complete else []
    if confirmation is not None:
        status = confirmation.status
    else:
        status = "technical_complete" if complete else "collecting"
    return {
        "status": status,
        "expected": len(selected),
        "submitted": len(submitted),
        "members": members,
        "averages": averages,
        "rankings": rank(averages) if complete else [],
        "policy_version": CURRENT_POLICY,
        "criteria_version": criteria.version if criteria else 0,
        "chair_id": chair,
        "confirmable": complete and confirmation is None and chair is not None,
        "confirmation": confirmation,
        "notices": notices,
    }


def confirm_results(db: Session, project: Project, actor_id: str) -> ResultConfirmation:
    if get_confirmation(db, project.id) is not None:
        raise HTTPException(409, "이미 확정된 결과입니다.")
    summary = summarize(db, project)
    if summary["status"] != "technical_complete":
        raise HTTPException(
            409,
            f"선정위원 {summary['expected']}명 중 {summary['submitted']}명 제출. "
            "전원 제출 전에는 결과를 확인할 수 없습니다.",
        )
    draw = permissions.current_draw(db, project.id)
    sheets = db.scalars(
        select(ScoreSheet).where(
            ScoreSheet.project_id == project.id,
            ScoreSheet.evaluator_id.in_(draw.selected_ids),
            ScoreSheet.status == "submitted",
        )
    ).all()
    versions = {sheet.criteria_version for sheet in sheets}
    if len(versions) != 1:
        raise HTTPException(
            409, "평가표의 기준 버전이 서로 다릅니다. 간사가 처리 방법을 정해야 합니다."
        )
    version = versions.pop()
    if not version:
        raise HTTPException(
            409, "확정된 평가기준(버전 1 이상)으로 작성된 평가표만 확정할 수 있습니다."
        )
    criteria = current_confirmation(db, project.id)
    if criteria is None or criteria.status != "confirmed" or criteria.version != version:
        raise HTTPException(409, "평가기준이 평가 이후 변경되었거나 재검토 중입니다.")
    tampered = [sheet.evaluator_id for sheet in sheets if not verify_sheet_hash(sheet)]
    if tampered:
        raise HTTPException(409, f"평가표 내용 해시가 일치하지 않습니다: {', '.join(tampered)}")
    snapshot = {
        "policy_version": CURRENT_POLICY,
        "criteria_version": version,
        "criteria": criteria.criteria,
        "vendor_ids": list(project.vendor_ids),
        "averages": summary["averages"],
        "rankings": summary["rankings"],
        "sheets": [
            {
                "evaluator_id": sheet.evaluator_id,
                "sheet_hash": sheet.sheet_hash,
                "submitted_at": sheet.submitted_at,
                "signed_at": sheet.signed_at,
                "sign_method": sheet.sign_method,
                "criteria_version": sheet.criteria_version,
            }
            for sheet in sorted(sheets, key=lambda s: s.evaluator_id)
        ],
        "expected": summary["expected"],
        "submitted": summary["submitted"],
    }
    confirmation = ResultConfirmation(
        project_id=project.id,
        status="confirmed",
        policy_version=CURRENT_POLICY,
        criteria_version=version,
        result_sha256=canonical_hash(snapshot),
        result_snapshot=snapshot,
        expected=summary["expected"],
        submitted=summary["submitted"],
        confirmed_by=actor_id,
        confirmed_at=datetime.now(UTC).isoformat(),
    )
    db.add(confirmation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "동시 확정 요청이 먼저 처리되었습니다.") from None
    db.refresh(confirmation)
    return confirmation
