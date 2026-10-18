"""Real compiler checks for preview instrumentation; no models or user documents."""
from pathlib import Path
import shutil
import tempfile

from editor import compile_source_snapshot, make_server, proofread_pdf


# prefix, selected source, suffix, replacement. Each proposed document is valid.
CASES = [
    ('math text', '', r'$x+\text{a-b and x=y}$', '', r'$y+\text{a+b and x<y}$'),
    ('math font', '', r'$x+\textrm{a-b}$', '', r'$y+\textrm{a+b}$'),
    ('operator name', '', r'$\operatorname{arg-max}(x)$', '', r'$\operatorname{arg-min}(y)$'),
    ('unbraced text', '', r'\textbf abc', '', r'\textbf xyz'),
    ('unbraced color', '', r'\textcolor{blue}abc', '', r'\textcolor{red}xyz'),
    ('accent', '', r"caf\'e", '', r"caf\`e"),
    ('dimension', '', r'left\kern2pt right', '', r'left\kern3pt right'),
    ('character number', '', r'\char65', '', r'\char66'),
    ('table columns', '', r'\begin{tabular}{lr}old & 1\\end & 2\end{tabular}', '', r'\begin{tabular}{lr}new & 2\\end & 3\end{tabular}'),
    ('alignment count', '', r'$\begin{alignedat}{2}x&=1& y&=2\end{alignedat}$', '', r'$\begin{alignedat}{2}x&=2& y&=3\end{alignedat}$'),
    ('array columns', '', r'$\begin{array}{cc}x&y\\z&w\end{array}$', '', r'$\begin{array}{cc}y&x\\w&z\end{array}$'),
    ('box dimensions', '', r'\begin{minipage}{.5\linewidth}Old text.\end{minipage}', '', r'\begin{minipage}{.6\linewidth}New text.\end{minipage}'),
    ('list', '', r'\begin{enumerate}\item Old\item Next\end{enumerate}', '', r'\begin{enumerate}\item New\item Next\end{enumerate}'),
    ('root index', '', r'$\sqrt[3]{x_i}+\sqrt2$', '', r'$\sqrt[4]{x_j}+\sqrt3$'),
    ('unbraced scripts', '', r'$x^ab_i+\frac12$', '', r'$x^cd_j+\frac34$'),
    ('inside math text', r'$x+\text{', 'a-b and x=y', r'}$', 'a+b and x<y'),
    ('inside superscript', r'$x^', '2', '$', '3'),
    ('inside fraction', r'$\frac', '12', '$', '34'),
    ('inside format', r'\textbf{', 'old words', '}', 'new words'),
    ('comment', 'start % ', 'old comment', '\nend', 'new comment'),
    ('paragraphs', '', 'One paragraph.\n\nNext paragraph.', '', 'Revised paragraph.\n\nNext paragraph.'),
    ('inline verbatim', '', r'\verb|x^2_a-b|', '', r'\verb|x^3_a+b|'),
    ('verbatim environment', '', '\\begin{verbatim}\nx^2_a-b\n\\end{verbatim}\n', '', '\\begin{verbatim}\nx^3_a+b\n\\end{verbatim}\n'),
    ('partial math open', '', r'old $x^2', '$ end', r'new $x^3'),
    ('partial math close', '$x^2 ', r'+y$ old', ' end', r'-y$ new'),
    ('partial group', r'\textbf{old ', r'words} next', ' end', r'text} more'),
    ('unknown unbraced macro', '', r'\wrap a b', '', r'\wrap c d'),
    ('picture coordinates', '', r'\begin{picture}(100,20)\put(0,0){Old}\end{picture}', '', r'\begin{picture}(120,20)\put(0,0){New}\end{picture}'),
]

checks = 0
for engine in ('pdflatex', 'xelatex'):
    if not shutil.which(engine):
        continue
    with tempfile.TemporaryDirectory(prefix='latex-proofread-safety-') as directory:
        root = Path(directory)
        path = root/'main.tex'
        header = ('% !TeX program = '+engine+'\n\\documentclass{article}\n'
                  '\\usepackage{amsmath,amssymb,array,xcolor}\n'
                  '\\newcommand{\\wrap}[2]{#1#2}\n\\begin{document}\n')
        ending = '\n\\end{document}\n'
        original = header+'Saved original.'+ending
        path.write_text(original,encoding='utf-8')
        original_bytes = path.read_bytes()
        server = make_server(path,main_thread='',preferences_path=root/'preferences.sqlite3')
        formal_pdf = server.pdf
        try:
            for name,prefix,selection,suffix,replacement in CASES:
                source = header+prefix+selection+suffix+ending
                candidate = header+prefix+replacement+suffix+ending
                # A plain candidate must compile; fallback must not conceal invalid suggestions.
                compiled = compile_source_snapshot(server,path,candidate)
                compiled['directory'].cleanup()
                start = len(header+prefix)
                items = [dict(id=1,start=start,end=start+len(selection),selection=selection,replacement=replacement)]
                result = proofread_pdf(server,path,source,items)
                assert result['pdf'].startswith(b'%PDF'), (engine,name)
                assert result['regions'], (engine,name,'Keep/Undo region missing')
                if name in ('comment','partial math open','partial math close','partial group','inside fraction'):
                    assert result['plain_preview'], (engine,name,'Expected a clearly identified plain preview')
                if name in ('math text','unbraced text','table columns','alignment count','array columns','box dimensions','inside superscript'):
                    assert not result['plain_preview'], (engine,name,'Common TeX should keep full highlighting')
                assert path.read_bytes()==original_bytes and server.pdf==formal_pdf
                assert not server.proofread_pdfs and not server.history_pdfs
                checks += 1
            # A real syntax error must still fail, even after the unmarked retry.
            try:
                proofread_pdf(server,path,header+'valid'+ending,
                              [dict(id=1,start=len(header),end=len(header)+5,selection='valid',replacement=r'\undefinedPreviewCommand')])
            except ValueError as error:
                assert 'PDF 校对预览编译失败' in str(error)
            else:
                raise AssertionError('Invalid replacement was silently accepted')
            assert path.read_bytes()==original_bytes and server.pdf==formal_pdf
            print(f'PASS: {engine}: {len(CASES)} TeX boundary cases, explicit fallback, invalid-replacement rejection and source/PDF preservation',flush=True)
        finally:
            server.server_close()
            server.build.cleanup()
assert checks, 'A local TeX engine is required for this safety matrix.'
