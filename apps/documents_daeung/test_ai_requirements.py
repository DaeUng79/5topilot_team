"""요구사항의 원문 보존, 전체 범위 검사, 원본 연결 및 실패 시 저장 경계 검증.

API·DB 접속 없이 실행: .venv/bin/python -m unittest test_ai_requirements -v
"""
import copy
import json
import os
import unittest
from contextlib import nullcontext
from functools import partial
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import apps.app.documents.step3_ai_requirements as requirements


def selection(summary=(), details=(), review=False):
    return {"summary_block_ids": list(summary), "detail_block_ids": list(details),
            "needs_review": review}


def response(value, *, finish="stop", refusal=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(finish_reason=finish, message=SimpleNamespace(
            content=json.dumps(value, ensure_ascii=False), refusal=refusal))],
        usage=SimpleNamespace(prompt_tokens=20, completion_tokens=10, total_tokens=30))


def client_for(value):
    client = MagicMock()
    client.chat.completions.create.return_value = response(value)
    return client


def source_document():
    return {
        "_id": "document-a", "document_id": "document-a", "active_revision": "revision-1",
        "filename": "작성자별 양식이 다른 제안요청서.hwpx", "source_sha256": "source-hash",
        "blocks": [
            {"block_id": "intro", "type": "paragraph", "text": "사업 소개", "order": 0},
            {"block_id": "summary", "type": "table", "order": 1,
             "physical_page_numbers": [7, 8], "table": {"row_count": 2, "cells": [
                 [{"row": 0, "col": 0, "row_span": 2, "col_span": 1,
                   "text": "요청 분류\n  원문 공백", "style": {"fill": "#eeeeee"}},
                  {"row": 0, "col": 1, "row_span": 1, "col_span": 2,
                   "text": "SFR-001\n검색 <원문> & 기능", "child_block_ids": ["cell-text"]}],
                 [{"row": 1, "col": 1, "text": "기재 건수: 1"}]]}},
            {"block_id": "cell-text", "type": "paragraph", "parent_block_id": "summary",
             "text": "SFR-001\n검색 <원문> & 기능", "order": 2,
             "runs": [{"text": "SFR-001", "bold": True}]},
            {"block_id": "detail", "type": "table", "order": 3,
             "physical_page_numbers": [9, 10], "table": {"cells": [[
                 {"row": 0, "col": 0, "text": "관리부호"},
                 {"row": 0, "col": 1, "text": "SFR-001"}], [
                 {"row": 1, "col": 0, "text": "준수 설명 / 검수 근거", "row_span": 2},
                 {"row": 1, "col": 1, "text": "  첫 줄\n\t둘째 줄\n\n◦ 마지막 줄  ",
                  "col_span": 2, "child_block_ids": ["nested", "image"]}]]}},
            {"block_id": "nested", "type": "table", "parent_block_id": "detail", "order": 4,
             "table": {"cells": [[{"text": "별첨 기준\n원문 유지", "child_block_ids": ["nested-text"]}]]}},
            {"block_id": "nested-text", "type": "paragraph", "parent_block_id": "nested",
             "text": "별첨 기준\n원문 유지", "order": 5},
            {"block_id": "image", "type": "image", "parent_block_id": "detail", "order": 6,
             "image": {"asset_id": "asset-a", "width": 100, "height": 50}},
            {"block_id": "evaluation", "type": "paragraph", "text": "제안서 평가배점표", "order": 7},
        ],
    }


def extracted(document=None):
    document = document or source_document()
    return requirements.extract_requirements(
        document, client=client_for(selection(["summary"], ["detail"])))


def fake_database(document, saved=None):
    db = {name: MagicMock(name=name) for name in ("Request", requirements.RESULT_COLLECTION, "hwpx_blocks")}
    db["Request"].find_one.return_value = copy.deepcopy(document)
    db[requirements.RESULT_COLLECTION].find_one.return_value = saved
    return db


