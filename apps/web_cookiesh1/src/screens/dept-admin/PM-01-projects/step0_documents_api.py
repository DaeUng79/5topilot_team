"""PM-01 문서 API와 EV-03 읽기 전용 제안요청서 API를 제공하는 서버.

실행: .venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step0_documents_api.py
Vite의 /document-api 및 /rfp-api 프록시를 통해 호출하도록 127.0.0.1에 바인딩한다.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import tempfile
import traceback
import unicodedata
import zipfile
from collections import Counter
from threading import RLock
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

try:
    from . import step2_hwpx_save_to_SQLite as project_store
    from . import step4_project_delete_to_SQLite as project_deletion
    from .step1_hwpx_parse_to_JSON import parse_hwpx
    from .step2_hwpx_save_to_SQLite import SCHEMA, save_to_sqlite
    from .step3_ai_requirements_extract_to_SQLite import (
        RequirementsError, extract_and_save_requirements, group_detail_items,
        load_saved_requirements, read_source,
    )
    from .step4_ai_criteria import CriteriaError, extract_and_save_criteria, load_saved_criteria
except ImportError:
    import step2_hwpx_save_to_SQLite as project_store
    import step4_project_delete_to_SQLite as project_deletion
    from step1_hwpx_parse_to_JSON import parse_hwpx
    from step2_hwpx_save_to_SQLite import SCHEMA, save_to_sqlite
    from step3_ai_requirements_extract_to_SQLite import (
        RequirementsError, extract_and_save_requirements, group_detail_items,
        load_saved_requirements, read_source,
    )
    from step4_ai_criteria import CriteriaError, extract_and_save_criteria, load_saved_criteria


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR.parents[3] / "src/screens/dept-admin/projects.sqlite3"
RFP_API_PREFIX = "/rfp-api"
RFP_TOC_ROW = re.compile(r"^(?P<title>.+?)[\s\t.·…]*\t\s*(?P<page>\d+)\s*$")
RFP_ROMAN = re.compile(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*\S")
RFP_NUMBERED = re.compile(r"^(\d+)\.\s*\S")
RFP_LEADING_MARK = re.compile(r"^(?:\[[^\]]*\]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*|\d+[.)]|[가-힣]\.)\s*")
RFP_SENTENCE_END = re.compile(r"(다|함|음)\.?$")
MAX_FILE_SIZE = 50 * 1024 * 1024
MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024
PROJECT_PATH = re.compile(r"^/document-api/projects/([A-Za-z0-9_-]{1,100})/(rfp|requirements|criteria)$")
PROJECT_ITEM_PATH = re.compile(r"^/document-api/projects/([A-Za-z0-9_-]{1,100})(?:/(source|download))?$")
PROJECT_MUTATION_LOCK = RLock()
EXTRACTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rfp-requirements")

UPLOAD_SCHEMA = """
CREATE TABLE IF NOT EXISTS project_rfp_uploads (
    project_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(document_id),
    filename TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    block_count INTEGER NOT NULL,
    warning_count INTEGER NOT NULL,
    PRIMARY KEY (project_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_project_rfp_latest
    ON project_rfp_uploads(project_id, revision DESC);
CREATE TABLE IF NOT EXISTS requirement_jobs (
    project_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    document_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, revision),
    FOREIGN KEY (project_id, revision)
        REFERENCES project_rfp_uploads(project_id, revision)
);
CREATE TABLE IF NOT EXISTS criteria_jobs (
    project_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    document_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, revision),
    FOREIGN KEY (project_id, revision)
        REFERENCES project_rfp_uploads(project_id, revision)
);
"""


def initialize_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with project_store.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA + UPLOAD_SCHEMA + project_store.PROJECT_SCHEMA)
        for table in ("requirement_jobs", "criteria_jobs"):
            connection.execute(
                f"UPDATE {table} SET status='failed', "
                "error='서버가 다시 시작되었습니다. 다시 시도해 주세요.', updated_at=? "
                "WHERE status IN ('queued', 'running')",
                (datetime.now(timezone.utc).isoformat(),),
            )


def ensure_database(db_path: Path) -> None:
    if db_path.is_file():
        return
    with PROJECT_MUTATION_LOCK:
        if not db_path.is_file():
            initialize_database(db_path)


def latest_rfp(db_path: Path, project_id: str) -> dict | None:
    if not db_path.exists():
        return None
    with project_store.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(UPLOAD_SCHEMA)
        row = connection.execute(
            "SELECT revision, document_id, filename, byte_size, uploaded_at, "
            "page_count, block_count, warning_count FROM project_rfp_uploads "
            "WHERE project_id=? ORDER BY revision DESC LIMIT 1", (project_id,)
        ).fetchone()
    if row is None:
        return None
    revision, document_id, filename, size, uploaded_at, pages, blocks, warnings = row
    return {
        "id": document_id, "project_id": project_id, "kind": "rfp",
        "vendor_id": None, "filename": filename, "size": size,
        "revision": revision, "sha256": document_id, "uploaded_at": uploaded_at,
        "job": {"id": f"rfp-{project_id}-{revision}", "status": "done",
                "error": None, "updated_at": uploaded_at},
        "parse": {"pages": pages, "blocks": blocks, "warnings": warnings},
    }


def save_upload(db_path: Path, project_id: str, project_name: str, filename: str, data: bytes) -> dict:
    # 임시 파일은 파싱과 SQLite 저장이 끝난 뒤 삭제한다. 원본은 source_files BLOB에 남는다.
    with tempfile.TemporaryDirectory(prefix="rfp-upload-") as temporary:
        temp_root = Path(temporary)
        source = temp_root / filename
        source.write_bytes(data)
        parsed = parse_hwpx(source, output_dir=temp_root / "assets", strict_pagination=False)
        saved = save_to_sqlite(parsed, db_path, source_path=source,
                               project_id=project_id, project_name=project_name)

    uploaded_at = datetime.now(timezone.utc).isoformat()
    with project_store.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(UPLOAD_SCHEMA)
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            revision = connection.execute(
                "SELECT COALESCE(MAX(revision), 0) + 1 FROM project_rfp_uploads WHERE project_id=?",
                (project_id,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO project_rfp_uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (project_id, revision, saved["document_id"], filename, len(data), uploaded_at,
                 saved["pages"], saved["blocks"], len(parsed.get("warnings", []))),
            )
    return latest_rfp(db_path, project_id)


def _set_requirement_job(db_path: Path, project_id: str, revision: int,
                         status: str, error: str | None = None) -> None:
    with project_store.connect(db_path) as connection:
        connection.execute(
            "UPDATE requirement_jobs SET status=?, error=?, updated_at=? "
            "WHERE project_id=? AND revision=?",
            (status, error, datetime.now(timezone.utc).isoformat(), project_id, revision),
        )


def _extract_requirements(db_path: Path, project_id: str, revision: int, document_id: str) -> None:
    try:
        _set_requirement_job(db_path, project_id, revision, "running")
        extract_and_save_requirements(db_path, document_id)
        _set_requirement_job(db_path, project_id, revision, "done")
    except RequirementsError as error:
        _set_requirement_job(db_path, project_id, revision, "failed", str(error))
    except Exception:
        traceback.print_exc()
        _set_requirement_job(db_path, project_id, revision, "failed", "요구사항 추출에 실패했습니다. 서버 로그를 확인해 주세요.")


def queue_requirements(db_path: Path, project_id: str, revision: int,
                       document_id: str) -> dict:
    with project_store.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT status FROM requirement_jobs WHERE project_id=? AND revision=?",
            (project_id, revision),
        ).fetchone()
        if existing and existing[0] in {"queued", "running", "done"}:
            return requirement_status(db_path, project_id)
        connection.execute(
            "INSERT INTO requirement_jobs VALUES (?, ?, ?, 'queued', NULL, ?) "
            "ON CONFLICT(project_id, revision) DO UPDATE SET "
            "status='queued', error=NULL, updated_at=excluded.updated_at",
            (project_id, revision, document_id, datetime.now(timezone.utc).isoformat()),
        )
    EXTRACTOR.submit(_extract_requirements, db_path, project_id, revision, document_id)
    return {"status": "queued", "revision": revision, "error": None, "result": None}


def _display_blocks(blocks: list[dict]) -> list[dict]:
    included = {block["block_id"] for block in blocks}
    visible = []
    for block in blocks:
        if block.get("parent_block_id") in included:
            continue
        pages = block.get("physical_page_numbers") or [block.get("physical_page_number")]
        item = {"id": block["block_id"], "type": block["type"],
                "pages": sorted({page for page in pages if isinstance(page, int) and page > 0})}
        if block["type"] == "paragraph":
            item["text"] = block.get("text", "")
        elif block["type"] == "table":
            item["rows"] = [[{"text": cell.get("text", ""),
                              "row_span": cell.get("row_span", 1),
                              "col_span": cell.get("col_span", 1)}
                             for cell in row] for row in block.get("table", {}).get("cells", [])]
        else:
            continue
        visible.append(item)
    return visible


def _requirements_view(db_path: Path, document_id: str, result: dict) -> dict:
    document = read_source(db_path, document_id)
    source = {block["block_id"]: block for block in document["blocks"]}
    business = {}
    for category, points in result["business_status"].items():
        business[category] = []
        for point in points:
            pages = {page for block_id in point["source_block_ids"]
                     for page in (source.get(block_id, {}).get("physical_page_numbers")
                                  or [source.get(block_id, {}).get("physical_page_number")])
                     if isinstance(page, int) and page > 0}
            business[category].append({"text": point["text"], "pages": sorted(pages)})
    groups = group_detail_items(document, result["details"])
    return {
        "status": result["status"], "created_at": result["created_at"],
        "warnings": result["warnings"], "business_status": business,
        "requirement_list": _display_blocks(result["requirement_list"]["blocks"]),
        "details": [{"label": item["label"], "codes": item["codes"],
                     "pages": item["pages"], "blocks": _display_blocks(item["blocks"])}
                    for item in groups],
    }


def requirement_status(db_path: Path, project_id: str) -> dict:
    latest = latest_rfp(db_path, project_id)
    if latest is None:
        return {"status": "none", "revision": None, "error": None, "result": None}
    with project_store.connect(db_path) as connection:
        row = connection.execute(
            "SELECT status, error FROM requirement_jobs WHERE project_id=? AND revision=?",
            (project_id, latest["revision"]),
        ).fetchone()
    if row is None:
        return {"status": "none", "revision": latest["revision"], "error": None, "result": None}
    status, error = row
    result = None
    if status == "done":
        saved = load_saved_requirements(db_path, latest["id"])
        if saved is None:
            raise RequirementsError("저장된 요구사항 결과를 찾을 수 없습니다.")
        result = _requirements_view(db_path, latest["id"], saved)
    return {"status": status, "revision": latest["revision"], "error": error, "result": result}


def _set_criteria_job(db_path: Path, project_id: str, revision: int,
                      status: str, error: str | None = None) -> None:
    with project_store.connect(db_path) as connection:
        connection.execute(
            "UPDATE criteria_jobs SET status=?, error=?, updated_at=? "
            "WHERE project_id=? AND revision=?",
            (status, error, datetime.now(timezone.utc).isoformat(), project_id, revision),
        )


def _generate_criteria(db_path: Path, project_id: str, revision: int, document_id: str) -> None:
    try:
        _set_criteria_job(db_path, project_id, revision, "running")
        extract_and_save_criteria(document_id, db_path=db_path)
        _set_criteria_job(db_path, project_id, revision, "done")
    except (CriteriaError, RequirementsError) as error:
        _set_criteria_job(db_path, project_id, revision, "failed", str(error))
    except Exception:
        traceback.print_exc()
        _set_criteria_job(db_path, project_id, revision, "failed", "평가기준 생성에 실패했습니다. 서버 로그를 확인해 주세요.")


def queue_criteria(db_path: Path, project_id: str, revision: int,
                   document_id: str) -> dict:
    if load_saved_requirements(db_path, document_id) is None:
        raise CriteriaError("제안 요구사항 추출이 끝난 뒤 평가기준을 생성할 수 있습니다.")
    with project_store.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        existing = connection.execute(
            "SELECT status FROM criteria_jobs WHERE project_id=? AND revision=?",
            (project_id, revision),
        ).fetchone()
        if existing and existing[0] in {"queued", "running", "done"}:
            return criteria_status(db_path, project_id)
        connection.execute(
            "INSERT INTO criteria_jobs VALUES (?, ?, ?, 'queued', NULL, ?) "
            "ON CONFLICT(project_id, revision) DO UPDATE SET "
            "status='queued', error=NULL, updated_at=excluded.updated_at",
            (project_id, revision, document_id, datetime.now(timezone.utc).isoformat()),
        )
    EXTRACTOR.submit(_generate_criteria, db_path, project_id, revision, document_id)
    return {"status": "queued", "revision": revision, "requirements_ready": True,
            "error": None, "result": None}


def criteria_status(db_path: Path, project_id: str) -> dict:
    latest = latest_rfp(db_path, project_id)
    if latest is None:
        return {"status": "none", "revision": None, "requirements_ready": False,
                "error": None, "result": None}
    requirements_ready = load_saved_requirements(db_path, latest["id"]) is not None
    with project_store.connect(db_path) as connection:
        row = connection.execute(
            "SELECT status, error FROM criteria_jobs WHERE project_id=? AND revision=?",
            (project_id, latest["revision"]),
        ).fetchone()
    status, error = row if row else ("none", None)
    saved = load_saved_criteria(db_path, latest["id"]) if requirements_ready and status in {"none", "done"} else None
    if saved is not None:
        status = "done"
    elif status == "done":
        raise CriteriaError("저장된 평가기준 결과를 찾을 수 없습니다.")
    result = None
    if saved is not None:
        result = {key: saved[key] for key in (
            "created_at", "template_source", "reference_filename", "total_score",
            "rows", "selection_rationale", "supplemental_items", "guideline_url",
        )}
    return {"status": status, "revision": latest["revision"],
            "requirements_ready": requirements_ready, "error": error, "result": result}


class RfpNotFound(Exception):
    pass


def _rfp_connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def _rfp_norm(text: str | None) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"[\s\W_]+", "", text)


def _rfp_title_key(title: str) -> str:
    return _rfp_norm(RFP_LEADING_MARK.sub("", title.strip(), count=1))


def _rfp_latest_document(conn: sqlite3.Connection, project_id: str) -> sqlite3.Row:
    row = conn.execute(
        """SELECT p.project_id, p.name, u.document_id, u.filename, u.page_count,
                  d.active_revision AS revision
             FROM projects p
             JOIN project_rfp_uploads u ON u.project_id = p.project_id
             JOIN documents d ON d.document_id = u.document_id
            WHERE p.project_id = ?
            ORDER BY u.revision DESC LIMIT 1""",
        (project_id,),
    ).fetchone()
    if row is None:
        raise RfpNotFound("이 사업에는 제안요청서가 없습니다.")
    return row


def _rfp_list_projects(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT p.project_id, p.name, u.filename, u.page_count
             FROM projects p
             JOIN project_rfp_uploads u ON u.project_id = p.project_id
            WHERE u.revision = (SELECT MAX(revision) FROM project_rfp_uploads
                                 WHERE project_id = p.project_id)
              AND COALESCE((SELECT deleted_at FROM project_profiles
                             WHERE project_id = p.project_id), '') = ''
            ORDER BY p.created_at"""
    ).fetchall()
    return [dict(row) for row in rows]


