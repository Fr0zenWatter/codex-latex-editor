"""Run: python test_proofread_pdf.py (local TeX; no history from preview builds)."""
import hashlib
import json
from pathlib import Path
import sqlite3
import shutil
import subprocess
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from unittest.mock import patch

from editor import make_server
from proofread import document_start, proofread_source


def item(source, text, replacement, identifier=1):
    start = source.index(text)
    return {'id':identifier,'start':start,'end':start+len(text),'selection':text,'replacement':replacement}


unicode_source='中文 😀 first.\nSecond.'
marked, ranges=proofread_source(unicode_source,[item(unicode_source,'Second.','',2),item(unicode_source,'first.','better.')])
assert '中文 😀 ' in marked and 'first.' in marked and 'better.' in marked and 'Second.' in marked
assert [row['id'] for row in ranges]==[1,2]
assert document_start('% \\begin{document}\n\\begin{document}').start()==19
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
                input=json.dumps({'url':base+data['pdf_url']+'?v='+data['pdf_revision'],'colors':True}),
                text=True,encoding='utf-8',capture_output=True)
            assert checked.returncode==0,checked.stderr
            analysis=json.loads(checked.stdout)
            assert ['#c71f29'] in analysis['fillColors'] and ['#057a33'] in analysis['fillColors'],analysis['fillColors']
            words=' '.join(word[2] for word in analysis['words'])
            assert 'give stable result' in words and 'gives stable results' in words
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
        print('PASS: red/green PDF previews, per-range geometry, CRLF/source and formal PDF preservation, no history/cache writes, child/math overlays and failures')
    finally:
        server.shutdown();worker.join();server.server_close();server.build.cleanup()
        for cached in server.history_pdfs.values():cached['directory'].cleanup()
