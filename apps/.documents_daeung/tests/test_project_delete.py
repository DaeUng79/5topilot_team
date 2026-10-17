import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch


SCREEN_DIR = (
    Path(__file__).resolve().parents[2]
    / "web_cookiesh1/src/screens/dept-admin/PM-01-projects"
)
sys.path.insert(0, str(SCREEN_DIR))

import step0_documents_api as api
import step4_project_delete_to_SQLite as project_deletion
import step2_hwpx_save_to_SQLite as project_store
from step3_ai_requirements_extract_to_SQLite import SCHEMA as REQUIREMENTS_SCHEMA
from step4_ai_criteria import CRITERIA_SCHEMA


class ProjectDeletionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "projects.sqlite3"
        api.initialize_database(self.database)
        self.payload = {
            "name": "검증 사업",
            "org": "테스트 기관",
            "dept": "정보화담당관",
            "pos": "주무관",
            "owner": "테스트 담당자",
            "tel": "02-1234-5678",
            "mail": "",
            "date": "2026-11-05",
        }

    @property
    def archive(self):
        return self.database.with_name("projects_delete.sqlite3")

    def create_project(self):
        return project_store.save_project(self.database, self.payload)["id"]

    def seed_document(self, project_id, document_id="document-1"):
        revision = "revision-1"
        source_sha = "source-sha-1"
        now = "2026-10-16T00:00:00+00:00"
        source = b"original HWPX"
        document_json = json.dumps({
            "blocks": [{"block_id": "block-1", "physical_page_numbers": [2, 3]}]
        })
        result_json = json.dumps({
            "status": "complete",
            "business_status": {
                "current_status": [{"text": "현재 운영 현황", "source_block_ids": ["block-1"]}],
                "background_and_need": [{"text": "사업 추진 배경", "source_block_ids": ["block-1"]}],
                "scope": [{"text": "주요 과업", "source_block_ids": ["block-1"]}],
            },
        })
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.executescript(REQUIREMENTS_SCHEMA + CRITERIA_SCHEMA)
            connection.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
                (document_id, "proposal.hwpx", source_sha, revision, now, now),
            )
            connection.execute(
                "INSERT INTO parse_snapshots VALUES (?, ?, ?, ?, ?, ?)",
                (document_id, revision, "parser", "2", document_json, now),
            )
            connection.execute(
                "INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (document_id, revision, "block-1", 0, "paragraph", None, None,
                 "요약 근거", "[2,3]", "{}"),
            )
            connection.execute(
                "INSERT INTO source_files VALUES (?, ?, ?, ?)",
                (source_sha, "proposal.hwpx", len(source), source),
            )
            connection.execute(
                "INSERT INTO project_documents VALUES (?, ?, ?)",
                (project_id, document_id, now),
            )
            connection.execute(
                "INSERT INTO project_rfp_uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (project_id, 1, document_id, "proposal.hwpx", len(source), now, 2, 1, 0),
            )
            connection.execute(
                "INSERT INTO requirement_jobs VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, 1, document_id, "done", None, now),
            )
            connection.execute(
                "INSERT INTO criteria_jobs VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, 1, document_id, "done", None, now),
            )
            connection.execute(
                "INSERT INTO requirement_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("requirement-1", document_id, revision, "extractor", "model",
                 "fingerprint", "complete", now, result_json),
            )
            connection.execute(
                "INSERT INTO criteria_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("criteria-1", document_id, revision, "requirement-1",
                 "template", "criteria", "model", now, "{}"),
            )
        return document_id

    def count(self, table, database=None):
        with closing(sqlite3.connect(database or self.database)) as connection:
            return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    def test_delete_archives_only_project_and_business_summary_then_purges_source(self):
        project_id = self.create_project()
        self.seed_document(project_id)

        result = project_deletion.delete_project(
            self.database, project_id, {"reason": "사업이 취소됨"}
        )

        self.assertTrue(result["archived"])
        for table in (
            "projects", "project_profiles", "project_documents", "project_rfp_uploads",
            "requirement_jobs", "criteria_jobs", "documents", "parse_snapshots",
            "blocks", "source_files", "requirement_results", "criteria_results",
        ):
            self.assertEqual(self.count(table), 0, table)
        self.assertEqual(self.count("deleted_projects", self.archive), 1)
        with closing(sqlite3.connect(self.archive)) as connection:
            connection.row_factory = sqlite3.Row
            saved = connection.execute("SELECT * FROM deleted_projects").fetchone()
        self.assertEqual(saved["project_name"], self.payload["name"])
        self.assertEqual(saved["project_status"], "준비")
        self.assertEqual(saved["deletion_reason"], "사업이 취소됨")
        self.assertEqual(
            json.loads(saved["business_related_status_json"]),
            [{"text": "현재 운영 현황", "pages": [2, 3]}],
        )
        self.assertEqual(
            json.loads(saved["background_and_need_json"]),
            [{"text": "사업 추진 배경", "pages": [2, 3]}],
        )
        self.assertEqual(
            json.loads(saved["scope_main_tasks_json"]),
            [{"text": "주요 과업", "pages": [2, 3]}],
        )

    def test_shared_document_is_retained_for_other_project(self):
        first = self.create_project()
        second = project_store.save_project(
            self.database, self.payload | {"name": "공유 문서 사업"}
        )["id"]
        document_id = self.seed_document(first)
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(
                "INSERT INTO project_documents VALUES (?, ?, ?)",
                (second, document_id, "2026-10-16T00:00:01+00:00"),
            )
            connection.execute(
                "INSERT INTO project_rfp_uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (second, 1, document_id, "proposal.hwpx", 12,
                 "2026-10-16T00:00:01+00:00", 2, 1, 0),
            )

        project_deletion.delete_project(
            self.database, first, {"reason": "첫 사업 취소"}
        )

        self.assertEqual(self.count("projects"), 1)
        self.assertEqual(self.count("documents"), 1)
        self.assertEqual(self.count("requirement_results"), 1)
        self.assertEqual(self.count("source_files"), 1)

    def test_migrate_existing_soft_deleted_project_preserves_recorded_reason(self):
        project_id = self.create_project()
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute(
                "UPDATE project_profiles SET deleted_at=?, deletion_reason=? WHERE project_id=?",
                ("2026-10-15T00:00:00+00:00", "기존 삭제 사유", project_id),
            )

        self.assertEqual(project_deletion.migrate_soft_deleted_projects(self.database), 1)
        with closing(sqlite3.connect(self.archive)) as connection:
            row = connection.execute(
                "SELECT deletion_reason FROM deleted_projects WHERE project_id=?",
                (project_id,),
            ).fetchone()
        self.assertEqual(row[0], "기존 삭제 사유")
        self.assertEqual(self.count("projects"), 0)

    def test_locked_project_is_not_archived_or_deleted(self):
        project_id = self.create_project()
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute(
                "UPDATE project_profiles SET status='평가 중' WHERE project_id=?",
                (project_id,),
            )

        with self.assertRaises(project_store.ProjectError):
            project_deletion.delete_project(
                self.database, project_id, {"reason": "삭제 시도"}
            )

        self.assertEqual(self.count("projects"), 1)
        if self.archive.exists():
            with closing(sqlite3.connect(self.archive)) as connection:
                archived_tables = connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            self.assertEqual(archived_tables, [])

    def test_failure_during_purge_rolls_back_archive_and_source_changes(self):
        project_id = self.create_project()
        self.seed_document(project_id)

        with patch.object(
            project_deletion, "_delete_document_records",
            side_effect=RuntimeError("simulated purge failure"),
        ):
            with self.assertRaisesRegex(RuntimeError, "simulated purge failure"):
                project_deletion.delete_project(
                    self.database, project_id, {"reason": "롤백 확인"}
                )

        self.assertEqual(self.count("projects"), 1)
        self.assertEqual(self.count("documents"), 1)
        if self.archive.exists():
            with closing(sqlite3.connect(self.archive)) as connection:
                archived_tables = connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name='deleted_projects'"
                ).fetchone()
            if archived_tables:
                self.assertEqual(self.count("deleted_projects", self.archive), 0)


if __name__ == "__main__":
    unittest.main()
