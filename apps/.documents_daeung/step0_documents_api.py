"""사업 상세의 제안요청서 업로드에 쓰는 로컬 문서 API.

실행: .venv/bin/python apps/documents_daeung/step0_documents_api.py
Vite의 /document-api 프록시를 통해서만 호출하도록 127.0.0.1에 바인딩한다.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import tempfile
import traceback
import zipfile
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
DATABASE = BASE_DIR.parent / "web_cookiesh1/src/screens/dept-admin/projects.sqlite3"
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

    def route(self) -> tuple[str, str] | None:
        match = PROJECT_PATH.fullmatch(urlsplit(self.path).path)
        return (match.group(1), match.group(2)) if match else None

    def do_GET(self) -> None:
        try:
            path = urlsplit(self.path).path
            if path == '/document-api/health':
                self.respond(200, {'status': 'ok', 'ai_enabled': self.ai_enabled})
                return
            if path == '/document-api/projects':
                self.respond(200, {'items': project_store.list_projects(self.database)})
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
    parser = argparse.ArgumentParser(description="제안요청서 HWPX 업로드 API")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--database", type=Path, default=DATABASE)
    parser.add_argument("--no-ai", action="store_true", help="문서 저장은 제공하되 AI 추출 요청은 차단")
    args = parser.parse_args()
    Handler.database = args.database
    Handler.ai_enabled = not args.no_ai
    initialize_database(args.database)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"RFP API: http://127.0.0.1:{args.port}, SQLite: {args.database}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
