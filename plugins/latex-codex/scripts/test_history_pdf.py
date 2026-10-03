"""Run: python -B scripts/test_history_pdf.py (local pdfLaTeX, SyncTeX and pdfinfo)."""
import base64
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import zipfile
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from unittest.mock import patch

from editor import (make_server, snapshot, history_pdf_highlights, history_pdf_changes,
                    history_pdf_cache_file, prune_history_pdf_cache, compile_tex)
from history import History

old = {'words':[(1, [0, 0, 1, 1], 'x')]}
new = {'pdf':Path('unused.pdf'), 'boxes':[[0, 0, 10, 10]]}
changes = [{'after':[{'page':1,'rect':[0, 0, 10, 10]}]}]
xml = b'<html><page><word xMin="1" yMin="2" xMax="3" yMax="4">\x10</word></page></html>'
with patch('editor.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=xml)) as run:
    history_pdf_highlights(old, new, changes)
assert '-raw' in run.call_args.args[0]
assert new['words'][0][2] == '\ue010' and changes[0]['after'][0]['highlights'] == [[1, 6, 3, 8]]

def sentence_marks(before, after):
    old = {'words': [(1, [i, 10, i+1, 11], text) for i, text in enumerate(before.split())]}
    new = {'words': [(1, [i, 10, i+1, 11], text) for i, text in enumerate(after.split())], 'boxes': [[0, 0, 100, 100]]}
    changes = [{'after': [{'page': 1, 'rect': [0, 0, 100, 100]}]}]
    history_pdf_highlights(old, new, changes)
    return [text for _, rect, text in new['words'] if rect in changes[0]['after'][0]['highlights']]

assert sentence_marks('A very stable method. The next sentence stays.', 'A stable method. The next sentence stays.') == ['A', 'stable', 'method.']
assert sentence_marks('Remove this sentence. The next sentence stays.', 'The next sentence stays.') == []
assert sentence_marks('See e.g. Eq. 2.1 for the old bound. Unchanged.', 'See e.g. Eq. 2.1 for the new bound. Unchanged.') == ['See', 'e.g.', 'Eq.', '2.1', 'for', 'the', 'new', 'bound.']
assert sentence_marks('An old solution u. Use V. Unchanged.', 'An exact solution u. Use V. Unchanged.') == ['An', 'exact', 'solution', 'u.']

# A changed word's crop must include the rest of its sentence, including another page.
old = {'words': [(1, [10, 40, 20, 50], 'An'), (1, [20, 10, 30, 20], 'old'), (2, [10, 70, 20, 80], 'method.')]}
new = {'words': [old['words'][0], (1, [20, 10, 30, 20], 'improved'), old['words'][2]], 'boxes': [[0, 0, 100, 100]] * 2}
changes = [{'after': [{'page': 1, 'rect': [0, 5, 100, 25]}]}]
history_pdf_highlights(old, new, changes)
assert [region['page'] for region in changes[0]['after']] == [1, 2]
assert changes[0]['after'][0]['rect'][3] >= 50
assert [rect for region in changes[0]['after'] for rect in region['highlights']] == [word[1] for word in new['words']]

# Both versions must retain a sentence continuation on the following page.
old['boxes'] = [[0, 0, 100, 100]] * 2
changes = [{'before': [{'page': 1, 'rect': [0, 5, 100, 25]}],
            'after': [{'page': 1, 'rect': [0, 5, 100, 25]}]}]
history_pdf_highlights(old, new, changes)
assert [region['page'] for region in changes[0]['before']] == [1, 2]
assert all('highlights' not in region for region in changes[0]['before']), 'Before crops stay uncolored.'

# One paragraph edited around an unchanged display equation remains one card.
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    before = ('% !TeX program = pdflatex\n\\documentclass{article}\n\\begin{document}\n'
              'The original iteration reads\n\\begin{equation}\nu_k=u_{k-1}+S(f-Au_{k-1}).\n\\end{equation}\n'
              '\\newpage\nwhere the old smoother is defined in the following discussion.\n'
              '\nAn unchanged paragraph.\n\\end{document}\n')
    after = before.replace('original iteration', 'updated iteration').replace('old smoother', 'new smoother')
    path.write_text(before, encoding='utf-8')
    server = make_server(path, main_thread='')
    try:
        with patch('editor.synctex_records', side_effect=AssertionError('History uses one SyncTeX index, not a process per line.')):
            data = history_pdf_changes(server, path, before, after)
        assert len(data['changes']) == 1, 'Unchanged math must not split the edited paragraph into separate cards.'
        for side in ('before', 'after'):
            assert [region['page'] for region in data['changes'][0][side]] == [1, 2], (side, data)
        # An unchanged sentence on another page must not inflate a small edit.
        one_edit = before.replace('original iteration', 'updated iteration')
        continued = history_pdf_changes(server, path, before, one_edit)
        assert len(continued['changes']) == 1
        for side in ('before', 'after'):
            assert [region['page'] for region in continued['changes'][0][side]] == [1]
        # Without a blank line, a theorem/proof still starts a separate block.
        bounded_before = before.replace('\\newpage\nwhere', '\\begin{quote}\n\\newpage\nwhere').replace(
            '\n\nAn unchanged paragraph.', '\n\\end{quote}\n\nAn unchanged paragraph.')
        bounded_after = bounded_before.replace('original iteration', 'updated iteration')
        bounded = history_pdf_changes(server, path, bounded_before, bounded_after)
        assert len(bounded['changes']) == 1
        for side in ('before', 'after'):
            assert [region['page'] for region in bounded['changes'][0][side]] == [1], 'Do not scan the next environment as prose continuation.'
        # A paragraph boundary still separates independent edits.
        separate_before = before.replace('\\newpage\nwhere', '\\newpage\n\nwhere')
        separate_after = after.replace('\\newpage\nwhere', '\\newpage\n\nwhere')
        separate = history_pdf_changes(server, path, separate_before, separate_after)
        assert len(separate['changes']) == 2
    finally:
        server.server_close(); server.build.cleanup()
        for cached in server.history_pdfs.values(): cached['directory'].cleanup()

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'main.tex'
    (path.parent / 'body.tex').write_text('Relative project input.', encoding='utf-8')
    paragraph = ('The original method uses a stable iteration and preserves the equation. '
                 r'The energy norm is $\|v\|_a=\sqrt{a(v,v)}$. '
                 r'The dual space consists of continuous linear functionals on $V$. ') * 8
    before = '% !TeX program = pdflatex\n\\documentclass{article}\n\\usepackage{lineno,amsmath}\n\\begin{document}\n\\linenumbers\n\\input{body}\n\n' + paragraph + '\n\n\\newpage\nThe unchanged later section.\n\\end{document}\n'
    after = before.replace('original method', 'improved method', 1)
    path.write_bytes(before.encode())
    server = make_server(path, main_thread='')
    server.pdf, server.pdf_revision = b'%PDF-live-preview', 'live-preview'
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))
    history = History(path)

    def request(route, data=None):
        req = Request(base + route, json.dumps(data).encode() if data is not None else None, {'Content-Type':'application/json'})
        try:
            with direct.open(req, timeout=120) as response:
                body = response.read()
                return response.status, json.loads(body) if response.headers.get_content_type() == 'application/json' else body
        except HTTPError as error:
            return error.code, json.load(error)

    try:
        state = snapshot(path)
        code, compiled = request('/compile', {'source':before, 'version':state['version']})
        assert code == 200 and compiled['ok'], compiled
        assert not (path.parent / '.latex-codex' / 'pdf-cache').exists()
        assert not (path.parent / '.latex-codex' / 'pdf-diff-cache').exists(), 'Live compilation must not archive previews.'
        server.pdf, server.pdf_revision = b'%PDF-live-preview', 'live-preview'
        revision = history.record(after, 'save')
        payload = {'path':str(path), 'id':revision, 'compare':'previous'}
        state, revisions = snapshot(path), history.list()
        with patch('editor.compile_tex', wraps=compile_tex) as compile_calls:
            code, data = request('/history/pdf', payload)
            assert compile_calls.call_count == 2, 'First image comparison compiles both snapshots.'
        assert code == 200, data
        assert len(data['changes']) == 1, 'Unchanged later pages must not produce PDF changes.'
        for side in ('before', 'after'):
            assert request(data[side])[1].startswith(b'%PDF-')
            regions = data['changes'][0][side]
            assert regions and regions[0]['page'] == 1, regions
            assert 15 < regions[0]['rect'][3] - regions[0]['rect'][1] < 100, 'One edited sentence in a long single source line must not crop the whole paragraph.'
        assert snapshot(path) == state and history.list() == revisions, 'Historical compilation must preserve source and history.'
        assert request('/pdf')[1] == b'%PDF-live-preview' and server.pdf_revision == 'live-preview'
        assert len(server.history_pdfs) == 2
        highlights = data['changes'][0]['after'][0]['highlights']
        cached = server.history_pdfs[data['after'].rsplit('/', 1)[-1]]
        marked = [text for _, rect, text in cached.get('words', []) if rect in highlights]
        assert ' '.join(marked).replace('- ', '') == 'The improved method uses a stable iteration and preserves the equation.', marked
        with patch('editor.compile_tex', side_effect=AssertionError('Cached snapshots must not recompile')):
            assert request('/history/pdf', payload)[0] == 200
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZkAAAAASUVORK5CYII=')
        images = [{'kind':change['kind'], **{side:[{'page':r['page'], 'png':'data:image/png;base64,'+base64.b64encode(png).decode()} for r in change[side]] for side in ('before','after')}} for change in data['changes']]
        archive = history_pdf_cache_file(path, before, after)
        assert not archive.exists(), 'Images are saved only after the browser has rendered both sides.'
        assert request('/history/pdf-cache', {**payload, 'images':images}) == (200, {'cache_error':''})
        with zipfile.ZipFile(archive) as stored:
            assert sorted(stored.namelist()) == ['0-after-0.png', '0-before-0.png', 'changes.json']
        archived = archive.read_bytes()
        with patch('editor.os.replace', side_effect=PermissionError('cache read-only')):
            assert request('/history/pdf-cache', {**payload, 'images':images})[1]['cache_error'] == 'cache read-only'
        assert archive.read_bytes() == archived and not list(archive.parent.glob('*.tmp'))
        assert request('/history/pdf-cache', {**payload, 'images':[{'kind':'replace','before':[{'page':1,'png':'not PNG'}],'after':[]}]})[0] == 400
        assert archive.read_bytes() == archived
        for cached in server.history_pdfs.values(): cached['directory'].cleanup()
        server.history_pdfs.clear()
        restarted = make_server(path, main_thread='')
        restarted_revisions = history.list()
        try:
            with patch('editor.compile_tex', side_effect=AssertionError('Cached comparison images must bypass compilation')):
                restored = history_pdf_changes(restarted, path, before, after)
                served = request('/history/pdf', payload)[1]
            assert restored == served and served['images'] and not restarted.history_pdfs
            for side in ('before','after'):
                assert request(served['changes'][0][side][0]['image'])[1] == png
            assert snapshot(path) == state and history.list() == restarted_revisions
        finally:
            restarted.server_close(); restarted.build.cleanup()
        with patch('editor.compile_tex', return_value=(False,'compile failed','pdflatex')):
            assert request('/history/pdf', {**payload, 'recompile':True})[0] == 400
        assert archive.read_bytes() == archived, 'A failed recompile must preserve the comparison images.'
        assert request('/history/pdf', payload)[1]['images']
        with patch('editor.compile_tex', wraps=compile_tex) as compile_calls:
            assert request('/history/pdf', {**payload, 'recompile':True})[0] == 200
            assert compile_calls.call_count == 2, 'Explicit recompile bypasses both image and temporary PDF caches.'
        archive.write_bytes(b'damaged cache')
        for cached in server.history_pdfs.values(): cached['directory'].cleanup()
        server.history_pdfs.clear()
        with patch('editor.compile_tex', wraps=compile_tex) as compile_calls:
            assert request('/history/pdf', payload)[0] == 200
            assert compile_calls.call_count == 2, 'A damaged image archive regenerates the comparison.'
        assert request('/history/pdf-cache', {**payload, 'images':images})[0] == 200
        assert request('/history/pdf', {**payload, 'compare':'current', 'source':after})[1]['changes'] == []
        assert request('/history/pdf', {**payload, 'path':'other.tex'})[0] == 409
        bad = history.record(before.replace(paragraph, r'\DefinitelyMissingCommand'), 'save')
        assert request('/history/pdf', {'path':str(path), 'id':bad, 'target_id':revision})[0] == 400
        assert not history_pdf_cache_file(path, after, before.replace(paragraph, r'\DefinitelyMissingCommand')).exists()
        assert snapshot(path) == state and request('/pdf')[1] == b'%PDF-live-preview'
        print('PASS: real historical compilation, relative inputs, cropped paragraph pairing, later reflow isolation, cache, failure and unchanged live source/PDF')
    finally:
        server.shutdown(); worker.join(); server.server_close(); server.build.cleanup()
        for cached in server.history_pdfs.values():
            cached['directory'].cleanup()

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    old, older, latest = [folder / (str(i) * 64 + '.zip') for i in range(3)]
    for file in (old, older, latest): file.write_bytes(b'1234567')
    os.utime(old, (0, 0)); os.utime(older, (time.time()-10, time.time()-10))
    protected = folder / 'history.sqlite3'; protected.write_bytes(b'permanent history')
    with patch('editor.HISTORY_PDF_CACHE_BYTES', 10): prune_history_pdf_cache(folder)
    assert not old.exists() and not older.exists() and latest.is_file()
    assert protected.read_bytes() == b'permanent history'
print('PASS: no live archives, paired comparison PNGs, atomic cache failure, restart reuse, manual recompile, corruption rebuild, expiry and storage limit')