def _rfp_page_table(conn: sqlite3.Connection, doc_id: str, revision: str) -> dict[int, int | None]:
    return {
        row["physical_page_number"]: row["page_number"]
        for row in conn.execute(
            "SELECT physical_page_number, page_number FROM pages WHERE document_id=? AND revision=?",
            (doc_id, revision),
        )
    }


def _rfp_paragraph_rows(
    conn: sqlite3.Connection, doc_id: str, revision: str,
) -> list[tuple[int, str, list[int], bool]]:
    rows = conn.execute(
        """SELECT order_index, text, physical_page_numbers_json, parent_cell_id
             FROM blocks WHERE document_id=? AND revision=? AND type='paragraph'
            ORDER BY order_index""",
        (doc_id, revision),
    ).fetchall()
    return [
        (row["order_index"], (row["text"] or "").strip(),
         json.loads(row["physical_page_numbers_json"]), row["parent_cell_id"] is None)
        for row in rows if (row["text"] or "").strip()
    ]


def _rfp_printed_toc(
    paragraphs: list[tuple[int, str, list[int], bool]],
) -> tuple[list[dict], set[int]]:
    start = next(
        (index for index, (_, text, _, top) in enumerate(paragraphs)
         if top and re.sub(r"\s", "", text) == "목차"),
        None,
    )
    if start is None:
        return [], set()
    entries, pages = [], set(paragraphs[start][2])
    for _, text, physical_pages, _ in paragraphs[start + 1:]:
        match = RFP_TOC_ROW.match(text)
        if not match:
            if entries:
                break
            continue
        title = match["title"].strip()
        level = 1 if (RFP_NUMBERED.match(title) or RFP_ROMAN.match(title)) else 2
        entries.append({"t": title, "printed": int(match["page"]), "lv": level})
        pages.update(physical_pages)
    return entries, pages


