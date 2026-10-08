"""Run: python test_project_review.py (no TeX needed)."""
import json
from pathlib import Path
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server, snapshot
from project_review import ProjectReview, review_hunks
from proofread import proofread_source


def request(server, route, data=None):
    req = Request(f'http://127.0.0.1:{server.server_port}' + route,
                  None if data is None else json.dumps(data).encode(), {'Content-Type': 'application/json'})
    try:
        with build_opener(ProxyHandler({})).open(req, timeout=10) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    main = root / 'main.tex'
    child = root / 'parts' / 'child.tex'
    child.parent.mkdir()
    original = '\\documentclass{article}\n\\begin{document}\nOriginal sentence.\n\nUnchanged middle.\n\nLast sentence.\n\\end{document}\n'
    child_bytes = b'\xef\xbb\xbf' + '中文 😀 old\r\n'.encode('utf-8')
    main.write_text(original, encoding='utf-8', newline='')
    child.write_bytes(child_bytes)
    prefs = root / 'user.sqlite3'
    with patch('editor.compiler', return_value=('xelatex', 'unused')):
        server = make_server(main, main_thread='', preferences_path=prefs)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        assert request(server, '/project-review')[1] == {'enabled': False, 'files': []}
        assert request(server, '/preferences', {'latex-codex-proofread-project': 'on'})[0] == 200
        assert request(server, '/project-review')[1]['files'] == []
        changed = original.replace('Original sentence.', 'Concise sentence.').replace('Last sentence.', 'Final sentence.')
        main.write_text(changed, encoding='utf-8', newline='')
        child.write_bytes(b'\xef\xbb\xbf' + '中文 😀 new\r\n'.encode('utf-8'))
        files = request(server, '/project-review')[1]['files']
        assert len(files) == 2
        main_review = next(file for file in files if file['path'] == str(main))
        child_review = next(file for file in files if file['path'] == str(child))
        assert len(main_review['hunks']) == 2
        assert child_review['hunks'][0]['changes']
        def resolve(review, identifier, action):
            return request(server, '/project-review', {key: review[key] for key in ('path', 'version', 'signature')} |
                           {'id': identifier, 'action': action})
        assert resolve(main_review, 1, 'keep')[0] == 200
        assert main.read_text(encoding='utf-8') == changed
        assert resolve(main_review, 2, 'undo')[0] == 409, 'A stale baseline cannot undo an accepted change.'
        assert len(ProjectReview(root).file_review('main.tex', snapshot(main))['hunks']) == 1
        assert resolve(child_review, 1, 'undo')[0] == 200
        assert child.read_bytes() == child_bytes, 'Undo preserves BOM and CRLF.'
        latest = request(server, '/project-review')[1]['files'][0]
        manual = latest['source'].replace('Unchanged middle.', 'Unchanged middle, typed by hand.')
        assert request(server, '/save', {'source': manual, 'version': latest['version']})[0] == 200
        latest = request(server, '/project-review')[1]['files'][0]
        assert len(latest['hunks']) == 1 and 'typed by hand' not in latest['hunks'][0]['after']
        main.write_text(manual + '% concurrent edit\n', encoding='utf-8', newline='')
        assert resolve(latest, 1, 'undo')[0] == 409
        latest = request(server, '/project-review')[1]['files'][0]
        for hunk in latest['hunks']:
            assert hunk['before'] == ''.join(run['text'] for run in hunk['changes'] if run['kind'] != 'insert')
            assert hunk['after'] == ''.join(run['text'] for run in hunk['changes'] if run['kind'] != 'delete')
        # Main chat can submit a revision through the public local API without
        # classifying its edit as manual editor typing.
        state = snapshot(main)
        proposed = state['source'].replace('Concise sentence.', 'Main-chat revision.')
        assert request(server, '/project-review', {'action': 'propose', 'path': str(main),
                       'version': state['version'], 'source': proposed})[0] == 200
        assert any('Main-chat revision' in hunk['after'] for file in request(server, '/project-review')[1]['files'] for hunk in file['hunks'])
        assert request(server, '/project-review', {'action':'propose', 'path':str(root.parent / 'outside.tex'),
                       'version':'invalid', 'source':'no write'})[0] == 400
        assert request(server, '/preferences', {'latex-codex-proofread-project':'off'})[0] == 200
        assert request(server, '/project-review')[1]['files'] == []
        assert request(server, '/preferences', {'latex-codex-proofread-project':'on'})[0] == 200
        assert request(server, '/project-review')[1]['files'], 'Turning review off does not accept pending edits.'
    finally:
        server.shutdown(); server.server_close(); server.build.cleanup()

deletion = review_hunks('before\nremoved\nafter\n', 'before\nafter\n')[0]
assert deletion['start'] == deletion['end'] and deletion['after'] == ''
marked, _ = proofread_source('before\nafter\n', [{'id':1, 'start':7, 'end':7, 'selection':'',
    'replacement':'', 'display_original':'removed\n'}])
assert 'removed' in marked and '0.78,0.12,0.16' in marked and '0.02,0.48,0.20' not in marked
marked, _ = proofread_source('new\n', [{'id':1, 'start':0, 'end':4, 'selection':'new\n',
    'replacement':'new\n', 'display_original':'old\n'}])
assert 'old' in marked and 'new' in marked
print('PASS: project-wide persistent reviews, per-hunk Keep/Undo, stale protection, manual-edit rebasing, BOM/CRLF, proposals and PDF old/new colors')
