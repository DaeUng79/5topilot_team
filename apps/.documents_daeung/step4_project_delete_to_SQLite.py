"""삭제 사업 요약을 projects_delete.sqlite3에 보관하고 원본 자료를 정리한다."""

from __future__ import annotations

import argparse
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from .step2_hwpx_save_to_SQLite import ProjectError
except ImportError:
    from step2_hwpx_save_to_SQLite import ProjectError


ARCHIVE_SCHEMA = """
CREATE TABLE IF NOT EXISTS deleted.deleted_projects (
    project_id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    org TEXT NOT NULL,
    dept TEXT NOT NULL,
    position TEXT NOT NULL,
    owner TEXT NOT NULL,
    telephone TEXT NOT NULL,
    email TEXT NOT NULL,
    evaluation_date TEXT NOT NULL,
    project_status TEXT NOT NULL,
    project_created_at TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    business_related_status_json TEXT NOT NULL,
    background_and_need_json TEXT NOT NULL,
    scope_main_tasks_json TEXT NOT NULL,
    deletion_reason TEXT NOT NULL
);
"""
BUSINESS_CATEGORIES = (
    "current_status",
    "background_and_need",
    "scope",
)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM main.sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _business_summary(connection: sqlite3.Connection, document_id: str) -> dict[str, list[dict]]:
    summary: dict[str, list[dict]] = {category: [] for category in BUSINESS_CATEGORIES}
    if not _table_exists(connection, "requirement_results"):
        return summary

    revision_row = connection.execute(
        "SELECT active_revision FROM documents WHERE document_id=?", (document_id,)
    ).fetchone()
    if revision_row is None:
        raise sqlite3.IntegrityError("사업 문서 연결이 유효하지 않습니다.")
    revision = revision_row["active_revision"]
    result_row = connection.execute(
        "SELECT result_json FROM requirement_results "
        "WHERE document_id=? AND source_revision=? "
        "ORDER BY created_at DESC LIMIT 1",
        (document_id, revision),
    ).fetchone()
    if result_row is None:
        return summary

    snapshot_row = connection.execute(
        "SELECT document_json FROM parse_snapshots WHERE document_id=? AND revision=?",
        (document_id, revision),
    ).fetchone()
    if snapshot_row is None:
        raise sqlite3.IntegrityError("요구사항 결과의 원본 파싱 자료를 찾을 수 없습니다.")

    result = json.loads(result_row["result_json"])
    document = json.loads(snapshot_row["document_json"])
    page_map = {}
    for block in document.get("blocks", []):
        pages = block.get("physical_page_numbers") or [block.get("physical_page_number")]
        page_map[block["block_id"]] = sorted({
            page for page in pages if isinstance(page, int) and page > 0
        })

    business_status = result.get("business_status") or {}
    for category in BUSINESS_CATEGORIES:
        for point in business_status.get(category, []):
            pages = sorted({
                page
                for block_id in point.get("source_block_ids", [])
                for page in page_map.get(block_id, [])
            })
            summary[category].append({"text": point["text"], "pages": pages})
    return summary


def _project_record(connection: sqlite3.Connection, project_id: str) -> sqlite3.Row:
    row = connection.execute(
        """SELECT p.project_id, p.name, p.created_at,
        COALESCE(m.org, '') AS org, COALESCE(m.dept, '') AS dept,
        COALESCE(m.pos, '') AS position, COALESCE(m.owner, '') AS owner,
        COALESCE(m.tel, '') AS telephone, COALESCE(m.mail, '') AS email,
        COALESCE(m.date, '') AS evaluation_date,
        COALESCE(m.status, '준비') AS project_status,
        m.deleted_at, m.deletion_reason
        FROM projects p LEFT JOIN project_profiles m ON m.project_id=p.project_id
        WHERE p.project_id=?""",
        (project_id,),
    ).fetchone()
    if row is None:
        raise ProjectError("사업을 찾을 수 없습니다.", 404)
    return row


def _delete_document_records(connection: sqlite3.Connection, document_id: str) -> None:
    document = connection.execute(
        "SELECT source_sha256 FROM documents WHERE document_id=?", (document_id,)
    ).fetchone()
    if document is None:
        return

    image_hashes = [
        row["sha256"]
        for row in connection.execute(
            "SELECT DISTINCT sha256 FROM snapshot_assets WHERE document_id=?", (document_id,)
        )
    ]
    for table in ("criteria_results", "requirement_results"):
        if _table_exists(connection, table):
            connection.execute(f"DELETE FROM {table} WHERE document_id=?", (document_id,))

    connection.execute("DELETE FROM project_documents WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM project_rfp_uploads WHERE document_id=?", (document_id,))
    for table in ("criteria_jobs", "requirement_jobs"):
        if _table_exists(connection, table):
            connection.execute(f"DELETE FROM {table} WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM table_cells WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM blocks WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM pages WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM snapshot_assets WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM parse_snapshots WHERE document_id=?", (document_id,))
    connection.execute("DELETE FROM documents WHERE document_id=?", (document_id,))

    for image_hash in image_hashes:
        connection.execute(
            "DELETE FROM assets WHERE sha256=? AND NOT EXISTS "
            "(SELECT 1 FROM snapshot_assets WHERE snapshot_assets.sha256=?)",
            (image_hash, image_hash),
        )
    source_sha = document["source_sha256"]
    connection.execute(
        "DELETE FROM source_files WHERE sha256=? AND NOT EXISTS "
        "(SELECT 1 FROM documents WHERE documents.source_sha256=?)",
        (source_sha, source_sha),
    )


