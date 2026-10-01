"""Run: python -B scripts/test_http_server.py (stdlib only; no TeX needed)."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import socket
import tempfile
import threading
from unittest.mock import patch
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
        revision = json.loads(request('/state')[1])['version']

        def compile_tex(*args):
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
        build = Path(server.build.name)
        (build / 'main.pdf').write_bytes(b'%PDF-test')
        (build / 'main.aux').write_text(r'\newlabel{eq:regularity}{{3.13}{17}{}{equation*.114}{}}' + '\n' + r'\newlabel{custom}{{\dangerous{data}}{1}}', encoding='utf-8')
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(True, 'ok', 'xelatex')), patch('editor.pdf_page_boxes', return_value=[[0, 0, 600, 800]]):
            revision = json.loads(request('/state')[1])['version']
            code, body = request('/compile', {'source': 'First edit.', 'version': revision})
            assert code == 200 and json.loads(body)['labels'] == {'eq:regularity': '3.13'}
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(False, 'error', 'xelatex')):
            revision = json.loads(request('/state')[1])['version']
            code, body = request('/compile', {'source': 'First edit.', 'version': revision})
            assert code == 200 and json.loads(body)['labels'] == {} and not json.loads(body)['sync']
        print('PASS: compiled reference metadata and failed-build isolation')
        print('PASS: idle browser connections, page/assets during compilation, serialized saves and conflict protection')
    finally:
        release.set()
        idle.close()
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
