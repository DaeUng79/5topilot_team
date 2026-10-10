import io
import json
import subprocess
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from streamlit.testing.v1 import AppTest
from PIL import Image
import apps.app.modules.documents.streamlit_main as app
from apps.app.modules.documents.step2_hwpx_storage import MongoStorageError


DOC = {
    '_id': 'doc1', 'document_id': 'doc1', 'filename': '테스트 제안요청서.hwpx',
    'stored_at': datetime(2026, 10, 3, tzinfo=timezone.utc),
    'pages': [{'physical_page_number': 1}],
    'counts': {'blocks': 3, 'assets': 1, 'chunks': 2},
    'blocks': [
        {'block_id': 'p1', 'type': 'paragraph', 'text': '유지관리 과업', 'physical_page_numbers': [1]},
        {'block_id': 't1', 'type': 'table', 'physical_page_numbers': [1],
         'table': {'cells': [[{'row': 0, 'col': 0, 'row_span': 1, 'col_span': 2,
                              'background_color': '#cccccc', 'text': '표 내용'}]]}},
        {'block_id': 'i1', 'type': 'image', 'physical_page_numbers': [1],
         'image': {'asset_id': 'image1', 'source_path': 'image.bmp'}},
    ], 'assets': [{'asset_id': 'image1', 'gridfs_id': 'image1'}],
}
SAVED = {'document_id': 'doc1', 'counts': DOC['counts']}


def app_test():
    return AppTest.from_string('from streamlit_main import main\nmain()', default_timeout=45)


