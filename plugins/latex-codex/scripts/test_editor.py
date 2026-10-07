"""Run: python test_editor.py (requires local XeLaTeX)."""
import json
import re
import subprocess
import hashlib
from pathlib import Path
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import ASSETS, VENDOR, compile_diagnostic, make_server


diagnostic_path = Path('C:/papers with spaces/main.tex')
for filename in (str(diagnostic_path), diagnostic_path.as_posix(), diagnostic_path.name, './main.tex'):
    error = filename + ':231: Undefined control sequence.'
    for width in (13, 79, 1000):
        wrapped = '\n'.join(error[i:i+width] for i in range(0, len(error), width))
        diagnostic = compile_diagnostic(wrapped, diagnostic_path)
        assert diagnostic and diagnostic['line'] == 231, wrapped
assert compile_diagnostic('other.tex:12: Undefined control sequence.\nl.12 \\bad', diagnostic_path) is None
assert compile_diagnostic('Compilation timed out.', diagnostic_path) is None
assert compile_diagnostic('main.tex:7: First error.\nmain.tex:8: Second error.', diagnostic_path)['line'] == 7


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    source = r'\documentclass{article}\begin{document}First version.\end{document}'
    path.write_text(source, encoding='utf-8')
    server = make_server(path)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))

    def request(route, data=None, headers=None):
        body = None if data is None else json.dumps(data).encode()
        req = Request(base + route, body, {'Content-Type': 'application/json', **(headers or {})})
        try:
            with direct.open(req, timeout=55) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    def state():
        code, body = request('/state')
        assert code == 200
        return json.loads(body)

    try:
        code, page = request('/')
        assert code == 200
        for name in re.findall(rb"from ['\"]/vendor/([^'\"]+)['\"]", page):
            assert name.decode() in ASSETS, 'Every boot module must be served, or the editor cannot initialize.'
        for name, mime in ASSETS.items():
            if '/' not in name:
                assert ('/vendor/' + name).encode() in page, 'Asset must also be loaded by the editor.'
            with direct.open(base + '/vendor/' + name) as response:
                assert response.headers.get_content_type() == mime
                assert response.read() == (VENDOR / name).read_bytes()
        assert request('/vendor/../editor.py')[0] == 404
        assert b'/vendor/matchbrackets.js' in page, 'Vim % requires the matching-bracket addon.'
        current = state()
        edited = source.replace('First', 'Second')
        code, body = request('/compile', {'source': edited, 'version': current['version']})
        assert code == 200 and json.loads(body)['ok'], body
        assert path.read_text(encoding='utf-8') == edited
        pdf = request('/pdf')[1]
        assert pdf.startswith(b'%PDF-') and len(pdf) > 1000
        revision = json.loads(body)['pdf_revision']
        assert revision == hashlib.sha256(pdf).hexdigest()
        assert request('/pdf?v=' + revision)[1] == pdf
        assert request('/pdf?v=stale')[0] == 409
        assert request('/page/0')[0] == 404
        assert request('/page/1')[0] == 404
        assert not list(Path(server.build.name).rglob('*.png')), 'Server must not rasterize pages.'
        current = state()
        broken = edited.replace('Second', r'\DefinitelyUndefinedCommand')
        code, body = request('/compile', {'source': broken, 'version': current['version']})
        assert code == 200 and not json.loads(body)['ok'], body
        assert not json.loads(body)['sync']
        assert path.read_text(encoding='utf-8') == broken
        assert request('/pdf')[1] == pdf, 'Failed compile replaced the previous PDF.'
        assert json.loads(body)['pdf_revision'] == revision, 'Failed compile replaced the previous PDF revision.'
        current = state()
        path.write_text(source, encoding='utf-8')
        assert request('/compile', {'source': edited, 'version': current['version']})[0] == 409
        assert path.read_text(encoding='utf-8') == source
        assert request('/compile', [], {})[0] == 400
        assert request('/compile', {}, {'Origin': 'https://example.com'})[0] == 403
        response = request('/state', headers={'Host': 'example.com'})
        assert response[0] == 403, response
        assert request('/../main.tex')[0] == 404
        with patch('editor.choose_file', return_value=''):
            assert json.loads(request('/open', {})[1])['cancelled']
            assert request('/pdf')[1] == pdf
        original = state()
        other = Path(directory) / 'another project' / 'S2super2_GS_blue.tex'
        other.parent.mkdir()
        other.write_text(source, encoding='utf-8')
        with patch('editor.choose_file', return_value=str(other)):
            code, body = request('/open', {})
        assert code == 200 and json.loads(body)['name'] == other.name
        assert state()['version'] != original['version'], 'Identical files must have distinct versions.'
        assert request('/pdf')[0] == 404 and request('/page/0')[0] == 404
        assert request('/compile', {'source': edited, 'version': original['version']})[0] == 409
        (other.parent / 'body.tex').write_text('Relative input works.', encoding='utf-8')
        edited = source.replace('First version.', r'\input{body}')
        code, body = request('/compile', {'source': edited, 'version': state()['version']})
        assert code == 200 and json.loads(body)['ok'], body
        assert other.read_text(encoding='utf-8') == edited
        assert path.read_text(encoding='utf-8') == source, 'Switching must not overwrite the original file.'
        with patch('editor.choose_file', return_value=str(other.parent / 'body.txt')):
            assert request('/open', {})[0] == 500
        assert state()['path'] == str(other)
        invalid = '% !TeX program = cmd.exe\n' + source
        assert request('/compile', {'source': invalid, 'version': state()['version']})[0] == 400
        assert other.read_text(encoding='utf-8') == edited
        (other.parent / 'references.bib').write_text('@article{sample, author={Doe, Jane}, title={Test reference}, journal={Test Journal}, year={2026}}', encoding='utf-8')
        # Old products beside the source must not shadow the current build's auxiliaries.
        stale_aux = other.with_suffix('.aux')
        stale_aux.write_text('\\relax\n', encoding='utf-8')
        paper = '% !TeX program = pdflatex\n' + r'\documentclass{article}\begin{document}\section{Test}\label{sec:test}Section \ref{sec:test}, citation \cite{sample}.\bibliographystyle{plain}\bibliography{references}\end{document}'
        code, body = request('/compile', {'source': paper, 'version': state()['version']})
        result = json.loads(body)
        assert code == 200 and result['ok'] and result['engine'] == 'pdflatex', body
        assert result['citations'] == {'sample': '1'}
        build = Path(server.build.name)
        assert r'\bibitem{sample}' in (build / (other.stem + '.bbl')).read_text()
        assert 'undefined' not in (build / (other.stem + '.log')).read_text(errors='replace').lower()
        assert server.page_boxes == [], 'Geometry is supplied by PDF.js only when locating.'
        assert result['pdf_revision'] == hashlib.sha256(request('/pdf')[1]).hexdigest()
        code, body = request('/compile', {'source': paper, 'version': state()['version']})
        repeat = json.loads(body)
        assert code == 200 and repeat['ok'] and 'This is BibTeX' not in repeat['log'], body
        assert repeat['log'].count('This is pdfTeX') == 1, repeat['log']
        assert repeat['pdf_revision'] == hashlib.sha256(request('/pdf')[1]).hexdigest()
        updated = paper.replace('Section ', 'See Section ')
        code, body = request('/compile', {'source': updated, 'version': state()['version']})
        assert code == 200 and json.loads(body)['ok'] and 'This is BibTeX' not in json.loads(body)['log'], body
        assert 'undefined' not in (build / (other.stem + '.log')).read_text(errors='replace').lower()
        assert stale_aux.read_text(encoding='utf-8') == '\\relax\n'
        bib = other.parent / 'references.bib'
        previous_build = json.loads(body)['pdf_revision']
        previous_source_version = state()['version']
        bib.write_text(bib.read_text().replace('Test reference', 'Updated reference'), encoding='utf-8')
        code, body = request('/compile', {'source': updated, 'version': state()['version']})
        assert code == 200 and json.loads(body)['ok'] and 'This is BibTeX' in json.loads(body)['log'], body
        assert 'Updated reference' in (build / (other.stem + '.bbl')).read_text()
        assert state()['version'] == previous_source_version
        assert json.loads(body)['pdf_revision'] != previous_build, 'Bibliography changes must refresh the PDF even if the source version is unchanged.'
        assert request('/pdf?v=' + previous_build)[0] == 409
        cited = updated.replace(r'\cite{sample}', r'\nocite{*}\cite{sample}')
        code, body = request('/compile', {'source': cited, 'version': state()['version']})
        assert code == 200 and json.loads(body)['ok'] and 'This is BibTeX' in json.loads(body)['log'], body
        # Real SyncTeX round trips across two pages, including a path with spaces.
        synced = '% !TeX program = pdflatex\n\\documentclass{article}\n\\begin{document}\nFirst target.\\par\nSecond target.\\par\n\\newpage\nThird target.\\par\n\\end{document}\n'
        code, body = request('/compile', {'source': synced, 'version': state()['version']})
        result = json.loads(body)
        assert code == 200 and result['ok'] and result['sync'], body
        def page_boxes():
            reader = subprocess.run(['node', str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                input=json.dumps({'url':base + '/pdf', 'text':False}), text=True, encoding='utf-8', capture_output=True, check=True)
            return json.loads(reader.stdout)['boxes']
        boxes = page_boxes()
        assert len(boxes) == 2
        revision = result['version']
        pdf_revision = result['pdf_revision']
        raw_request = request
        def request(route, data=None, headers=None):
            if route == '/synctex': data = {**data, 'boxes':boxes}
            return raw_request(route, data, headers)
        for line, page in [(5, 1), (7, 2)]:
            code, body = request('/synctex', {'direction': 'forward', 'version': revision, 'pdf_revision': pdf_revision, 'line': line, 'column': 1})
            target = json.loads(body)
            assert code == 200 and target['page'] == page and target['rect'][3] > target['rect'][1], body
            x1, y1, x2, y2 = target['rect']
            point = {'direction': 'backward', 'version': revision, 'pdf_revision': pdf_revision, 'page': page,
                     'x': x1 + min((x2-x1)/2, 12), 'y': (y1+y2)/2}
            code, body = request('/synctex', point)
            assert code == 200 and json.loads(body)['line'] == line, body
            code, body = request('/synctex', {'direction':'range', 'version':revision, 'pdf_revision':pdf_revision, 'first':line, 'last':line})
            assert code == 200 and any(region['page'] == page for region in json.loads(body)['regions']), body
            assert all(region['rect'][3]-region['rect'][1] <= 72 for region in json.loads(body)['regions']), 'Selection regions exclude whole-page containers.'
        for invalid in [{'direction': 'forward', 'line': 0},
                        {'direction': 'forward', 'line': 5, 'column': True},
                        {'direction': 'backward', 'page': 9, 'x': .2, 'y': .3},
                        {'direction': 'backward', 'page': 1, 'x': float('nan'), 'y': .3},
                        {'direction': 'backward', 'page': 1, 'x': True, 'y': .3},
                        {'direction': 'range', 'first':True, 'last':5},
                        {'direction': 'range', 'first':5, 'last':3},
                        {'direction': 'range', 'first':5, 'last':500}]:
            assert request('/synctex', {'version': revision, 'pdf_revision': pdf_revision, **invalid})[0] == 400
        assert request('/synctex', {'direction': 'forward', 'version': revision, 'pdf_revision': 'stale', 'line': 5})[0] == 409
        assert request('/synctex', {'direction': 'forward', 'version': 'stale', 'line': 5})[0] == 409
        # Rotation/cropping change the display viewport, not the SyncTeX/PDF point protocol.
        rotated = synced.replace(r'\begin{document}', r'\pdfpageattr{/Rotate 90 /CropBox [10 20 580 780]}\begin{document}')
        code, body = request('/compile', {'source': rotated, 'version': state()['version']})
        rotated_result = json.loads(body)
        assert code == 200 and rotated_result['ok'], body
        boxes = page_boxes()
        assert boxes[0][0:2] == [0,0] and boxes[0][3] > 780, 'Use MediaBox, not the cropped/rotated view.'
        mapping = {'version': rotated_result['version'], 'pdf_revision': rotated_result['pdf_revision']}
        code, body = request('/synctex', {**mapping, 'direction': 'forward', 'line': 5, 'column': 1})
        target = json.loads(body)
        assert code == 200 and target['page'] == 1, body
        x1, y1, x2, y2 = target['rect']
        code, body = request('/synctex', {**mapping, 'direction': 'backward', 'page': 1, 'x': x1+5, 'y': (y1+y2)/2})
        assert code == 200 and json.loads(body)['line'] == 5, body
        other.write_text(synced + '\n', encoding='utf-8')
        assert request('/synctex', {'direction': 'forward', 'version': revision, 'line': 5})[0] == 409
        assert request('/synctex', {'direction':'range', 'version':revision, 'pdf_revision':pdf_revision, 'first':5, 'last':5})[0] == 409
        code, body = request('/compile', {'source': synced.replace('Second target.', r'\DefinitelyUndefinedCommand'), 'version': state()['version']})
        assert code == 200 and not json.loads(body)['ok']
        assert json.loads(body)['diagnostic'] == {'path':str(other), 'line': 5, 'message': 'Undefined control sequence.'}
        assert request('/synctex', {'direction': 'forward', 'version': state()['version'], 'line': 5})[0] == 409
        print('PASS: compile/save, previews, conflicts, picker, cached bibliography with dependency/citation invalidation, SyncTeX round trips and stale/invalid mapping rejection')
    finally:
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
