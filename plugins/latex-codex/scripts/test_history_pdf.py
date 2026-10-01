"""Run: python -B scripts/test_history_pdf.py (local pdfLaTeX, SyncTeX and pdfinfo)."""
import json
from pathlib import Path
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from unittest.mock import patch

from editor import make_server, snapshot
from history import History

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    (path.parent / 'body.tex').write_text('Relative project input.', encoding='utf-8')
    paragraph = 'The original method uses a stable iteration and preserves the equation. ' * 14
    before = '% !TeX program = pdflatex\n\\documentclass{article}\n\\begin{document}\n\\input{body}\n\n' + paragraph + '\n\n\\newpage\nThe unchanged later section.\n\\end{document}\n'
    after = before.replace('original method', 'improved method', 1)
    path.write_bytes(before.encode())
    server = make_server(path, main_thread='')
    server.pdf, server.pdf_revision = b'%PDF-live-preview', 'live-preview'
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))
    history = History(path)
    revision = history.record(after, 'save')
    payload = {'path':str(path), 'id':revision, 'compare':'previous'}
    state, revisions = snapshot(path), history.list()

    def request(route, data=None):
        req = Request(base + route, json.dumps(data).encode() if data is not None else None, {'Content-Type':'application/json'})
        try:
            with direct.open(req, timeout=120) as response:
                body = response.read()
                return response.status, json.loads(body) if response.headers.get_content_type() == 'application/json' else body
        except HTTPError as error:
            return error.code, json.load(error)

    try:
        code, data = request('/history/pdf', payload)
        assert code == 200, data
        assert len(data['changes']) == 1, 'Unchanged later pages must not produce PDF changes.'
        for side in ('before', 'after'):
            assert request(data[side])[1].startswith(b'%PDF-')
            regions = data['changes'][0][side]
            assert regions and regions[0]['page'] == 1, regions
            assert 40 < regions[0]['rect'][3] - regions[0]['rect'][1] < 400, 'Crop should cover the changed wrapped paragraph, not the full page.'
        assert snapshot(path) == state and history.list() == revisions, 'Historical compilation must preserve source and history.'
        assert request('/pdf')[1] == b'%PDF-live-preview' and server.pdf_revision == 'live-preview'
        assert len(server.history_pdfs) == 2
        with patch('editor.compile_tex', side_effect=AssertionError('Cached snapshots must not recompile')):
            assert request('/history/pdf', payload)[0] == 200
        assert request('/history/pdf', {**payload, 'compare':'current', 'source':after})[1]['changes'] == []
        assert request('/history/pdf', {**payload, 'path':'other.tex'})[0] == 409
        bad = history.record(before.replace(paragraph, r'\DefinitelyMissingCommand'), 'save')
        assert request('/history/pdf', {'path':str(path), 'id':bad, 'target_id':revision})[0] == 400
        assert snapshot(path) == state and request('/pdf')[1] == b'%PDF-live-preview'
        print('PASS: real historical compilation, relative inputs, cropped paragraph pairing, later reflow isolation, cache, failure and unchanged live source/PDF')
    finally:
        server.shutdown(); worker.join(); server.server_close(); server.build.cleanup()
        for cached in server.history_pdfs.values():
            cached['directory'].cleanup()
