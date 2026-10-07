"""Run: python test_markdown_pdf.py (local XeLaTeX/SyncTeX; Node for PDF.js analysis)."""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server, history_pdf_snapshot, history_pdf_line_index, history_pdf_changes
from obsidian_tex import Converter, convert

# Converter fixture adapted from the user's LaTeX Sidecar test_notes.py.
SOURCE = r"""---
tags: [demo]
---
# 测试笔记

令 $n$ 为正整数, 范数 $\|x\|$ 与 \*星号\*, 则
$$
\int_0^1 x^n \mathrm{d}x=\frac{1}{n+1}
$$

> [!thm] 定理 1 (Cauchy)
> 设 $f$ 全纯, 则 $$\oint_\gamma f(z)\mathrm{d}z=0.$$
> - 子项 $a$
>   继续一行

**Proof.** See [[复变函数复习整理#洛朗展开|复习整理]] and ![[missing.png|200]]. $\square$

- 第一项
  - 嵌套项
- [ ] 待办
1. 有序项

| 节 | 内容 |
|:-:|---|
| §1 | $|z|<1$ 与 \| 竖线 |

```tikz
\usepackage{tikz-cd}
\begin{document}
\begin{tikzcd} A \arrow[r] & B \end{tikzcd}
\end{document}
```

```python
print("x_1 % {}")
```

%% 注释
不会出现 %%
==高亮== 和 ~~删除~~ 以及 #标签 和 `code_x`.[^1]

[^1]: 脚注内容 $x$.
最后一行

# 不变标题

第一句保持原样。第二句需要修改。第三句保持原样。
"""

