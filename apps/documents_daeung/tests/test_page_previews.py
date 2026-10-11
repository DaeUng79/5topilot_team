import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import apps.app.documents.streamlit_main as app
from apps.app.documents.streamlit_page_preview import remove_rendered_page_label


class PagePreviewTests(unittest.TestCase):
    def test_removes_only_page_label_outside_body(self):
        """SVG의 본문·제목·다른 숫자는 보존하고 본문 밖의 인쇄 쪽번호만 제거하는지 검증한다."""
        svg = ('<svg xmlns="http://www.w3.org/2000/svg">'
               '<g><text y="10">2</text></g><text y="20">제목</text>'
               '<text y="30">-</text><text y="30">2</text><text y="30">-</text>'
               '<text y="40">2026</text></svg>')
        result = remove_rendered_page_label(svg, 2)
        self.assertIn('>2<', result)
        self.assertIn('제목', result)
        self.assertIn('2026', result)
        self.assertNotIn('y="30"', result)

    def test_preview_generation_and_cache_need_no_database_write(self):
        """미리보기를 한 번 생성한 뒤 캐시를 재사용하고 DB에 접근하지 않는지 검증한다."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = b'PKoriginal'
            digest = hashlib.sha256(data).hexdigest()
            source = root / 'output/uploads' / digest / 'test.hwpx'
            source.parent.mkdir(parents=True)
            source.write_bytes(data)
            document = {'source_sha256': digest}
            preview = {'source_sha256': digest, 'pages': [
                {'physical_page_number': 1, 'page_number': None}], 'svgs': {'1': '<svg/>'}}

            def run(command, **kwargs):
                """미리보기 작업자를 대신해 명령·제한시간을 확인하고 합성 SVG 결과 파일을 만든다."""
                self.assertEqual(command[2], str(source))
                self.assertEqual(kwargs['timeout'], 300)
                Path(command[-1]).write_text(json.dumps(preview))
                return subprocess.CompletedProcess(command, 0)

            with patch.object(app, 'ROOT', root), \
                 patch.object(app.subprocess, 'run', side_effect=run) as worker, \
                 patch.object(app, 'database_connection') as db:
                self.assertEqual(app.load_page_previews(document), preview)
                self.assertEqual(app.load_page_previews(document), preview)
                worker.assert_called_once()
                db.assert_not_called()

    def test_wrong_original_hash_is_not_rendered(self):
        """해시가 다른 로컬 파일을 원본으로 사용하지 않는지 검증한다."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'output/uploads' / ('a' * 64) / 'test.hwpx'
            source.parent.mkdir(parents=True)
            source.write_bytes(b'wrong document')
            with patch.object(app, 'ROOT', root), patch.object(app.subprocess, 'run') as worker:
                self.assertIsNone(app.load_page_previews({'source_sha256': 'a' * 64}))
                worker.assert_not_called()


if __name__ == '__main__':
    unittest.main()
