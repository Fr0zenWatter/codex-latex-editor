"""Run: python test_outline.py (stdlib plus the existing local TeX engine)."""
from pathlib import Path
import tempfile
from editor import compile_tex
from outline import compiled_outline, groups

assert groups(r'{A {nested} title}{B\{literal\}}', 0, 2) == ['A {nested} title', r'B\{literal\}']
assert groups('{unfinished', 0, 1) == []
with tempfile.TemporaryDirectory(prefix='latex-outline-') as directory:
    root = Path(directory)
    (root / 'child.aux').write_text(r'\@writefile{toc}{\contentsline {subsection}{\numberline {2.1}A \textbf{nested} title}{iv}{subsection.2.1}}', encoding='utf-8')
    aux = root / 'main.aux'
    aux.write_text('\n'.join([
        r'\@writefile{toc}{\contentsline {section}{\numberline {2}Methods \& results}{iii}{section.2}}',
        r'\@input{child.aux}', r'\@input{child.aux}', r'\@input{../outside.aux}',
        r'\@writefile{toc}{\contentsline {section}{Appendix}{v}{section*.3}}',
        r'\@writefile{lof}{\contentsline {figure}{Not a heading}{2}{figure.1}}',
    ]), encoding='utf-8')
    result = compiled_outline(aux)
    assert [(item['title'], item['pageLabel'], item['number']) for item in result] == [
        ('Methods & results', 'iii', '2'), ('A nested title', 'iv', '2.1'), ('Appendix', 'v', '')]
    main = root / 'paper.tex'
    (root / 'body.tex').write_text(r'\subsection{Included heading} Child text.\subsubsection{Details} More.', encoding='utf-8')
    source = '\n'.join([r'\documentclass{article}', r'\begin{document}',
        r'\section{First heading} Text.\input{body}',
        r'\newpage\section{Second heading} More text.', r'\end{document}'])
    main.write_text(source, encoding='utf-8')
    build = root / 'build'
    build.mkdir()
    ok, log, _ = compile_tex(main, build, source)
    assert ok, log[-3000:]
    result = compiled_outline(build / 'paper.aux')
    assert [item['title'] for item in result] == ['First heading', 'Included heading', 'Details', 'Second heading']
    assert [item['number'] for item in result] == ['1', '1.1', '1.1.1', '2']
    assert [item['pageLabel'] for item in result] == ['1', '1', '1', '2']
print('PASS: compiled headings, nested formatting, include order, numbering, page labels and no-bookmark documents')
