import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from apps.app.modules.documents.step2_hwpx_storage import MongoStorageError, prepare_records, save_to_mongodb


class Collection:
    def __init__(self):
        self.rows = {}

    def create_index(self, *args):
        pass

    def bulk_write(self, operations, ordered=True):
        for op in operations:
            self.rows[op._filter['_id']] = op._doc

    def count_documents(self, query):
        return sum(all(row.get(k) == v for k, v in query.items()) for row in self.rows.values())

    def replace_one(self, query, document, upsert=False):
        self.rows[query['_id']] = document

    def find_one(self, query, projection=None):
        return self.rows.get(query['_id'])


class Database:
    name = 'unit_test'

    def __init__(self):
        self.collections = {}
        self.hwpx_documents = self['Request']

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source.hwpx'
        self.source.write_bytes(b'original')
        self.image = self.root / 'image.bmp'
        self.image.write_bytes(b'image')
        self.env = self.root / '.env'
        self.env.write_text('MONGODB_URI=mongodb://localhost/test\n')
        digest = hashlib.sha256(b'original').hexdigest()
        image_digest = hashlib.sha256(b'image').hexdigest()
        self.document = {
            'document_id': digest, 'source_sha256': digest,
            'filename': 'source.hwpx', 'blocks': [
                {'block_id': 'p_0001', 'type': 'paragraph', 'text': '문장', 'order': 0}
            ], 'tables': [], 'images': [],
            'assets': [{'asset_id': image_digest, 'sha256': image_digest, 'local_path': str(self.image)}]
        }
        self.db = Database()
        self.client = MagicMock()
        self.client.__enter__.return_value = self.client
        self.client.get_default_database.return_value = self.db
        self.client.__getitem__.return_value = self.db
        self.files = {}
        self.fs = MagicMock()
        self.fs.exists.side_effect = lambda key: key in self.files
        self.fs.put.side_effect = lambda stream, _id, **kwargs: self.files.setdefault(_id, stream.read())

    def save(self, **kwargs):
        with patch('pymongo.MongoClient', return_value=self.client), patch('gridfs.GridFS', return_value=self.fs), patch.dict('os.environ', {}, clear=True):
            return save_to_mongodb(self.document, self.source, env_path=self.env, **kwargs)

    def test_upsert_is_idempotent_and_source_is_opt_in(self):
        a = self.save()
        b = self.save()
        self.assertEqual(a, b)
        self.assertEqual(len(self.db['hwpx_blocks'].rows), 1)
        self.assertEqual(len(self.files), 1)
        self.assertNotIn(self.document['source_sha256'], self.files)
        self.assertEqual(a['counts'], {'blocks': 1, 'assets': 1, 'chunks': 1})
        metadata = self.db.hwpx_documents.find_one({'_id': self.document['document_id']})
        self.assertEqual(metadata['status'], 'ready')
        self.assertEqual(metadata['blocks'][0]['text'], '문장')
        self.assertEqual(a['collection'], 'Request')

    def test_optional_source_upload(self):
        self.save(store_source=True)
        self.assertEqual(self.files[self.document['source_sha256']], b'original')
        self.save()
        metadata = self.db.hwpx_documents.find_one({'_id': self.document['document_id']})
        self.assertEqual(metadata['source_gridfs_id'], self.document['source_sha256'])

    def test_failure_does_not_publish_revision_or_leak_secret(self):
        self.db['hwpx_chunks'].bulk_write = MagicMock(side_effect=RuntimeError('mongodb://user:secret@host'))
        with self.assertRaises(MongoStorageError) as caught:
            self.save()
        self.assertNotIn('secret', str(caught.exception))
        self.assertIn('save_chunks', str(caught.exception))
        self.assertEqual(self.db.hwpx_documents.rows, {})

    def test_changed_image_fails_before_network(self):
        self.image.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.save()
        self.client.admin.command.assert_not_called()

    def test_bson_size_checked_before_write(self):
        self.document['blocks'][0]['text'] = 'a' * (16 * 1024 * 1024)
        with self.assertRaises(ValueError):
            prepare_records(self.document)


if __name__ == '__main__':
    unittest.main()