class SourcePreservationTests(unittest.TestCase):
    def test_exact_original_cells_lines_styles_and_descendants_are_copied(self):
        document = source_document()
        original = copy.deepcopy(document)
        client = client_for(selection(["summary"], ["detail", "nested"]))
        result = requirements.extract_requirements(document, client=client)

        self.assertEqual(result["summary"]["block_ids"], ["summary"])
        self.assertEqual(result["details"]["block_ids"], ["detail"])
        self.assertEqual(result["summary"]["blocks"], original["blocks"][1:3])
        self.assertEqual(result["details"]["blocks"], original["blocks"][3:7])
        self.assertEqual(result["status"], "complete")
        self.assertEqual(document, original)
        self.assertEqual(result["validation"]["summary_codes"], ["SFR-001"])
        self.assertEqual(result["validation"]["detail_codes"], ["SFR-001"])
        self.assertEqual(result["source_revision"], document["active_revision"])
        self.assertEqual(result["document_id"], document["_id"])
        self.assertEqual(result["model"], requirements.DEFAULT_MODEL)
        request = client.chat.completions.create.call_args.kwargs
        self.assertFalse(request["store"])
        self.assertTrue(request["response_format"]["json_schema"]["strict"])
        # 추출 JSON을 수정해도 DB에서 읽은 원본 객체는 바뀌지 않는다.
        result["details"]["blocks"][0]["table"]["cells"][1][1]["text"] = "변경"
        self.assertEqual(document, original)

    def test_compact_input_preserves_unfamiliar_labels_and_full_cell_text(self):
        units = requirements.compact_blocks(source_document())
        self.assertNotIn("cell-text", {unit["block_id"] for unit in units})
        detail = next(unit for unit in units if unit["block_id"] == "detail")
        self.assertEqual(detail["rows"][1][0]["text"], "준수 설명 / 검수 근거")
        self.assertEqual(detail["rows"][1][1]["text"], "  첫 줄\n\t둘째 줄\n\n◦ 마지막 줄  ")
        self.assertEqual(detail["rows"][1][1]["col_span"], 2)

    def test_child_paragraph_missing_from_parent_cells_is_sent_to_model(self):
        document = source_document()
        child = {"block_id": "uncopied-child", "type": "paragraph", "parent_block_id": "detail",
                 "text": "  셀 텍스트에 없는 추가 요구사항\n둘째 줄도 그대로 전송  "}
        document["blocks"].append(child)
        client = client_for(selection(["summary"], ["detail", "uncopied-child"]))
        result = requirements.extract_requirements(document, client=client)
        request = client.chat.completions.create.call_args.kwargs
        units = json.loads(request["messages"][1]["content"])["blocks"]
        transmitted = next(unit for unit in units if unit["block_id"] == "uncopied-child")
        self.assertEqual(transmitted["text"], child["text"])
        self.assertEqual(transmitted["parent_block_id"], "detail")
        self.assertIn(child, result["details"]["blocks"])
        self.assertEqual(result["details"]["block_ids"], ["detail"])

    def test_long_input_is_fully_scanned_and_reassembled_without_truncation(self):
        document = source_document()
        document["blocks"] = [document["blocks"][1]] + [
            {"block_id": f"long-{index}", "type": "paragraph",
             "text": f"요구사항 {index}\n" + "긴 원문\n\"인용\" \\ 끝 " * 900 + f"최종표식-{index}"}
            for index in range(4)]
        document["blocks"][0]["table"]["cells"][0][1].pop("child_block_ids")
        client = MagicMock()

        def choose(**request):
            payload = json.loads(request["messages"][1]["content"])
            ids = {unit["block_id"] for unit in payload["blocks"]}
            return response(selection(ids & {"summary"}, ids - {"summary"}))

        client.chat.completions.create.side_effect = choose
        real_batches = requirements.make_batches
        with patch.object(requirements, "make_batches", side_effect=partial(real_batches, max_chars=2000)):
            result = requirements.extract_requirements(document, client=client)

        requests = [json.loads(call.kwargs["messages"][1]["content"])
                    for call in client.chat.completions.create.call_args_list]
        self.assertGreater(len(requests), 5)
        self.assertEqual([request["batch"] for request in requests], list(range(1, len(requests) + 1)))
        self.assertTrue(all(request["total_batches"] == len(requests) for request in requests))
        for unit in requirements.compact_blocks(document)[1:]:
            pieces = {piece["part"]: piece for request in requests for piece in request["blocks"]
                      if piece["block_id"] == unit["block_id"]}
            self.assertEqual(sorted(pieces), list(range(1, pieces[1]["parts"] + 1)))
            assembled = "".join(pieces[index]["source_json_part"] for index in sorted(pieces))
            self.assertEqual(json.loads(assembled), unit)
        self.assertEqual(result["details"]["blocks"], document["blocks"][1:])
        self.assertEqual(result["usage"]["total_tokens"], 30 * len(requests))

    def test_scan_stops_after_all_summary_requirement_codes_are_found(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-001\nSFR-002"
        document["blocks"][3]["table"]["cells"] = [
            [{"row": 0, "col": 0, "text": "요구사항 고유번호"},
             {"row": 0, "col": 1, "text": "요구사항 내용"}],
            [{"row": 1, "col": 0, "text": "SFR-001"},
             {"row": 1, "col": 1, "text": "첫 번째 세부 요구사항"}],
            [{"row": 2, "col": 0, "text": "SFR-002"},
             {"row": 2, "col": 1, "text": "두 번째 세부 요구사항"}],
        ]
        batches = [
            [{"block_id": "summary", "type": "table"}],
            [{"block_id": "detail", "type": "table"}],
            [{"block_id": "evaluation", "type": "paragraph", "text": "후속 자료"}],
        ]
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            response(selection(["summary"])),
            response(selection(details=["detail"])),
            response(selection()),
        ]

        with patch.object(requirements, "make_batches", return_value=batches):
            result = requirements.extract_requirements(document, client=client)

        self.assertEqual(client.chat.completions.create.call_count, 2)
        self.assertEqual(result["batch_count"], 2)
        self.assertTrue(result["stopped_after_inventory"])
        self.assertEqual(result["validation"]["missing_detail_codes"], [])

    def test_scan_continues_when_only_some_summary_codes_are_found(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-001\nSFR-002"
        document["blocks"][3]["table"]["cells"] = [
            [{"row": 0, "col": 0, "text": "요구사항 고유번호"},
             {"row": 0, "col": 1, "text": "요구사항 내용"}],
            [{"row": 1, "col": 0, "text": "SFR-001"},
             {"row": 1, "col": 1, "text": "첫 번째 세부 요구사항"}],
        ]
        batches = [
            [{"block_id": "summary", "type": "table"}],
            [{"block_id": "detail", "type": "table"}],
            [{"block_id": "later-detail", "type": "table"}],
        ]
        document["blocks"].append({"block_id": "later-detail", "type": "table", "table": {"cells": [
            [{"row": 0, "col": 0, "text": "요구사항 고유번호"}],
            [{"row": 1, "col": 0, "text": "SFR-002"}],
        ]}})
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            response(selection(["summary"])),
            response(selection(details=["detail"])),
            response(selection(details=["later-detail"])),
        ]

        with patch.object(requirements, "make_batches", return_value=batches):
            result = requirements.extract_requirements(document, client=client)

        self.assertEqual(client.chat.completions.create.call_count, 3)
        self.assertEqual(result["batch_count"], 3)
        self.assertFalse(result["stopped_after_inventory"])
        self.assertEqual(result["validation"]["missing_detail_codes"], [])

    def test_split_block_does_not_count_unprocessed_parts_as_found(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-001\nSFR-002"
        document["blocks"][3]["table"]["cells"] = [
            [{"row": 0, "col": 0, "text": "요구사항 고유번호"},
             {"row": 0, "col": 1, "text": "요구사항 내용"}],
            [{"row": 1, "col": 0, "text": "SFR-001"},
             {"row": 1, "col": 1, "text": "첫 번째 세부 요구사항"}],
            [{"row": 2, "col": 0, "text": "SFR-002"},
             {"row": 2, "col": 1, "text": "두 번째 세부 요구사항"}],
        ]
        batches = [
            [{"block_id": "summary", "type": "table", "part": 1, "parts": 1}],
            [{"block_id": "detail", "type": "table", "part": 1, "parts": 2}],
            [{"block_id": "detail", "type": "table", "part": 2, "parts": 2}],
            [{"block_id": "evaluation", "type": "paragraph", "text": "후속 자료"}],
        ]
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            response(selection(["summary"])),
            response(selection(details=["detail"])),
            response(selection(details=["detail"])),
        ]

        with patch.object(requirements, "make_batches", return_value=batches):
            result = requirements.extract_requirements(document, client=client)

        self.assertEqual(client.chat.completions.create.call_count, 3)
        self.assertEqual(result["batch_count"], 3)
        self.assertTrue(result["stopped_after_inventory"])

    def test_missing_sections_and_unmatched_requirement_codes_need_review(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] += "\nSFR-002"
        result = extracted(document)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["validation"]["missing_detail_codes"], ["SFR-002"])
        self.assertTrue(any("SFR-002" in warning for warning in result["warnings"]))
        result = requirements.extract_requirements(document, client=client_for(selection()))
        self.assertEqual(result["status"], "needs_review")
        self.assertTrue(any("총괄표" in warning for warning in result["warnings"]))
        self.assertTrue(any("세부내역" in warning for warning in result["warnings"]))

    def test_model_review_flag_is_retained(self):
        result = requirements.extract_requirements(
            source_document(), client=client_for(selection(["summary"], ["detail"], review=True)))
        self.assertEqual(result["status"], "needs_review")
        self.assertTrue(result["warnings"])

    def test_numbering_rule_examples_are_excluded_from_inventory_validation(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"] = [
            [{"col": 0, "text": "요구사항 분류"}, {"col": 1, "text": "ID 부여 규칙"}],
            [{"col": 0, "text": "기능 요구사항"}, {"col": 1, "text": "SFR-000"}],
        ]
        document["blocks"].insert(3, {"block_id": "inventory", "type": "table", "table": {"cells": [
            [{"col": 0, "text": "요구사항 고유번호"}, {"col": 1, "text": "요구사항 명칭"}],
            [{"col": 0, "text": "SFR-001"}, {"col": 1, "text": "검색 기능"}],
        ]}})
        result = requirements.extract_requirements(
            document, client=client_for(selection(["summary", "inventory"], ["detail"])))
        self.assertEqual(result["validation"]["summary_codes"], ["SFR-001"])
        self.assertEqual(result["validation"]["missing_detail_codes"], [])
        self.assertEqual(result["status"], "complete")
        # 검증에서 제외되어도 총괄표 원문은 그대로 보존한다.
        self.assertEqual(result["summary"]["blocks"][0]["table"]["cells"][1][1]["text"], "SFR-000")

    def test_zero_number_remains_valid_when_it_is_an_actual_inventory_id(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-000"
        result = extracted(document)
        self.assertEqual(result["validation"]["summary_codes"], ["SFR-000", "SFR-001"])
        self.assertEqual(result["validation"]["missing_detail_codes"], ["SFR-000"])
        self.assertEqual(result["status"], "needs_review")

    def test_related_requirement_id_does_not_replace_missing_detail(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-002"
        document["blocks"][3]["table"]["cells"][0][0]["text"] = "요구사항 고유번호"
        document["blocks"][3]["table"]["cells"].append(
            [{"col": 0, "text": "관련 요구사항"}, {"col": 1, "text": "SFR-002"}])
        result = extracted(document)
        self.assertEqual(result["validation"]["detail_codes"], ["SFR-001"])
        self.assertEqual(result["validation"]["missing_detail_codes"], ["SFR-002"])
        self.assertEqual(result["status"], "needs_review")

    def test_mixed_detail_formats_keep_identifiers_from_each_table_and_paragraph(self):
        document = source_document()
        document["blocks"][1]["table"]["cells"][1][0]["text"] = "SFR-002\nSFR-003"
        document["blocks"][3]["table"]["cells"][0][0]["text"] = "요구사항 고유번호"
        document["blocks"][3]["table"]["cells"].append(
            [{"col": 0, "text": "관련 요구사항"}, {"col": 1, "text": "SFR-999"}])
        document["blocks"].extend([
            {"block_id": "unfamiliar-detail", "type": "table", "table": {"cells": [[
                {"col": 0, "text": "관리부호"}, {"col": 1, "text": "SFR-002"}]]}},
            {"block_id": "paragraph-detail", "type": "paragraph", "parent_block_id": "intro",
             "text": "SFR-003\n  문단으로 기록한 요구사항도 원문 보존"},
        ])
        result = requirements.extract_requirements(
            document, client=client_for(selection(
                ["summary"], ["detail", "unfamiliar-detail", "paragraph-detail"])))
        self.assertEqual(result["validation"]["detail_codes"], ["SFR-001", "SFR-002", "SFR-003"])
        self.assertEqual(result["validation"]["missing_detail_codes"], [])
        self.assertEqual(result["status"], "complete")

    def test_detail_items_split_requirement_rows_and_retain_source_pages(self):
        table = {"block_id": "detail-list", "type": "table", "physical_page_numbers": [12, 13],
                 "table": {"row_count": 3, "cells": [
                     [{"row": 0, "col": 0, "text": "분류"},
                      {"row": 0, "col": 1, "text": "요구사항 고유번호"},
                      {"row": 0, "col": 2, "text": "요구사항 명칭"}],
                     [{"row": 1, "col": 0, "row_span": 2, "text": "기능 요구사항"},
                      {"row": 1, "col": 1, "text": "FUN-001"},
                      {"row": 1, "col": 2, "text": "사용자 로그인"}],
                     [{"row": 2, "col": 1, "text": "FUN-002"},
                      {"row": 2, "col": 2, "text": "권한 관리"}],
                 ]}}
        document = {"blocks": [table]}
        details = {"block_ids": ["detail-list"], "blocks": [table]}

        groups = requirements.group_detail_items(document, details)

        self.assertEqual([group["label"] for group in groups], ["FUN-001", "FUN-002"])
        self.assertEqual([group["pages"] for group in groups], [[12, 13], [12, 13]])
        self.assertEqual(len(groups[0]["blocks"][0]["table"]["cells"]), 2)
        self.assertEqual(len(groups[1]["blocks"][0]["table"]["cells"]), 2)
        first_row = {cell["col"]: cell for cell in groups[0]["blocks"][0]["table"]["cells"][1]}
        second_row = {cell["col"]: cell for cell in groups[1]["blocks"][0]["table"]["cells"][1]}
        self.assertEqual(first_row[2]["text"], "사용자 로그인")
        self.assertEqual(second_row[0]["text"], "기능 요구사항")
        self.assertEqual(second_row[0]["row_span"], 1)
        self.assertEqual(second_row[2]["text"], "권한 관리")

    def test_mutated_or_cross_document_saved_result_is_rejected(self):
        document = source_document()
        result = extracted(document)
        for mutation in ("text", "document_id", "source_revision", "source_fingerprint"):
            with self.subTest(mutation=mutation):
                invalid = copy.deepcopy(result)
                if mutation == "text":
                    invalid["details"]["blocks"][0]["table"]["cells"][0][0]["text"] = "요약됨"
                else:
                    invalid[mutation] = "different"
                with self.assertRaises(requirements.RequirementsError):
                    requirements.validate_result(document, invalid)

    def test_missing_child_is_rejected_and_overlapping_sections_are_deduplicated(self):
        document = source_document()
        document["blocks"][3]["table"]["cells"][1][1]["child_block_ids"].append("missing")
        with self.assertRaises(requirements.RequirementsError):
            extracted(document)
        client = client_for(selection(["detail"], ["nested"]))
        result = requirements.extract_requirements(source_document(), client=client)
        self.assertEqual(result["summary"]["block_ids"], ["detail"])
        self.assertEqual(result["details"]["block_ids"], [])
        summary_ids = {block["block_id"] for block in result["summary"]["blocks"]}
        detail_ids = {block["block_id"] for block in result["details"]["blocks"]}
        self.assertFalse(summary_ids & detail_ids)
        self.assertEqual(result["status"], "needs_review")
        self.assertTrue(any("중복 구간은 한쪽에만" in warning for warning in result["warnings"]))

        reverse = requirements.extract_requirements(
            source_document(), client=client_for(selection(["nested"], ["detail"])))
        self.assertEqual(reverse["summary"]["block_ids"], [])
        self.assertEqual(reverse["details"]["block_ids"], ["detail"])
        self.assertTrue(any("원문 범위가 겹쳐" in warning for warning in reverse["warnings"]))


class SelectionFailureTests(unittest.TestCase):
    def test_invalid_or_unavailable_ids_and_invalid_schema_are_rejected(self):
        batch = [{"block_id": "available", "type": "paragraph", "text": "원문"}]
        invalid_values = [
            selection(["fabricated"]), selection(["available"], ["available"]),
            selection([1]), {**selection(), "extra": "data"},
            {**selection(), "needs_review": "false"}, {**selection(), "summary_block_ids": "available"},
        ]
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(requirements.RequirementsError):
                requirements._select(client_for(value), batch, "gpt-4o-mini", 1, 1)

    def test_invalid_ai_responses_report_safe_specific_reasons(self):
        batch = [{"block_id": "available", "type": "paragraph", "text": "원문"}]
        cases = [
            (selection(["fabricated"]), "현재 문서에 없는 블록"),
            (selection(["available"], ["available"]), "중복 선택"),
            ({"unexpected": True}, "필드 구성이 올바르지 않습니다"),
        ]
        for value, expected in cases:
            with self.subTest(expected=expected), self.assertRaises(requirements.RequirementsError) as caught:
                requirements._select(client_for(value), batch, "gpt-4o-mini", 1, 1)
            self.assertIn(expected, str(caught.exception))

        client = client_for(selection())
        client.chat.completions.create.return_value.choices[0].message.content = "not JSON"
        with self.assertRaises(requirements.RequirementsError) as caught:
            requirements._select(client, batch, "gpt-4o-mini", 1, 1)
        self.assertIn("JSON으로 해석하지 못했습니다", str(caught.exception))

    def test_duplicate_selection_is_retried_once_and_usage_is_combined(self):
        batch = [{"block_id": "available", "type": "paragraph", "text": "원문"}]
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            response(selection(["available"], ["available"])),
            response(selection(["available"], review=True)),
        ]

        result, usage = requirements._select(client, batch, "gpt-4o-mini", 1, 1)

        self.assertEqual(result, selection(["available"], review=True))
        self.assertEqual(usage, {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60})
        self.assertEqual(client.chat.completions.create.call_count, 2)
        retry_messages = client.chat.completions.create.call_args_list[1].kwargs["messages"]
        self.assertIn("겹친 각 블록", retry_messages[-1]["content"])

    def test_refusal_and_truncated_response_are_rejected(self):
        for finish, refusal in (("length", None), ("content_filter", None), ("stop", "거절")):
            with self.subTest(finish=finish, refusal=refusal):
                client = client_for(selection())
                client.chat.completions.create.return_value = response(selection(), finish=finish, refusal=refusal)
                with self.assertRaises(requirements.RequirementsError):
                    requirements.extract_requirements(source_document(), client=client)

    def test_provider_exception_never_discloses_credentials_or_response(self):
        client = client_for(selection())
        secret = "FAKE_SECRET_FOR_TEST_ONLY"
        client.chat.completions.create.side_effect = RuntimeError(secret)
        with self.assertRaises(requirements.RequirementsError) as caught:
            requirements.extract_requirements(source_document(), client=client)
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("저장하지 않았습니다", str(caught.exception))


class PersistenceTests(unittest.TestCase):
    def test_cache_reuse_avoids_api_and_write(self):
        document = source_document()
        saved = extracted(document)
        db = fake_database(document, saved)
        with patch.object(requirements, "requirements_database", return_value=nullcontext(db)), \
             patch.object(requirements, "extract_requirements") as extract:
            result = requirements.extract_and_save_requirements(document["_id"])
        self.assertEqual(result, saved)
        extract.assert_not_called()
        db[requirements.RESULT_COLLECTION].replace_one.assert_not_called()

    def test_failure_in_later_batch_never_writes_partial_result(self):
        document = source_document()
        db = fake_database(document)
        client = client_for(selection())
        client.chat.completions.create.side_effect = [
            response(selection(["summary"])), response(selection(["does-not-exist"]))]
        batches = [[{"block_id": "summary"}], [{"block_id": "detail"}]]
        with patch.object(requirements, "requirements_database", return_value=nullcontext(db)), \
             patch.object(requirements, "make_batches", return_value=batches), \
             patch.object(requirements, "get_client", return_value=client):
            with self.assertRaises(requirements.RequirementsError):
                requirements.extract_and_save_requirements(document["_id"])
        self.assertEqual(client.chat.completions.create.call_count, 2)
        client.close.assert_called_once()
        db[requirements.RESULT_COLLECTION].create_index.assert_not_called()
        db[requirements.RESULT_COLLECTION].replace_one.assert_not_called()

    def test_explicit_extraction_can_replace_corrupted_saved_result(self):
        document = source_document()
        valid = extracted(document)
        corrupt = copy.deepcopy(valid)
        corrupt["details"]["blocks"][0]["table"]["cells"][0][0]["text"] = "잘못 저장된 값"
        db = fake_database(document, corrupt)
        with patch.object(requirements, "requirements_database", return_value=nullcontext(db)), \
             patch.object(requirements, "extract_requirements", return_value=valid) as extract:
            result = requirements.extract_and_save_requirements(document["_id"])
        self.assertEqual(result, valid)
        extract.assert_called_once()
        db[requirements.RESULT_COLLECTION].replace_one.assert_called_once_with(
            {"_id": valid["_id"]}, valid, upsert=True)

    def test_stale_revision_before_save_never_writes(self):
        document = source_document()
        result = extracted(document)
        current = copy.deepcopy(document)
        current["active_revision"] = "revision-2"
        db = fake_database(current)
        with self.assertRaises(requirements.RequirementsError):
            requirements.save_requirements(db, document, result)
        db[requirements.RESULT_COLLECTION].create_index.assert_not_called()
        db[requirements.RESULT_COLLECTION].replace_one.assert_not_called()

    def test_changed_source_with_same_revision_before_save_never_writes(self):
        document = source_document()
        result = extracted(document)
        current = copy.deepcopy(document)
        current["blocks"][0]["text"] = "변경된 원문"
        db = fake_database(current)
        with self.assertRaises(requirements.RequirementsError):
            requirements.save_requirements(db, document, result)
        db[requirements.RESULT_COLLECTION].replace_one.assert_not_called()

    def test_successful_save_is_linked_by_document_revision_and_result_id(self):
        document = source_document()
        result = extracted(document)
        db = fake_database(document)
        requirements.save_requirements(db, document, result)
        db[requirements.RESULT_COLLECTION].replace_one.assert_called_once_with(
            {"_id": result["_id"]}, result, upsert=True)
        self.assertEqual(result["document_id"], document["_id"])
        self.assertEqual(result["source_revision"], document["active_revision"])

    def test_separate_block_collection_only_loads_active_document_revision(self):
        document = source_document()
        blocks = document.pop("blocks")
        db = fake_database(document)
        db["hwpx_blocks"].find.return_value.sort.return_value = blocks
        loaded = requirements.read_source(db, document["_id"])
        self.assertEqual(loaded["blocks"], blocks)
        db["hwpx_blocks"].find.assert_called_once_with(
            {"document_id": "document-a", "revision": "revision-1"},
            {"_id": 0, "document_id": 0, "revision": 0})
        db["hwpx_blocks"].find.return_value.sort.assert_called_once_with("order", 1)

    def test_loading_saved_result_rejects_a_changed_revision(self):
        document = source_document()
        db = fake_database(dict(document, active_revision="revision-2"), extracted(document))
        with patch.object(requirements, "requirements_database", return_value=nullcontext(db)):
            with self.assertRaises(requirements.RequirementsError):
                requirements.load_saved_requirements(document)
        db[requirements.RESULT_COLLECTION].find_one.assert_not_called()


class ClientConfigurationTests(unittest.TestCase):
    def test_environment_key_precedes_dotenv_and_endpoint_is_official(self):
        env_path = Path("/unused/test.env")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "  fake-env-key  ",
                                     "OPENAI_BASE_URL": "https://untrusted.invalid"}, clear=True), \
             patch("dotenv.dotenv_values", return_value={"OPENAI_API_KEY": "fake-file-key"}) as dotenv, \
             patch("openai.OpenAI") as constructor:
            requirements.get_client(env_path)
        dotenv.assert_called_once_with(env_path, interpolate=False)
        self.assertEqual(constructor.call_args.kwargs["api_key"], "fake-env-key")
        self.assertEqual(constructor.call_args.kwargs["base_url"], "https://api.openai.com/v1")

    def test_dotenv_fallback_and_missing_key_error(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch("dotenv.dotenv_values", return_value={"OPENAI_API_KEY": "fake-file-key"}), \
             patch("openai.OpenAI") as constructor:
            requirements.get_client()
        self.assertEqual(constructor.call_args.kwargs["api_key"], "fake-file-key")
        with patch.dict(os.environ, {}, clear=True), \
             patch("dotenv.dotenv_values", return_value={}), patch("openai.OpenAI") as constructor:
            with self.assertRaises(requirements.RequirementsError):
                requirements.get_client()
        constructor.assert_not_called()


if __name__ == "__main__":
    unittest.main()
