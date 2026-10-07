"""Run: python test_project_files.py (local pdfLaTeX, SyncTeX, Node for PDF.js inspection)."""
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server, history_pdf_snapshot, history_pdf_line_index, save_source, snapshot
from history import History


with tempfile.TemporaryDirectory(prefix='latex project ') as directory:
    root = Path(directory).resolve()
    main = root / 'main.tex'
    chapter = root / 'chapters' / 'first.tex'
    appendix = root / 'appendices' / 'body.tex'
    nested = root / 'chapters' / 'deep' / 'body.tex'
    for file in (chapter, appendix, nested):
        file.parent.mkdir(parents=True, exist_ok=True)
    main.write_bytes('\r\n'.join([
        '% !TeX program = pdflatex', r'\documentclass{article}', r'\usepackage{hyperref}',
        r'\hypersetup{', 'pdftitle={Historical project test},', 'pdfauthor={Test author}', '}',
        r'\begin{document}',
        r'\section{Main document}', 'Main document text.', r'\input{chapters/first}',
        r'\include{appendices/body}', r'\end{document}']).encode('utf-8'))
    chapter.write_text('\n'.join([r'\section{Chapter}', r'Chapter text to navigate.\par',
                                  r'\input{chapters/deep/body}']), encoding='utf-8')
    nested.write_text('\n'.join([r'\subsection{Nested input}', r'Nested input text to navigate.\par']), encoding='utf-8')
    appendix.write_text('\n'.join([r'\section{Appendix}\label{appendix:body}',
                                    r'Appendix text to navigate.\par']), encoding='utf-8')
    server = make_server(main, main_thread='')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))

    def request(route, data=None):
        body = None if data is None else json.dumps(data).encode()
        req = Request(base + route, body, {'Content-Type':'application/json'})
        try:
            with direct.open(req, timeout=55) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def state():
        code, data = request('/state')
        assert code == 200, data
        return data

    def switch(file):
        code, data = request('/source', {'path':str(file), 'version':state()['version']})
        assert code == 200, data
        assert data['path'] == str(file) and data['main_file'] == str(main)
        assert data['project_root'] == str(root)
        assert data['main_source'] == (snapshot(main)['source'] if file != main else '')
        return data

    def compile_current():
        current = state()
        code, data = request('/compile', {'source':current['source'], 'version':current['version']})
        assert code == 200 and data['ok'] and data['sync'], data
        return data

    try:
        current = state()
        original_bytes = main.read_bytes()
        save_source(main, current['source'].replace('\r\n', '\n'), current['version'], History(main, root))
        assert main.read_bytes() == original_bytes, 'Opening or compiling browser-normalized source must preserve line endings.'
        assert {file['name'] for file in current['files']} == {
            'main.tex', 'chapters/first.tex', 'chapters/deep/body.tex', 'appendices/body.tex'}
        compiled = compile_current()
        assert compiled['labels']['appendix:body'] == '3', compiled['labels']
        pdf = server.pdf
        analysis = subprocess.run(['node', str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                                  input=json.dumps({'url':base + '/pdf', 'text':False}),
                                  text=True, encoding='utf-8', capture_output=True, check=True)
        boxes = json.loads(analysis.stdout)['boxes']
        for file in (chapter, nested, appendix):
            current = switch(file)
            assert current['sync'] and server.pdf == pdf
            mapping = {'version':current['version'], 'pdf_revision':compiled['pdf_revision'], 'boxes':boxes}
            code, point = request('/synctex', {**mapping, 'direction':'forward', 'line':2, 'column':1})
            assert code == 200, point
            x1, y1, x2, y2 = point['rect']
            switch(main)
            mapping['version'] = state()['version']
            code, target = request('/synctex', {**mapping, 'direction':'backward', 'page':point['page'],
                                               'x':x1 + 5, 'y':(y1 + y2)/2})
            assert code == 200 and target['path'] == str(file) and target['line'] == 2, target
            current = switch(file)
            mapping['version'] = current['version']
            code, ranges = request('/synctex', {**mapping, 'direction':'range', 'first':2, 'last':2})
            assert code == 200 and ranges['regions'], (str(file), ranges)
        print('PASS: nested input/include forward and inverse navigation, source ranges, stable main PDF and included labels')

        current = switch(appendix)
        original_main = main.read_bytes()
        before = current['source']
        after = before.replace('Appendix text', 'Revised appendix text')
        code, saved = request('/compile', {'source':after, 'version':current['version']})
        assert code == 200 and saved['ok'] and main.read_bytes() == original_main, saved
        assert appendix.read_bytes().decode('utf-8') == after
        assert not (appendix.parent / '.latex-codex').exists()
        first_history, second_history = History(appendix, root), History(nested, root)
        assert first_history.database == second_history.database
        assert first_history.file != second_history.file
        assert first_history.get(first_history.list()['revisions'][0]['id'])['source'] == after
        assert first_history.list() == second_history.list(), 'Every source opens the unified project timeline.'
        nested_row = next(row for row in second_history.list()['revisions'] if row['file'] == second_history.file)
        assert second_history.get(nested_row['id'])['source'] != after
        first_history.chat_append(0, 'Shared project question', {'answer':'Shared answer'}, str(appendix), 'text')
        switch(nested)
        assert request('/chat/history')[1]['messages'][0]['content'] == 'Shared project question'
        print('PASS: child saves compile main; unified history retains distinct same-name files and shared project chat')

        switch(appendix)
        live_pdf = server.pdf
        key, historical = history_pdf_snapshot(server, appendix, before)
        assert (historical['root'] / 'main.tex').read_bytes() == original_main, 'History must preserve CRLF in the copied main source without adding paragraph breaks.'
        inspection = subprocess.run(['node', str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                                     input=json.dumps({'path':str(historical['pdf'])}),
                                     text=True, encoding='utf-8', capture_output=True, check=True)
        analysis = json.loads(inspection.stdout)
        historical['boxes'] = analysis['boxes']
        assert history_pdf_line_index(historical)[2], 'Historical child changes must map through the main PDF.'
        words = ' '.join(word[2] for word in analysis['words'])
        assert 'Main document text.' in words and 'Appendix text to navigate.' in words and 'Revised' not in words, words
        assert appendix.read_bytes().decode('utf-8') == after and server.pdf == live_pdf
        main.write_text(main.read_text(encoding='utf-8').replace('Main document text.', 'External main change.'), encoding='utf-8')
        assert not state()['sync']
        current = state()
        assert request('/synctex', {'direction':'forward', 'line':2, 'version':current['version'],
                                  'pdf_revision':server.pdf_revision, 'boxes':boxes})[0] == 409
        changed_key, _ = history_pdf_snapshot(server, appendix, before)
        assert key != changed_key, 'Historical child PDFs depend on the current main file.'
        compile_current()
        print('PASS: child historical PDF overlays preserve the live project, and external dependency edits reject stale SyncTeX')

        outside = root.parent / (root.name + '-outside.tex')
        outside.write_text('Outside source.', encoding='utf-8')
        try:
            current = state()
            assert request('/source', {'path':str(outside), 'version':current['version']})[0] == 400
            assert request('/source', {'path':str(main), 'version':'stale'})[0] == 409
            assert state()['path'] == str(appendix)
        finally:
            outside.unlink()

        manuscript = root / 'manuscript'
        manuscript.mkdir()
        second_main = manuscript / 'entry.tex'
        second_main.write_text('\n'.join(['% !TeX program = pdflatex', r'\documentclass{article}',
                                          r'\begin{document}', r'\input{../appendices/body}', r'\end{document}']), encoding='utf-8')
        code, configured = request('/project', {'project_root':str(root), 'main_file':'manuscript/entry.tex',
                                               'version':state()['version']})
        assert code == 200 and configured['main_file'] == str(second_main), configured
        main = second_main
        compile_current()
        current = switch(appendix)
        assert current['sync']
        _, sibling_history = history_pdf_snapshot(server, appendix, before)
        assert sibling_history['pdf'].is_file(), 'Historical overlays must retain ../ sibling dependencies.'
        _, main_history = history_pdf_snapshot(server, main, snapshot(main)['source'])
        assert main_history['pdf'].is_file(), 'Nested main history must compile with sibling inputs.'
        code, point = request('/synctex', {'direction':'forward', 'line':2, 'version':current['version'],
                                         'pdf_revision':server.pdf_revision, 'boxes':boxes})
        assert code == 200, point
        assert request('/project', {'project_root':str(appendix.parent), 'main_file':str(main),
                                   'version':current['version']})[0] == 400
        assert state()['main_file'] == str(main)
        revision = first_history.record(before, 'open')
        current = state()
        code, restored = request('/history/restore', {'id':revision, 'path':str(appendix), 'source':current['source'], 'version':current['version']})
        assert code == 200 and restored['project_root'] == str(root) and restored['main_file'] == str(main), restored
        assert restored['path'] == str(appendix) and len(restored['files']) == 5, restored
        print('PASS: project root validation, stale switches, configurable nested main and sibling appendices using relative input paths')
    finally:
        server.shutdown()
        worker.join()
        server.server_close()
        server.build.cleanup()
        for cached in server.history_pdfs.values():
            cached['directory'].cleanup()