def _archive_and_delete(
    db_path: str | Path,
    project_id: str,
    reason: str,
    archive_path: str | Path | None,
    *,
    allow_previously_deleted: bool = False,
) -> None:
    source = Path(db_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"SQLite 파일을 찾지 못했습니다: {source}")
    archive = Path(archive_path).resolve() if archive_path else source.with_name(
        "projects_delete.sqlite3"
    )
    if source == archive:
        raise ValueError("보관 DB와 원본 DB 경로는 달라야 합니다.")
    archive.parent.mkdir(parents=True, exist_ok=True)

    with closing(sqlite3.connect(source, timeout=30)) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("ATTACH DATABASE ? AS deleted", (str(archive),))
        source_mode = connection.execute("PRAGMA main.journal_mode").fetchone()[0].lower()
        archive_mode = connection.execute("PRAGMA deleted.journal_mode").fetchone()[0].lower()
        if source_mode != "delete" or archive_mode != "delete":
            raise ProjectError(
                "보관 DB와 원본 DB는 안전한 삭제 처리를 위해 DELETE journal 모드여야 합니다.",
                503,
            )

        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute(ARCHIVE_SCHEMA)
            project = _project_record(connection, project_id)
            was_deleted = project["deleted_at"] is not None
            if was_deleted and not allow_previously_deleted:
                raise ProjectError("이미 삭제된 사업입니다.", 409)
            if not was_deleted and project["project_status"] != "준비":
                raise ProjectError("평가가 시작된 사업은 삭제할 수 없습니다.", 409)

            stored_reason = project["deletion_reason"] if was_deleted else reason
            if not isinstance(stored_reason, str) or not stored_reason.strip() or len(stored_reason) > 1000:
                raise ProjectError("삭제 사유를 1~1,000자로 입력해 주세요.")

            uploads = connection.execute(
                "SELECT document_id FROM project_rfp_uploads "
                "WHERE project_id=? ORDER BY uploaded_at DESC, revision DESC",
                (project_id,),
            ).fetchall()
            document_ids = {
                row["document_id"]
                for row in connection.execute(
                    "SELECT document_id FROM project_documents WHERE project_id=?",
                    (project_id,),
                )
            }
            document_ids.update(row["document_id"] for row in uploads)
            business = (
                _business_summary(connection, uploads[0]["document_id"])
                if uploads else {category: [] for category in BUSINESS_CATEGORIES}
            )
            deleted_at = project["deleted_at"] or datetime.now(timezone.utc).isoformat()
            connection.execute(
                """INSERT INTO deleted.deleted_projects (
                    project_id, project_name, org, dept, position, owner, telephone,
                    email, evaluation_date, project_status, project_created_at, deleted_at,
                    business_related_status_json, background_and_need_json,
                    scope_main_tasks_json, deletion_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    project["project_id"], project["name"], project["org"], project["dept"],
                    project["position"], project["owner"], project["telephone"],
                    project["email"], project["evaluation_date"], project["project_status"],
                    project["created_at"], deleted_at,
                    _json(business["current_status"]),
                    _json(business["background_and_need"]),
                    _json(business["scope"]),
                    stored_reason.strip(),
                ),
            )

            connection.execute("DELETE FROM criteria_jobs WHERE project_id=?", (project_id,))
            connection.execute("DELETE FROM requirement_jobs WHERE project_id=?", (project_id,))
            connection.execute("DELETE FROM project_rfp_uploads WHERE project_id=?", (project_id,))
            connection.execute("DELETE FROM project_documents WHERE project_id=?", (project_id,))
            connection.execute("DELETE FROM project_profiles WHERE project_id=?", (project_id,))
            connection.execute("DELETE FROM projects WHERE project_id=?", (project_id,))

            for document_id in document_ids:
                linked = connection.execute(
                    "SELECT 1 FROM project_documents WHERE document_id=? "
                    "UNION ALL SELECT 1 FROM project_rfp_uploads WHERE document_id=? LIMIT 1",
                    (document_id, document_id),
                ).fetchone()
                if linked is None:
                    _delete_document_records(connection, document_id)
            connection.commit()
        except Exception:
            connection.rollback()
            raise


def delete_project(
    db_path: str | Path,
    project_id: str,
    payload: Any,
    archive_path: str | Path | None = None,
) -> dict[str, Any]:
    reason = payload.get("reason") if isinstance(payload, dict) else None
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        raise ProjectError("삭제 사유를 1~1,000자로 입력해 주세요.")
    _archive_and_delete(db_path, project_id, reason.strip(), archive_path)
    return {"id": project_id, "deleted": True, "archived": True}


def migrate_soft_deleted_projects(
    db_path: str | Path, archive_path: str | Path | None = None
) -> int:
    """기존 논리 삭제 사업을 보관 DB로 이관하고 원본 자료를 정리한다."""
    with closing(sqlite3.connect(db_path, timeout=30)) as connection:
        rows = connection.execute(
            "SELECT project_id, deletion_reason FROM project_profiles "
            "WHERE deleted_at IS NOT NULL ORDER BY deleted_at, project_id"
        ).fetchall()
    for project_id, reason in rows:
        _archive_and_delete(
            db_path, project_id, reason, archive_path, allow_previously_deleted=True
        )
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path, help="현재 사업 DB 경로")
    parser.add_argument("--archive-database", type=Path, help="보관 DB 경로")
    args = parser.parse_args()
    try:
        migrated = migrate_soft_deleted_projects(args.database, args.archive_database)
    except (OSError, sqlite3.Error, ProjectError, ValueError) as error:
        parser.exit(1, f"삭제 사업 이관 실패: {error}\n")
    print(json.dumps({"migrated_projects": migrated}, ensure_ascii=False))


if __name__ == "__main__":
    main()
