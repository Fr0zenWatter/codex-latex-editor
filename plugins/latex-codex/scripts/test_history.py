"""Run: python test_history.py (stdlib only; no TeX needed)."""
import json
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import tempfile
import threading
from unittest.mock import patch, Mock
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import ProxyHandler, Request, build_opener

from editor import make_server, save_source, snapshot
from history import History, difference, word_changes, describe_revision

paper = '\\begin{document}\n\\section{Introduction}\nHello.\n\\section{Method}\n\\subsection{Stability}\n$x^2$ is stable.\n\\end{document}'
changed = paper.replace('x^2','x^3')
assert describe_revision(paper,changed)['sections'] == ['2.1 Stability']
assert describe_revision(paper,paper.replace('Hello.','Hello again.'))['sections'] == ['1 Introduction']
assert describe_revision(paper,paper+'\n')['description']=='调整空白或换行'
assert describe_revision(paper,paper)['description']=='内容与上一版相同'
with tempfile.TemporaryDirectory() as directory:
    activity = History(Path(directory)/'main.tex')
    first = activity.record(paper,'open')
    current = activity.record(changed,'save')
    row = activity.list()['revisions'][0]
    assert row['sections'] == ['2.1 Stability'] and row['baseline'] == first and not row['summary']
    context = activity.summary_context([current], 'zh-CN')
    # Simulate an existing database from before summaries were language-specific.
    with closing(activity.connect()) as db, db:
        db.execute('UPDATE revision_activity SET summary=? WHERE revision_id=?', ('将稳定性估计中的平方项改为立方项。',current))
    activity = History(Path(directory)/'main.tex')
    assert activity.list(language='zh-CN')['revisions'][0]['summary'].startswith('将稳定性')
    assert activity.list(language='en')['revisions'][0]['summary'] == ''
    assert activity.summary_context([current], 'zh-CN') == [], 'Legacy Chinese summaries must remain cached.'
    for language, summary in [('en','Changed the square to a cube.'), ('zh-TW','將平方改為立方。'), ('ja','二乗を三乗に変更。'),
                              ('fr','Remplacement du carré par un cube.'), ('de','Quadrat durch Kubus ersetzt.'),
                              ('es','Se cambió el cuadrado por un cubo.')]:
        items = activity.summary_context([current], language)
        assert items == context, 'A different language needs its own summary.'
        activity.save_summaries(items,[{'id':current,'summary':summary}],language)
        reopened = History(Path(directory)/'main.tex')
        assert reopened.list(language=language)['revisions'][0]['summary'] == summary
        assert reopened.summary_context([current],language) == [], 'Cached languages must not invoke the model again.'
    assert len(activity.list()['revisions'][0]['summaries']) == 7
    assert activity.list(language='invalid')['revisions'][0]['summary'] == 'Changed the square to a cube.'
    for invalid in ([],[{'id':current,'summary':'x'}]*2,[{'id':True,'summary':'x'}]):
        try: activity.save_summaries(context,invalid)
        except ValueError: pass
        else: raise AssertionError('Invalid AI summaries accepted')
    final = activity.record(changed.replace('stable','coercive'),'save')
    assert activity.list()['revisions'][0]['baseline']==first
    activity.label(current,'Checkpoint')
    assert activity.list()['revisions'][0]['baseline']==current, 'Named checkpoints change the activity comparison boundary.'
    assert not activity.list()['revisions'][0]['summaries'], 'A new comparison boundary must not reuse another diff summary.'


for old, new in [('the smoothing iteration is convergent', 'the smoothing factor decays'),
                 ('', '新增词语\n'), ('delete\nthis\n', ''), ('same\n', 'same\n'),
                 ('a\r\nb\r\n', 'a\nb changed\n'), ('a\nb', 'ab'), ('a', 'a\n'),
                 (r'\alpha_{old} + x^2', r'\beta_{new} + x^3'), ('<script>alert(1)</script>', '<strong>text</strong>')]:
    changes = word_changes(old, new)
    assert ''.join(run['text'] for run in changes if run['kind'] != 'insert') == old
    assert ''.join(run['text'] for run in changes if run['kind'] != 'delete') == new
