"""Run: python test_chat_export.py (no TeX or model call)."""
import json
from pathlib import Path
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server
from history import CHAT_EXPORT_NAMES, History


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory).resolve()
    note = root / 'note.md'
    note.write_text('# Test\n', encoding='utf-8')
    server = make_server(note, preferences_path=root / 'preferences.sqlite3')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    direct = build_opener(ProxyHandler({}))
    base = f'http://127.0.0.1:{server.server_port}'

    def request(route, data=None):
        body = None if data is None else json.dumps(data).encode()
        try:
            with direct.open(Request(base + route, body, {'Content-Type':'application/json'}), timeout=10) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    try:
        reply = '**Result** with $x^2$ and a list:\n\n- first\n- second'
        identity = History(note, root).chat_append(0, 'Question?', {'reply':reply}, 'note.md', '')
        code, history = request('/chat/history')
        assert code == 200 and history['messages'][-1]['id'] == identity
        code, result = request('/chat/export', {'id':identity, 'project':str(root)})
        assert code == 200 and result == {'file':'AI对话记录.md','already_saved':False}
        record = (root / result['file']).read_text(encoding='utf-8')
        assert reply in record and f'<!-- latex-codex-chat:{identity} -->' in record
        assert note.read_text(encoding='utf-8') == '# Test\n'
        assert request('/chat/export', {'id':identity, 'project':str(root)})[1]['already_saved']
        assert (root / result['file']).read_text(encoding='utf-8') == record
        for language, (filename, heading) in CHAT_EXPORT_NAMES.items():
            code, translated = request('/chat/export', {'id':identity, 'project':str(root), 'language':language})
            assert code == 200 and translated['file'] == filename
            assert f'## {heading}' in (root / filename).read_text(encoding='utf-8')
        assert request('/chat/export', {'id':identity-1, 'project':str(root)})[0] == 400
        assert request('/chat/export', {'id':identity, 'project':str(root / 'other')})[0] == 409
        assert request('/chat/export', {'id':'1', 'project':str(root)})[0] == 400
        assert request('/chat/export', {'id':identity, 'project':str(root), 'language':'../outside'})[0] == 400
    finally:
        server.shutdown()
        worker.join(timeout=5)
        server.server_close()
        server.build.cleanup()

print('PASS: project chat export preserves Markdown, checks identity and avoids duplicate writes')
