"""요구사항 화면의 문서 연결, API 실행 경계와 원문 렌더링 검증."""
import copy
import io
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from streamlit.testing.v1 import AppTest
from PIL import Image

import streamlit_main as app


DOCUMENT = {
    "_id": "document-a", "filename": "테스트 제안요청서.hwpx", "active_revision": "revision-1",
    "blocks": [{"block_id": "title", "type": "paragraph", "text": "제안 요구사항"}],
}
SUMMARY = {"block_id": "summary", "type": "table", "physical_page_numbers": [7, 8],
           "table": {"cells": [[{"text": "분류", "row_span": 2, "col_span": 1},
                                  {"text": "총괄 원문 <tag>", "col": 1}]]}}
DETAILS = [
    {"block_id": "detail", "type": "table", "parent_block_id": "outside-excerpt",
     "physical_page_numbers": [9, 10], "table": {"cells": [[
         {"text": "대체 내용", "child_block_ids": ["nested", "paragraph"]}]]}},
    {"block_id": "nested", "type": "table", "parent_block_id": "detail",
     "table": {"cells": [[{"text": "중첩 원문", "col_span": 2}]]}},
    {"block_id": "paragraph", "type": "paragraph", "parent_block_id": "detail",
     "text": "원문 줄1\n  원문 줄2"},
]
RESULT = {"document_id": "document-a", "source_revision": "revision-1",
          "model": "gpt-4o-mini", "created_at": datetime(2026, 10, 5, tzinfo=timezone.utc),
          "status": "complete", "warnings": [], "usage": {"total_tokens": 100},
          "summary": {"block_ids": ["summary"], "blocks": [SUMMARY]},
          "details": {"block_ids": ["detail"], "blocks": DETAILS}}


def requirements_app(document=DOCUMENT):
    at = AppTest.from_string(
        "import streamlit as st\n"
        "from streamlit_main import render_document\n"
        "render_document(st.session_state.test_document)", default_timeout=10)
    at.session_state.test_document = copy.deepcopy(document)
    return at


def extraction_button(at):
    return next(button for button in at.button if button.key.startswith("requirements_extract_"))


