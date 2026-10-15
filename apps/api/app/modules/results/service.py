"""결과 취합·공개·확정.

- 취합(summary): 선정위원별 제출 상태와, 전원 제출 뒤에만 계산되는 기술 평균·순위(RES-01).
- 확정(confirm): 위원장이 전원 제출·기준 버전 일치·평가표 해시 검증을 거친 결과를 봉인한다(RES-03).
  개인 평가표 제출(evaluation_sheets)과 사업 결과 확정(result_confirmations)은 별도 상태다(EVAL-03).
위원장은 사업관리자가 추첨 결과의 본위원 중 지정한다(committee_draws.chair_id,
modules/committee/chair.py). 확정 조건: 위원장 지정, 전원 제출, 모든 평가표에 서명(확인) 기록,
기준 버전 일치, 해시 재검증, 위원장의 확인 동의와 자필 서명 이미지(ConfirmRequest). 확정 기록은
스냅샷·해시와 서명 이미지(0007) 저장이며 법적 전자서명이 아니다(로컬 시연용).
"""

import base64
import hashlib
import json
import struct
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
from app.modules.results.state import get_confirmation

# 위원장 최종 서명 방식. 화면에서 작성한 자필 서명 이미지(PNG) + 확인 동의 + 결과 스냅샷 SHA-256.
# 법적 전자서명이 아니며 로컬 시연용이다. 평가위원 개인 제출의 attestation-v1(문구 동의+해시)과
# 구분한다.
SIGN_METHOD = "chair-handwritten-v1"
SIGNATURE_PREFIX = "data:image/png;base64,"
MAX_SIGNATURE_BYTES = 300_000
MAX_SIGNATURE_SIDE = 2000
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def canonical_hash(payload) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def decode_signature(data_url: str) -> bytes:
    """화면이 보낸 서명(PNG data URL)을 검증해 원본 바이트를 돌려준다. 형식·크기 오류는 422.

    Pillow 없이 PNG 서명(magic)·IHDR 크기만 확인한다. 빈 서명 여부는 화면이 획 수로 막는다.
    """
    if not data_url.startswith(SIGNATURE_PREFIX):
        raise HTTPException(422, "서명은 PNG 이미지(data:image/png;base64)여야 합니다.")
    try:
        raw = base64.b64decode(data_url[len(SIGNATURE_PREFIX) :], validate=True)
    except ValueError:
        raise HTTPException(422, "서명 이미지 인코딩이 올바르지 않습니다.") from None
    if len(raw) > MAX_SIGNATURE_BYTES:
        raise HTTPException(422, "서명 이미지가 너무 큽니다(300KB 이하).")
    if len(raw) < 33 or raw[:8] != PNG_MAGIC or raw[12:16] != b"IHDR":
        raise HTTPException(422, "서명 이미지가 PNG 형식이 아닙니다.")
    width, height = struct.unpack(">II", raw[16:24])
    if not (0 < width <= MAX_SIGNATURE_SIDE and 0 < height <= MAX_SIGNATURE_SIDE):
        raise HTTPException(422, "서명 이미지 크기가 허용 범위를 벗어났습니다.")
    return raw


def canonical_signature(raw: bytes) -> str:
    return SIGNATURE_PREFIX + base64.b64encode(raw).decode()


def signature_intact(confirmation: ResultConfirmation) -> bool | None:
    """저장된 서명 이미지가 기록된 해시와 같은지. 서명이 없는 기록(0007 이전)은 None."""
    if not confirmation.signature_image or not confirmation.signature_sha256:
        return None
    try:
        raw = base64.b64decode(
            confirmation.signature_image.removeprefix(SIGNATURE_PREFIX), validate=True
        )
    except ValueError:
        return False
    return hashlib.sha256(raw).hexdigest() == confirmation.signature_sha256


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
            "위원장이 지정되지 않았습니다. 평가위원 등록·추첨 화면에서 본위원 중 위원장을 지정하면 "
            "결과 확정이 가능합니다."
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
    if confirmation is not None:
        status = confirmation.status
        snapshot = confirmation.result_snapshot
        averages, rankings = snapshot["averages"], snapshot["rankings"]
        policy_version = snapshot["policy_version"]
    else:
        status = "technical_complete" if complete else "collecting"
        averages = aggregate(CURRENT_POLICY, project, submitted) if complete else []
        rankings = rank(averages) if complete else []
        policy_version = CURRENT_POLICY
    return {
        "status": status,
        "expected": len(selected),
        "submitted": len(submitted),
        "members": members,
        "averages": averages,
        "rankings": rankings,
        "policy_version": policy_version,
        "criteria_version": criteria.version if criteria else 0,
        "chair_id": chair,
        "confirmable": complete and confirmation is None and chair is not None,
        "confirmation": confirmation,
        "notices": notices,
    }


def confirm_results(
    db: Session, project: Project, actor_id: str, signature_image: str
) -> ResultConfirmation:
    if get_confirmation(db, project.id) is not None:
        raise HTTPException(409, "이미 확정된 결과입니다.")
    signature = decode_signature(signature_image)
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
    unsigned = [
        sheet.evaluator_id
        for sheet in sheets
        if not (sheet.signed_at and sheet.sheet_hash and sheet.sign_method)
    ]
    if unsigned:
        raise HTTPException(409, f"서명(확인) 기록이 없는 평가표가 있습니다: {', '.join(unsigned)}")
    tampered = [sheet.evaluator_id for sheet in sheets if not verify_sheet_hash(sheet)]
    if tampered:
        raise HTTPException(409, f"평가표 내용 해시가 일치하지 않습니다: {', '.join(tampered)}")
    snapshot = {
        "policy_version": CURRENT_POLICY,
        "criteria_version": version,
        "chair_id": summary["chair_id"],
        "confirm_method": SIGN_METHOD,
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
        signature_image=canonical_signature(signature),
        signature_sha256=hashlib.sha256(signature).hexdigest(),
        sign_method=SIGN_METHOD,
        signer_name=next(
            (c["name"] for c in draw.candidate_snapshot if c["id"] == actor_id), actor_id
        ),
    )
    db.add(confirmation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "동시 확정 요청이 먼저 처리되었습니다.") from None
    db.refresh(confirmation)
    return confirmation
