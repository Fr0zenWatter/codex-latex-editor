"""Run: python test_preferences.py (stdlib only; no TeX)."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
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
        assert request(servers[0], '/preferences', {'latex-codex-forward-shortcut': 'Shift-Cmd-E'})[0] == 200
        assert json.loads(request(servers[1], '/preferences')[1])['latex-codex-forward-shortcut'] == 'Shift-Cmd-E'
        assert Preferences(database).read()['latex-codex-forward-shortcut'] == 'Shift-Cmd-E'
        completion_settings = {'latex-codex-inline-completion': 'on', 'latex-codex-completion-effort': 'low',
                               'latex-codex-completion-model': 'gpt-6-luna'}
        assert request(servers[0], '/preferences', completion_settings)[0] == 200
        assert all(json.loads(request(servers[1], '/preferences')[1])[key] == value
                   for key, value in completion_settings.items())
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

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    home, local = folder / 'home', folder / 'Local App Data'
    legacy = home / '.latex-codex' / 'preferences.sqlite3'
    native = local / 'latex-codex' / 'preferences.sqlite3'
    original = {'latex-codex-source-font-size': '14', 'latex-codex-theme': 'eclipse', 'latex-codex-language': 'zh-CN'}
    Preferences(legacy).save(original)
    original_bytes = legacy.read_bytes()
    with patch('preferences.sys.platform', 'win32'), patch('preferences.Path.home', return_value=home), \
            patch.dict('preferences.os.environ', {'LOCALAPPDATA': str(local)}):
        first, second = Preferences(), Preferences()
        assert first.path == native and first.read() == original and not native.exists()
        with ThreadPoolExecutor(2) as pool:
            tasks = [pool.submit(store.save, {key: value}) for store, key, value in (
                (first, 'latex-codex-source-font-size', '18'), (second, 'latex-codex-theme', 'neo'))]
            for task in tasks:
                task.result()
        expected = {**original, 'latex-codex-source-font-size': '18', 'latex-codex-theme': 'neo'}
        assert Preferences().read() == expected, 'New services must reuse the migrated settings without losing concurrent changes.'
        assert legacy.read_bytes() == original_bytes, 'Migration must leave the original settings intact.'
        assert Preferences(legacy).path == legacy, 'An explicit settings path must remain authoritative.'
        with patch('preferences.sys.platform', 'darwin'):
            assert Preferences().path == legacy, 'Other platforms retain their existing settings directory.'
    print('PASS: standard Windows settings directory, legacy migration, concurrent updates and unchanged explicit/non-Windows paths')

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    home, local = folder / 'blocked home', folder / 'Local'
    legacy = home / '.latex-codex' / 'preferences.sqlite3'
    original_exists, original_mkdir = Path.exists, Path.mkdir

    def checked_exists(path):
        if path == legacy:
            raise PermissionError(5, 'Access is denied.', str(path.parent))
        return original_exists(path)

    def checked_mkdir(path, *args, **kwargs):
        if path == legacy.parent:
            raise PermissionError(5, 'Access is denied.', str(path))
        return original_mkdir(path, *args, **kwargs)

    with patch('preferences.sys.platform', 'win32'), patch('preferences.Path.home', return_value=home), \
            patch.dict('preferences.os.environ', {'LOCALAPPDATA': str(local)}), \
            patch.object(Path, 'exists', checked_exists), patch.object(Path, 'mkdir', checked_mkdir):
        store = Preferences()
        assert store.read() == {}, 'An inaccessible old location must not prevent startup.'
        store.save({'latex-codex-theme': 'neo'})
        assert Preferences().read() == {'latex-codex-theme': 'neo'}, 'Settings remain durable despite a denied home directory.'
        try:
            Preferences(legacy).save({'latex-codex-theme': 'eclipse'})
            raise AssertionError('Explicit inaccessible paths must report failure, not silently relocate.')
        except PermissionError:
            pass
    print('PASS: denied legacy directory recovers through Windows app data; explicit path errors remain visible')

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    legacy = folder / '.latex-codex' / 'preferences.sqlite3'
    Preferences(legacy).save({'latex-codex-theme': 'neo'})
    with patch('preferences.sys.platform', 'win32'), patch('preferences.Path.home', return_value=folder), \
            patch.dict('preferences.os.environ', {'LOCALAPPDATA': str(folder / 'Local')}):
        with patch('preferences.sqlite3.connect', side_effect=sqlite3.OperationalError('unable to open database file')):
            assert Preferences().read() == {}, 'Legacy access failures from SQLite also allow the new location.'
        with patch('preferences.sqlite3.connect', side_effect=sqlite3.OperationalError('database is locked')):
            try:
                Preferences().read()
                raise AssertionError('Database locking must not silently discard old settings.')
            except sqlite3.OperationalError:
                pass
    print('PASS: SQLite access failures recover, while other database errors remain visible')
