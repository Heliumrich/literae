#!/usr/bin/env python3
"""Copy validated library assets to another Directus storage, preserving their UUIDs.

The manifest lists id, source, sha256 and mime. Default mode only checks the plan.
Requires no third-party Python packages. Verified with Directus 12.2.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request
import uuid


class Directus:
    def __init__(self, url: str, token: str):
        self.url, self.token = url.rstrip('/'), token

    def request(self, method, path, data=None, content_type='application/json'):
        if data is not None and content_type == 'application/json':
            data = json.dumps(data, ensure_ascii=False).encode()
        request = urllib.request.Request(self.url + path, method=method, data=data,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': content_type})
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)['data']

    def copy(self, identity, target, filename, mime, content):
        # Fields must precede the file: Directus selects the storage before reading it.
        boundary = 'literae-' + uuid.uuid4().hex
        data = (f'--{boundary}\r\nContent-Disposition: form-data; name="storage"\r\n\r\n{target}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f'Content-Type: {mime}\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
        return self.request('PATCH', '/files/' + identity, data, 'multipart/form-data; boundary=' + boundary)

    def verify_public(self, identity, expected):
        request = urllib.request.Request(self.url + '/assets/' + identity,
            headers={'Cache-Control': 'no-cache', 'Origin': 'https://literae.ch'})
        with urllib.request.urlopen(request, timeout=90) as response:
            actual = hashlib.sha256(response.read()).hexdigest()
        if actual != expected:
            raise ValueError('Public asset SHA-256 differs: ' + identity)


def upload_filename(before):
    """Keep filename_disk unchanged: renaming it could touch the original storage."""
    disk = before['filename_disk']
    if not disk or Path(disk).name != disk or not Path(disk).suffix:
        raise ValueError('Unsupported storage path: ' + str(disk))
    name = Path(before['filename_download']).stem + Path(disk).suffix
    if any(character in name for character in ['"', '\r', '\n']):
        raise ValueError('Unsafe multipart filename')
    return name


def save(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def migrate(api, assets, root, target, checkpoint, execute, pause):
    # Validate every local source before touching any remote file.
    sources = {}
    for asset in assets:
        source = (root / asset['source']).resolve()
        if not source.is_relative_to(root):
            raise ValueError('Source outside source root')
        content = source.read_bytes()
        if hashlib.sha256(content).hexdigest() != asset['sha256']:
            raise ValueError('Source SHA-256 differs: ' + str(source))
        sources[asset['id']] = source
    if len(sources) != len(assets):
        raise ValueError('Duplicate asset UUIDs in manifest')

    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    preserved = ['filename_download', 'title', 'description', 'tags', 'metadata', 'folder']
    for index, asset in enumerate(assets, 1):
        identity = asset['id']
        before = api.request('GET', '/files/' + identity)
        if before['filename_disk'] != asset['filename_disk']:
            raise ValueError('Storage filename changed since planning: ' + identity)
        filename = upload_filename(before)
        print(f'{index}/{len(assets)} {identity}: {before["storage"]} → {target}', flush=True)
        if not execute:
            continue
        previous = state.get(identity, {})
        if before['storage'] == target:
            # Reconcile a lost response only after Directus wrote its final uploaded_on.
            if previous.get('status') == 'started' and before['uploaded_on'] == previous['before']['uploaded_on']:
                raise RuntimeError('Prior transfer may still be active; do not repeat it: ' + identity)
            original = previous.get('before')
            if original:
                restore = {key: original.get(key) for key in preserved if before.get(key) != original.get(key)}
                if restore:
                    api.request('PATCH', '/files/' + identity, restore)
            api.verify_public(identity, asset['sha256'])
            state[identity] = {**previous, 'status': 'complete', 'sha256': asset['sha256'], 'storage': target}
            save(checkpoint, state)
            continue
        if previous.get('status') == 'started':
            raise RuntimeError('Prior transfer was interrupted; inspect it before retrying: ' + identity)
        if before['storage'] != asset['storage']:
            raise ValueError('Storage changed since planning: ' + identity)

        content = sources[identity].read_bytes()
        if hashlib.sha256(content).hexdigest() != asset['sha256']:
            raise ValueError('Source changed after preflight: ' + identity)
        state[identity] = {'status': 'started', 'before': before, 'sha256': asset['sha256']}
        save(checkpoint, state)
        # No automatic upload retries. A timed-out request can still be running remotely.
        after = api.copy(identity, target, filename, asset['mime'], content)
        if after['id'] != identity or after['storage'] != target or after['filename_disk'] != before['filename_disk']:
            raise RuntimeError('Unexpected copy result: ' + identity)
        if int(after['filesize']) != sources[identity].stat().st_size:
            raise RuntimeError('Unexpected copied size: ' + identity)
        restore = {key: before.get(key) for key in preserved if after.get(key) != before.get(key)}
        if restore:
            after = api.request('PATCH', '/files/' + identity, restore)
        api.verify_public(identity, asset['sha256'])
        state[identity].update(status='complete', storage=target, uploaded_on=after['uploaded_on'])
        save(checkpoint, state)
        time.sleep(pause)
    print(f'{len(assets)} assets {"verified in target storage" if execute else "checked; no changes made"}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--url', default='https://api.literae.ch')
    parser.add_argument('--target', default='local')
    parser.add_argument('--token-file', type=Path)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--pause', type=float, default=0.5)
    args = parser.parse_args()
    token = os.environ.get('DIRECTUS_TOKEN')
    if args.token_file:
        token = json.loads(args.token_file.read_text())['token']
    if not token:
        parser.error('Set DIRECTUS_TOKEN or pass --token-file (JSON with a token field)')
    if args.pause < 0:
        parser.error('--pause must be nonnegative')
    migrate(Directus(args.url, token), json.loads(args.manifest.read_text()),
            args.source_root.resolve(), args.target, args.checkpoint, args.execute, args.pause)