class RequirementsUI(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(app, "document_view")
        patcher.start()
        self.addCleanup(patcher.stop)
        criteria_patcher = patch.object(app, "load_criteria_result", return_value=None)
        criteria_patcher.start()
        self.addCleanup(criteria_patcher.stop)

    def test_legacy_document_never_loads_or_extracts(self):
        document = dict(DOCUMENT)
        document.pop("active_revision")
        with patch.object(app, "load_requirements_result") as load, \
             patch.object(app, "extract_requirements_result") as extract:
            at = requirements_app(document).run()
        self.assertFalse(at.exception)
        load.assert_not_called()
        extract.assert_not_called()
        self.assertEqual([tab.label for tab in at.tabs],
                 ["제안요청서", "제안 요구사항", "정성적 평가기준"])
        self.assertTrue(any("다시 등록" in message.value for message in at.info))

    def test_saved_results_are_reused_without_api(self):
        with patch.object(app, "load_requirements_result", return_value=copy.deepcopy(RESULT)) as load, \
             patch.object(app, "extract_requirements_result") as extract:
            at = requirements_app().run().run()
        self.assertFalse(at.exception)
        load.assert_called_once()
        extract.assert_not_called()
        self.assertEqual([tab.label for tab in at.tabs],
                 ["제안요청서", "제안 요구사항", "정성적 평가기준"])
        self.assertEqual(len(at.get("iframe")), 1)
        self.assertEqual(extraction_button(at).label, "제안 요구사항 다시 추출")
        self.assertTrue(any(button.label == "저장 공간 새로고침" for button in at.button))
        self.assertTrue(any(button.label == "제안 요구사항 JSON 다운로드"
                    for button in at.get("download_button")))
        markup = app.build_requirements_html(DOCUMENT, RESULT)
        self.assertIn("원본 파일 7쪽 · 8쪽", markup)

    def test_all_three_controls_stay_visible_when_result_is_missing(self):
        with patch.object(app, "load_requirements_result", return_value=None):
            at = requirements_app().run()
        self.assertFalse(at.exception)
        self.assertTrue(any(button.label == "저장 공간 새로고침" for button in at.button))
        self.assertEqual(extraction_button(at).label, "제안 요구사항 추출")
        download = next(button for button in at.get("download_button")
                if button.label == "제안 요구사항 JSON 다운로드")
        self.assertTrue(download.disabled)

    def test_explicit_extract_and_reextract(self):
        with patch.object(app, "load_requirements_result", return_value=None), \
             patch.object(app, "extract_requirements_result", return_value=copy.deepcopy(RESULT)) as extract:
            at = requirements_app().run()
            extract.assert_not_called()
            extraction_button(at).click().run()
            self.assertFalse(at.exception)
            self.assertFalse(extract.call_args.kwargs["force"])
            at.run()
            self.assertEqual(extract.call_count, 1)
            extraction_button(at).click().run()
            self.assertEqual(extract.call_count, 2)
            self.assertTrue(extract.call_args.kwargs["force"])

    def test_new_revision_does_not_display_old_results(self):
        with patch.object(app, "load_requirements_result", side_effect=[copy.deepcopy(RESULT), None]) as load:
            at = requirements_app().run()
            self.assertEqual(len(at.get("iframe")), 1)
            at.session_state.test_document = dict(DOCUMENT, active_revision="revision-2")
            at.run()
        self.assertFalse(at.exception)
        self.assertEqual(load.call_count, 2)
        self.assertEqual(len(at.get("iframe")), 0)
        self.assertEqual(extraction_button(at).label, "제안 요구사항 추출")

    def test_rejects_results_for_other_document(self):
        with patch.object(app, "load_requirements_result", return_value=dict(RESULT, document_id="other")):
            at = requirements_app().run()
        self.assertFalse(at.exception)
        self.assertEqual(len(at.get("iframe")), 0)
        self.assertTrue(any("일치하지 않는" in message.value for message in at.info))

    def test_unexpected_error_does_not_expose_credentials(self):
        with patch.object(app, "load_requirements_result", return_value=None), \
             patch.object(app, "extract_requirements_result", side_effect=RuntimeError("sk-secret-token")):
            at = requirements_app().run()
            extraction_button(at).click().run()
        self.assertFalse(at.exception)
        self.assertTrue(at.error)
        self.assertNotIn("sk-secret-token", " ".join(message.value for message in at.error))

    def test_needs_review_status_does_not_show_warnings(self):
        result = dict(RESULT, status="needs_review", warnings=["요구사항 식별자를 확인해 주세요."])
        with patch.object(app, "load_requirements_result", return_value=result):
            at = requirements_app().run()
        self.assertFalse(at.exception)
        self.assertFalse(at.warning)
        self.assertFalse(any("요구사항 식별자를 확인" in message.value for message in at.info))

    def test_summary_precedes_requirement_groups_with_page_numbers(self):
        detail_table = {"block_id": "detail-list", "type": "table", "physical_page_numbers": [10, 11],
                        "table": {"row_count": 3, "cells": [
                            [{"row": 0, "col": 0, "text": "요구사항 고유번호"},
                             {"row": 0, "col": 1, "text": "요구사항 명칭"}],
                            [{"row": 1, "col": 0, "text": "FUN-001"},
                             {"row": 1, "col": 1, "text": "로그인"}],
                            [{"row": 2, "col": 0, "text": "FUN-002"},
                             {"row": 2, "col": 1, "text": "권한 관리"}],
                        ]}}
        document = dict(DOCUMENT, blocks=[SUMMARY, detail_table])
        result = copy.deepcopy(RESULT)
        result["details"] = {"block_ids": ["detail-list"], "blocks": [detail_table]}
        markup = app.build_requirements_html(document, result)
        self.assertLess(markup.index("1. 요구사항 총괄표"), markup.index("2. 요구사항별 구분"))
        self.assertIn("FUN-001", markup)
        self.assertIn("FUN-002", markup)
        self.assertIn("원문 페이지 10쪽 · 11쪽", markup)
        with patch.object(app, "load_requirements_result", return_value=result):
            at = requirements_app(document).run()
        self.assertFalse(at.exception)
        self.assertEqual(len(at.get("iframe")), 1)

    def test_extracted_multpage_nested_tables_are_exact_and_once(self):
        blocks = [copy.deepcopy(SUMMARY), *copy.deepcopy(DETAILS)]
        original = copy.deepcopy(blocks)
        markup = app.build_document_html({"blocks": blocks}, extracted=True)
        self.assertEqual(markup.count("중첩 원문"), 1)
        self.assertEqual(markup.count("원문 줄1\n  원문 줄2"), 1)
        self.assertIn("총괄 원문 &lt;tag&gt;", markup)
        self.assertIn('rowspan="2"', markup)
        self.assertIn('colspan="2"', markup)
        self.assertIn("원본 파일 7쪽 · 8쪽", markup)
        self.assertIn("원본 파일 9쪽 · 10쪽", markup)
        self.assertNotIn("원본 파일을 다시 등록", markup)
        self.assertEqual(blocks, original)

    def test_extracted_cells_keep_raw_spacing_and_field_text(self):
        raw = "  첫 문단\n\n\t둘째 문단  \n8=SUM(?2:?12)??%g,;;49=SUM(?2:?12)%g,4949"
        blocks = [
            {"block_id": "table", "type": "table", "table": {"cells": [[
                {"text": raw, "child_block_ids": ["p1", "p2", "p3"]}]]}},
            {"block_id": "p1", "type": "paragraph", "parent_block_id": "table", "text": "첫 문단"},
            {"block_id": "p2", "type": "paragraph", "parent_block_id": "table", "text": "둘째 문단"},
            {"block_id": "p3", "type": "paragraph", "parent_block_id": "table", "text": "49"},
        ]
        original = copy.deepcopy(blocks)
        markup = app.build_document_html({"blocks": blocks}, extracted=True)
        self.assertIn(raw, markup)
        self.assertEqual(markup.count("첫 문단"), 1)
        self.assertEqual(markup.count("둘째 문단"), 1)
        self.assertNotIn('>49</p>', markup)
        self.assertEqual(blocks, original)
        ordinary = app.build_document_html({"blocks": blocks})
        self.assertNotIn("SUM(?2:?12)", ordinary)
        self.assertIn('>49</p>', ordinary)

    def test_extracted_empty_cell_keeps_child_paragraph_and_image(self):
        blocks = [
            {"block_id": "table", "type": "table", "table": {"cells": [[
                {"text": "", "child_block_ids": ["paragraph", "image"]}]]}},
            {"block_id": "paragraph", "type": "paragraph", "parent_block_id": "table",
             "text": "셀 원문에 없는 문단"},
            {"block_id": "image", "type": "image", "parent_block_id": "table",
             "image": {"asset_id": "asset"}},
        ]
        data = io.BytesIO()
        Image.new("RGB", (2, 2)).save(data, format="PNG")
        markup = app.build_document_html({"blocks": blocks}, extracted=True,
                                         image_loader=lambda _: data.getvalue())
        self.assertEqual(markup.count("셀 원문에 없는 문단"), 1)
        self.assertEqual(markup.count("data:image/png;base64,"), 1)

    def test_delete_removes_linked_requirements(self):
        collections = {app.COLLECTION: MagicMock(), "RequestRequirements": MagicMock(),
                   "RequestCriteria": MagicMock()}
        collections[app.COLLECTION].find_one.return_value = {"_id": "document-a"}
        db = MagicMock()
        db.__getitem__.side_effect = lambda name: collections.setdefault(name, MagicMock())
        db.hwpx_assets.find.return_value = []
        connection = MagicMock()
        connection.__enter__.return_value = db
        with patch.object(app, "database_connection", return_value=connection), patch.object(app, "GridFS"):
            app.delete_document("document-a")
        collections["RequestRequirements"].delete_many.assert_called_once_with({"document_id": "document-a"})
        collections["RequestCriteria"].delete_many.assert_called_once_with({"document_id": "document-a"})


if __name__ == "__main__":
    unittest.main()