def _rfp_locate_printed(entries: list[dict], page_table: dict[int, int | None],
                        paragraphs: list[tuple[int, str, list[int], bool]],
                        toc_pages: set[int]) -> list[dict]:
    texts: dict[int, str] = {}
    for _, text, physical_pages, _ in paragraphs:
        for page_number in physical_pages:
            texts[page_number] = texts.get(page_number, "") + _rfp_norm(text)
    after = [
        (physical, printed) for physical, printed in page_table.items()
        if printed is not None and physical not in toc_pages
        and physical > max(toc_pages, default=0)
    ]
    offsets = Counter(physical - printed for physical, printed in after)
    offset = offsets.most_common(1)[0][0] if offsets else None
    output, previous = [], 0
    for entry in entries:
        key = _rfp_title_key(entry["t"])
        candidates = {
            physical for physical, printed in page_table.items()
            if printed == entry["printed"] and physical not in toc_pages
        }
        expected = entry["printed"] + offset if offset is not None else None
        if expected in page_table:
            candidates.add(expected)
        hits = sorted(page for page in candidates if key and key in texts.get(page, ""))
        item = {
            "t": entry["t"], "lv": entry["lv"], "printed": entry["printed"],
            "page": None, "seen": False,
        }
        if len(hits) == 1:
            item.update(page=hits[0], seen=True)
        elif key and expected is not None:
            nearby = [
                page for page in range(max(previous, expected - 1, 1), expected + 5)
                if page in page_table and page not in toc_pages
                and key in texts.get(page, "")
            ]
            if len(nearby) == 1:
                item.update(page=nearby[0], seen=True, adjusted=True)
        previous = item["page"] or previous
        output.append(item)
    return output


