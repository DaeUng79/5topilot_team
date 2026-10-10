"""정성적 평가기준 탭의 의존성, 생성 및 저장 결과 표시를 확인한다."""
import copy
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from streamlit.testing.v1 import AppTest
import streamlit_main as app


DOCUMENT = {"_id": "document-a", "filename": "sample.hwpx", "active_revision": "revision-a",
            "blocks": [{"block_id": "title", "type": "paragraph", "text": "제안 요구사항"}]}
REQUIREMENTS = {"_id": "requirements-a", "document_id": "document-a",
                "source_revision": "revision-a", "model": "gpt-4o", "created_at": datetime.now(timezone.utc),
                "usage": {"total_tokens": 20}, "summary": {"block_ids": [], "blocks": []},
                "details": {"block_ids": [], "blocks": []}}
CRITERIA = {"_id": "criteria-a", "document_id": "document-a", "source_revision": "revision-a",
            "source_requirements_id": "requirements-a", "model": "gpt-4o",
            "created_at": datetime.now(timezone.utc), "total_score": 4,
            "template_source": "fallback_markdown",
            "usage": {"total_tokens": 33}, "rows": [{"row_id": "R01",
                "evaluation_division": "전략 및 방법론", "evaluation_item": "사업 이해도",
                "evaluation_criteria": "사업목표와 요구사항의 부합성을 평가합니다.",
                "evaluation_elements": ["요구사항의 범위와 목표를 정확히 설명"], "score": 4}]}


def make_app(document=DOCUMENT):
    test_app = AppTest.from_string(
        "import streamlit as st\nfrom streamlit_main import render_document\n"
        "render_document(st.session_state.test_document)", default_timeout=10)
    test_app.session_state.test_document = copy.deepcopy(document)
    return test_app


class CriteriaUI(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(app, "document_view")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_generation_uses_extracted_requirements_and_shows_downloadable_table(self):
        with patch.object(app, "load_requirements_result", return_value=copy.deepcopy(REQUIREMENTS)), \
             patch.object(app, "extract_requirements_result", return_value=copy.deepcopy(REQUIREMENTS)), \
             patch.object(app, "load_criteria_result", return_value=None), \
             patch.object(app, "extract_criteria_result", return_value=copy.deepcopy(CRITERIA)) as generate:
            at = make_app().run()
            self.assertFalse(at.exception)
            button = next(item for item in at.button if item.key.startswith("criteria_generate_"))
            self.assertEqual(button.label, "정성적 평가기준표 생성")
            button.click().run()
            self.assertFalse(at.exception)
            self.assertFalse(generate.call_args.kwargs["force"])
            self.assertEqual(len(at.get("iframe")), 2)
            self.assertTrue(any(item.label == "평가기준표 JSON 다운로드" and not item.disabled
                                for item in at.get("download_button")))
            self.assertTrue(any("총 배점 4점" in item.value for item in at.caption))
            markup = app.build_criteria_html(DOCUMENT, CRITERIA)
            self.assertIn("평가기준", markup)
            self.assertIn("사업목표와 요구사항의 부합성을 평가합니다.", markup)
            self.assertIn("요구사항의 범위와 목표를 정확히 설명", markup)

    def test_missing_extracted_requirements_blocks_criteria_generation(self):
        with patch.object(app, "load_requirements_result", return_value=None), \
             patch.object(app, "load_criteria_result") as load_criteria, \
             patch.object(app, "extract_criteria_result") as generate:
            at = make_app().run()
            self.assertFalse(at.exception)
            self.assertFalse(any(button.key.startswith("criteria_generate_") for button in at.button))
            self.assertTrue(any("제안 요구사항" in message.value for message in at.info))
            load_criteria.assert_not_called()
            generate.assert_not_called()

    def test_saved_criteria_are_displayed_without_generation(self):
        with patch.object(app, "load_requirements_result", return_value=copy.deepcopy(REQUIREMENTS)), \
             patch.object(app, "load_criteria_result", return_value=copy.deepcopy(CRITERIA)), \
             patch.object(app, "extract_criteria_result") as generate:
            at = make_app().run()
            self.assertFalse(at.exception)
            button = next(item for item in at.button if item.key.startswith("criteria_generate_"))
            self.assertEqual(button.label, "평가기준표 다시 생성")
            self.assertEqual(len(at.get("iframe")), 2)
            generate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
