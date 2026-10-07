"""Run: python test_markdown.py (stdlib only; Markdown must not need a TeX engine)."""
import json
from pathlib import Path
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server
from history import describe_revision

with tempfile.TemporaryDirectory() as directory:
    vault = Path(directory)
    (vault / '.obsidian').mkdir()
    notes = vault / 'notes'; notes.mkdir()
    path = notes / 'demo.md'
    original = '# Matrices\n\n$$x^2$$\n\n![[image.png]]\n'
    path.write_bytes(original.encode())
    second = notes / 'second.markdown'; second.write_bytes(b'# Second\n')
    image = b'\x89PNG\r\n\x1a\nfixture'
    (vault / 'image.png').write_bytes(image)
    (vault / 'secret.txt').write_text('private', encoding='utf-8')
    with patch('editor.compiler', side_effect=AssertionError('Markdown must not invoke TeX')):
        server = make_server(path, main_thread='', preferences_path=vault / 'preferences.sqlite3')
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        opener = build_opener(ProxyHandler({}))

        def request(route, data=None):
            req = Request(base + route, None if data is None else json.dumps(data).encode(), {'Content-Type':'application/json'})
            try:
                with opener.open(req, timeout=5) as response:
                    body = response.read()
                    return response.status, json.loads(body) if response.headers.get_content_type() == 'application/json' else body
            except HTTPError as error:
                return error.code, json.loads(error.read())

        try:
            _, initial = request('/state')
            assert initial['document_type'] == 'markdown' and initial['source'] == original
            assert {item['name'] for item in initial['files']} == {'demo.md','second.markdown'}
            assert request('/markdown-resource?path=image.png') == (200,image)
            for name in ('../secret.txt','../../outside.png','file:///image.png','%2e%2e%2f%2e%2e%2foutside.png'):
                assert request('/markdown-resource?path=' + quote(name))[0] == 404
            _, history = request('/history?path=' + quote(str(path)))
            first_id = next(row['id'] for row in history['revisions'] if row['file']=='demo.md')
            changed = original.replace('x^2','x^3')
            _, saved = request('/compile', {'source':changed,'version':initial['version']})
            assert saved['ok'] and not saved['sync'] and path.read_text() == changed
            assert request('/download') == (200,changed.encode())
            assert request('/save', {'source':'stale','version':initial['version']})[0] == 409
            _, diff = request('/history/diff', {'path':str(path),'id':first_id,'compare':'current','source':changed})
            assert diff['file'] == 'demo.md' and any(run['kind']!='equal' for run in diff['changes'])
            _, restored = request('/history/restore', {'path':str(path),'id':first_id,'source':changed,'version':saved['version']})
            assert restored['source'] == original and path.read_text() == original
            _, switched = request('/source', {'path':str(second),'version':restored['version']})
            assert switched['document_type']=='markdown' and switched['source']=='# Second\n'
            assert switched['main_file'] == str(second), 'Each PDF note must compile itself.'
            assert request('/open',{'path':str(path)})[0] == 200
            path.write_bytes(original.replace('\n','\r\n').encode())
            _, crlf = request('/state')
            before = path.read_bytes()
            assert request('/save',{'source':original,'version':crlf['version']})[0] == 200
            assert path.read_bytes() == before,'Opening a CRLF note must preserve its exact bytes.'
        finally:
            server.shutdown();server.server_close();server.build.cleanup()

activity = describe_revision('# Heading\n\nBefore\n', '# Heading\n\nAfter\n', True)
assert activity['sections'] == ['Heading']
activity = describe_revision('# Real\n\n```\n# Code\nBefore\n```\n', '# Real\n\n```\n# Code\nAfter\n```\n', True)
assert activity['sections'] == ['Real'],'Code fences cannot introduce history headings.'
print('PASS: no-TeX Markdown startup/preview requests, auto-save/conflicts, project files, image boundaries, downloads, shared history/diff/restore and switching')