def _rfp_heading_toc(
    paragraphs: list[tuple[int, str, list[int], bool]],
    page_table: dict[int, int | None],
) -> list[dict]:
    output, last_number = [], 0
    for _, text, physical_pages, top in paragraphs:
        if not top or len(text) > 40:
            continue
        level = 0
        if RFP_ROMAN.match(text):
            level, last_number = 1, 0
        else:
            match = RFP_NUMBERED.match(text)
            if (match and not RFP_SENTENCE_END.search(text)
                    and int(match[1]) == last_number + 1 and output):
                level, last_number = 2, int(match[1])
        if level:
            clean = len(physical_pages) == 1 and page_table.get(physical_pages[0]) is not None
            output.append({
                "t": text, "lv": level, "page": physical_pages[0], "seen": clean,
                "printed": page_table.get(physical_pages[0]),
            })
    return output


def rfp_overview(conn: sqlite3.Connection, project_id: str) -> dict:
    doc = _rfp_latest_document(conn, project_id)
    doc_id, revision = doc["document_id"], doc["revision"]
    page_table = _rfp_page_table(conn, doc_id, revision)
    paragraphs = _rfp_paragraph_rows(conn, doc_id, revision)
    entries, toc_pages = _rfp_printed_toc(paragraphs)
    toc = (_rfp_locate_printed(entries, page_table, paragraphs, toc_pages)
           if entries else _rfp_heading_toc(paragraphs, page_table))
    cover = next((text for _, text, _, top in paragraphs if top), "")
    source_sha = _rfp_source_sha(conn, doc_id)
    has_source = conn.execute(
        "SELECT 1 FROM source_files WHERE sha256=?", (source_sha,),
    ).fetchone() is not None
    return {
        "project": {"id": doc["project_id"], "name": doc["name"]},
        "document": {
            "id": doc_id, "filename": doc["filename"],
            "title": doc["name"] + " 제안요청서", "cover": cover,
            "page_count": len(page_table), "has_source": has_source,
            "source_version": source_sha,
        },
        "pages": [{"n": number, "label": page_table[number]} for number in sorted(page_table)],
        "toc": toc,
    }