assert word_changes('the smooth factor', 'the stable factor') == [
    {'kind':'equal', 'text':'the '}, {'kind':'delete', 'text':'smooth'},
    {'kind':'insert', 'text':'stable'}, {'kind':'equal', 'text':' factor'}]


with tempfile.TemporaryDirectory() as directory:
    grouped = History(Path(directory) / 'grouped.tex')
    start = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    ids = []
    for minutes, kind in [(0,'open'), (1,'save'), (2,'save'), (4,'external'), (5,'save'), (6,'save'), (7,'before-restore'), (8,'restore'), (9,'save')]:
        with patch('history.datetime') as clock:
            clock.now.return_value = start + timedelta(minutes=minutes)
            ids.append(grouped.record(str(minutes), kind))
    shown = [row['id'] for row in grouped.list()['revisions']]
    assert shown == [ids[8],ids[7],ids[6],ids[5],ids[3],ids[0]], shown
    assert grouped.previous(ids[8])['id'] == ids[7], 'Restoration markers stay separate.'
    assert grouped.previous(ids[3])['id'] == ids[0], 'Compare whole editing groups, not hidden keystrokes.'
    assert grouped.get(ids[1])['source'] == '1', 'Grouping must retain original backups and immutable IDs.'
    assert [row['id'] for row in grouped.list(ids[3])['revisions']] == [ids[0]], 'Pagination must not resurface hidden rows.'
    grouped.label(ids[2], 'named')
    assert ids[2] in [row['id'] for row in grouped.list()['revisions']]
    assert grouped.previous(ids[3])['id'] == ids[2], 'Named versions stay visible and become comparison boundaries.'
    assert [row['id'] for row in History(Path(directory) / 'grouped.tex').list()['revisions']] == [row['id'] for row in grouped.list()['revisions']]


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / '论文.tex'
    original = 'First line\n原始版本\n'
    path.write_bytes(original.encode('utf-8'))
    with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.shutil.which', return_value='unused'):
        server = make_server(path, main_thread='')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    direct = build_opener(ProxyHandler({}))
    base = f'http://127.0.0.1:{server.server_port}'

    def request(route, data=None, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        req = Request(base + route, None if data is None else json.dumps(data).encode(), headers)
        try:
            with direct.open(req, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def state():
        code, data = request('/state')
        assert code == 200, data
        return data

    def listing():
        code, data = request('/history?path=' + quote(str(path)))
        assert code == 200, data
        return data['revisions']

    history = History(path)
    try:
        first = listing()[0]['id']
        assert history.get(first)['source'] == original
        state(); state()
        assert len(listing()) == 1, 'Polling must not duplicate revisions.'
        edited = original.replace('原始', '编辑后')
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(False, 'compile error', 'xelatex')):
            code, data = request('/compile', {'version':state()['version'], 'source':edited})
        assert code == 200 and not data['ok'], data
        assert path.read_text(encoding='utf-8') == edited
        second = listing()[0]['id']
        with patch('editor.ChatJob') as constructor:
            job = Mock(id='summary-job',result={'status':'running'},context={'language':'fr'}); job.start.return_value=job
            constructor.return_value=job
            code, started = request('/history/summaries',{'path':str(path),'ids':[second],'language':'fr'})
            assert code==200 and started['id']=='summary-job'
            assert constructor.call_args.args[0]['task']=='history-summary'
            assert constructor.call_args.args[0]['items'][0]['id']==second
            assert constructor.call_args.args[0]['language']=='fr'
            assert request('/history/summaries',{'path':str(path),'ids':[second],'language':'fr'})[1]['id']=='summary-job'
            assert constructor.call_count == 1, 'Reuse only a job in the same language.'
            replacement = Mock(id='english-job',result={'status':'running'},context={'language':'en'})
            replacement.start.return_value = replacement
            constructor.return_value = replacement
            assert request('/history/summaries',{'path':str(path),'ids':[second],'language':'en'})[1]['id']=='english-job'
            job.cancel.assert_called_once()
            assert constructor.call_args.args[0]['language']=='en'
            server.history_summary=job
            assert request('/history/summaries?id=summary-job')[1]['status']=='running'
            assert request('/history/summaries?id=wrong')[0]==404
            assert request('/history/summaries/cancel',{'path':str(path),'id':'summary-job'})[0]==200
            assert job.cancel.call_count == 2
            server.history_summary=None
        items = history.summary_context([second],'fr')
        history.save_summaries(items,[{'id':second,'summary':'Texte révisé.'}],'fr')
        with patch('editor.ChatJob') as constructor:
            code, cached = request('/history/summaries',{'path':str(path),'ids':[second],'language':'fr'})
            assert code==200 and cached=={'status':'done','language':'fr','summaries':[{'id':second,'summary':'Texte révisé.'}]}
            constructor.assert_not_called()
        assert request('/history?path='+quote(str(path))+'&language=fr')[1]['revisions'][0]['summary']=='Texte révisé.'
        assert request('/history?path='+quote(str(path))+'&language=en')[1]['revisions'][0]['summary']==''
        assert history.get(second)['source'] == edited
        assert history.previous(first) is None and history.previous(second)['id'] == first
        code, previous = request('/history/diff', {'path':str(path), 'id':second, 'compare':'previous'})
        assert code == 200 and not previous['first']
        assert ''.join(run['text'] for run in previous['changes'] if run['kind'] != 'delete') == edited
        assert ''.join(run['text'] for run in previous['changes'] if run['kind'] != 'insert') == original
        assert len(listing()) == 2, 'Even failed compilations retain saved source.'
        data = {'path':str(path), 'id':first}
        assert request('/history/label', {**data, 'label':'投稿前'})[0] == 200
        assert History(path).get(first)['label'] == '投稿前'
        code, compared = request('/history/diff', {**data, 'target_id':second})
        assert code == 200 and '-原始版本\n' in compared['diff'] and '+编辑后版本\n' in compared['diff']
        assert request('/history/diff', {**data, 'source':original})[1]['same']
        assert difference('a', 'a\n') and difference('', '新增\n')

        draft = '未保存的草稿\n'
        code, restored = request('/history/restore', {**data, 'version':state()['version'], 'source':draft})
        assert code == 200 and restored['source'] == original, restored
        assert path.read_text(encoding='utf-8') == original
        rows = listing()
        assert rows[0]['kind'] == 'restore'
        assert any(history.get(row['id'])['source'] == draft and row['kind'] == 'before-restore' for row in rows)
        assert history.get(second)['source'] == edited, 'Restoring must retain newer versions.'
        # The first actual edit after restoring is a new save, not an external edit.
        with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.compile_tex', return_value=(False, '', 'xelatex')):
            assert request('/compile', {'version':state()['version'], 'source':original})[0] == 200
        assert len(listing()) == len(rows)

        stale = state()
        path.write_bytes('来自外部 Codex 的修改\n'.encode('utf-8'))
        assert request('/history/restore', {**data, 'version':stale['version'], 'source':draft})[0] == 409
        assert path.read_text(encoding='utf-8') == '来自外部 Codex 的修改\n'
        assert listing()[0]['kind'] == 'external'
        other = path.with_name('other.tex')
        other.write_text('other file', encoding='utf-8')
        other_id = History(other).record('other file', 'open')
        assert request('/history/diff', {**data, 'id':other_id, 'source':''})[1]['same'], 'A child history compares with that child, not the active editor.'
        assert request('/history/diff', {**data, 'id':other_id, 'target_id':first})[0] == 400
        assert request('/history/restore', {**data, 'path':str(other), 'version':state()['version'], 'source':draft})[0] == 409
        assert request('/history/diff', {**data, 'id':True, 'source':''})[0] == 400
        assert request('/history/label', {**data, 'label':'x' * 121})[0] == 400
        assert request('/history/restore', {**data, 'source':draft})[0] == 400
        assert request('/history/diff', {**data, 'source':''}, origin='https://example.com')[0] == 403
        assert request('/history?path=' + quote(str(path)) + '&before=bad')[0] == 400
        assert request('/history?path=' + quote(str(other)))[0] == 409

        before = snapshot(path)
        with patch.object(history, 'record', side_effect=sqlite3.OperationalError('disk full')):
            try:
                save_source(path, 'must not save', before['version'], history)
                raise AssertionError('A failed backup must abort the save.')
            except sqlite3.OperationalError:
                pass
        assert snapshot(path) == before
        with patch('editor.os.replace', side_effect=OSError('write failed')):
            try:
                save_source(path, 'must not save', before['version'], history)
                raise AssertionError('A failed replace must be reported.')
            except OSError:
                pass
        assert snapshot(path) == before and not list(path.parent.glob('*.tmp'))
        for i in range(105):
            with patch('history.datetime') as clock:
                clock.now.return_value = start + timedelta(minutes=5*i)
                history.record(f'version {i}')
        page = history.list()
        older = history.list(page['next'])
        assert len(page['revisions']) == 100 and older['revisions'] and not older['next']
        assert not {row['id'] for row in page['revisions']} & {row['id'] for row in older['revisions']}
        with patch('editor.choose_file', return_value=str(other)):
            assert request('/open', {})[0] == 200
        assert request('/history/restore', {**data, 'source':draft, 'version':before['version']})[0] == 409
        assert other.read_text() == 'other file'
    finally:
        server.shutdown(); worker.join(); server.server_close(); server.build.cleanup()
    # Actual server restart, with persisted history and labels.
    with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.shutil.which', return_value='unused'):
        restarted = make_server(path, main_thread='')
    restarted.server_close(); restarted.build.cleanup()
    assert History(path).get(first)['label'] == '投稿前'
    assert History(path).get(second)['source'] == edited
    print('PASS: five-minute grouping, protected checkpoints, immutable backups, grouped pagination, history persistence, deduplication, diff, labels, failed compile, draft-safe restore, conflicts, file guards, pagination and failed writes')


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    main, child = root / 'main.tex', root / 'parts' / 'input.tex'
    child.parent.mkdir()
    main.write_text('Main initial.', encoding='utf-8')
    child.write_text('Child initial.', encoding='utf-8')
    with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.shutil.which', return_value='unused'):
        server = make_server(main, main_thread='')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        initial = request('/history?path=' + quote(str(main)))[1]
        ids = {row['file']: row['id'] for row in initial['revisions']}
        assert set(ids) == {'main.tex', 'parts/input.tex'}, 'Include sources not yet opened in the editor.'
        main.write_text('Main changed.', encoding='utf-8')
        child.write_text('Child changed.', encoding='utf-8')
        current = state()
        listing = request('/history?path=' + quote(str(main)))[1]['revisions']
        assert len(listing) == 4 and {row['file'] for row in listing} == set(ids)
        history = History(main)
        assert History(child, root).list() == history.list(), 'Every source sees the same project timeline.'
        latest = {file: next(row for row in listing if row['file'] == file) for file in ids}
        history.label(latest['parts/input.tex']['id'], 'Child edit checkpoint')
        for file, row in latest.items():
            assert row['baseline'] == ids[file] and history.previous(row['id'])['file'] == file
        assert {item['file'] for item in history.summary_context([row['id'] for row in latest.values()])} == set(ids)
        assert request('/history/label', {'path':str(main),'id':ids['parts/input.tex'],'label':'Child checkpoint'})[0] == 200
        payload = {'path':str(main), 'id':ids['parts/input.tex'], 'compare':'current', 'source':'Active main draft.'}
        code, compared = request('/history/diff', payload)
        assert code == 200 and compared['file'] == 'parts/input.tex'
        assert ''.join(run['text'] for run in compared['changes'] if run['kind'] != 'delete') == 'Child changed.'
        assert request('/history/diff', {**payload,'target_id':ids['main.tex']})[0] == 400
        with patch('editor.history_pdf_changes', return_value={'changes':[]}) as render:
            assert request('/history/pdf', {**payload,'compare':'previous'})[0] == 200
            assert render.call_args.args[1:4] == (child, 'Child initial.', 'Child initial.')
        restore = {**payload, 'source':'Main unsaved draft.', 'version':current['version'], 'target_version':compared['current_version']}
        child.write_text('Concurrent child edit.', encoding='utf-8')
        assert request('/history/restore', restore)[0] == 409
        assert main.read_text() == 'Main changed.' and child.read_text() == 'Concurrent child edit.'
        restore['target_version'] = snapshot(child)['version']
        main.write_text('Concurrent main edit.', encoding='utf-8')
        assert request('/history/restore', restore)[0] == 409
        assert child.read_text() == 'Concurrent child edit.'
        restore['version'] = snapshot(main)['version']
        code, restored = request('/history/restore', restore)
        assert code == 200 and restored['path'] == str(child) and restored['source'] == 'Child initial.', restored
        assert main.read_text() == 'Main unsaved draft.', 'Save the active draft before switching to the restored child.'
        assert child.read_text() == 'Child initial.'
        assert any(history.get(row['id'])['source'] == 'Concurrent child edit.' for row in history.list()['revisions']), 'Keep the child backup.'
        assert request('/history?path=' + quote(str(child)))[1]['file'] == 'parts/input.tex'
        retired = root / 'retired.tex'; retired.write_text('Retired content.', encoding='utf-8')
        state()
        retired_id = next(row['id'] for row in history.list()['revisions'] if row['file'] == 'retired.tex')
        retired.unlink()
        code, retired_diff = request('/history/diff', {'path':str(child),'id':retired_id,'compare':'previous'})
        assert code == 200 and retired_diff['source'] == 'Retired content.' and retired_diff['current_version'] is None, 'Deleted files retain browsable source history.'
        other_root = root / 'separate-project'; other_root.mkdir()
        assert History(other_root / 'main.tex').list()['revisions'] == [], 'Other projects remain isolated.'
        # More than a page of another file must not erase this file's older comparison baseline.
        for i in range(105):
            with patch('history.datetime') as clock:
                clock.now.return_value = start + timedelta(minutes=5*i)
                history.record(str(i), 'save')
        top = history.list()
        older = history.list(top['next'])
        assert not {row['id'] for row in top['revisions']} & {row['id'] for row in older['revisions']}
        assert top['revisions'][-1]['baseline'] == history.previous(top['revisions'][-1]['id'])['id'], 'The page boundary keeps its full comparison baseline.'
        child_row = next(row for row in older['revisions'] if row['id'] == latest['parts/input.tex']['id'])
        assert child_row['baseline'] == ids['parts/input.tex'], 'Pagination uses the preceding revision of the same file.'
    finally:
        server.shutdown(); worker.join(); server.server_close(); server.build.cleanup()
    print('PASS: unified project timeline, inactive source capture, per-file baselines, project isolation, cross-file PDF routing and conflict-safe child restoration')


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    main, child = root / 'main.tex', root / 'input.tex'
    main.write_text('Main source.', encoding='utf-8')
    child.write_bytes('😀 original\r\nOther line.\r\n'.encode('utf-8'))
    with patch('editor.compiler', return_value=('xelatex', 'unused')), patch('editor.shutil.which', return_value='unused'):
        server = make_server(main, main_thread='')
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        active = state()
        assert request('/source', {'path':str(child),'version':active['version']})[0] == 200
        version = snapshot(child)['version']
        before = '😀 original\nOther unsaved edit.\n'
        change = {'id':'a'*32, 'before':before, 'reply':'Clarified the passage.', 'items':[
            {'id':1,'start':2,'end':10,'selection':'original','request':'Make precise.','replacement':'revised'}]}
        after = before.replace('original','revised')
        payload = {'path':str(child),'source':after,'version':version,'annotation_change':change}
        assert request('/save', {**payload,'path':str(main)})[0] == 409
        code, saved = request('/save', payload)
        assert code == 200, saved
        assert child.read_bytes() == after.replace('\n','\r\n').encode('utf-8'), 'Preserve the source newline style.'
        history = History(main)
        row = history.list()['revisions'][0]
        assert row['file']=='input.tex' and row['annotation_count']==1 and row['kind']=='annotation'
        note_id = row['id']
        baseline = history.previous(note_id)
        assert baseline['source']==before.replace('\n','\r\n') and baseline['id']==row['baseline'], 'Use the exact editor draft before applying AI, including unrelated edits, with consistent disk newlines.'
        detail = request('/history/diff', {'path':str(child),'id':note_id,'compare':'previous'})[1]
        assert detail['annotations'][0]['request']=='Make precise.' and detail['annotation_reply']==change['reply']
        assert detail['annotations'][0]['first_line']==1 and detail['annotations'][0]['last_line']==1
        assert ''.join(run['text'] for run in detail['changes'] if run['kind']!='insert') == baseline['source']
        assert ''.join(run['text'] for run in detail['changes'] if run['kind']!='delete') == saved['source']
        assert [run for run in detail['changes'] if run['kind']!='equal'] == [{'kind':'delete','text':'original'},{'kind':'insert','text':'revised'}], 'CRLF normalization must not falsely mark every line as changed.'
        assert all(item['kind']!='before-annotation' for item in history.list()['revisions'])
        with closing(history.connect()) as db:
            count = db.execute('SELECT COUNT(*) FROM revisions').fetchone()[0]
        assert request('/save', payload)[0] == 200, 'Retry after a lost response succeeds despite the original version.'
        with closing(history.connect()) as db:
            assert db.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == count
        altered = {**change,'reply':'Different reply.'}
        assert request('/save', {**payload,'annotation_change':altered})[0] == 400
        # A second batch in the same save window stays distinct, even without source changes.
        current_before = after
        second = {**change,'id':'b'*32,'before':current_before,'reply':'No further edit needed.', 'items':[
            {'id':2,'start':2,'end':9,'selection':'revised','request':'Check this.','replacement':None}]}
        assert request('/save', {**payload,'source':current_before,'version':saved['version'],'annotation_change':second})[0] == 200
        rows = history.list()['revisions']
        assert len([item for item in rows if item['annotation_count']]) == 2
        second_id = rows[0]['id']
        assert History(child,root).get(second_id)['annotations'][0]['replacement'] is None
        assert History(child,root).get(note_id)['annotation_reply']==change['reply'], 'Metadata survives reopening.'
        child.write_text('External newer edit.',encoding='utf-8')
        assert request('/save', payload)[0] == 409
        assert child.read_text()=='External newer edit.', 'Never replay a saved annotation over newer disk content.'
        # Validation failures cannot write a file, record a revision, or lose comments.
        invalid_base = {'id':'c'*32,'before':'😀 original','reply':'x','items':change['items']}
        for invalid in ({**invalid_base,'id':'bad'}, {**invalid_base,'items':[]},
                        {**invalid_base,'items':[dict(change['items'][0],start=True)]},
                        {**invalid_base,'items':[dict(change['items'][0],selection='wrong')]},
                        {**invalid_base,'items':change['items']*2},
                        {**invalid_base,'items':[dict(change['items'][0],replacement=12)]}):
            assert request('/save', {**payload,'version':snapshot(child)['version'],'source':'😀 revised','annotation_change':invalid})[0] == 400
            assert child.read_text()=='External newer edit.'
        fresh = {**invalid_base,'id':'d'*32}
        # Failing the mandatory exact-before backup must prevent the file write.
        real_record = History.record
        def fail_backup(self, source, kind='external', force=False):
            if kind=='before-annotation': raise sqlite3.OperationalError('backup unavailable')
            return real_record(self,source,kind,force)
        with patch.object(History,'record',fail_backup):
            assert request('/save', {**payload,'version':snapshot(child)['version'],'source':'😀 revised','annotation_change':fresh})[0] == 500
        assert child.read_text()=='External newer edit.'
    finally:
        server.shutdown();worker.join();server.server_close();server.build.cleanup()
    print('PASS: persisted annotation requests/selections/replies, exact draft baselines, independent batches, Unicode, CRLF, idempotent retries, file guards and failure-safe saves')
