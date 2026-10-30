import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

spec = importlib.util.spec_from_file_location('storage_migration', Path(__file__).parents[2] / 'scripts/move-library-storage.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeAPI:
    def __init__(self, record):
        self.record = copy.deepcopy(record)
        self.copies = 0
        self.verified = []
        self.patches = []

    def request(self, method, path, data=None):
        if method == 'PATCH':
            # A storage switch without the preceding byte copy is forbidden.
            assert 'storage' not in data
            self.patches.append(data)
            self.record.update(data)
        else:
            assert method == 'GET'
        return copy.deepcopy(self.record)

    def copy(self, identity, target, filename, mime, content):
        self.copies += 1
        self.record.update(storage=target, filename_download=filename, metadata=None,
                           filesize=len(content), uploaded_on='new')
        return copy.deepcopy(self.record)

    def verify_public(self, identity, expected):
        self.verified.append((identity, expected))


class StorageMigration(TestCase):
    def setup_plan(self, root):
        content = b'validated source bytes'
        (root / 'source.epub').write_bytes(content)
        before = dict(id='asset', storage='s3', filename_disk='asset.epub',
                      filename_download='Ouvrage.zip', title='Ouvrage', folder='books',
                      description='Edition', tags=['book'], metadata={'pair': 'download'},
                      uploaded_on='old', filesize=len(content))
        asset = dict(id='asset', source='source.epub', sha256=hashlib.sha256(content).hexdigest(),
                     mime='application/epub+zip', filename_disk='asset.epub', storage='s3')
        return before, asset

    def test_preflight_hash_failure_never_reads_or_writes_remote(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            before, asset = self.setup_plan(root)
            asset['sha256'] = 'incorrect'
            class NoNetwork:
                def request(self, *args):
                    raise AssertionError('Network must not be used')
            with self.assertRaisesRegex(ValueError, 'Source SHA-256'):
                module.migrate(NoNetwork(), [asset], root, 'local', root / 'state.json', True, 0)

    def test_preserves_uuid_disk_path_display_name_and_pairing(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            before, asset = self.setup_plan(root)
            api = FakeAPI(before)
            module.migrate(api, [asset], root, 'local', root / 'state.json', True, 0)
            self.assertEqual(api.copies, 1)
            self.assertEqual(api.record['storage'], 'local')
            for key in ['id', 'filename_disk', 'filename_download', 'title', 'folder', 'metadata', 'tags']:
                self.assertEqual(api.record[key], before[key])
            self.assertEqual(api.verified, [('asset', asset['sha256'])])
            self.assertEqual(json.loads((root / 'state.json').read_text())['asset']['status'], 'complete')

    def test_interrupted_transfer_is_not_reuploaded(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            before, asset = self.setup_plan(root)
            checkpoint = root / 'state.json'
            checkpoint.write_text(json.dumps({'asset': {'status': 'started', 'before': before}}))
            for storage in ['s3', 'local']:
                api = FakeAPI({**before, 'storage': storage})
                with self.assertRaisesRegex(RuntimeError, 'Prior transfer'):
                    module.migrate(api, [asset], root, 'local', checkpoint, True, 0)
                self.assertEqual(api.copies, 0)
                self.assertEqual(api.verified, [])

    def test_finished_transfer_is_reconciled_without_reupload(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            before, asset = self.setup_plan(root)
            checkpoint = root / 'state.json'
            checkpoint.write_text(json.dumps({'asset': {'status': 'started', 'before': before}}))
            api = FakeAPI({**before, 'storage': 'local', 'uploaded_on': 'new', 'metadata': None})
            module.migrate(api, [asset], root, 'local', checkpoint, True, 0)
            self.assertEqual(api.copies, 0)
            self.assertEqual(api.record['metadata'], before['metadata'])
            self.assertEqual(len(api.verified), 1)

    def test_multipart_selects_storage_before_the_file(self):
        class Capture(module.Directus):
            def request(self, *args):
                self.args = args
                return {}
        api = Capture('https://example.invalid', 'test')
        api.copy('asset', 'local', 'source.epub', 'application/epub+zip', b'content')
        method, path, body, content_type = api.args
        self.assertEqual((method, path), ('PATCH', '/files/asset'))
        self.assertLess(body.index(b'name="storage"'), body.index(b'name="file"'))
        self.assertIn(b'\r\nlocal\r\n', body)
        self.assertTrue(content_type.startswith('multipart/form-data; boundary='))