def _rfp_source_sha(conn: sqlite3.Connection, doc_id: str) -> str | None:
    row = conn.execute(
        "SELECT source_sha256 FROM documents WHERE document_id=?", (doc_id,),
    ).fetchone()
    return row["source_sha256"] if row else None


def _rfp_table_rows(
    conn: sqlite3.Connection, doc_id: str, revision: str, block_id: str,
) -> list[list[dict]]:
    rows: dict[int, list[dict]] = {}
    for cell in conn.execute(
        """SELECT row_index, col_index, row_span, col_span, text FROM table_cells
            WHERE document_id=? AND revision=? AND block_id=?
            ORDER BY row_index, col_index""",
        (doc_id, revision, block_id),
    ):
        rows.setdefault(cell["row_index"], []).append({
            "text": cell["text"], "rs": cell["row_span"], "cs": cell["col_span"],
        })
    return [rows[key] for key in sorted(rows)]


def rfp_page(conn: sqlite3.Connection, project_id: str, page_number: int) -> dict:
    doc = _rfp_latest_document(conn, project_id)
    doc_id, revision = doc["document_id"], doc["revision"]
    page = conn.execute(
        "SELECT page_number FROM pages WHERE document_id=? AND revision=? AND physical_page_number=?",
        (doc_id, revision, page_number),
    ).fetchone()
    if page is None:
        raise RfpNotFound("없는 쪽입니다.")
    blocks = []
    rows = conn.execute(
        """SELECT block_id, type, text, physical_page_numbers_json, block_json
             FROM blocks WHERE document_id=? AND revision=?
              AND parent_block_id IS NULL AND parent_cell_id IS NULL
              AND json_extract(physical_page_numbers_json, '$[0]') = ?
            ORDER BY order_index""",
        (doc_id, revision, page_number),
    ).fetchall()
    for row in rows:
        span = json.loads(row["physical_page_numbers_json"])
        item = {"id": row["block_id"], "type": row["type"], "continues": len(span) > 1}
        if row["type"] == "paragraph":
            if not (row["text"] or "").strip():
                continue
            item["text"] = row["text"]
        elif row["type"] == "table":
            item["rows"] = _rfp_table_rows(conn, doc_id, revision, row["block_id"])
        elif row["type"] == "image":
            image = json.loads(row["block_json"]).get("image") or {}
            if not image.get("asset_id"):
                continue
            item["src"] = f"{RFP_API_PREFIX}/assets/{image['asset_id']}"
        else:
            continue
        blocks.append(item)
    return {"n": page_number, "label": page["page_number"], "blocks": blocks}


def rfp_asset(conn: sqlite3.Connection, sha256: str) -> tuple[bytes, str]:
    row = conn.execute(
        """SELECT a.data, json_extract(s.metadata_json, '$.mime_type') AS mime
             FROM assets a LEFT JOIN snapshot_assets s ON s.sha256 = a.sha256
            WHERE a.sha256 = ? LIMIT 1""",
        (sha256,),
    ).fetchone()
    if row is None:
        raise RfpNotFound("그림을 찾을 수 없습니다.")
    mime = (row["mime"] or "application/octet-stream").replace("image/jpg", "image/jpeg")
    return bytes(row["data"]), mime


