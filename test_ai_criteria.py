"""평가기준표의 출처, 배점 불변, AI 응답 검증과 캐시 저장 경계를 검증한다."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import step4_ai_criteria as criteria


def template_document():
    return {
        "_id": "reference-doc", "document_id": "reference-doc",
        "filename": "기준 서식.hwpx", "active_revision": "reference-rev",
        "blocks": [
            {"block_id": "attach", "type": "paragraph", "order": 1, "text": "[붙임 6]"},
            {"block_id": "title", "type": "paragraph", "order": 2,
             "text": "정성적 지표의 평가기준"},
            {"block_id": "table", "type": "table", "order": 3,
             "table": {"cells": [
                 [{"row": 0, "col": 0, "text": "평가부문"},
                  {"row": 0, "col": 1, "text": "평가항목"},
                  {"row": 0, "col": 2, "text": "평가요소"},
                  {"row": 0, "col": 3, "text": "배점기준"},
                  {"row": 0, "col": 4, "text": ""}],
                 [{"row": 1, "col": 0, "text": "전략 및 방법론"},
                  {"row": 1, "col": 1, "text": "대상사업 이해도"},
                  {"row": 1, "col": 2, "text": "기존 기준"},
                  {"row": 1, "col": 3, "text": "4"},
                  {"row": 1, "col": 4, "text": "4"}],
                 [{"row": 2, "col": 0, "text": "기술 및 기능"},
                  {"row": 2, "col": 1, "text": "사업추진 내용"},
                  {"row": 2, "col": 2, "text": "요구사항별 제안"},
                  {"row": 2, "col": 3, "text": "5"},
                  {"row": 2, "col": 4, "text": "5"}],
             ]}},
        ],
    }


def target_document():
    source = template_document()
    return {"_id": "target-doc", "document_id": "target-doc", "active_revision": "target-rev",
            "filename": "제안요청서.hwpx", "blocks": copy.deepcopy(source["blocks"])}


def requirement_result():
    return {
        "_id": "requirements-result", "document_id": "target-doc", "source_revision": "target-rev",
        "source_fingerprint": "fingerprint", "summary": {"blocks": [
            {"block_id": "summary", "type": "table", "table": {"cells": [[
                {"text": "보안 요구사항"}, {"text": "암호화·접근통제 적용"}]]}}]},
        "details": {"blocks": [
            {"block_id": "detail", "type": "paragraph",
             "text": "산출물: 위협모델, 침투테스트 결과. 개인정보 전송 구간 암호화 적용."}]},
    }


def client_for(entries):
    client = MagicMock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(
            content=json.dumps({"criteria": entries}, ensure_ascii=False), refusal=None))],
        usage=SimpleNamespace(prompt_tokens=21, completion_tokens=14, total_tokens=35))
    return client


def valid_entries():
    return [
        {"row_id": "R01", "evaluation_criteria": "사업목표와 요구사항의 부합성을 평가한다.",
         "evaluation_elements": ["제안 목표와 범위의 근거가 구체적인지 확인"]},
        {"row_id": "R02", "evaluation_criteria": "요구사항별 이행방안과 검증 가능성을 평가한다.",
         "evaluation_elements": ["보안 요구사항별 구현방안과 검증방법의 구체성"]},
    ]


class CriteriaGenerationTests(unittest.TestCase):
    def generate(self, client):
        with patch.object(criteria.requirements, "validate_result"):
            return criteria.generate_criteria(target_document(), requirement_result(), client=client)

    def test_request_document_template_and_scores_are_preserved(self):
        client = client_for(valid_entries())
        result = self.generate(client)
        self.assertEqual([row["row_id"] for row in result["rows"]], ["R01", "R02"])
        self.assertEqual([row["evaluation_division"] for row in result["rows"]],
                         ["전략 및 방법론", "기술 및 기능"])
        self.assertEqual([row["evaluation_item"] for row in result["rows"]],
                         ["대상사업 이해도", "사업추진 내용"])
        self.assertEqual([row["score"] for row in result["rows"]], [4, 5])
        self.assertEqual(result["template_source"], "request_document")
        self.assertEqual(result["rows"][0]["evaluation_criteria"],
                 "사업목표와 요구사항의 부합성을 평가한다.")
        self.assertEqual(result["total_score"], 9)
        self.assertEqual(result["usage"]["total_tokens"], 35)
        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["model"], "gpt-4o")
        self.assertFalse(request["store"])
        self.assertTrue(request["response_format"]["json_schema"]["strict"])
        self.assertEqual(
            request["response_format"]["json_schema"]["schema"]["properties"]["criteria"]["items"]["required"],
            ["row_id", "evaluation_criteria", "evaluation_elements"],
        )
        payload = json.loads(request["messages"][1]["content"])
        self.assertIn("산출물: 위협모델", payload["proposal_requirements"])
        self.assertEqual(payload["template_rows"][1]["score"], 5)
        self.assertEqual(payload["template_source"], "request_document")

    def test_markdown_template_is_fallback_when_rfp_has_no_table(self):
        document = target_document()
        document["blocks"] = [{"block_id": "body", "type": "paragraph", "text": "일반 제안요청서"}]
        template = criteria._resolve_template(document)
        self.assertEqual(template["template_source"], "fallback_markdown")
        self.assertEqual(len(template["rows"]), 15)
        self.assertEqual(sum(row["score"] for row in template["rows"]), 100)
        self.assertEqual(template["rows"][0]["evaluation_item"], "사업 이해도")

    def test_model_cannot_change_score_or_omit_rows(self):
        for entries in (valid_entries()[:1], [valid_entries()[0], valid_entries()[0]]):
            with self.subTest(entries=entries):
                with self.assertRaises(criteria.CriteriaError):
                    self.generate(client_for(entries))

    def test_empty_or_untrusted_response_is_rejected(self):
        bad_entries = [
            {"row_id": "R01", "evaluation_criteria": "기준", "evaluation_elements": []},
            {"row_id": "R01", "evaluation_criteria": " ", "evaluation_elements": ["요소"]},
            {"row_id": "unknown", "evaluation_criteria": "기준", "evaluation_elements": ["새 항목"]},
        ]
        for entries in bad_entries:
            with self.subTest(entries=entries), self.assertRaises(criteria.CriteriaError):
                self.generate(client_for(entries))

    def test_empty_evaluation_elements_trigger_one_correction_retry(self):
        client = client_for(valid_entries())
        good_response = client.chat.completions.create.return_value
        invalid_response = copy.deepcopy(good_response)
        invalid_response.choices[0].message.content = json.dumps({"criteria": [
            valid_entries()[0],
            {"row_id": "R02", "evaluation_criteria": "요구사항의 이행 가능성을 평가한다.",
             "evaluation_elements": []},
        ]}, ensure_ascii=False)
        client.chat.completions.create.side_effect = [invalid_response, good_response]

        result = self.generate(client)

        self.assertEqual(len(result["rows"][1]["evaluation_elements"]), 1)
        self.assertEqual(result["usage"]["total_tokens"], 70)
        self.assertEqual(client.chat.completions.create.call_count, 2)
        correction = json.loads(client.chat.completions.create.call_args.kwargs["messages"][-1]["content"])
        self.assertIn("R02", correction["correction"][0])

    def test_saved_result_validation_detects_changed_weights(self):
        result = self.generate(client_for(valid_entries()))
        reference = criteria._resolve_template(target_document())
        result["_id"] = criteria._criteria_id(target_document(), requirement_result(), reference)
        with patch.object(criteria.requirements, "validate_result"):
            criteria._validate_saved(target_document(), requirement_result(), reference, result)
            invalid = copy.deepcopy(result)
            invalid["rows"][0]["score"] = 40
            with self.assertRaises(criteria.CriteriaError):
                criteria._validate_saved(target_document(), requirement_result(), reference, invalid)

    def test_requirement_source_is_required_and_size_limited(self):
        with self.assertRaises(criteria.CriteriaError):
            criteria.requirements_text({"summary": {"blocks": []}, "details": {"blocks": []}})
        too_large = {"summary": {"blocks": [{"type": "paragraph", "text": "가" * 100_001}]}}
        with self.assertRaises(criteria.CriteriaError):
            criteria.requirements_text(too_large)


if __name__ == "__main__":
    unittest.main()
