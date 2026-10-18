"""Run: python test_proofread_pdf.py (local TeX; no history from preview builds)."""
import hashlib
import json
import re
from pathlib import Path
import sqlite3
import shutil
import subprocess
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from unittest.mock import patch

from editor import make_server, validate_annotation_change
from proofread import color_preamble, document_start, emphasize_changes, proofread_source
from project_review import review_hunks


def item(source, text, replacement, identifier=1):
    start = source.index(text)
    return {'id':identifier,'start':start,'end':start+len(text),'selection':text,'replacement':replacement}


unicode_source='中文 😀 first.\nSecond.'
marked, ranges=proofread_source(unicode_source,[item(unicode_source,'Second.','',2),item(unicode_source,'first.','better.')])
def changed_words(other, text):
    return re.findall(r'\\LatexCodexProofreadLiteral\{/LCBeforeChanged1 BMC\}(.*?)\\LatexCodexProofreadLiteral\{EMC\}', emphasize_changes(other,text))
plain_marked = re.sub(r'\\LatexCodexProofreadLiteral\{[^}]*\}', '', marked)
assert all(text in plain_marked for text in ('中文 😀 ', 'first.', 'better.', 'Second.'))
assert [row['id'] for row in ranges]==[1,2]
assert document_start('% \\begin{document}\n\\begin{document}').start()==19
assert changed_words('A good and good method.', 'A robust and good approach.') == ['robust','approach']
assert changed_words('same text', 'same text') == []
assert changed_words('', 'two words') == ['two','words']
assert changed_words('旧字', '新字') == ['新','字']
assert emphasize_changes(r'\cite{old} \unknown{old}', r'\cite{new} \unknown{new}') == r'\cite{new} \unknown{new}'
assert changed_words(r'$x+y$', r'$x-y$') == ['-']
assert changed_words(r'$\frac12$', r'$\frac34$') == ['3','4']
deleted, _ = proofread_source('new', [{'id':1,'start':0,'end':3,'selection':'new',
                                      'display_original':'old','replacement':'new'}])
assert '/LCBeforeChanged1 BMC}old' in deleted and '/LCAfterChanged1 BMC}new' in deleted
insertion = {'id':'a'*32,'before':'Before.\n','reply':'Added text.','items':[
    {'id':1,'start':8,'end':8,'selection':'','request':'Add a paragraph.','replacement':'New paragraph.'}]}
assert validate_annotation_change(insertion,'Before.\nNew paragraph.')['items'][0]['last_line']==2
assert proofread_source('Before.\n',[{'id':1,'start':8,'end':8,'selection':'','replacement':'New paragraph.'}])[1][0]['id']==1
for invalid in ([{'start':'bad'}], [item(unicode_source,'first.','x'),item(unicode_source,'first.','y',2)],
                [{**item(unicode_source,'first.','x'),'selection':'stale'}]):
    try: proofread_source(unicode_source,invalid)
    except ValueError: pass
    else: raise AssertionError('Invalid ranges must be rejected.')