def rfp_source_file(conn: sqlite3.Connection, project_id: str) -> tuple[str, bytes]:
    doc = _rfp_latest_document(conn, project_id)
    source_sha = _rfp_source_sha(conn, doc["document_id"])
    row = conn.execute(
        "SELECT filename, data FROM source_files WHERE sha256=?", (source_sha,),
    ).fetchone()
    if row is None:
        raise RfpNotFound("원본 파일을 찾을 수 없습니다.")
    return row["filename"], bytes(row["data"])


def rfp_render_page_svg(conn: sqlite3.Connection, project_id: str, page_number: int) -> bytes:
    doc = _rfp_latest_document(conn, project_id)
    page = conn.execute(
        "SELECT 1 FROM pages WHERE document_id=? AND revision=? AND physical_page_number=?",
        (doc["document_id"], doc["revision"], page_number),
    ).fetchone()
    if page is None:
        raise RfpNotFound("없는 쪽입니다.")

    source_sha = _rfp_source_sha(conn, doc["document_id"])
    source = conn.execute(
        "SELECT data FROM source_files WHERE sha256=?", (source_sha,),
    ).fetchone()
    if source is None:
        raise RfpNotFound("원본 파일을 찾을 수 없습니다.")

    suffix = Path(doc["filename"]).suffix.lower()
    if suffix not in {".hwpx", ".hwp"}:
        raise ValueError("저장된 원본 파일 형식을 확인할 수 없습니다.")

    from pyhwpxlib.rhwp_bridge import RhwpEngine

    with tempfile.TemporaryDirectory(prefix="ev03_rfp_render_") as directory:
        path = Path(directory) / ("source" + suffix)
        path.write_bytes(bytes(source["data"]))
        renderer = RhwpEngine().load(str(path))
        try:
            if page_number > renderer.page_count:
                raise ValueError("파싱된 쪽번호와 원본 문서의 쪽 수가 일치하지 않습니다.")
            svg = renderer.render_page_svg(page_number - 1)
        finally:
            renderer.close()
    return svg.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    database = DATABASE
    ai_enabled = True

    def respond(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def respond_bytes(
        self, status: int, body: bytes, content_type: str,
        *, extra: dict[str, str] | None = None, cache_control: str = "no-store",
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _rfp_get(self, path: str) -> None:
        parts = unquote(path).strip("/").split("/")[1:]
        try:
            with _rfp_connect(self.database) as connection:
                if parts == ["projects"]:
                    self.respond(200, _rfp_list_projects(connection))
                    return
                if len(parts) == 3 and parts[0] == "projects" and parts[2] == "rfp":
                    self.respond(200, rfp_overview(connection, parts[1]))
                    return
                if (len(parts) == 5 and parts[0] == "projects"
                        and parts[2:4] == ["rfp", "pages"] and parts[4].isdigit()):
                    self.respond(200, rfp_page(connection, parts[1], int(parts[4])))
                    return
                if (len(parts) == 6 and parts[0] == "projects"
                        and parts[2:4] == ["rfp", "pages"] and parts[4].isdigit()
                        and parts[5] == "svg"):
                    svg = rfp_render_page_svg(connection, parts[1], int(parts[4]))
                    self.respond_bytes(200, svg, "image/svg+xml; charset=utf-8",
                                       cache_control="private, max-age=86400")
                    return
                if len(parts) == 4 and parts[0] == "projects" and parts[2:] == ["rfp", "source"]:
                    name, data = rfp_source_file(connection, parts[1])
                    self.respond_bytes(200, data, "application/octet-stream", extra={
                        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
                    })
                    return
                if (len(parts) == 2 and parts[0] == "assets"
                        and re.fullmatch(r"[0-9a-f]{64}", parts[1])):
                    data, mime = rfp_asset(connection, parts[1])
                    self.respond_bytes(200, data, mime)
                    return
        except RfpNotFound as error:
            self.respond(404, {"error": str(error)})
            return
        except ImportError:
            self.respond(503, {"error": "원본 쪽 SVG 렌더러를 사용할 수 없습니다. pyhwpxlib 설치를 확인해 주세요."})
            return
        except ValueError as error:
            self.respond(422, {"error": str(error)})
            return
        except (OSError, RuntimeError) as error:
            self.log_error("EV-03 원본 쪽 SVG 렌더링 실패: %s", error)
            self.respond(500, {"error": "원본 쪽을 SVG로 렌더링하지 못했습니다."})
            return
        except sqlite3.Error as error:
            self.log_error("EV-03 자료 조회 실패: %s", error)
            self.respond(500, {"error": "자료를 읽지 못했습니다."})
            return
        self.respond(404, {"error": "없는 주소입니다."})

    def route(self) -> tuple[str, str] | None:
        match = PROJECT_PATH.fullmatch(urlsplit(self.path).path)
        return (match.group(1), match.group(2)) if match else None

    def do_GET(self) -> None:
        try:
            path = urlsplit(self.path).path
            if path == RFP_API_PREFIX or path.startswith(RFP_API_PREFIX + "/"):
                self._rfp_get(path)
                return
            if path == '/document-api/health':
                self.respond(200, {'status': 'ok', 'ai_enabled': self.ai_enabled})
                return
            ensure_database(self.database)
            if path == '/document-api/projects':
                self.respond(200, {'items': project_store.list_projects(self.database)})
                return
            if path == '/document-api/deleted-projects':
                self.respond(200, {'items': project_deletion.list_deleted_projects(self.database)})
                return
            deleted_match = re.fullmatch(
                r"/document-api/deleted-projects/([A-Za-z0-9_-]{1,100})", path
            )
            if deleted_match:
                self.respond(
                    200,
                    project_deletion.get_deleted_project(self.database, deleted_match.group(1)),
                )
                return
            match = PROJECT_ITEM_PATH.fullmatch(path)
            if match:
                project_id, resource = match.groups()
                project = project_store.get_project(self.database, project_id)
                if resource is None:
                    self.respond(200, project)
                    return
                latest = latest_rfp(self.database, project_id)
                if latest is None:
                    raise project_store.ProjectError('등록된 제안요청서가 없습니다.', 404)
                if resource == 'source':
                    source = read_source(self.database, latest['id'])
                    self.respond(200, {'filename': latest['filename'], 'revision': latest['revision'],
                                      'warnings': source.get('warnings', []),
                                      'blocks': _display_blocks(source['blocks'])})
                else:
                    with project_store.connect(self.database) as connection:
                        row = connection.execute('SELECT data FROM source_files WHERE sha256=?',
                                                 (latest['sha256'],)).fetchone()
                    if row is None:
                        raise project_store.ProjectError('저장된 원본 파일이 없습니다.', 404)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/octet-stream')
                    self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + quote(latest['filename']))
                    self.send_header('Content-Length', str(len(row[0])))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(row[0])
                return
            route = self.route()
            if route:
                project_store.get_project(self.database, route[0])
        except project_store.ProjectError as error:
            self.respond(error.status, {'detail': str(error)})
            return
        except (RequirementsError, sqlite3.Error, OSError) as error:
            self.log_error('사업 조회 실패: %s', error)
            self.respond(500, {'detail': '저장된 사업 정보를 읽지 못했습니다.'})
            return
        route = self.route()
        if route is None:
            self.respond(404, {"detail": "주소를 찾을 수 없습니다."})
            return
        project_id, resource = route
        try:
            result = (latest_rfp(self.database, project_id) if resource == "rfp" else
                      requirement_status(self.database, project_id) if resource == "requirements" else
                      criteria_status(self.database, project_id))
        except (CriteriaError, RequirementsError, sqlite3.Error, OSError) as error:
            self.log_error("조회 실패: %s", error)
            self.respond(500, {"detail": "저장된 결과를 읽지 못했습니다. 서버 로그를 확인해 주세요."})
            return
        self.respond(200, result)

    def do_POST(self) -> None:
        self._mutate('POST')

    def do_PATCH(self) -> None:
        self._mutate('PATCH')

    def do_DELETE(self) -> None:
        self._mutate('DELETE')

    def _json_body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise project_store.ProjectError('요청 길이가 올바르지 않습니다.', 400) from None
        if not 0 < length <= 16384:
            raise project_store.ProjectError('요청 크기를 확인해 주세요.', 413)
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise project_store.ProjectError('JSON 요청이 필요합니다.', 415)
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            raise project_store.ProjectError('JSON 요청이 올바르지 않습니다.', 400) from None

    def _mutate(self, method):
        try:
            # 동일 사업에 대한 업로드·수정·삭제가 서로 덮어쓰지 않도록 직렬화한다.
            with PROJECT_MUTATION_LOCK:
                ensure_database(self.database)
                path = urlsplit(self.path).path
                if path == '/document-api/projects' and method == 'POST':
                    self.respond(201, project_store.save_project(self.database, self._json_body()))
                    return
                match = PROJECT_ITEM_PATH.fullmatch(path)
                if match and match[2] is None and method in {'PATCH', 'DELETE'}:
                    payload = self._json_body()
                    result = (project_store.save_project(self.database, payload, match[1])
                              if method == 'PATCH' else
                              project_deletion.delete_project(self.database, match[1], payload))
                    self.respond(200, result)
                    return
                route = self.route()
                if method == 'POST' and route:
                    project = project_store.get_project(self.database, route[0])
                    if route[1] == 'rfp' and project['status'] != '준비':
                        raise project_store.ProjectError('평가가 시작된 사업의 문서는 변경할 수 없습니다.', 409)
                    self._post_document(project)
                    return
                self.respond(404, {'detail': '주소를 찾을 수 없습니다.'})
        except project_store.ProjectError as error:
            self.respond(error.status, {'detail': str(error)})
        except (sqlite3.Error, OSError) as error:
            self.log_error('사업 저장 실패: %s', error)
            self.respond(500, {'detail': '사업 정보를 저장하지 못했습니다. 다시 시도해 주세요.'})

    def _post_document(self, project) -> None:
        route = self.route()
        if route is None:
            self.respond(404, {"detail": "주소를 찾을 수 없습니다."})
            return
        project_id, resource = route
        if resource == "requirements":
            if not self.ai_enabled:
                self.respond(503, {"detail": "이 서버에서는 AI 요구사항 추출이 비활성화돼 있습니다."})
                return
            latest = latest_rfp(self.database, project_id)
            if latest is None:
                self.respond(404, {"detail": "등록된 제안요청서가 없습니다."})
                return
            try:
                queued = queue_requirements(self.database, project_id, latest["revision"], latest["id"])
            except (RequirementsError, sqlite3.Error, OSError) as error:
                self.log_error("요구사항 추출 요청 실패: %s", error)
                self.respond(500, {"detail": "요구사항 추출을 시작하지 못했습니다."})
                return
            self.respond(202 if queued["status"] == "queued" else 200, queued)
            return
        if resource == "criteria":
            if not self.ai_enabled:
                self.respond(503, {"detail": "이 서버에서는 AI 평가기준 생성이 비활성화돼 있습니다."})
                return
            latest = latest_rfp(self.database, project_id)
            if latest is None:
                self.respond(404, {"detail": "등록된 제안요청서가 없습니다."})
                return
            try:
                queued = queue_criteria(self.database, project_id, latest["revision"], latest["id"])
            except CriteriaError as error:
                self.respond(409, {"detail": str(error)})
                return
            except (RequirementsError, sqlite3.Error, OSError) as error:
                self.log_error("평가기준 생성 요청 실패: %s", error)
                self.respond(500, {"detail": "평가기준 생성을 시작하지 못했습니다."})
                return
            self.respond(202 if queued["status"] == "queued" else 200, queued)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_REQUEST_SIZE:
            self.respond(413, {"detail": "50MB 이하의 HWPX 파일을 올려 주세요."})
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data;"):
            self.respond(415, {"detail": "파일 업로드 형식이 올바르지 않습니다."})
            return
        try:
            message = BytesParser(policy=default).parsebytes(
                f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + self.rfile.read(length)
            )
            if not message.is_multipart():
                raise ValueError("파일 업로드 형식이 올바르지 않습니다.")
            parts = {part.get_param("name", header="content-disposition"): part
                     for part in message.iter_parts()}
            file_part = parts.get("file")
            if file_part is None:
                raise ValueError("HWPX 파일이 없습니다.")
            filename = Path(unquote(file_part.get_filename() or "").replace("\\", "/")).name
            data = file_part.get_payload(decode=True)
            if not filename.lower().endswith(".hwpx") or not filename or not data:
                raise ValueError("HWPX 파일을 선택해 주세요.")
            if len(data) > MAX_FILE_SIZE:
                raise ValueError("50MB 이하의 HWPX 파일을 올려 주세요.")
            if not zipfile.is_zipfile(io.BytesIO(data)):
                raise ValueError("올바른 HWPX 파일이 아닙니다.")
            result = save_upload(self.database, project_id, project['name'], filename, data)
            if self.ai_enabled:
                try:
                    queue_requirements(self.database, project_id, result["revision"], result["id"])
                except Exception:
                    self.log_error('파일은 저장되었으나 AI 작업을 시작하지 못했습니다.')
                    result['extraction_warning'] = '파일은 저장되었습니다. 요구사항 추출을 다시 실행해 주세요.'
        except (ValueError, zipfile.BadZipFile) as error:
            self.respond(422, {"detail": str(error)})
            return
        except Exception as error:
            self.log_error("제안요청서 처리 실패: %s", error)
            self.respond(500, {"detail": "파일을 처리하지 못했습니다. 서버 로그를 확인해 주세요."})
            return
        self.respond(201, result)


def main() -> None:
    parser = argparse.ArgumentParser(description="PM-01 / EV-03 통합 API")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--database", type=Path, default=DATABASE)
    parser.add_argument("--no-ai", action="store_true", help="문서 저장은 제공하되 AI 추출 요청은 차단")
    args = parser.parse_args()
    Handler.database = args.database
    Handler.ai_enabled = not args.no_ai
    initialize_database(args.database)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"PM-01 / EV-03 API: http://127.0.0.1:{args.port}, SQLite: {args.database}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
