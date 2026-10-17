import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from apps.documents_daeung.step2_hwpx_save_to_SQLite import (
    delete_document_from_sqlite, load_document, load_source, save_to_sqlite,
)


class SQLiteStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.database = self.root / 'documents.sqlite3'
        self.image = self.root / 'image.bmp'
        self.image.write_bytes(b'image bytes')
        self.image_sha = hashlib.sha256(self.image.read_bytes()).hexdigest()

    def source_and_document(self, number):
        source = self.root / f'source{number}.hwpx'
        source.write_bytes(f'original {number}'.encode())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        document = {
            'document_id': digest, 'source_sha256': digest, 'filename': source.name,
            'schema_version': 2, 'parser_version': 'test',
            'pages': [{'physical_page_number': 1, 'page_number': None}],
            'blocks': [{'block_id': 'p_0001', 'order': 0, 'type': 'paragraph',
                        'parent_block_id': None, 'text': '문장', 'physical_page_numbers': [1]}],
            'assets': [{'asset_id': self.image_sha, 'sha256': self.image_sha,
                        'local_path': str(self.image), 'byte_size': self.image.stat().st_size}],
        }
        return source, document

    def count(self, table):
        with sqlite3.connect(self.database) as connection:
            return connection.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]

    def test_roundtrip_and_repeat_save(self):
        source, document = self.source_and_document(1)
        first = save_to_sqlite(document, self.database, source_path=source)
        second = save_to_sqlite(document, self.database, source_path=source)
        self.assertEqual(first['revision'], second['revision'])
        self.assertEqual(self.count('parse_snapshots'), 1)
        self.assertEqual(self.count('blocks'), 1)
        self.assertEqual(load_document(self.database, document['document_id']), document)
        self.assertEqual(load_source(self.database, document['source_sha256']), source.read_bytes())

    def test_changed_image_is_rejected_before_write(self):
        source, document = self.source_and_document(1)
        self.image.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            save_to_sqlite(document, self.database, source_path=source)
        self.assertFalse(self.database.exists())

    def test_delete_removes_document_and_analysis_results(self):
        source, document = self.source_and_document(1)
        saved = save_to_sqlite(document, self.database, source_path=source)
        from apps.documents_daeung.step3_ai_requirements_extract_to_SQLite import SCHEMA as requirement_schema
        from apps.documents_daeung.step4_ai_criteria import CRITERIA_SCHEMA
        with sqlite3.connect(self.database) as connection:
            connection.executescript(requirement_schema + CRITERIA_SCHEMA)
            connection.execute('INSERT INTO requirement_results VALUES (?,?,?,?,?,?,?,?,?)',
                               ('req', document['document_id'], saved['revision'], 'v', 'm',
                                'fingerprint', 'complete', 'now', '{}'))
            connection.execute('INSERT INTO criteria_results VALUES (?,?,?,?,?,?,?,?,?)',
                               ('criteria', document['document_id'], saved['revision'],
                                'req', 'template', 'v', 'm', 'now', '{}'))
        self.assertTrue(delete_document_from_sqlite(self.database, document['document_id']))
        for table in ('documents', 'parse_snapshots', 'pages', 'blocks', 'snapshot_assets',
                      'assets', 'source_files', 'requirement_results', 'criteria_results'):
            self.assertEqual(self.count(table), 0, table)
        self.assertFalse(delete_document_from_sqlite(self.database, document['document_id']))

    def test_shared_asset_survives_until_last_document_is_deleted(self):
        source1, document1 = self.source_and_document(1)
        source2, document2 = self.source_and_document(2)
        save_to_sqlite(document1, self.database, source_path=source1)
        save_to_sqlite(document2, self.database, source_path=source2)
        self.assertTrue(delete_document_from_sqlite(self.database, document1['document_id']))
        self.assertEqual(self.count('assets'), 1)
        self.assertEqual(self.count('source_files'), 1)
        self.assertTrue(delete_document_from_sqlite(self.database, document2['document_id']))
        self.assertEqual(self.count('assets'), 0)
        self.assertEqual(self.count('source_files'), 0)


if __name__ == '__main__':
    unittest.main()