with tempfile.TemporaryDirectory(prefix='latex-proofread-test-') as directory:
    root=Path(directory); path=root/'main.tex'; child=root/'parts'/'details.tex'; child.parent.mkdir()
    source='% !TeX program = pdflatex\n\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nThe method give stable result.\n\nThis estimates are accurate.\n\\input{parts/details}\n\\end{document}\n'
    path.write_bytes(source.replace('\n','\r\n').encode())
    child_source='A child paragraph.\n\\begin{equation}x+y=1\\end{equation}\n'
    child.write_bytes(child_source.encode())
    server=make_server(path,main_thread='',preferences_path=root/'preferences.sqlite3')
    worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    base=f'http://127.0.0.1:{server.server_port}'
    direct=build_opener(ProxyHandler({}))
    def request(route,data=None):
        req=Request(base+route,None if data is None else json.dumps(data).encode(),{'Content-Type':'application/json'})
        try:
            with direct.open(req,timeout=55) as response:return response.status,response.read()
        except HTTPError as error:return error.code,error.read()
    def state():return json.loads(request('/state')[1])
    def history_rows():
        with sqlite3.connect(root/'.latex-codex/history.sqlite3') as db:
            return (db.execute('SELECT id,digest,kind FROM revisions').fetchall(),db.execute('SELECT * FROM revision_annotations').fetchall())
    try:
        current=state()
        code,body=request('/compile',{'source':source,'version':current['version']})
        assert code==200 and json.loads(body)['ok'],body
        current=state(); originals={file:file.read_bytes() for file in (path,child)}
        formal_pdf=server.pdf; formal_version=server.pdf_revision; formal_sync=server.sync_version
        rows=history_rows(); payload={'path':str(path),'version':current['version'],'source':source,
            'items':[item(source,'The method give stable result.','The method gives stable results.'),item(source,'This estimates are accurate.','These estimates are accurate.',2)]}
        code,body=request('/proofread',payload); assert code==200,body
        data=json.loads(body); assert data['proofread'] and not data['sync']
        assert {region['id'] for region in data['regions']}=={1,2},data['regions']
        code,pdf=request(data['pdf_url']+'?v='+data['pdf_revision']);assert code==200 and pdf.startswith(b'%PDF')
        assert hashlib.sha256(pdf).hexdigest()==data['pdf_revision']
        if shutil.which('node'):
            checked=subprocess.run(['node',str(Path(__file__).with_name('pdf_analysis_test.mjs'))],
                input=json.dumps({'url':base+data['pdf_url']+'?v='+data['pdf_revision'],'colors':True,'proofread':[1,2]}),
                text=True,encoding='utf-8',capture_output=True)
            assert checked.returncode==0,checked.stderr
            analysis=json.loads(checked.stdout)
            assert ['#c71f29'] not in analysis['fillColors'] and ['#057a33'] not in analysis['fillColors'],analysis['fillColors']
            words=' '.join(word[2] for word in analysis['words'])
            assert 'give stable result' in words and 'gives stable results' in words
            old_word = next(word for word in analysis['words'] if word[2]=='give')
            new_word = next(word for word in analysis['words'] if word[2]=='gives')
            assert old_word[0] != new_word[0] or abs(old_word[1][1]-new_word[1][1]) > 10, 'Old/new text must occupy separate preview paragraphs.'
            strong = [mark for mark in analysis['proofread'] if mark['strong']]
            def covered(word):
                page, (l,b,r,t), _ = word
                return any(mark['page']==page and mark['rect'][0] <= (l+r)/2 <= mark['rect'][2]
                           and mark['rect'][1] <= (b+t)/2 <= mark['rect'][3] for mark in strong)
            assert covered(old_word) and covered(new_word), 'Real changed words need deeper backgrounds.'
            assert not any(covered(word) for word in analysis['words'] if word[2] in ('method','stable')), 'Unchanged words keep only the pale background.'
            assert {mark['side'] for mark in analysis['proofread'] if not mark['strong']} == {'before','after'}
        assert server.pdf==formal_pdf and server.pdf_revision==formal_version and server.sync_version==formal_sync
        assert history_rows()==rows and not server.history_pdfs and not (root/'.latex-codex/pdf-diff-cache').exists()
        assert all(file.read_bytes()==text for file,text in originals.items())
        assert request('/proofread',{**payload,'version':'stale'})[0]==409
        assert request('/proofread',{**payload,'path':str(child)})[0]==409
        assert request('/proofread',{**payload,'items':[item(source,'article','book')]})[0]==400
        assert request('/proofread',{**payload,'source':None})[0]==400
        with patch('editor.compile_source_snapshot',side_effect=ValueError('Test compilation failure')):
            assert request('/proofread',payload)[0]==400
        assert history_rows()==rows and server.pdf==formal_pdf
        # An external review displays the baseline in red while selecting the
        # already-written new text. The disposable compile still records no history.
        project_item={**item(source,'The method give stable result.','The method give stable result.'),
            'display_original':'The previous sentence.'}
        code,body=request('/proofread',{**payload,'items':[project_item]});assert code==200,body
        assert history_rows()==rows and server.pdf==formal_pdf
        # Preview a child with explicit relative includes using a temporary main-file overlay.
        child_state=json.loads(request('/source',{'path':str(child),'version':current['version']})[1])
        rows=history_rows()
        code,body=request('/proofread',{'path':str(child),'version':child_state['version'],'source':child_source,
            'items':[item(child_source,'A child paragraph.','A revised child paragraph.'),item(child_source,'\\begin{equation}x+y=1\\end{equation}','\\begin{equation}x-y=2\\end{equation}',2)]})
        assert code==200,body
        assert {region['id'] for region in json.loads(body)['regions']}=={1,2}
        assert history_rows()==rows and all(file.read_bytes()==text for file,text in originals.items())
        assert server.pdf==formal_pdf and not server.history_pdfs
        # A selection inside math or a table cell cannot accept paragraph breaks.
        for draft,old,new in [(r'Before $x+y$ after.', 'x+y', 'x-y'),
                              (r'\begin{equation}L^2(x_i+y)=1\end{equation}', 'L^2(x_i+y)=1', 'L^2(x_j-y)=2'),
                              (r'Before $\frac12+x^2$ after.', r'\frac12+x^2', r'\frac34+x^3'),
                              (r'\begin{tabular}{l}Old cell\end{tabular}', 'Old cell', 'New cell')]:
            code,body=request('/proofread',{'path':str(child),'version':child_state['version'],'source':draft,
                'items':[item(draft,old,new)]})
            assert code==200,body
        # Compile exact-change emphasis in unbraced arguments, scripts, symbols,
        # delimiters and formatted text without splitting TeX command structure.
        old = r'$\frac{x_i}{y}+\frac12=x^a+\alpha+\left(x\right)$ \textbf{old words}'
        new = r'$\frac{x_j}{z}-\frac34=x^bc+\beta+\left[y\right]$ \textbf{new words}'
        draft = child_source + old
        code,body=request('/proofread',{'path':str(child),'version':child_state['version'],'source':draft,
            'items':[item(draft,old,new)]})
        assert code==200,body
        assert history_rows()==rows and all(file.read_bytes()==text for file,text in originals.items())
        paragraph_before = r'\par '.join(f'Paragraph {index}: original text.' for index in range(9))
        paragraph_after = paragraph_before.replace('original', 'revised')
        draft = child_source + paragraph_before
        pieces = review_hunks(paragraph_before, paragraph_after)
        split_items = [{'id':part['id'], 'start':len(child_source)+part['old_start'],
                        'end':len(child_source)+part['old_end'], 'selection':part['before'],
                        'replacement':part['after']} for part in pieces]
        code,body=request('/proofread',{'path':str(child),'version':child_state['version'],'source':draft,'items':split_items})
        assert code==200,body
        assert {region['id'] for region in json.loads(body)['regions']}=={1,2,3}, 'Each split chunk needs its own PDF actions.'
        assert history_rows()==rows and all(file.read_bytes()==text for file,text in originals.items())
        assert server.pdf==formal_pdf and not server.history_pdfs
        print('PASS: pale/deep PDF backgrounds, separate paragraphs, per-range geometry, CRLF/source and formal PDF preservation, no history/cache writes, child/math overlays and failures')
    finally:
        server.shutdown();worker.join();server.server_close();server.build.cleanup()
        for cached in server.history_pdfs.values():cached['directory'].cleanup()

