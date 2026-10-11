import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from apps.app.documents.step2_hwpx_storage import MongoStorageError, prepare_records, save_to_mongodb


class Collection:
    def __init__(self):
        """컬렉션 대역의 문서를 담을 빈 사전을 만든다."""
        self.rows = {}

    def create_index(self, *args):
        """테스트 대역에서는 인덱스를 만들지 않고 호출만 허용한다."""
        pass

    def bulk_write(self, operations, ordered=True):
        """ReplaceOne 연산의 문서를 메모리 사전에 저장해 upsert를 모사한다."""
        for op in operations:
            self.rows[op._filter['_id']] = op._doc

    def count_documents(self, query):
        """쿼리의 모든 값과 일치하는 메모리 레코드 수를 반환한다."""
        return sum(all(row.get(k) == v for k, v in query.items()) for row in self.rows.values())

    def replace_one(self, query, document, upsert=False):
        """지정한 ID의 메모리 문서를 교체한다. 실제 DB에는 접근하지 않는다."""
        self.rows[query['_id']] = document

    def find_one(self, query, projection=None):
        """메모리 사전에서 ID가 같은 문서를 반환한다. projection은 적용하지 않는다."""
        return self.rows.get(query['_id'])


class Database:
    name = 'unit_test'

    def __init__(self):
        """테스트 컬렉션 저장소와 Request 별칭을 준비한다."""
        self.collections = {}
        self.hwpx_documents = self['Request']

    def __getitem__(self, name):
        """이름에 해당하는 메모리 컬렉션을 만들거나 재사용한다."""
        return self.collections.setdefault(name, Collection())


class StorageTests(unittest.TestCase):
    def setUp(self):
        """원본·이미지·환경설정 합성 파일과 MongoDB·GridFS 대역을 준비한다."""
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
        """MongoClient·GridFS를 대역으로 교체하고 환경변수를 격리해 문서 저장을 실행한다."""
        with patch('pymongo.MongoClient', return_value=self.client), patch('gridfs.GridFS', return_value=self.fs), patch.dict('os.environ', {}, clear=True):
            return save_to_mongodb(self.document, self.source, env_path=self.env, **kwargs)

    def test_upsert_is_idempotent_and_source_is_opt_in(self):
        """반복 저장의 레코드·파일 수가 유지되고 원본 업로드는 기본적으로 생략되는지 검증한다."""
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
        """원본 업로드 옵션으로 저장한 파일 참조가 이후 기본 저장에서도 유지되는지 검증한다."""
        self.save(store_source=True)
        self.assertEqual(self.files[self.document['source_sha256']], b'original')
        self.save()
        metadata = self.db.hwpx_documents.find_one({'_id': self.document['document_id']})
        self.assertEqual(metadata['source_gridfs_id'], self.document['source_sha256'])

    def test_failure_does_not_publish_revision_or_leak_secret(self):
        """중간 저장 실패 시 문서를 활성화하지 않고 접속 비밀값을 오류에 노출하지 않는지 검증한다."""
        self.db['hwpx_chunks'].bulk_write = MagicMock(side_effect=RuntimeError('mongodb://user:secret@host'))
        with self.assertRaises(MongoStorageError) as caught:
            self.save()
        self.assertNotIn('secret', str(caught.exception))
        self.assertIn('save_chunks', str(caught.exception))
        self.assertEqual(self.db.hwpx_documents.rows, {})

    def test_changed_image_fails_before_network(self):
        """파싱 이후 바뀐 이미지 해시를 DB 연결 전에 거절하는지 검증한다."""
        self.image.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.save()
        self.client.admin.command.assert_not_called()

    def test_bson_size_checked_before_write(self):
        """저장 전 레코드 크기 검증이 과대한 BSON 문서를 거절하는지 검증한다."""
        self.document['blocks'][0]['text'] = 'a' * (16 * 1024 * 1024)
        with self.assertRaises(ValueError):
            prepare_records(self.document)


if __name__ == '__main__':
    unittest.main()
