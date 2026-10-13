import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from apps.ai_chatbot_daeung import chatbot
from apps.documents_daeung.step2_hwpx_save_to_SQLite import SCHEMA


class ChatbotTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / 'fixture.sqlite3'
        table = {'block_id': 't1', 'type': 'table', 'physical_page_numbers': [2, 3],
                 'table': {'cells': [[{'row': 0, 'col': 0, 'row_span': 2, 'col_span': 1,
                                      'text': '사업 예산 100원', 'width': 999}]]}}
        self.source = {'blocks': [table, {'block_id': 'p1', 'type': 'paragraph',
                                        'parent_block_id': 't1', 'text': '사업 예산 100원'},
                                 {'block_id': 'p2', 'type': 'paragraph', 'text': '별도 근거',
                                  'physical_page_number': 4}, {'block_id': 'i1', 'type': 'image'}]}
        with closing(sqlite3.connect(self.db)) as connection:
            connection.executescript(SCHEMA)
            for key in ('a', 'b'):
                connection.execute('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)',
                                   (key, key + '.hwpx', key, 'new', '', ''))
                for rev in ('old', 'new'):
                    source = self.source if rev == 'new' else {'blocks': []}
                    connection.execute('INSERT INTO parse_snapshots VALUES (?, ?, ?, ?, ?, ?)',
                                       (key, rev, '', '', json.dumps(source), ''))

            connection.commit()

    def test_active_versions_tables_dedup_and_scope(self):
        context = chatbot.load_context(self.db, ['a'])
        data = context['documents']
        self.assertEqual([d['document_id'] for d in data], ['a'])
        self.assertEqual(data[0]['revision'], 'new')
        self.assertEqual([b['block_id'] for b in data[0]['blocks']], ['t1', 'p2'])
        self.assertEqual(data[0]['blocks'][0]['rows'][0][0]['row_span'], 2)
        self.assertNotIn('width', context['content'])
        self.assertEqual(data[0]['blocks'][1]['pages'], [4])
        self.assertEqual(context['image_count'], 1)
        self.assertNotEqual(context['fingerprint'], chatbot.load_context(self.db, ['a', 'b'])['fingerprint'])
        with self.assertRaises(chatbot.ChatbotError):
            chatbot.load_context(self.db, ['missing'])

    def test_compact_payload_preserves_cells_text_and_source_links(self):
        context = chatbot.load_context(self.db, ['a'])
        payload = json.loads(context['content'])
        document = payload['documents'][0]
        self.assertNotIn('document_id', document)
        self.assertNotIn('revision', document)
        self.assertEqual(document['blocks'][0]['cells'], [[0, 0, '사업 예산 100원', 2, 1]])
        self.assertEqual(document['blocks'][0]['table_ref'], 'T1')
        self.assertEqual(document['blocks'][1]['text'], '별도 근거')
        self.assertEqual(document['blocks'][1]['p'], [4])
        # 빈 셀·줄바꿈·0·병합을 보존하고, 기본 병합값만 생략한다.
        units = context['documents']
        units[0]['blocks'][0]['rows'].append([
            {'row': 2, 'col': 0, 'text': '', 'row_span': 1, 'col_span': 1},
            {'row': 2, 'col': 1, 'text': '0\n가 | 나', 'row_span': 1, 'col_span': 2}])
        cells = chatbot.compact_payload(units)['documents'][0]['blocks'][0]['cells']
        self.assertEqual(cells[-2], [2, 0, ''])
        self.assertEqual(cells[-1], [2, 1, '0\n가 | 나', 1, 2])
        before = context['fingerprint']
        with closing(sqlite3.connect(self.db)) as connection:
            connection.execute("UPDATE parse_snapshots SET revision='newer' WHERE revision='new'")
            connection.execute("UPDATE documents SET active_revision='newer'")
            connection.commit()
        updated = chatbot.load_context(self.db, ['a'])
        self.assertEqual(context['content'], updated['content'])
        self.assertNotEqual(before, updated['fingerprint'])

    def test_text_cleanup_and_page_boundaries(self):
        self.assertEqual(chatbot.clean_text(
            '  CNR-004\t API  1,000원\n\n━━━\n① -3.5% / A+B ', paragraph=True),
            'CNR-004 API 1,000원\n① -3.5% / A+B')
        self.assertEqual(chatbot.clean_text('---'), '---')
        units = [{"filename": "예시.hwpx", "blocks": [
            {"block_id": str(i), "type": "paragraph", "pages": pages, "text": text}
            for i, (pages, text) in enumerate([
                ([1], '첫 문단'), ([1], '━━━'), ([1], '다음 문단'),
                ([2], '다른 페이지'), ([2, 3], '여러 쪽')])]}]
        packed = chatbot.compact_payload(units)['documents'][0]['blocks']
        self.assertEqual(packed, [
            {'p': [1], 'text': '첫 문단\n다음 문단'},
            {'p': [2], 'text': '다른 페이지'}, {'p': [2, 3], 'text': '여러 쪽'}])
        self.assertEqual(units[0]['blocks'][1]['text'], '━━━')

    def test_no_silent_document_truncation_and_history_pair_trimming(self):
        history = [{'role': 'user', 'content': 'x' * 1500},
                   {'role': 'assistant', 'content': 'y' * 1500}]
        with patch.object(chatbot, 'count_tokens', side_effect=lambda s: (len(s), 'test')), \
             patch.object(chatbot, 'CONTEXT_WINDOW', 8000):
            messages, removed, _ = chatbot.build_messages('원문 전체', history, '질문')
            self.assertEqual(removed, 2)
            self.assertIn('원문 전체', messages[1]['content'])
            self.assertEqual(messages[-1]['content'], '질문')
            with self.assertRaises(chatbot.ChatbotError):
                chatbot.build_messages('x' * 9000, [], '질문')

    def test_table_references_are_scoped_and_deduplicated(self):
        context = chatbot.load_context(self.db, ['a', 'b'])
        self.assertEqual(context['source_tables']['T1']['document_id'], 'a')
        self.assertEqual(context['source_tables']['T2']['document_id'], 'b')
        text, tables, invalid = chatbot.answer_parts(
            '설명 [[TABLE:T2]] [[TABLE:T2]] [[TABLE:T99]]', context['source_tables'])
        self.assertEqual(text, '설명')
        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0]['document_id'], 'b')
        self.assertEqual(invalid, ['T99'])
        self.assertEqual(chatbot.answer_parts('설명 [[TAB', {}, streaming=True)[0], '설명')

    def test_original_table_rendering_and_chat_rerun(self):
        from streamlit.testing.v1 import AppTest
        from unittest.mock import MagicMock
        from apps.documents_daeung.streamlit_parser_test_page import table_html
        markup = table_html({'cells': [[{'text': '<script>alert(1)</script>',
            'row_span': 2, 'col_span': 3, 'width': 100, 'background_color': '#eeeeee'}]]})
        self.assertIn('rowspan="2" colspan="3"', markup)
        self.assertIn('background-color:#eeeeee', markup)
        self.assertIn('width:100.000%', markup)
        self.assertIn('&lt;script&gt;', markup)
        self.assertNotIn('<script>', markup)
        code = f"""import streamlit as st
from apps.ai_chatbot_daeung.streamlit_chat import prepare_chatbot, render_chatbot
tabs = st.tabs(["문서 챗봇"], key="document_page_tabs", on_change="rerun")
chat_state = prepare_chatbot({str(self.db)!r}, [{{"document_id": "a", "filename": "a.hwpx"}}], "a")
prompt = None
if chat_state is not None:
    prompt = st.chat_input("질문", disabled=bool(chat_state[2]), key="document_chat_prompt")
with tabs[0]:
    render_chatbot(chat_state, prompt)"""
        app = AppTest.from_string(code).run()
        self.assertEqual(len(app.chat_input), 1)
        self.assertEqual(len(app.sidebar.chat_input), 0)
        with patch('apps.ai_chatbot_daeung.streamlit_chat.get_client', return_value=MagicMock()), \
             patch('apps.ai_chatbot_daeung.streamlit_chat.stream_answer',
                   return_value=iter(['원본 표입니다. [[TAB', 'LE:T1]]'])):
            app.chat_input[0].set_value('표를 보여줘').run()
        self.assertFalse(app.exception)
        self.assertTrue(any('rowspan="2"' in element.value for element in app.markdown))
        self.assertTrue(any('a.hwpx · 표 t1' in element.value for element in app.caption))
        self.assertFalse(any('rowspan="2"' in element.value for element in app.sidebar.markdown))
        self.assertTrue(any('rowspan="2"' in element.value for element in app.markdown))
        self.assertFalse(any('[[TABLE:' in element.value for element in app.markdown))
        app.run()
        self.assertFalse(app.exception)
        self.assertTrue(any('rowspan="2"' in element.value for element in app.markdown))
        self.assertTrue(any('원본 표입니다.' in element.value for element in app.markdown))
        self.assertFalse(any('원본 표입니다.' in element.value for element in app.sidebar.markdown))
        self.assertTrue(any('a.hwpx · 표 t1' in element.value for element in app.caption))

    def test_stream_failure_not_silently_successful(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        client = MagicMock()
        client.chat.completions.create.return_value.__enter__.return_value = [
            SimpleNamespace(choices=[SimpleNamespace(finish_reason='length',
                                                     delta=SimpleNamespace(content=None))])]
        with self.assertRaises(chatbot.ChatbotError):
            list(chatbot.stream_answer(client, []))

    def test_streamlit_scope_and_missing_key(self):
        from streamlit.testing.v1 import AppTest
        code = f'''import streamlit as st
from apps.ai_chatbot_daeung.streamlit_chat import prepare_chatbot, render_chatbot
tabs = st.tabs(["문서 챗봇"], key="document_page_tabs", on_change="rerun")
chat_state = prepare_chatbot({str(self.db)!r}, [{{"document_id": "a", "filename": "a.hwpx"}},
                                          {{"document_id": "b", "filename": "b.hwpx"}}], "a")
prompt = None
if chat_state is not None:
    prompt = st.chat_input("질문", disabled=bool(chat_state[2]), key="document_chat_prompt")
with tabs[0]:
    render_chatbot(chat_state, prompt)'''
        app = AppTest.from_string(code).run()
        self.assertFalse(app.exception)
        self.assertTrue(any(widget.label == '질문 범위' for widget in app.sidebar.radio))
        self.assertTrue(any(button.label == '전달 JSON 다운로드'
                            for button in app.sidebar.get('download_button')))
        self.assertTrue(any(button.label == '대화 초기화' for button in app.sidebar.button))
        with patch.object(chatbot, 'get_client'):
            # UI imported its own name; fail without making any network request.
            with patch('apps.ai_chatbot_daeung.streamlit_chat.get_client',
                       side_effect=chatbot.ChatbotError('API 키를 설정해 주세요.')):
                app.chat_input[0].set_value('예산은?').run()
        self.assertFalse(app.exception)
        self.assertIn('API 키', app.error[0].value)
        self.assertEqual(app.session_state['document_chat_messages'], [])
        app.radio[0].set_value('문서 직접 선택').run()
        app.multiselect[0].set_value(['b']).run()
        self.assertFalse(app.exception)
        app.radio[0].set_value('등록된 사업').run()
        self.assertIn('사업에 연결된 문서가 없습니다', app.info[0].value)


if __name__ == '__main__':
    unittest.main()