if shutil.which('xelatex') and shutil.which('node'):
    with tempfile.TemporaryDirectory(prefix='latex-proofread-xetex-') as directory:
        root = Path(directory)
        old = r'First old initial phrase.\newpage Last old. \(\frac{x_i}{y}+\alpha=1\)'
        new = r'First new revised text.\newpage Last new. \(\frac{x_j}{z}-\beta=2\)'
        source = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n'+old+'\n\\end{document}'
        marked, _ = proofread_source(source,[item(source,old,new)])
        (root/'preview.tex').write_text(color_preamble(marked),encoding='utf-8')
        result = subprocess.run(['xelatex','-no-shell-escape','-halt-on-error','-interaction=nonstopmode','preview.tex'],
                                cwd=root,capture_output=True,timeout=45)
        assert result.returncode == 0,result.stdout.decode(errors='replace')[-2500:]
        checked = subprocess.run(['node',str(Path(__file__).with_name('pdf_analysis_test.mjs').resolve())],
            input=json.dumps({'path':str(root/'preview.pdf'),'proofread':[1]}),
            text=True,encoding='utf-8',capture_output=True,check=True)
        analysis = json.loads(checked.stdout)
        assert len(analysis['boxes']) >= 3
        assert {mark['page'] for mark in analysis['proofread']} == set(range(1,len(analysis['boxes'])+1))
        assert {mark['side'] for mark in analysis['proofread'] if mark['strong']} == {'before','after'}
        for phrase in (('old','initial','phrase.'),('new','revised','text.')):
            words = [next(word for word in analysis['words'] if word[2]==text) for text in phrase]
            assert any(mark['strong'] and all(word[0]==mark['page']
                and mark['rect'][0] <= (word[1][0]+word[1][2])/2 <= mark['rect'][2]
                and mark['rect'][1] <= (word[1][1]+word[1][3])/2 <= mark['rect'][3] for word in words)
                for mark in analysis['proofread']), 'Consecutive changed words need one continuous deep background in the actual PDF.'
        print('PASS: XeLaTeX marked-content backgrounds survive page breaks and math without extra dependencies')
