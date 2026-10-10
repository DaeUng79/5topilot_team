"""결과 리포트 데이터. 저장하지 않고 확정 스냅샷에서 매번 다시 만든다(RES-03).

문서 revision 참조 필드는 DaeUng79의 문서 계약(document_id, source_revision)을 그대로 담을 자리이며
문서 모듈 연결 전까지 비어 있다. HWP·Word 파일 생성은 범위 밖이고 화면 인쇄와 JSON 내려받기까지
제공한다.
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions
from app.modules.evaluations.models import ScoreSheet
from app.modules.evaluations.service import verify_sheet_hash
from app.modules.projects.models import Project
from app.modules.results.policies import POLICIES
from app.modules.results.service import canonical_hash
from app.modules.results.state import get_confirmation


def _vendor_totals(sheet: ScoreSheet, vendor_ids: list[str]) -> dict[str, float]:
    return {
        vendor: float(
            sum(
                (Decimal(str(s["score"])) for s in sheet.scores if s["vendor_id"] == vendor),
                Decimal(0),
            )
        )
        for vendor in vendor_ids
    }


def build_report(db: Session, project: Project) -> dict:
    confirmation = get_confirmation(db, project.id)
    if confirmation is None:
        raise HTTPException(409, "위원장이 결과를 확정한 뒤에 리포트를 만들 수 있습니다.")
    snapshot = confirmation.result_snapshot
    draw = permissions.current_draw(db, project.id)
    names = {c["id"]: c["name"] for c in draw.candidate_snapshot} if draw else {}
    current = {
        sheet.evaluator_id: sheet
        for sheet in db.scalars(
            select(ScoreSheet).where(
                ScoreSheet.project_id == project.id,
                ScoreSheet.evaluator_id.in_([s["evaluator_id"] for s in snapshot["sheets"]]),
            )
        ).all()
    }
    sheets = []
    for sealed in snapshot["sheets"]:
        sheet = current.get(sealed["evaluator_id"])
        if sheet is None:
            integrity = "missing"
        elif sheet.sheet_hash == sealed["sheet_hash"] and verify_sheet_hash(sheet):
            integrity = "intact"
        else:
            integrity = "mismatch"
        sheets.append(
            {
                **sealed,
                "name": names.get(sealed["evaluator_id"], sealed["evaluator_id"]),
                "integrity": integrity,
                "vendor_totals": _vendor_totals(sheet, snapshot["vendor_ids"]) if sheet else {},
                "opinion": sheet.opinion if sheet else "",
            }
        )
    snapshot_intact = canonical_hash(snapshot) == confirmation.result_sha256
    notices = [
        POLICIES[snapshot["policy_version"]].description,
        "서명은 본인 확인 문구 동의와 평가표 내용 해시 기록이며 법적 전자서명이 아닙니다.",
        "가격점수·최종 순위 산식은 정책 승인 전입니다. 표시 순위는 기술 평균 기준입니다.",
        "문서 revision 참조는 문서 모듈(DaeUng79) 연결 뒤 채워집니다.",
    ]
    if not snapshot_intact:
        notices.insert(0, "확정 스냅샷 해시가 저장된 값과 다릅니다. 저장소 변조 여부를 확인하세요.")
    if any(s["integrity"] != "intact" for s in sheets):
        notices.insert(
            0, "확정 이후 변경된 평가표가 있습니다. 결과를 신뢰하기 전에 원인을 확인하세요."
        )
    return {
        "project": {"id": project.id, "name": project.name, "department": project.department},
        "confirmation": confirmation,
        "generated_at": datetime.now(UTC).isoformat(),
        "policy_version": snapshot["policy_version"],
        "criteria_version": snapshot["criteria_version"],
        "criteria": snapshot["criteria"],
        "vendor_ids": snapshot["vendor_ids"],
        "averages": snapshot["averages"],
        "rankings": snapshot["rankings"],
        "sheets": sheets,
        "document_revisions": [],
        "snapshot_intact": snapshot_intact,
        "notices": notices,
    }


def close_project(db: Session, project: Project, actor_id: str):
    confirmation = get_confirmation(db, project.id)
    if confirmation is None:
        raise HTTPException(409, "위원장이 결과를 확정한 뒤에 사업을 완료할 수 있습니다.")
    if confirmation.status == "closed":
        raise HTTPException(409, "이미 완료·보관된 사업입니다.")
    report = build_report(db, project)
    if not report["snapshot_intact"] or any(s["integrity"] != "intact" for s in report["sheets"]):
        raise HTTPException(409, "확정 결과 또는 평가표 증빙이 일치하지 않아 완료할 수 없습니다.")
    confirmation.status = "closed"
    confirmation.closed_by = actor_id
    confirmation.closed_at = datetime.now(UTC).isoformat()
    db.commit()
    db.refresh(confirmation)
    return confirmation