class StreamlitTests(unittest.TestCase):
    def setUp(self):
        for name, value in (("load_history", ([], 0, 1)), ("load_document", DOC), ("load_image", b"")):
            patcher = patch.object(app, name, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_parser_worker_uses_project_environment_without_db_write(self):
        def run(command, **kwargs):
            self.assertEqual(command[0], str(app.ROOT / '.venv/bin/python'))
            self.assertIn('--no-mongo', command)
            self.assertIn('--strict-pagination', command)
            self.assertEqual(kwargs['timeout'], 300)
            output = Path(command[command.index('--output-json') + 1])
            output.write_text(json.dumps({'pages': [
                {'page_number': None, 'physical_page_number': 1},
                {'page_number': 1, 'physical_page_number': 2}]}))
            return subprocess.CompletedProcess(command, 0)
        with patch.object(app.subprocess, 'run', side_effect=run):
            result = app.parse_in_worker(Path('/tmp/test.hwpx'))
        self.assertIsNone(result['pages'][0]['page_number'])
        self.assertEqual(result['pages'][1]['page_number'], 1)

    def test_parser_worker_failure_and_timeout(self):
        for failure in (subprocess.CompletedProcess([], 1, stderr=b'private details'),
                        subprocess.TimeoutExpired('parser', 300)):
            kwargs = ({'side_effect': failure} if isinstance(failure, Exception)
                      else {'return_value': failure})
            with self.subTest(failure=type(failure).__name__), \
                 patch.object(app.subprocess, 'run', **kwargs), \
                 self.assertRaises(app.AppError) as caught:
                app.parse_in_worker(Path('/tmp/test.hwpx'))
            self.assertNotIn('private details', str(caught.exception))

    def test_latest_document_opens_in_main(self):
        older = dict(DOC, _id="older")
        with patch.object(app, "load_history", return_value=([DOC, older], 2, 1)) as history, \
             patch.object(app, "load_document", return_value=DOC) as load:
            at = app_test().run()
            self.assertFalse(at.exception)
            load.assert_called_once_with("doc1")
            self.assertEqual(len(at.sidebar.file_uploader), 1)
            self.assertEqual(len(at.main.get("iframe")), 1)
            self.assertEqual(len(at.sidebar.get("iframe")), 0)
            at.selectbox(key="history_choice_1").set_value("older").run()
            self.assertEqual(at.session_state.selected_document, "doc1")
            at.button(key="open_document").click().run()
            self.assertEqual(at.session_state.selected_document, "older")
            load.assert_called_with("older")
            # 새 문서가 추가되어도 일반 재실행에서 사용자가 연 문서를 유지한다.
            newer = dict(DOC, _id="newer")
            history.return_value = ([newer, DOC, older], 3, 1)
            at.run()
            self.assertFalse(at.exception)
            self.assertEqual(at.session_state.selected_document, "older")
            self.assertEqual(at.selectbox(key="history_choice_1").value, "older")
            load.assert_called_with("older")

    def test_delete_confirmation_and_empty_state(self):
        with patch.object(app, "load_history", return_value=([DOC], 1, 1)) as history, \
             patch.object(app, "delete_document") as delete:
            at = app_test().run()
            at.button(key="delete_document").click().run()
            delete.assert_not_called()
            at.button(key="cancel_delete_document").click().run()
            delete.assert_not_called()
            at.button(key="delete_document").click().run()
            delete.side_effect = lambda _: setattr(history, "return_value", ([], 0, 1))
            at.button(key="confirm_delete_document").click().run()
            delete.assert_called_once_with("doc1")
            self.assertFalse(at.exception)
            self.assertNotIn("selected_document", at.session_state)
            self.assertTrue(any(x.value == "제안요청서를 등록해주세요" for x in at.main.info))

    def test_delete_preserves_shared_files(self):
        db = MagicMock()
        db[app.COLLECTION].find_one.side_effect = [
            {"assets": [{"gridfs_id": "shared"}, {"gridfs_id": "unique"}]},
            {"_id": "other"}, {"_id": "other"}]
        db.hwpx_assets.find.return_value = []
        connection = MagicMock()
        connection.__enter__.return_value = db
        with patch.object(app, "database_connection", return_value=connection), \
             patch.object(app, "GridFS") as fs:
            app.delete_document("doc1")
            fs.return_value.delete.assert_not_called()
        db[app.COLLECTION].delete_one.assert_called_once_with({"_id": "doc1"})

    def test_initial_view_requires_file(self):
        at = app_test().run()
        self.assertFalse(at.exception)
        self.assertTrue(at.button(key='register').disabled)
        self.assertTrue(any(x.value == '제안요청서를 등록해주세요' for x in at.main.info))

    def test_upload_save_and_open(self):
        with patch.object(app, 'parse_upload', return_value=(DOC, Path('source.hwpx'))) as parse, \
             patch.object(app, 'save_to_mongodb', return_value=SAVED) as save, \
             patch.object(app, 'load_history', return_value=([DOC], 1, 1)), \
             patch.object(app, 'load_document', return_value=DOC):
            at = app_test().run()
            at.file_uploader[0].set_value(('source.hwpx', b'PKtest', 'application/zip')).run()
            at.button(key='register').click().run()
            self.assertFalse(at.exception)
            self.assertTrue(at.success)
            parse.assert_called_once()
            self.assertEqual(save.call_args.kwargs['database'], 'Request_for_Proposal')
            self.assertEqual(save.call_args.kwargs['collection_name'], 'Request')
            self.assertEqual(at.session_state.selected_document, 'doc1')
            self.assertEqual(len(at.main.get('iframe')), 1)
            at.button(key='open_saved').click().run()
            self.assertFalse(at.exception)
            self.assertEqual(at.radio(key='detail_view').value, '문서 보기')
            self.assertEqual(len(at.get('iframe')), 1)
            at.radio(key='detail_view').set_value('표').run()
            self.assertTrue(any('표 내용' in t.value for t in at.markdown))
            # 상세 화면의 일반 재실행은 DB에 다시 쓰지 않는다.
            save.assert_called_once()

    def test_save_failure_keeps_result_and_retry(self):
        with patch.object(app, 'parse_upload', return_value=(DOC, Path('source.hwpx'))), \
             patch.object(app, 'save_to_mongodb', side_effect=[MongoStorageError('연결 실패'), SAVED]) as save:
            at = app_test().run()
            at.file_uploader[0].set_value(('source.hwpx', b'PKtest', 'application/zip')).run()
            at.button(key='register').click().run()
            self.assertTrue(at.warning)
            self.assertIn('pending_save', at.session_state)
            at.button(key='retry_save').click().run()
            self.assertFalse(at.exception)
            self.assertTrue(at.success)
            self.assertEqual(save.call_count, 2)
            at.file_uploader[0].set_value(('new.hwpx', b'PKnew', 'application/zip')).run()
            self.assertFalse(at.success)
            self.assertNotIn('saved_upload', at.session_state)

    def test_history_selection_table_and_image(self):
        image = io.BytesIO()
        Image.new('RGB', (4, 4), 'blue').save(image, format='PNG')
        with patch.object(app, 'load_history', return_value=([DOC], 1, 1)) as history, \
             patch.object(app, 'load_document', return_value=DOC), \
             patch.object(app, 'load_image', return_value=image.getvalue()) as load:
            at = app_test().run()
            history.assert_called_with('', 1)
            self.assertEqual(at.selectbox(key='history_choice_1').value, 'doc1')
            at.button(key='open_document').click().run()
            self.assertEqual(at.session_state.selected_document, 'doc1')
            at.radio(key='detail_view').set_value('표').run()
            self.assertTrue(any('colspan="2"' in m.value for m in at.markdown))
            load.reset_mock()
            at.radio(key='detail_view').set_value('이미지').run()
            load.assert_called_once_with('image1')
            self.assertEqual(len(at.get('image')), 1)
            self.assertFalse(at.exception)

    def test_empty_and_disconnected_history(self):
        with patch.object(app, 'load_history', return_value=([], 0, 1)):
            at = app_test().run()
            self.assertTrue(any(x.value == '제안요청서를 등록해주세요' for x in at.main.info))
            self.assertFalse(at.exception)
        with patch.object(app, 'load_history', side_effect=app.AppError('연결 실패')):
            at.run()
            self.assertTrue(any(x.value == '연결 실패' for x in at.sidebar.error))
            self.assertTrue(at.main.warning)
            self.assertFalse(at.main.info)
            self.assertFalse(at.exception)
        with patch.object(app, 'load_history', return_value=([], 0, 1)):
            at.run()
            self.assertFalse(at.error)
            self.assertFalse(at.main.warning)
            self.assertTrue(any(x.value == '제안요청서를 등록해주세요' for x in at.main.info))
            self.assertFalse(at.exception)

    def test_untrusted_names_text_and_search(self):
        self.assertEqual(app.clean_filename('../../test.hwpx'), 'test.hwpx')
        self.assertEqual(app.clean_filename('C:\\folder\\test.hwp'), 'test.hwp')
        with self.assertRaises(app.AppError):
            app.parse_upload(b'plain text', 'test.hwpx')
        markup = app.table_html({'cells': [[{'text': '<script>alert(1)</script>', 'background_color': 'red;"onclick=bad'}]]})
        self.assertNotIn('<script>', markup)
        self.assertNotIn('onclick', markup)
        self.assertIn('\\.', str(app.history_query('a.b')))
        self.assertEqual(app.display_time(datetime(2026, 10, 3)), '2026.10.03 09:00')


if __name__ == '__main__':
    unittest.main()
