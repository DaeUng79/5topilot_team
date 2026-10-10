import copy
import base64
import io
import unittest
from PIL import Image
from apps.app.modules.documents.streamlit_main import build_document_html, recover_page_metadata


class DocumentViewTests(unittest.TestCase):
    def fixture(self):
        return {'filename': '<script>test</script>', 'pages': [{'physical_page_number': 1, 'page_number': 1}, {'physical_page_number': 2, 'page_number': 2}],
                'blocks': [
                    {'block_id': 't', 'type': 'table', 'physical_page_numbers': [1],
                     'table': {'cells': [[{'col': 0, 'col_span': 2, 'row_span': 1, 'text': 'fallback',
                                           'background_color': '#aabbcc', 'child_block_ids': ['p', 'i']}]]}},
                    {'block_id': 'p', 'type': 'paragraph', 'parent_block_id': 't', 'text': 'unique-cell'},
                    {'block_id': 'i', 'type': 'image', 'parent_block_id': 't', 'image': {'asset_id': 'a'}},
                ]}

    def test_recover_unnumbered_cover_only_for_matching_content(self):
        current = {"blocks": [{"block_id": "p", "type": "paragraph", "text": "표지",
                              "physical_page_number": None, "physical_page_numbers": []}]}
        previous = [dict(current["blocks"][0], physical_page_number=1,
                         physical_page_numbers=[1], page_number=None, page_numbers=[None])]
        recovered = recover_page_metadata(current, previous)
        self.assertEqual(recovered["pages"], [{"physical_page_number": 1, "page_number": None}])
        self.assertNotIn('1쪽', build_document_html(recovered))
        self.assertIsNone(current["blocks"][0]["physical_page_number"])
        previous[0]["text"] = "다른 본문"
        self.assertIsNone(recover_page_metadata(current, previous))

    def test_printed_numbers_start_after_unnumbered_pages(self):
        document = {"pages": [
            {"physical_page_number": 1, "page_number": None},
            {"physical_page_number": 2, "page_number": None},
            {"physical_page_number": 3, "page_number": 1}],
            "blocks": [{"block_id": str(p), "type": "paragraph",
                        "physical_page_number": p, "text": f"content-{p}"}
                       for p in (1, 2, 3)]}
        output = build_document_html(document)
        self.assertEqual(output.count('class="paper"'), 3)
        self.assertEqual(output.count('aria-label="페이지 구분"'), 2)
        self.assertIn('aria-label="1쪽 시작"', output)
        self.assertNotIn('2쪽', output)
        self.assertNotIn('3쪽', output)
        self.assertLess(output.index('content-2'), output.index('aria-label="1쪽 시작"'))

    def test_nested_content_once_and_image_embedded(self):
        data = io.BytesIO()
        Image.new('RGB', (2, 2)).save(data, format='PNG')
        output = build_document_html(self.fixture(), image_loader=lambda _: data.getvalue())
        self.assertEqual(output.count('unique-cell'), 1)
        self.assertEqual(output.count('<table>'), 1)
        self.assertIn('colspan="2"', output)
        self.assertIn('background-color:#aabbcc', output)
        self.assertIn('data:image/png;base64,', output)
        self.assertNotIn('<script>', output)

    def test_missing_original_does_not_put_full_table_on_first_page(self):
        document = self.fixture()
        document['blocks'][0]['physical_page_numbers'] = [1, 2]
        output = build_document_html(document, selected_page=1)
        self.assertNotIn('unique-cell', output)
        self.assertIn('원본 파일을 다시 등록', output)
        self.assertNotIn('시작 쪽', output)

    def test_each_page_uses_its_own_rendered_content(self):
        document = self.fixture()
        document['blocks'][0]['physical_page_numbers'] = [1, 2]
        previews = {'pages': document['pages'], 'svgs': {
            '1': '<svg><text>first-rows</text></svg>',
            '2': '<svg><text>remaining-rows</text></svg>'}}
        encoded = {p: base64.b64encode(svg.encode()).decode() for p, svg in previews['svgs'].items()}
        output = build_document_html(document, page_previews=previews)
        for value in encoded.values():
            self.assertEqual(output.count(value), 1)
        selected = build_document_html(document, selected_page=2, page_previews=previews)
        self.assertNotIn(encoded['1'], selected)
        self.assertIn(encoded['2'], selected)
        self.assertNotIn('unique-cell', selected)
        self.assertNotIn('시작 쪽', output)
        self.assertNotIn('여러 페이지에 걸친 표', output)

    def test_cycle_and_missing_image_have_fallback(self):
        document = self.fixture()
        document['blocks'][0]['table']['cells'][0][0]['child_block_ids'].append('t')
        output = build_document_html(document, selected_page=1)
        self.assertIn('참조를 확인할 수 없습니다', output)
        self.assertIn('이미지 미리보기를 불러오지 못했습니다', output)


if __name__ == '__main__':
    unittest.main()
