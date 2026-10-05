"""Run: python -B scripts/test_http_server.py (stdlib only; no TeX needed)."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import socket
import tempfile
import threading
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    path.write_text('Original.', encoding='utf-8')
    with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.shutil.which', return_value='unused'):
        server = make_server(path, main_thread='')
    accepted = threading.Event()
    original_get_request = server.get_request

    def get_request():
        result = original_get_request()
        accepted.set()
        return result

    server.get_request = get_request
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'

    def request(route, data=None):
        req = Request(base + route, None if data is None else json.dumps(data).encode(),
                      {'Content-Type': 'application/json'})
        try:
            with build_opener(ProxyHandler({})).open(req, timeout=3) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    idle = socket.create_connection(server.server_address)
    started, release = threading.Event(), threading.Event()
    try:
        assert accepted.wait(2)
        assert request('/')[0] == 200, 'An idle browser preconnect must not block the page.'
        assert request('/vendor/latex-themes.mjs')[0] == 200
        assert request('/vendor/latex-native-annotations.mjs')[0] == 200
        for theme in ('eclipse', 'idea', 'neo', 'base16-light', 'solarized', 'material-darker', 'material-palenight', 'ayu-dark', 'gruvbox-dark'):
            code, css = request('/vendor/' + theme + '.css')
            assert code == 200 and b'.cm-s-' in css, 'Bundled themes must be available offline.'
        revision = json.loads(request('/state')[1])['version']
        server.pdf, server.pdf_revision, server.sync_version = b'%PDF-preserved', 'preserved', revision
        with patch('editor.compile_tex') as no_compile:
            assert request('/save', {'source': 'Original.', 'version': revision})[0] == 200
            assert server.sync_version == revision, 'Unchanged autosave preserves synchronization.'
            code, body = request('/save', {'source': 'Saved without compile.', 'version': revision})
            assert code == 200 and path.read_text(encoding='utf-8') == 'Saved without compile.'
            assert not server.sync_version and server.pdf == b'%PDF-preserved'
            assert request('/save', {'source': 'Stale.', 'version': revision})[0] == 409
            assert request('/save', {'source': 123, 'version': revision})[0] == 400
            no_compile.assert_not_called()
        revision = json.loads(body)['version']


        def compile_tex(*args, **kwargs):
            started.set()
            assert release.wait(5)
            return False, 'Test compilation result.', 'xelatex'

        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', side_effect=compile_tex), ThreadPoolExecutor(2) as pool:
            first = pool.submit(request, '/compile', {'source': 'First edit.', 'version': revision})
            try:
                assert started.wait(2)
                second = pool.submit(request, '/compile', {'source': 'Stale edit.', 'version': revision})
                assert request('/')[0] == 200, 'The page shell stays available during compilation.'
                assert request('/vendor/latex-chat.mjs')[0] == 200
            finally:
                release.set()
            assert first.result()[0] == 200
            assert second.result()[0] == 409, 'Concurrent stale saves must never overwrite the first edit.'
        assert path.read_text(encoding='utf-8') == 'First edit.'
        assert json.loads(request('/state')[1])['source'] == 'First edit.'
        # A slow history comparison must not lock the live document after closing history.
        started.clear(); release.clear()
        def history_pdf_changes(*args, **kwargs):
            started.set()
            assert release.wait(5)
            return {'changes': []}
        latest = json.loads(request('/history?path=' + str(path))[1])['revisions'][0]['id']
        current = json.loads(request('/state')[1])
        with patch('editor.history_pdf_changes', side_effect=history_pdf_changes), ThreadPoolExecutor(1) as pool:
            preview = pool.submit(request, '/history/pdf', {'path':str(path), 'id':latest, 'compare':'previous'})
            try:
                assert started.wait(2)
                assert json.loads(request('/state')[1])['source'] == 'First edit.'
                assert request('/save', {'source':'First edit.', 'version':current['version']})[0] == 200
            finally:
                release.set()
            assert preview.result()[0] == 200
        print('PASS: state polling and saving remain responsive during history PDF generation')
        started.clear(); release.clear()
        def cancellable_pdf(*args, cancelled):
            started.set()
            while not release.wait(.01):
                if cancelled(): raise InterruptedError('History cancelled')
            return {'changes': []}
        with patch('editor.history_pdf_changes', side_effect=cancellable_pdf), ThreadPoolExecutor(1) as pool:
            preview = pool.submit(request, '/history/pdf', {'path':str(path), 'id':latest, 'compare':'previous', 'request_id':'1'*36})
            try:
                assert started.wait(2)
                assert request('/history/pdf-cancel', {'request_id':'2'*36})[0] == 200
                assert not preview.done(), 'A late cancellation must not cancel a newer comparison.'
                assert request('/history/pdf-cancel', {'request_id':'1'*36})[0] == 200
                assert preview.result(timeout=2)[0] == 409
                assert request('/state')[0] == 200
            finally:
                release.set()
        print('PASS: targeted history cancellation stops obsolete work without blocking state reads')
        batch = {'request_id': '1' * 32, 'source': 'First edit.', 'selection': 'First',
                 'messages': [{'role': 'user', 'content': 'Shorten this.'}],
                 'remember': True, 'memory_revision': 0,
                 'annotations': [{'id': 1, 'start': 0, 'end': 5, 'selection': 'First', 'request': 'Shorten this.'}]}
        job = Mock(result={'status': 'running'})
        job.start.return_value = job
        with patch('editor.ChatJob', return_value=job) as spawn:
            code, body = request('/chat', batch)
            assert code == 200 and json.loads(body)['id'] == batch['request_id']
            assert request('/chat', batch) == (code, body), 'A lost acknowledgement must not start a second model request.'
            job.result = {'status': 'done'}
            assert request('/chat', batch) == (code, body), 'Retries after completion must reuse the original task.'
            assert spawn.call_count == job.start.call_count == 1
            assert request('/chat', {**batch, 'selection': 'First edit.'})[0] == 409
            assert request('/chat', {**batch, 'request_id': 'invalid'})[0] == 400
        server.chat = None
        print('PASS: Send retries reuse one task and reject changed or invalid requests')
        build = Path(server.build.name)
        (build / 'main.pdf').write_bytes(b'%PDF-test')
        (build / 'main.aux').write_text('\n'.join([
            r'\newlabel{eq:regularity}{{3.13}{17}{}{equation*.114}{}}',
            r'\newlabel{custom}{{\dangerous{data}}{1}}',
            r'\bibcite{BankXu2003b}{9}', r'\bibcite{BankXuZheng2007}{10}',
            r'\bibcite{BankNguyen2011}{{6}{2011}{{Bank and Nguyen}}{{}}}',
            r'\bibcite{eq:regularity}{7}', r'\bibcite{custom}{\dangerous{data}}',
            r'\bibcite{author-year}{{Doe(2026)}{2026}{{Doe}}{{}}}',
        ]), encoding='utf-8')
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(True, 'ok', 'xelatex')):
            revision = json.loads(request('/state')[1])['version']
            code, body = request('/compile', {'source': 'First edit.', 'version': revision})
            assert code == 200 and json.loads(body)['labels'] == {'eq:regularity': '3.13'}
            assert json.loads(body)['citations'] == {'BankXu2003b': '9', 'BankXuZheng2007': '10', 'BankNguyen2011': '6', 'eq:regularity': '7'}
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(False, 'error', 'xelatex')):
            revision = json.loads(request('/state')[1])['version']
            code, body = request('/compile', {'source': 'First edit.', 'version': revision})
            assert code == 200 and json.loads(body)['labels'] == json.loads(body)['citations'] == {} and not json.loads(body)['sync']
        print('PASS: compiled reference/citation metadata and failed-build isolation')
        print('PASS: idle browser connections, page/assets during compilation, serialized saves and conflict protection')
    finally:
        release.set()
        idle.close()
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
