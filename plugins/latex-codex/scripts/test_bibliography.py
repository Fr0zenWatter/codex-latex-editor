"""Run: python test_bibliography.py (local XeLaTeX, pdfLaTeX, Biber and Node)."""
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import compile_source_snapshot, make_server, tex_tool


with tempfile.TemporaryDirectory(prefix='latex bibliography ') as directory:
    root = Path(directory)
    path = root / 'paper' / 'main file.tex'
    path.parent.mkdir()
    bib = root / 'bibliography' / 'references.bib'
    bib.parent.mkdir()
    bib.write_text('@book{demo,author={Doe, Jane},title={Example Book},year={2024},publisher={Example Press}}\n'
                   '@book{other,author={Smith, John},title={Second Book},year={2025},publisher={Example Press}}\n', encoding='utf-8')
    source = '\n'.join([r'\documentclass{article}',
                        r'\usepackage[backend=biber,style=numeric]{biblatex}',
                        r'\addbibresource{../bibliography/references.bib}',
                        r'\begin{document}', r'A citation: \cite{demo}.',
                        r'\printbibliography', r'\end{document}'])
    path.write_text(source, encoding='utf-8')
    server = make_server(path, project_root=root, main_thread='', preferences_path=root / 'preferences.sqlite3')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    client = build_opener(ProxyHandler({}))

    def request(route, data=None):
        body = None if data is None else json.dumps(data).encode()
        try:
            with client.open(Request(base + route, body, {'Content-Type': 'application/json'}), timeout=90) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def compile_current(text=None):
        state = request('/state')[1]
        return request('/compile', {'source': state['source'] if text is None else text, 'version': state['version']})

    def pdf_text(path=None):
        run = subprocess.run(['node', str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                             input=json.dumps({'url': base + '/pdf'} if path is None else {'path': str(path)}).encode(), capture_output=True, check=True)
        return ' '.join(word[2] for word in json.loads(run.stdout)['words'])

    try:
        original = path.read_bytes()
        original_bib = bib.read_bytes()
        # First previews must work before a live compile has recorded dependencies.
        assert not server.dependencies and not server.pdf
        for proofread in (False, True):
            preview = compile_source_snapshot(server, path, source, proofread=proofread)
            try:
                text = pdf_text(preview['pdf'])
                assert 'A citation: [1].' in text and 'Example Book' in text
            finally:
                preview['directory'].cleanup()
        assert not server.dependencies and not server.pdf
        assert path.read_bytes() == original and bib.read_bytes() == original_bib
        def changed_bibliography(*args, **kwargs):
            bib.write_bytes(original_bib + b'\n% Changed during preview\n')
            return {'pdf_revision': 'stale', 'pdf': b'stale preview'}
        with patch('editor.proofread_pdf', side_effect=changed_bibliography):
            code, result = request('/proofread', {'path': str(path), 'version': request('/state')[1]['version'],
                                                'source': source, 'items': []})
            assert code == 409 and not server.proofread_pdfs, result
        bib.write_bytes(original_bib)
        code, result = compile_current()
        build = Path(server.build.name)
        assert code == 200 and result['ok'], result
        assert (build / (path.stem + '.bbl')).is_file(), 'A successful fresh Biber build must produce a bibliography.'
        assert 'This is Biber' in result['log'] and result['log'].count('This is XeTeX') == 3
        assert 'A citation: [1].' in pdf_text() and 'Example Book' in pdf_text()
        assert path.read_bytes() == original

        code, result = compile_current()
        assert code == 200 and result['ok'] and 'This is Biber' not in result['log'], result
        assert result['log'].count('This is XeTeX') == 1
        code, result = compile_current(source.replace('A citation:', 'See this citation:'))
        assert result['ok'] and 'This is Biber' not in result['log'], result

        before = request('/state')[1]
        bib.write_text(bib.read_text().replace('Example Book', 'Updated Book'), encoding='utf-8')
        changed = request('/state')[1]
        assert changed['version'] == before['version']
        assert changed['project_version'] != before['project_version'] and not changed['sync'], 'Bibliography edits must invalidate the preview.'
        code, result = compile_current()
        assert result['ok'] and 'This is Biber' in result['log'] and 'Updated Book' in pdf_text(), result

        code, result = compile_current(source.replace(r'\cite{demo}', r'\cite{other}'))
        assert result['ok'] and 'This is Biber' in result['log'] and 'Second Book' in pdf_text(), result
        code, result = compile_current(source.replace('style=numeric', 'style=authoryear'))
        assert result['ok'] and 'This is Biber' in result['log'] and 'Doe 2024' in pdf_text(), result
        code, result = compile_current('% !TeX program = pdflatex\n' + source)
        assert result['ok'] and result['engine'] == 'pdflatex' and 'A citation: [1].' in pdf_text(), result

        # Historical and proofread overlays must preserve ../ bibliography paths and live files.
        originals = {file: file.read_bytes() for file in (path, bib)}
        formal_pdf = server.pdf
        for proofread in (False, True):
            preview = compile_source_snapshot(server, path, source, proofread=proofread)
            try:
                assert 'A citation: [1].' in pdf_text(preview['pdf']) and 'Updated Book' in pdf_text(preview['pdf'])
            finally:
                preview['directory'].cleanup()
        assert server.pdf == formal_pdf and all(file.read_bytes() == content for file, content in originals.items())

        code, result = compile_current(source.replace('backend=biber', 'backend=bibtex'))
        assert result['ok'] and 'This is BibTeX' in result['log'] and 'Updated Book' in pdf_text(), result
        code, result = compile_current(source)
        assert result['ok'] and 'This is Biber' in result['log'], result

        # Only the current TeX pass may request Biber; old .bcf files cannot activate it.
        plain = r'\documentclass{article}\begin{document}Plain text.\end{document}'
        with patch('editor.tex_tool', side_effect=lambda name: None if name == 'biber' else tex_tool(name)):
            code, result = compile_current(plain)
            assert code == 200 and result['ok'] and 'This is Biber' not in result['log'], result
            previous_pdf = server.pdf
            code, result = compile_current(source)
            assert code == 500 and 'Biber' in result['error'], result
            assert server.pdf == previous_pdf and not request('/state')[1]['sync']

        # A processor failure must retain the last successful PDF and allow a real retry.
        real_run = subprocess.run
        def failing_biber(command, *args, **kwargs):
            if Path(command[0]).stem.lower() == 'biber':
                return subprocess.CompletedProcess(command, 1, b'ERROR - Deliberate Biber failure\n')
            return real_run(command, *args, **kwargs)
        bib.write_text(bib.read_text().replace('Updated Book', 'Retry Book'), encoding='utf-8')
        with patch('editor.subprocess.run', side_effect=failing_biber):
            code, result = compile_current(source)
            assert code == 200 and not result['ok'] and 'Biber failure' in result['log'], result
            assert server.pdf == previous_pdf
        code, result = compile_current()
        assert result['ok'] and 'This is Biber' in result['log'] and 'Retry Book' in pdf_text(), result

        legacy = source.replace(r'\usepackage[backend=biber,style=numeric]{biblatex}', '').replace(
            r'\addbibresource{../bibliography/references.bib}', '').replace(
            r'\printbibliography', r'\bibliographystyle{plain}\bibliography{../bibliography/references}')
        code, result = compile_current(legacy)
        assert result['ok'] and 'This is BibTeX' in result['log'] and 'This is Biber' not in result['log'], result
        child = path.parent / 'parts' / 'chapter.tex'
        child.parent.mkdir()
        child.write_text(r'A nested citation: \cite{other}.', encoding='utf-8')
        child.with_suffix('.aux').write_text(r'\relax', encoding='utf-8')
        code, result = compile_current(legacy.replace(r'A citation: \cite{demo}.', r'\include{parts/chapter}'))
        assert result['ok'] and 'Second Book' in pdf_text(), result
        assert not list(path.parent.glob('*.bbl')) and child.with_suffix('.aux').read_text() == r'\relax'
        style = path.parent / 'local.bst'
        plain_style = subprocess.run([tex_tool('kpsewhich'), 'plain.bst'], capture_output=True, check=True).stdout.decode().strip()
        style.write_bytes(Path(plain_style).read_bytes())
        code, result = compile_current(legacy.replace('{plain}', '{local}'))
        assert result['ok'], result
        previous = request('/state')[1]['project_version']
        style.write_bytes(style.read_bytes() + b'\n% Local style edit\n')
        changed = request('/state')[1]
        assert changed['project_version'] != previous and not changed['sync']
        code, result = compile_current()
        assert result['ok'] and 'This is BibTeX' in result['log'], result
        code, result = compile_current(source)
        assert result['ok'] and 'This is Biber' in result['log'] and 'Retry Book' in pdf_text(), result
        print('PASS: Biber fresh builds, cache reuse, bibliography/citation/style changes, relative paths, both TeX engines, stale requests and safe failures')
    finally:
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
