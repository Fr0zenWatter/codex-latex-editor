"""Run: python test_preferences.py (stdlib only; no TeX)."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server
from preferences import Preferences


with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    database = folder / 'user' / 'preferences.sqlite3'
    first, second = Preferences(database), Preferences(database)
    assert first.read() == {} and not database.exists()
    with ThreadPoolExecutor(2) as pool:
        tasks = [pool.submit(store.save, {key: value}) for store, key, value in (
            (first, 'latex-codex-source-font-size', '18'),
            (second, 'latex-codex-theme', 'neo'))]
        for task in tasks:
            task.result()
    assert second.read() == {'latex-codex-source-font-size': '18', 'latex-codex-theme': 'neo'}
    servers = []
    for name in ('first.tex', 'second.tex'):
        source = folder / name
        source.write_text('Unchanged source.', encoding='utf-8')
        with patch('editor.compiler', return_value=('xelatex', 'unused')):
            server = make_server(source, main_thread='', preferences_path=database)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)

    def request(server, route, data=None, origin=None):
        base = f'http://127.0.0.1:{server.server_port}'
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        req = Request(base + route, None if data is None else json.dumps(data).encode(), headers)
        try:
            with build_opener(ProxyHandler({})).open(req, timeout=5) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    try:
        assert servers[0].server_port != servers[1].server_port
        assert request(servers[0], '/preferences', {'latex-codex-language': 'zh-CN'})[0] == 200
        assert json.loads(request(servers[1], '/preferences')[1])['latex-codex-language'] == 'zh-CN'
        assert request(servers[0], '/preferences', {'latex-codex-pdf-box-auto-comment': 'on'})[0] == 200
        assert json.loads(request(servers[1], '/preferences')[1])['latex-codex-pdf-box-auto-comment'] == 'on'
        assert Preferences(database).read()['latex-codex-pdf-box-auto-comment'] == 'on'
        switches = {'latex-codex-proofread-editor': 'off', 'latex-codex-proofread-pdf': 'on'}
        assert request(servers[0], '/preferences', switches)[0] == 200
        assert all(json.loads(request(servers[1], '/preferences')[1])[key] == value for key, value in switches.items())
        for style in ({'id': 'tao-en'}, {'name': 'Personal', 'prompt': 'Preserve notation.'}, None):
            value = json.dumps(style)
            assert request(servers[0], '/preferences', {'latex-codex-writing-style': value})[0] == 200
            assert json.loads(request(servers[1], '/preferences')[1])['latex-codex-writing-style'] == value
            assert Preferences(database).read()['latex-codex-writing-style'] == value
        assert request(servers[0], '/preferences', {'latex-codex-proofread-project':'on'})[0] == 200
        assert json.loads(request(servers[1], '/preferences')[1])['latex-codex-proofread-project'] == 'on'
        assert request(servers[0], '/preferences', {'source': 'never saved'})[0] == 400
        assert request(servers[0], '/preferences', {'latex-codex-theme': 1})[0] == 400
        assert request(servers[0], '/preferences', {'latex-codex-theme': 'x'}, 'https://example.com')[0] == 403
        assert request(servers[0], '/preferences', {'latex-codex-custom-themes': '</script><script>bad</script>'})[0] == 200
        page = request(servers[1], '/')[1].decode()
        assert 'id="user-preferences"' in page and '\\u003c/script>' in page
        assert '</script><script>bad' not in page
        assert all((folder / name).read_text() == 'Unchanged source.' for name in ('first.tex', 'second.tex'))
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()
            server.build.cleanup()
print('PASS: concurrent preference saves, shared settings across ports/projects, request validation and safe bootstrap')
