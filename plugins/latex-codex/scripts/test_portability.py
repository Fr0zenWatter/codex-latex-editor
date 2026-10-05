"""Run: python -B scripts/test_portability.py (stdlib only)."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from editor import compiler, tex_tool, choose_file, make_server, validate_pdf_boxes, accept_pdf_analysis

with patch('editor.shutil.which', side_effect=lambda name: '/tex/pdflatex' if name == 'pdflatex' else None):
    assert compiler('plain source') == ('pdflatex', '/tex/pdflatex')
    try:
        compiler('% !TeX program = xelatex\nplain source')
        raise AssertionError('Explicit engine directives must be honored.')
    except FileNotFoundError:
        pass
    with TemporaryDirectory() as directory:
        path = Path(directory) / 'main.tex'
        path.write_text('plain source', encoding='utf-8')
        server = make_server(path, main_thread='')
        server.server_close(); server.build.cleanup()

with patch('editor.sys.platform', 'darwin'), patch('editor.shutil.which', return_value=None), \
        patch('editor.Path.is_file', return_value=True), patch('editor.os.access', return_value=True):
    for name in ('pdflatex', 'xelatex', 'bibtex', 'synctex', 'kpsewhich'):
        assert tex_tool(name) == str(Path('/Library/TeX/texbin') / name)
with patch('editor.sys.platform', 'darwin'), patch('editor.subprocess.run',
        return_value=SimpleNamespace(returncode=0, stdout='/papers with spaces/main.tex\n'.encode(), stderr=b'')) as run:
    assert choose_file(Path('/papers with spaces/main.tex')) == '/papers with spaces/main.tex'
    assert run.call_args.args[0][-1] == str(Path('/papers with spaces/main.tex').parent)
    assert run.call_args.args[0][0] == 'osascript'

for invalid in (None, [], [[0,0,0,1]], [[0,False,1,1]], [[0,0,float('nan'),1]], [[0,0,1e9,1]]):
    try:
        validate_pdf_boxes(invalid)
        raise AssertionError(invalid)
    except ValueError:
        pass
snapshot = {'revision':'compiled-pdf'}
valid = {'revision':'compiled-pdf', 'boxes':[[0,0,600,800]], 'words':[[1,[1,2,3,4],'ﬁ']]}
for invalid in ({**valid,'revision':'stale'}, {**valid,'words':[[2,[1,2,3,4],'text']]},
                {**valid,'words':[[1,[1,2,float('nan'),4],'text']]}):
    try:
        accept_pdf_analysis(snapshot, invalid)
        raise AssertionError('Invalid analysis accepted.')
    except ValueError:
        assert 'words' not in snapshot
accept_pdf_analysis(snapshot, valid)
assert snapshot['words'][0][2] == 'fi'
print('PASS: no Poppler startup dependency, explicit engine/fallback, MacTeX discovery, native Mac picker and validated PDF.js geometry')