def analysis(path):
    result = subprocess.run(['node', str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                            input=json.dumps({'path': str(path)}), text=True, encoding='utf-8', capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


with tempfile.TemporaryDirectory() as directory:
    vault = Path(directory) / 'vault'; vault.mkdir()
    (vault / '.obsidian').mkdir()
    notes = vault / 'notes'; notes.mkdir()
    note = notes / '测试 笔记.md'; note.write_text(SOURCE, encoding='utf-8')
    tex, warnings = convert(SOURCE, note)
    rows, source_rows = tex.split('\n'), SOURCE.split('\n')
    assert len(rows) - 2 == len(source_rows), 'Conversion must preserve every source line.'
    assert rows[source_rows.index('# 测试笔记')] == r'\section{测试笔记}'
    assert rows[source_rows.index('$$')] == r'\['
    assert r'\begin{obscallout}{obsindigo}{定理 1 (Cauchy)}' in tex
    assert r'\usepackage{tikz-cd}' in rows[0]
    assert r'\footnote{脚注内容 $x$.}' in tex and r'$|z|<1$' in tex
    assert rows[source_rows.index('%% 注释')] == ''
    assert r'\obshl{高亮}' in tex and r'\sout{删除}' in tex
    assert warnings == ['未找到图片: missing.png']
    extra, _ = convert('Inline \\(x\\).\n\\[\nx^2\n\\]\n', note, has_package=lambda _: False)
    assert '$x$' in extra and '\n\\[\nx^2\n\\]' in extra
    outside = Path(directory) / 'outside.png'; outside.write_bytes(b'private')
    converter = Converter(note)
    for target in ('../../outside.png', str(outside), 'file:///outside.png'):
        assert converter.resolve_file(target) is None, 'PDF assets must stay inside the vault.'
    (vault / 'a').mkdir(); (vault / 'b').mkdir()
    for folder in ('a', 'b'):
        (vault / folder / 'same.png').write_bytes(b'fixture')
    assert Converter(note).resolve_file('same.png') is None, 'Ambiguous attachments cannot select an arbitrary file.'
    image = vault / 'image.png'
    image.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='))
    note.write_bytes((SOURCE + '\n![[image.png]]\n').replace('\n', '\r\n').encode())
    original = note.read_bytes()
    server = make_server(note, main_thread='', preferences_path=Path(directory) / 'preferences.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    opener = build_opener(ProxyHandler({}))

    def request(route, data=None):
        req = Request(base + route, None if data is None else json.dumps(data).encode(), {'Content-Type': 'application/json'})
        try:
            with opener.open(req, timeout=150) as response:
                body = response.read()
                return response.status, json.loads(body) if response.headers.get_content_type() == 'application/json' else body
        except HTTPError as error:
            return error.code, json.loads(error.read())

    try:
        current = request('/state')[1]
        status, result = request('/compile', {'source': current['source'], 'version': current['version'], 'preview': 'pdf'})
        assert status == 200 and result.get('ok') and result.get('sync'), str(result.get('error', '')) + result.get('log', '')[-1600:]
        assert note.read_bytes() == original, 'PDF preview never rewrites the original Markdown bytes.'
        assert request('/pdf')[1].startswith(b'%PDF-') and request('/download')[1] == original
        assert result['outline'], 'Markdown PDF reuses the chapter outline.'
        pdf = Path(server.build.name) / (note.stem + '.pdf')
        geometry = analysis(pdf)
        boxes = geometry['boxes']
        target = source_rows.index('**Proof.** See [[复变函数复习整理#洛朗展开|复习整理]] and ![[missing.png|200]]. $\\square$') + 1
        sync = {'version': result['version'], 'pdf_revision': result['pdf_revision'], 'boxes': boxes}
        status, forward = request('/synctex', {**sync, 'direction': 'forward', 'line': target, 'column': 1})
        assert status == 200 and forward['page'] >= 1, forward
        status, regions = request('/synctex', {**sync, 'direction': 'range', 'first': target, 'last': target})
        assert status == 200 and regions['regions'], regions
        x1, y1, x2, y2 = forward['rect']
        status, inverse = request('/synctex', {**sync, 'direction': 'backward', 'page': forward['page'], 'x': (x1+x2)/2, 'y': (y1+y2)/2})
        assert status == 200 and inverse['path'] == str(note) and abs(inverse['line'] - target) <= 1, inverse
        _, historical = history_pdf_snapshot(server, note, current['source'].replace('令 $n$', '令 $m$'))
        historical['boxes'] = analysis(historical['pdf'])['boxes']
        assert historical['pdf'].is_file() and history_pdf_line_index(historical), 'Markdown PDF history uses the generated source index.'
        live_pdf = server.pdf
        for needle, replacement in (('令 $n$', '令 $m$'), ('第二句需要修改', '第二句已经修改')):
            changed = current['source'].replace(needle, replacement)
            comparison = history_pdf_changes(server, note, current['source'], changed)
            if comparison.get('needs_analysis'):
                compared = {}
                for side in ('before', 'after'):
                    key = comparison[side].split('?')[0].rsplit('/', 1)[-1]
                    compared[side] = {'revision': comparison['revisions'][side], **analysis(server.history_pdfs[key]['pdf'])}
                comparison = history_pdf_changes(server, note, current['source'], changed, analysis=compared)
            assert len(comparison['changes']) == 1 and all(comparison['changes'][0][side] for side in ('before', 'after')), comparison
            marks = {(region['page'], tuple(rect)) for region in comparison['changes'][0]['after'] for rect in region['highlights']}
            marked = ''.join(text for page, rect, text in compared['after']['words'] if (page, tuple(rect)) in marks)
            assert '测试笔记' not in marked and '不变标题' not in marked, marked
            if needle.startswith('第二句'):
                assert marked == '第二句已经修改。', 'Neighboring CJK sentences on the same PDF row must remain unmarked: ' + marked
        assert server.pdf == live_pdf, 'Markdown historical comparison preserves the live PDF.'
        assert note.read_bytes() == original
        image.write_bytes(image.read_bytes() + b'changed')
        assert request('/state')[1]['sync'] is False, 'Changed original attachments invalidate PDF selection mapping.'
        assert request('/synctex', {**sync, 'direction': 'forward', 'line': target})[0] == 409
        broken = current['source'] + '\n$$\\notARealCommand$$\n'
        status, result = request('/compile', {'source': broken, 'version': result['version'], 'preview': 'pdf'})
        assert status == 200 and not result['ok'] and result['diagnostic']['path'] == str(note), result
        assert result['diagnostic']['line'] == len(broken.splitlines())
        assert request('/pdf')[1].startswith(b'%PDF-'), 'Failed Markdown builds retain the previous PDF.'
    finally:
        server.shutdown(); server.server_close(); server.build.cleanup()
        for cached in server.history_pdfs.values(): cached['directory'].cleanup()

print('PASS: Obsidian conversion, Chinese/TikZ PDF, line mapping, original bytes, attachments, outline, SyncTeX, PDF history and diagnostics')
