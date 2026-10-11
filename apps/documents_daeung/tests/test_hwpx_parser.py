import importlib.util
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
import xml.etree.ElementTree as ET

from apps.app.documents.step2_hwpx_storage import make_chunks, mongo_settings, prepare_records, split_text

spec = importlib.util.spec_from_file_location("parser", Path(__file__).resolve().parents[1] / "step1_parser_hwpx.py")
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
HP, HC, HH, HS = parser.HP, parser.HC, parser.HH, parser.HS


def p(text):
    return f'<hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p>'


def table(content):
    return f'<hp:tbl rowCnt="1" colCnt="2"><hp:tr><hp:tc borderFillIDRef="1"><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="2"/><hp:subList>{content}</hp:subList></hp:tc></hp:tr></hp:tbl>'


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def fixture(self, body):
        path = self.root / 'test.hwpx'
        with zipfile.ZipFile(path, 'w') as z:
            z.writestr('Contents/header.xml', f'<hh:head xmlns:hh="{HH}" xmlns:hc="{HC}"><hh:borderFill id="1"><hc:fillBrush><hc:winBrush faceColor="#ABCDEF"/></hc:fillBrush></hh:borderFill></hh:head>')
            z.writestr('Contents/section0.xml', f'<hs:sec xmlns:hs="{HS}" xmlns:hp="{HP}" xmlns:hc="{HC}">{body}</hs:sec>')
            z.writestr('Contents/content.hpf', '<package><manifest><item id="different_id" href="BinData/actual.bmp" media-type="image/bmp"/></manifest></package>')
            z.writestr('BinData/actual.bmp', b'BMfixture')
        return path

    def parse(self, body):
        return parser.parse_hwpx(self.fixture(body), output_dir=self.root, paginate=False)

    def test_mixed_text_and_cell_text(self):
        text = 'A<hp:tab/>B<hp:lineBreak/>C'
        result = self.parse(p(text) + '<hp:p><hp:run>' + table(p(text)) + '</hp:run></hp:p>')
        self.assertEqual(result['blocks'][0]['text'], 'A\tB\nC')
        self.assertEqual(result['tables'][0]['cells'][0][0]['text'], 'A\tB\nC')

    def test_formula_field_keeps_cached_result_without_formula_metadata(self):
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
        inner = '<hp:p><hp:run><hp:t>outer</hp:t>' + table(p('inner')) + '</hp:run></hp:p>'
        result = self.parse('<hp:p><hp:run>' + table(inner) + '</hp:run></hp:p>')
        self.assertEqual(len(result['tables']), 2)
        self.assertEqual(result['tables'][0]['cells'][0][0]['text'], 'outer')
        nested = next(b for b in result['blocks'] if b['block_id'] == 'tbl_0002')
        self.assertEqual(nested['parent_cell_id'], 'tbl_0001_r0_c0')
        texts = '\n'.join(c['text'] for c in make_chunks(result))
        self.assertEqual(texts.count('inner'), 1)

    def test_cell_image_manifest_and_bytes(self):
        pic = '<hp:p><hp:run><hp:pic><hc:img binaryItemIDRef="different_id"/></hp:pic></hp:run></hp:p>'
        result = self.parse('<hp:p><hp:run>' + table(pic) + '</hp:run></hp:p>')
        self.assertEqual(len(result['images']), 1)
        image = result['images'][0]
        self.assertEqual(Path(image['image_path']).read_bytes(), b'BMfixture')
        block = next(b for b in result['blocks'] if b['type'] == 'image')
        self.assertEqual(block['parent_cell_id'], 'tbl_0001_r0_c0')

    def test_merge_fill_and_no_fake_table_image(self):
        result = self.parse('<hp:p><hp:run>' + table(p('value')) + '</hp:run></hp:p>')
        cell = result['tables'][0]['cells'][0][0]
        self.assertEqual(cell['col_span'], 2)
        self.assertEqual(cell['background_color'], '#ABCDEF')
        self.assertIsNone(result['tables'][0]['image_path'])

    def test_pagination_failure_is_partial_success(self):
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
        path = self.fixture(p('cover') + p('contents') + p('body'))
        pages = [{"physical_page_number": 1, "page_number": None},
                 {"physical_page_number": 2, "page_number": None},
                 {"physical_page_number": 3, "page_number": 1}]
        with patch.object(parser, "read_rendered_pagination",
                          return_value=({0: [1], 1: [2], 2: [3]}, pages)):
            result = parser.parse_hwpx(path, output_dir=self.root)
        self.assertEqual([b["physical_page_number"] for b in result["blocks"]], [1, 2, 3])
        self.assertEqual([b["page_number"] for b in result["blocks"]], [None, None, 1])
        stored = prepare_records(result)["metadata"]
        self.assertEqual(stored["blocks"][0]["physical_page_number"], 1)
        self.assertIsNone(stored["blocks"][0]["page_number"])

    def test_printed_page_number_in_header_or_footer(self):
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
        path = self.fixture(p('different'))
        config = self.root / 'corrections.json'
        config.write_text(json.dumps({'other_hash': {'physical_page_number': 2, 'page_number': 1}}))
        pages = [{'physical_page_number': 1, 'page_number': 2}]
        with patch.object(parser, 'PAGE_NUMBER_CORRECTIONS', config):
            self.assertIsNone(parser.correct_page_numbers(path, 'new_hash', {0: [1]}, pages))
        self.assertEqual(pages[0]['page_number'], 2)

    def test_cover_body_number_is_not_a_printed_page_number(self):
        tree = {"type": "Page", "children": [
            {"type": "Footer"}, {"type": "Header"},
            {"type": "Column", "children": [
                {"type": "TextLine", "children": [{"type": "TextRun", "text": "2026"}]},
            ]},
        ]}
        self.assertIsNone(parser.page_number_from_render_tree(tree))

    def test_records_are_repeatable_and_not_duplicated(self):
        result = self.parse('<hp:p><hp:run>' + table(p('cell-value')) + '</hp:run></hp:p>')
        first, second = prepare_records(result), prepare_records(result)
        self.assertEqual(first, second)
        self.assertNotIn('tables', first['metadata'])
        self.assertEqual(len(first['chunks']), 1)
        self.assertEqual(len({r['_id'] for r in first['blocks']}), len(first['blocks']))

    def test_credentials_are_parsed_without_execution(self):
        env = self.root / '.env'
        with patch.dict('os.environ', {}, clear=True):
            env.write_text('client_db=MongoClient("mongodb://user:password@localhost/test")\n')
            uri, db = mongo_settings(env)
            self.assertTrue(uri.startswith('mongodb://'))
            self.assertIsNone(db)
            env.write_text('client_db=__import__("os").system("false")\n')
            with self.assertRaises(ValueError):
                mongo_settings(env)
            env.write_text('MONGODB_URI=mongodb://user:${PASSWORD}@localhost/test\n')
            self.assertIn('${PASSWORD}', mongo_settings(env)[0])

    def test_long_chunk_reconstruction(self):
        text = ('긴 문장입니다.\n' * 800)
        chunks = list(split_text(text))
        self.assertEqual(''.join(c[2] for c in chunks), text)
        self.assertTrue(all(len(c[2]) <= 2000 for c in chunks))

    def test_missing_image_is_explicit(self):
        result = self.parse('<hp:p><hp:run><hp:pic><hc:img binaryItemIDRef="missing"/></hp:pic></hp:run></hp:p>')
        self.assertIsNone(result['images'][0]['image_path'])
        self.assertEqual(result['warnings'][0]['code'], 'missing_image_binary')


if __name__ == '__main__':
    unittest.main()
