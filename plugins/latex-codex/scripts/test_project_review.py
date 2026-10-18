"""Run: python test_project_review.py (no TeX needed)."""
import json
from pathlib import Path
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server, snapshot
from project_review import ProjectReview, review_hunks, review_paragraphs
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
        current = next(file for file in request(server, '/project-review')[1]['files'] if file['path']==str(main))
        bulk = {key:current[key] for key in ('path','version','signature')} | {'action':'keep-all'}
        main_bytes = main.read_bytes()
        assert request(server, '/project-review', {**bulk,'signature':'stale'})[0]==409
        assert request(server, '/project-review', {**bulk,'version':'stale'})[0]==409
        assert any(file['path']==str(main) for file in request(server, '/project-review')[1]['files'])
        child.write_bytes(child_bytes+b'% another pending change\r\n')
        assert request(server, '/project-review', bulk)[0]==200
        assert main.read_bytes()==main_bytes, 'Bulk Keep only approves the already-written current file.'
        pending = request(server, '/project-review')[1]['files']
        assert len(pending)==1 and pending[0]['path']==str(child), 'Other source files remain pending.'
        main.write_bytes(main_bytes.replace(b'Unchanged middle',b'Externally revised middle')+b'% pending addition\n')
        current = next(file for file in request(server, '/project-review')[1]['files'] if file['path']==str(main))
        undo_bulk = {key:current[key] for key in ('path','version','signature')} | {'action':'undo-all'}
        assert request(server, '/project-review', {**undo_bulk,'signature':'stale'})[0]==409
        assert request(server, '/project-review', {**undo_bulk,'version':'stale'})[0]==409
        assert request(server, '/project-review', undo_bulk)[0]==200
        assert main.read_bytes()==main_bytes, 'Bulk Undo preserves previously accepted and manual changes.'
        pending = request(server, '/project-review')[1]['files']
        assert len(pending)==1 and pending[0]['path']==str(child), 'Bulk Undo affects only the current source file.'
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
assert 'removed' in marked and '/LCBeforeChanged1 BMC' in marked and '/LCAfter' not in marked
marked, _ = proofread_source('new\n', [{'id':1, 'start':0, 'end':4, 'selection':'new\n',
    'replacement':'new\n', 'display_original':'old\n'}])
assert 'old' in marked and 'new' in marked
print('PASS: project-wide persistent reviews, per-hunk Keep/Undo, stale protection, manual-edit rebasing, BOM/CRLF, proposals and PDF old/new colors')

paragraphs = [f'Paragraph {index}: original text.\\par ' for index in range(9)]
before = ''.join(paragraphs)
after = before.replace('original', 'updated')
hunks = review_hunks(before, after)
assert len(hunks) == 3
assert all(max(len(review_paragraphs(hunk['before'])), len(review_paragraphs(hunk['after']))) <= 3 for hunk in hunks)
rebuilt = before
for hunk in reversed(hunks):
    rebuilt = rebuilt[:hunk['old_start']] + hunk['after'] + rebuilt[hunk['old_end']:]
assert rebuilt == after
for previous, proposed in [('', after), (before, ''), (before, after + 'Extra paragraph.\\par '),
                           (before, after[:after.index('Paragraph 6')])]:
    parts = review_hunks(previous, proposed)
    rebuilt = previous
    for part in reversed(parts):
        assert previous[part['old_start']:part['old_end']] == part['before']
        assert proposed[part['start']:part['end']] == part['after']
        rebuilt = rebuilt[:part['old_start']] + part['after'] + rebuilt[part['old_end']:]
    assert rebuilt == proposed, 'Splitting must preserve insertions, deletions and unequal paragraph counts.'
long = 'Long paragraph ' + 'word ' * 100
mixed = '\n\n'.join(['Short first.', long, 'Short next.', 'Short third.', 'Short fourth.'])
parts = review_hunks('', mixed)
assert [len(review_paragraphs(part['after'])) for part in parts] == [1, 1, 3]
assert parts[1]['after'].strip() == long.strip(), 'Long paragraphs stand alone.'
for structure in [r'\textbf{One.' + '\n\nTwo.}', r'\[x' + '\n\n+y\]',
                  r'\begin{equation}x' + '\n\n+y\end{equation}',
                  r'\begin{verbatim}text' + '\n\ntext\end{verbatim}', r'\verb|{' + '\n\n}|']:
    assert review_paragraphs(structure) == [structure], 'Never split groups, formulas or literal TeX.'

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); (root / '.latex-codex').mkdir()
    review = ProjectReview(root); review.approve('main.tex', before)
    state = {'path':str(root / 'main.tex'), 'source':after, 'version':'first'}
    file = review.file_review('main.tex', state)
    assert review.resolve('main.tex', state, file['signature'], 2, 'keep') is None
    file = review.file_review('main.tex', state)
    assert len(file['hunks']) == 2, 'Keeping one chunk must leave the other two pending.'
    restored = review.resolve('main.tex', state, file['signature'], 1, 'undo')
    assert restored == ''.join(paragraphs[:3]) + ''.join(paragraphs[3:]).replace('original', 'updated')
print('PASS: three-paragraph chunks, standalone long paragraphs, balanced TeX, lossless ranges and independent Keep/Undo')
