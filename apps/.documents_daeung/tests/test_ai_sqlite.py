import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from apps.documents_daeung import step3_ai_requirements_extract_to_SQLite as requirements
from apps.documents_daeung import step4_ai_criteria as criteria
from apps.documents_daeung.step2_hwpx_save_to_SQLite import save_to_sqlite


class SQLiteAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.database = self.root / 'docs.sqlite3'
        self.source = self.root / 'source.hwpx'
        self.source.write_bytes(b'example document')
        self.document_id = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.parsed = {
            'document_id': self.document_id, 'source_sha256': self.document_id,
            'filename': self.source.name, 'assets': [],
            'pages': [{'physical_page_number': 1, 'page_number': 1}],
            'blocks': [
                {'block_id': 'p1', 'order': 0, 'type': 'paragraph',
                 'parent_block_id': None, 'physical_page_numbers': [1],
                 'text': '사업 목적은 서비스를 개선하고 운영 안정성을 높이는 것이다.'},
                {'block_id': 'p2', 'order': 1, 'type': 'table',
                 'parent_block_id': None, 'physical_page_numbers': [1],
                 'table': {'cells': [
                     [dict(cell_id=f'c{row}{col}', row=row, col=col,
                           row_span=1, col_span=1, text=value)
                      for col, value in enumerate(values)]
                     for row, values in enumerate((
                         ('구분', '요구사항 번호', '요구사항 명칭', '요구사항수'),
                         ('기능 요구사항', 'FR-1', '서비스 개선', '1'),
                         ('운영 요구사항', 'FR-2', '운영 안정성', '1'),
                     ))
                 ]}},
                {'block_id': 'p3', 'order': 2, 'type': 'paragraph',
                 'parent_block_id': None, 'physical_page_numbers': [1],
                 'text': 'FR-1 서비스 개선을 수행하고 FR-2 운영 장애 대응체계를 마련해야 한다.'},
            ],
        }
        save_to_sqlite(self.parsed, self.database, source_path=self.source)

    def requirement_result(self, document):
        return {
            '_id': requirements._result_id(document), 'document_id': self.document_id,
            'source_revision': document['active_revision'],
            'source_fingerprint': requirements.source_fingerprint(document),
            'extractor_version': requirements.EXTRACTOR_VERSION,
            'model': requirements.DEFAULT_MODEL,
            'created_at': datetime.now(timezone.utc), 'status': 'complete',
            'warnings': [], 'usage': {}, 'business_source_block_ids': ['p1'],
            'business_status': {
                'current_status': [{'text': '서비스 운영 현황', 'source_block_ids': ['p1']}],
                'background_and_need': [], 'scope': [],
            },
            'requirement_list': requirements._section(document, ['p2']),
            'details': requirements._section(document, ['p3']),
        }

    def summary_criteria_rows(self, reference):
        rows = []
        for group in reference['rows']:
            first, second = divmod(group['score'], 2)
            scores = (first + second, first)
            for index, score in enumerate(scores, 1):
                rows.append({
                    'row_id': f"{group['row_id']}-{index:02d}",
                    'evaluation_division': group['evaluation_division'],
                    'division_score': group['score'],
                    'evaluation_item': f"평가항목 {index}",
                    'evaluation_criteria': '제안요구사항과의 부합성을 평가한다.',
                    'evaluation_elements': ['근거 제시의 구체성'], 'score': score,
                })
        return rows

    def criteria_rationale(self, rows):
        missing = '원문에서 확인되지 않아 직접 반영하지 않았습니다.'
        return {
            'current_status': '서비스 운영 현황을 고려해 수행 방안의 구체성을 평가합니다.',
            'background_and_need': missing,
            'scope': missing,
            'evaluation_links': [
                {'evaluation_division': name,
                 'reason': '서비스 운영 현황과 연결된 실행 방안을 평가합니다.'}
                for name in dict.fromkeys(row['evaluation_division'] for row in rows)
            ],
        }

    def test_extract_business_status_summary_tables_and_details(self):
        document = requirements.read_source(self.database, self.document_id)
        selection = {'business_block_ids': ['p1'],
                     'list_block_ids': ['p1', 'p2'], 'detail_block_ids': ['p3']}
        usage = {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}
        business_status = {
            'current_status': [{'text': '서비스 운영 현황', 'source_block_ids': ['p1']}],
            'background_and_need': [{'text': '운영 안정성이 필요하다', 'source_block_ids': ['p1']}],
            'scope': [{'text': '서비스 개선', 'source_block_ids': ['p1']}],
        }
        with (patch.object(requirements, '_classify', return_value=(selection, usage)) as classify,
              patch.object(requirements, '_summarize_business',
                           return_value=(business_status, usage)) as summarize):
            result = requirements.extract_requirements(document, client=object())
        classify.assert_called_once()
        summarize.assert_called_once()
        self.assertEqual(result['business_status'], business_status)
        self.assertEqual(result['business_source_block_ids'], ['p1'])
        self.assertEqual(result['requirement_list']['block_ids'], ['p2'])
        self.assertEqual(result['details']['block_ids'], ['p3'])
        self.assertEqual(result['validation']['excluded_non_table_summary_blocks'], 1)

    def test_requirements_and_criteria_roundtrip_with_revision_guard(self):
        document = requirements.read_source(self.database, self.document_id)
        result = self.requirement_result(document)
        requirements.save_requirements(self.database, document, result)
        self.assertEqual(requirements.load_saved_requirements(
            self.database, self.document_id)['requirement_list'], result['requirement_list'])

        reference = criteria._resolve_template(document, result)
        self.assertEqual(reference['template_source'], 'generated_from_summary')
        self.assertEqual([row['evaluation_division'] for row in reference['rows']],
                         ['기능 요구사항', '운영 요구사항'])
        rows = self.summary_criteria_rows(reference)
        generated = {
            '_id': criteria._criteria_id(document, result, reference),
            'document_id': self.document_id, 'source_revision': document['active_revision'],
            'source_requirements_id': result['_id'],
            'reference_document_id': reference['_id'],
            'reference_revision': reference['active_revision'],
            'reference_filename': reference['filename'],
            'template_source': reference['template_source'],
            'model': criteria.DEFAULT_MODEL, 'criteria_version': criteria.CRITERIA_VERSION,
            'created_at': datetime.now(timezone.utc), 'total_score': sum(r['score'] for r in rows),
            'rows': rows, 'table': criteria.build_criteria_table(rows),
            'supplemental_items': [], 'guideline_url': criteria.GUIDELINE_URL,
            'selection_rationale': self.criteria_rationale(rows), 'usage': {},
        }
        criteria.save_criteria(self.database, document, result, generated)
        self.assertEqual(criteria.load_saved_criteria(
            self.database, self.document_id)['rows'], rows)
        self.assertEqual(criteria.load_saved_criteria(
            self.database, self.document_id)['table']['groups'][0]['evaluation_division'],
                         '기능 요구사항')
        broken = {**generated, 'table': {**generated['table'], 'total_score': 1}}
        with self.assertRaises(criteria.CriteriaError):
            criteria.save_criteria(self.database, document, result, broken)

        self.parsed['blocks'][0]['text'] = '사업 목적 변경'
        save_to_sqlite(self.parsed, self.database, source_path=self.source)
        self.assertIsNone(requirements.load_saved_requirements(
            self.database, self.document_id))
        with self.assertRaises(criteria.CriteriaError):
            criteria.load_saved_criteria(self.database, self.document_id)

    def test_criteria_generation_uses_saved_sqlite_requirements(self):
        document = requirements.read_source(self.database, self.document_id)
        result = self.requirement_result(document)
        requirements.save_requirements(self.database, document, result)
        reference = criteria._resolve_template(document, result)
        generated_rows = self.summary_criteria_rows(reference)
        with (patch.object(criteria, '_call_model_from_summary',
                           return_value=(generated_rows, {'prompt_tokens': 0, 'completion_tokens': 0,
                                                          'total_tokens': 0})) as model_call,
              patch.object(criteria, '_generate_rationale',
                           return_value=(self.criteria_rationale(generated_rows),
                                         {'prompt_tokens': 0, 'completion_tokens': 0,
                                          'total_tokens': 0})),
              patch.object(criteria, '_find_supplemental_items', return_value=([], {
                  'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}))):
            saved = criteria.extract_and_save_criteria(
                self.document_id, db_path=self.database, client=object())
        self.assertEqual(saved['rows'], generated_rows)
        self.assertEqual(saved['source_requirements_id'], result['_id'])
        self.assertEqual(criteria.load_saved_criteria(
            self.database, self.document_id)['_id'], saved['_id'])
        model_call.assert_called_once()

    def test_source_qualitative_table_preserves_rows_and_ignores_quantitative(self):
        document = requirements.read_source(self.database, self.document_id)
        def cells(values):
            return [{'col': col, 'text': value} for col, value in values.items()]
        document['blocks'].extend([
            {'block_id': 'caption', 'order': 3, 'type': 'paragraph',
             'text': '기술성 평가기준: 정성적 평가'},
            {'block_id': 'evaluation', 'order': 4, 'type': 'table',
             'table': {'cells': [
                 cells({0: '구분', 2: '평가항목', 4: '평가요소', 5: '배점'}),
                 cells({1: '정량적 평가', 2: '수행실적', 4: '최근 3년 실적', 5: '20'}),
                 cells({1: '정성적 평가 (70)', 2: '전략 및 방법론 (30)',
                        3: '사업 이해도', 4: '사업 특성 및 목표와의 부합성', 5: '15'}),
                 cells({3: '추진 전략', 4: '일정과 위험 대응의 구체성', 5: '15'}),
                 cells({2: '사업 관리 (40)', 3: '품질 관리',
                        4: '품질 관리 체계', 5: '40'}),
                 cells({1: '정성적 평가 소계', 5: '70'}),
             ]}},
        ])
        rows = criteria._find_document_table(document)
        self.assertEqual([row['evaluation_item'] for row in rows],
                         ['사업 이해도', '추진 전략', '품질 관리'])
        self.assertEqual([row['division_score'] for row in rows], [30, 30, 40])
        self.assertEqual(sum(row['score'] for row in rows), 70)

    def test_no_source_table_uses_summary_groups_instead_of_markdown(self):
        document = requirements.read_source(self.database, self.document_id)
        result = self.requirement_result(document)
        reference = criteria._resolve_template(document, result)
        self.assertEqual(reference['template_source'], 'generated_from_summary')
        self.assertEqual(sum(row['score'] for row in reference['rows']), 100)
        self.assertEqual([row['evaluation_division'] for row in reference['rows']],
                         ['기능 요구사항', '운영 요구사항'])

    def test_supplemental_item_requires_a_real_requirement_quote(self):
        document = requirements.read_source(self.database, self.document_id)
        requirement_result = self.requirement_result(document)
        reference = criteria._resolve_template(document, requirement_result)
        rows = self.summary_criteria_rows(reference)
        item = {
            'guideline_area': '프로젝트 지원', 'evaluation_item': '장애 대응',
            'evaluation_criteria': '장애 대응 계획의 구체성을 평가한다.',
            'evaluation_elements': ['대응 체계의 구체성'],
            'source_id': 'p3', 'source_quote': 'FR-2 운영 장애 대응체계를 마련해야 한다.',
        }
        evidence = criteria._requirement_evidence(requirement_result)
        self.assertEqual(criteria._gap_issues([item], evidence, rows), [])
        self.assertTrue(criteria._gap_issues(
            [{**item, 'source_quote': '원문에 없는 요구사항을 추가한다.'}], evidence, rows))
        self.assertTrue(criteria._gap_issues(
            [{**item, 'evaluation_item': rows[0]['evaluation_item']}], evidence, rows))
        def complete(**kwargs):
            return SimpleNamespace(choices=[SimpleNamespace(
                finish_reason='stop', message=SimpleNamespace(
                    content=json.dumps({'supplemental_items': [{**item,
                        'source_quote': 'FR-2 운영 장애 대응 체계를 마련한다.'}]}),
                    refusal=None))],
                usage=SimpleNamespace(prompt_tokens=3, completion_tokens=4, total_tokens=7))
        client = SimpleNamespace(chat=SimpleNamespace(
            completions=SimpleNamespace(create=complete)))
        supplemental, usage = criteria._find_supplemental_items(
            client, criteria.DEFAULT_MODEL, requirement_result, rows)
        self.assertEqual(supplemental[0]['source_id'], 'p3')
        self.assertEqual(supplemental[0]['source_quote'],
                         'FR-1 서비스 개선을 수행하고 FR-2 운영 장애 대응체계를 마련해야 한다.')
        self.assertEqual(usage['total_tokens'], 7)
        self.assertEqual(sum(row['score'] for row in rows), 100)

    def test_supplemental_quote_is_taken_from_long_original_text(self):
        original = '앞부분 ' * 90 + '실제 필요한 장애 대응 체계를 구축한다.' + ' 뒷부분' * 90
        item = {'source_id': 'p9', 'source_quote': '장애 대응 체계를 구축할 필요가 있다.'}
        grounded = criteria._ground_source_quotes([item], [
            {'source_id': 'p9', 'text': original}])[0]
        self.assertIn(grounded['source_quote'], original)
        self.assertLessEqual(len(grounded['source_quote']), 500)

    def test_long_requirement_evidence_is_split_without_dropping_rows(self):
        evidence = [{'source_id': f'p{index}', 'text': f'요구사항 {index}의 구체적 내용'}
                    for index in range(12)]
        batches = criteria._evidence_batches(evidence, max_chars=140)
        self.assertGreater(len(batches), 1)
        self.assertEqual([item for batch in batches for item in batch], evidence)

    def test_ai_generates_multiple_items_per_summary_group(self):
        document = requirements.read_source(self.database, self.document_id)
        requirement_result = self.requirement_result(document)
        reference = criteria._resolve_template(document, requirement_result)
        groups = []
        for group in reference['rows']:
            first = group['score'] // 2
            groups.append({'group_id': group['row_id'], 'items': [
                {'evaluation_item': '계획의 적정성',
                 'evaluation_criteria': '요구사항을 반영한 계획인지 평가한다.',
                 'evaluation_elements': ['계획의 구체성'], 'score': first},
                {'evaluation_item': '수행 및 검증',
                 'evaluation_criteria': '수행과 검증 방법을 평가한다.',
                 'evaluation_elements': ['검증 방법의 적정성'],
                 'score': group['score'] - first},
            ]})
        rationale_payload = self.criteria_rationale(self.summary_criteria_rows(reference))
        rationale_payload['background_and_need'] = '근거 없는 배경 설명'
        rationale_payload['scope'] = '근거 없는 사업 범위'
        payloads = iter([{'groups': groups}, {'supplemental_items': []}, rationale_payload])
        def complete(**kwargs):
            return SimpleNamespace(
                choices=[SimpleNamespace(finish_reason='stop',
                    message=SimpleNamespace(content=json.dumps(next(payloads)), refusal=None))],
                usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30),
            )
        client = SimpleNamespace(chat=SimpleNamespace(
            completions=SimpleNamespace(create=complete)))
        generated = criteria.generate_criteria(document, requirement_result, client=client)
        self.assertEqual(len(generated['rows']), 4)
        self.assertEqual(len(generated['table']['groups']), 2)
        self.assertEqual([len(group['items']) for group in generated['table']['groups']], [2, 2])
        self.assertEqual(generated['total_score'], 100)
        self.assertEqual(len(generated['selection_rationale']['evaluation_links']), 2)
        self.assertEqual(generated['selection_rationale']['background_and_need'],
                         '원문에서 확인되지 않아 직접 반영하지 않았습니다.')
        self.assertEqual(generated['usage']['total_tokens'], 90)
        self.assertEqual(generated['supplemental_items'], [])
        groups[0]['items'][0]['score'] -= 1
        _, issues = criteria._validate_summary_response({'groups': groups}, reference['rows'])
        self.assertTrue(any('배점 합계' in issue for issue in issues))

    def test_criteria_html_renders_merged_table_and_escapes_elements(self):
        from apps.documents_daeung.streamlit_parser_test_page import criteria_table_html
        rows = [
            {'row_id': f'R{index:02d}', 'evaluation_division': division,
             'division_score': division_score, 'evaluation_item': item,
             'evaluation_criteria': '제안 내용의 적정성',
             'evaluation_elements': [element], 'score': score}
            for index, (division, division_score, item, element, score) in enumerate([
                ('사업 수행 능력', 20, '사업 이해도', '<검증 근거>', 6),
                ('사업 수행 능력', 20, '추진 전략', '일정의 타당성', 14),
                ('사업 관리', 5, '수행 조직', '인력 배치', 5),
            ], 1)
        ]
        markup = criteria_table_html({'table': criteria.build_criteria_table(rows)})
        self.assertIn('rowspan="3"', markup)
        self.assertIn('rowspan="2"', markup)
        self.assertIn('정성적 평가 (25)', markup)
        self.assertIn('&lt;검증 근거&gt;', markup)
        self.assertNotIn('<검증 근거>', markup)

    def test_old_source_criteria_reuses_rows_and_adds_rationale(self):
        self.parsed['blocks'].extend([
            {'block_id': 'p4', 'order': 3, 'type': 'paragraph',
             'text': '정성적 평가기준'},
            {'block_id': 't5', 'order': 4, 'type': 'table',
             'table': {'cells': [
                 [dict(cell_id=f'e{row}{col}', row=row, col=col, row_span=1,
                       col_span=1, text=value) for col, value in enumerate(values)]
                 for row, values in enumerate([
                     ('평가부문', '평가항목', '평가기준', '배점'),
                     ('사업 수행', '추진 전략', '일정과 위험 대응', '60'),
                     ('사업 관리', '관리 체계', '인력 운영 방안', '40'),
                 ])
             ]}},
        ])
        save_to_sqlite(self.parsed, self.database, source_path=self.source)
        document = requirements.read_source(self.database, self.document_id)
        requirement_result = self.requirement_result(document)
        requirements.save_requirements(self.database, document, requirement_result)
        reference = criteria._resolve_template(document, requirement_result)
        rows = [{
            'row_id': row['row_id'], 'evaluation_division': row['evaluation_division'],
            'division_score': row['division_score'], 'evaluation_item': row['evaluation_item'],
            'evaluation_criteria': '사업 추진방안의 적정성',
            'evaluation_elements': ['제안 내용의 구체성'], 'score': row['score'],
        } for row in reference['rows']]
        old = {
            '_id': 'old-v3', 'document_id': self.document_id,
            'source_revision': document['active_revision'],
            'source_requirements_id': requirement_result['_id'],
            'reference_document_id': reference['_id'],
            'reference_revision': reference['active_revision'],
            'reference_filename': reference['filename'],
            'template_source': reference['template_source'],
            'model': criteria.DEFAULT_MODEL, 'criteria_version': 'qualitative-criteria-v3',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'total_score': sum(row['score'] for row in rows), 'rows': rows, 'usage': {},
        }
        with requirements._connect(self.database) as connection:
            connection.executescript(criteria.CRITERIA_SCHEMA)
            connection.execute(
                'INSERT INTO criteria_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (old['_id'], old['document_id'], old['source_revision'],
                 old['source_requirements_id'], old['reference_revision'],
                 old['criteria_version'], old['model'], old['created_at'],
                 json.dumps(old, ensure_ascii=False)),
            )
        with (patch.object(criteria, '_call_model', side_effect=AssertionError('unexpected criteria call')),
              patch.object(criteria, '_find_supplemental_items', return_value=([], {
                  'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0})),
              patch.object(criteria, '_generate_rationale', return_value=(
                  self.criteria_rationale(rows),
                  {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}))):
            upgraded = criteria.extract_and_save_criteria(
                self.document_id, db_path=self.database, client=object())
        self.assertEqual(upgraded['criteria_version'], criteria.CRITERIA_VERSION)
        self.assertEqual(upgraded['table']['total_score'], 100)
        self.assertEqual(upgraded['selection_rationale'], self.criteria_rationale(rows))
        self.assertEqual(criteria.load_saved_criteria(self.database, self.document_id), upgraded)


if __name__ == '__main__':
    unittest.main()
