import importlib.util
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
import xml.etree.ElementTree as ET

from apps.documents_daeung.step3_ai_requirements_extract_to_SQLite import compact_blocks

spec = importlib.util.spec_from_file_location("parser", Path(__file__).resolve().parents[1] / "step1_hwpx_parse_to_JSON.py")
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
HP, HC, HH, HS = parser.HP, parser.HC, parser.HH, parser.HS


def p(text):
    """테스트 입력 텍스트를 HWPX 문단 XML 조각으로 감싼다."""
    return f'<hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p>'


def table(content):
    """테스트 내용을 두 열이 병합된 단일 셀의 표 XML 조각으로 감싼다."""
    return f'<hp:tbl rowCnt="1" colCnt="2"><hp:tr><hp:tc borderFillIDRef="1"><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="2"/><hp:subList>{content}</hp:subList></hp:tc></hp:tr></hp:tbl>'


class ParserTests(unittest.TestCase):
    def setUp(self):
        """각 파서 테스트의 임시 폴더와 자동 정리 작업을 등록한다."""
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def fixture(self, body):
        """표·그림 매니페스트와 지정 본문을 포함한 임시 HWPX ZIP 파일을 만든다."""
        path = self.root / 'test.hwpx'
        with zipfile.ZipFile(path, 'w') as z:
            z.writestr('Contents/header.xml', f'<hh:head xmlns:hh="{HH}" xmlns:hc="{HC}"><hh:borderFill id="1"><hc:fillBrush><hc:winBrush faceColor="#ABCDEF"/></hc:fillBrush></hh:borderFill></hh:head>')
            z.writestr('Contents/section0.xml', f'<hs:sec xmlns:hs="{HS}" xmlns:hp="{HP}" xmlns:hc="{HC}">{body}</hs:sec>')
            z.writestr('Contents/content.hpf', '<package><manifest><item id="different_id" href="BinData/actual.bmp" media-type="image/bmp"/></manifest></package>')
            z.writestr('BinData/actual.bmp', b'BMfixture')
        return path

    def parse(self, body):
        """합성 HWPX를 만들고 렌더러 없이 파싱해 구조 검증용 결과를 반환한다."""
        return parser.parse_hwpx(self.fixture(body), output_dir=self.root, paginate=False)

    def test_mixed_text_and_cell_text(self):
        """일반 문단과 표 셀에서 탭·줄바꿈이 동일하게 보존되는지 검증한다."""
        text = 'A<hp:tab/>B<hp:lineBreak/>C'
        result = self.parse(p(text) + '<hp:p><hp:run>' + table(p(text)) + '</hp:run></hp:p>')
        self.assertEqual(result['blocks'][0]['text'], 'A\tB\nC')
        self.assertEqual(result['tables'][0]['cells'][0][0]['text'], 'A\tB\nC')

    def test_formula_field_keeps_cached_result_without_formula_metadata(self):
        """수식 내부 메타데이터는 제외하고 화면에 표시되는 계산 결과만 추출하는지 검증한다."""
        formula = (
            '<hp:p><hp:run><hp:ctrl><hp:fieldBegin type="FORMULA">'
            '<hp:parameters cnt="2"><hp:stringParam name="Formula">'
            '8=SUM(?2:?11)??%g,;;69=SUM(?2:?11)%g,69'
            '</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl>'
            '<hp:t>69</hp:t><hp:ctrl><hp:fieldEnd/></hp:ctrl></hp:run></hp:p>'
        )
        result = self.parse('<hp:p><hp:run>' + table(formula) + '</hp:run></hp:p>')
        cell = result['tables'][0]['cells'][0][0]
        paragraph = next(block for block in result['blocks'] if block['type'] == 'paragraph')

        self.assertEqual(cell['text'], '69')
        self.assertEqual(paragraph['text'], '69')
        self.assertNotIn('SUM', cell['text'])

    def test_nested_table_once_and_parent_link(self):
        """중첩 표의 부모 셀 참조와 청크 내 텍스트의 중복 없는 추출을 검증한다."""
        inner = '<hp:p><hp:run><hp:t>outer</hp:t>' + table(p('inner')) + '</hp:run></hp:p>'
        result = self.parse('<hp:p><hp:run>' + table(inner) + '</hp:run></hp:p>')
        self.assertEqual(len(result['tables']), 2)
        self.assertEqual(result['tables'][0]['cells'][0][0]['text'], 'outer')
        nested = next(b for b in result['blocks'] if b['block_id'] == 'tbl_0002')
        self.assertEqual(nested['parent_cell_id'], 'tbl_0001_r0_c0')
        units = compact_blocks(result)
        texts = json.dumps(units, ensure_ascii=False)
        self.assertEqual(texts.count('inner'), 1)

    def test_cell_image_manifest_and_bytes(self):
        """매니페스트로 찾은 셀 이미지 바이트와 부모 셀 연결을 검증한다."""
        pic = '<hp:p><hp:run><hp:pic><hc:img binaryItemIDRef="different_id"/></hp:pic></hp:run></hp:p>'
        result = self.parse('<hp:p><hp:run>' + table(pic) + '</hp:run></hp:p>')
        self.assertEqual(len(result['images']), 1)
        image = result['images'][0]
        self.assertEqual(Path(image['image_path']).read_bytes(), b'BMfixture')
        block = next(b for b in result['blocks'] if b['type'] == 'image')
        self.assertEqual(block['parent_cell_id'], 'tbl_0001_r0_c0')

    def test_merge_fill_and_no_fake_table_image(self):
        """셀 병합·단색 음영을 유지하고 생성하지 않은 표 이미지를 표시하지 않는지 검증한다."""
        result = self.parse('<hp:p><hp:run>' + table(p('value')) + '</hp:run></hp:p>')
        cell = result['tables'][0]['cells'][0][0]
        self.assertEqual(cell['col_span'], 2)
        self.assertEqual(cell['background_color'], '#ABCDEF')
        self.assertIsNone(result['tables'][0]['image_path'])

    def test_pagination_failure_is_partial_success(self):
        """페이지 매핑 실패 시 기본·엄격 모드는 중단하고 완화 모드는 본문과 경고를 반환하는지 검증한다."""
        path = self.fixture(p('preserved'))
        with patch.object(parser, 'read_rendered_pagination', side_effect=RuntimeError('failure')):
            with self.assertRaises(parser.PaginationError):
                parser.parse_hwpx(path, output_dir=self.root)
            result = parser.parse_hwpx(path, output_dir=self.root, strict_pagination=False)
            self.assertEqual(result['blocks'][0]['text'], 'preserved')
            self.assertEqual(result['warnings'][0]['code'], 'pagination_failed')
            with self.assertRaises(RuntimeError):
                parser.parse_hwpx(path, output_dir=self.root, strict_pagination=True)

    def test_unnumbered_cover_keeps_physical_page(self):
        """표지의 인쇄 번호는 비워 두고 물리 페이지는 파싱·저장 결과에 유지하는지 검증한다."""
        path = self.fixture(p('cover') + p('contents') + p('body'))
        pages = [{"physical_page_number": 1, "page_number": None},
                 {"physical_page_number": 2, "page_number": None},
                 {"physical_page_number": 3, "page_number": 1}]
        with patch.object(parser, "read_rendered_pagination",
                          return_value=({0: [1], 1: [2], 2: [3]}, pages)):
            result = parser.parse_hwpx(path, output_dir=self.root)
        self.assertEqual([b["physical_page_number"] for b in result["blocks"]], [1, 2, 3])
        self.assertEqual([b["page_number"] for b in result["blocks"]], [None, None, 1])
        self.assertEqual(result["blocks"][0]["physical_page_number"], 1)
        self.assertIsNone(result["blocks"][0]["page_number"])

    def test_printed_page_number_in_header_or_footer(self):
        """머리말·바닥글에서 문서명과 구별해 실제 인쇄 쪽번호를 읽는지 검증한다."""
        for region in ("Header", "Footer"):
            with self.subTest(region=region):
                tree = {"type": "Page", "children": [{"type": region, "children": [
                    {"type": "Container", "children": [
                        {"type": "TextLine", "children": [{"type": "TextRun", "text": "문서명"}]},
                        {"type": "TextLine", "children": [
                            {"type": "TextRun", "text": "- "},
                            {"type": "TextRun", "text": "12"},
                            {"type": "TextRun", "text": " -"},
                        ]},
                    ]},
                ]}]}
                self.assertEqual(parser.page_number_metadata_from_render_tree(tree), {
                    "page_number": 12, "page_number_source": f"rendered_{region.lower()}"})
                self.assertEqual(parser.page_number_from_render_tree(tree), 12)

    def test_verified_number_correction_preserves_cover_and_restart(self):
        """쪽번호 보정 시 표지·숨김 번호·번호 재시작과 물리 페이지가 유지되는지 검증한다."""
        path = self.fixture(p('cover') + p('body') + p('hidden') +
                            '<hp:p><hp:run><hp:ctrl><hp:newNum numType="PAGE" num="1"/>'
                            '</hp:ctrl><hp:t>restart</hp:t></hp:run></hp:p>')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        config = self.root / 'corrections.json'
        config.write_text(json.dumps({digest: {'physical_page_number': 2, 'page_number': 1}}))
        pages = [{'physical_page_number': i, 'page_number': n}
                 for i, n in enumerate([None, 2, None, 1, 2], 1)]
        with patch.object(parser, 'PAGE_NUMBER_CORRECTIONS', config), \
             patch.object(parser, 'read_rendered_pagination', return_value=(
                 {0: [1], 1: [2], 2: [3], 3: [4, 5]}, pages)):
            result = parser.parse_hwpx(path, output_dir=self.root)
        self.assertEqual([x['page_number'] for x in result['pages']], [None, 1, None, 1, 2])
        self.assertEqual(result['blocks'][1]['page_numbers'], [1])
        self.assertEqual(result['blocks'][1]['physical_page_number'], 2)
        self.assertEqual(result['blocks'][1]['rendered_page_number'], 2)
        self.assertEqual(result['blocks'][1]['page_number_source'], 'verified_number_correction')
        self.assertEqual(result['blocks'][3]['page_numbers'], [1, 2])

    def test_number_correction_does_not_apply_to_other_file(self):
        """원본 해시가 다른 문서에는 기존 쪽번호 보정을 적용하지 않는지 검증한다."""
        path = self.fixture(p('different'))
        config = self.root / 'corrections.json'
        config.write_text(json.dumps({'other_hash': {'physical_page_number': 2, 'page_number': 1}}))
        pages = [{'physical_page_number': 1, 'page_number': 2}]
        with patch.object(parser, 'PAGE_NUMBER_CORRECTIONS', config):
            self.assertIsNone(parser.correct_page_numbers(path, 'new_hash', {0: [1]}, pages))
        self.assertEqual(pages[0]['page_number'], 2)

    def test_cover_body_number_is_not_a_printed_page_number(self):
        """표지 본문의 숫자를 인쇄 쪽번호로 오인하지 않는지 검증한다."""
        tree = {"type": "Page", "children": [
            {"type": "Footer"}, {"type": "Header"},
            {"type": "Column", "children": [
                {"type": "TextLine", "children": [{"type": "TextRun", "text": "2026"}]},
            ]},
        ]}
        self.assertIsNone(parser.page_number_from_render_tree(tree))

    def test_parsed_blocks_are_repeatable_and_not_duplicated(self):
        """동일 원본의 파싱 결과가 재현되고 블록 ID가 중복되지 않는지 검증한다."""
        result = self.parse('<hp:p><hp:run>' + table(p('cell-value')) + '</hp:run></hp:p>')
        again = parser.parse_hwpx(self.root / 'test.hwpx', output_dir=self.root, paginate=False)
        self.assertEqual(result, again)
        self.assertEqual(len({block['block_id'] for block in result['blocks']}), len(result['blocks']))

    def test_missing_image_is_explicit(self):
        """이미지 바이너리가 없으면 경로를 만들지 않고 명시적인 경고를 남기는지 검증한다."""
        result = self.parse('<hp:p><hp:run><hp:pic><hc:img binaryItemIDRef="missing"/></hp:pic></hp:run></hp:p>')
        self.assertIsNone(result['images'][0]['image_path'])
        self.assertEqual(result['warnings'][0]['code'], 'missing_image_binary')


if __name__ == '__main__':
    unittest.main()
