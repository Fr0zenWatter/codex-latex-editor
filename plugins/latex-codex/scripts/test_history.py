"""Run: python test_history.py (stdlib only; no TeX needed)."""
import json
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
    context = activity.summary_context([current])
    activity.save_summaries(context,[{'id':current,'summary':'将稳定性估计中的平方项改为立方项。'}])
    assert History(Path(directory)/'main.tex').list()['revisions'][0]['summary'].startswith('将稳定性')
    assert activity.summary_context([current]) == [], 'Saved summaries must not create another model request.'
    for invalid in ([],[{'id':current,'summary':'x'}]*2,[{'id':True,'summary':'x'}]):
        try: activity.save_summaries(context,invalid)
        except ValueError: pass
        else: raise AssertionError('Invalid AI summaries accepted')
    final = activity.record(changed.replace('stable','coercive'),'save')
    assert activity.list()['revisions'][0]['baseline']==first
    activity.label(current,'Checkpoint')
    assert activity.list()['revisions'][0]['baseline']==current, 'Named checkpoints change the activity comparison boundary.'


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
            job = Mock(id='summary-job',result={'status':'running'}); job.start.return_value=job
            constructor.return_value=job
            code, started = request('/history/summaries',{'path':str(path),'ids':[second]})
            assert code==200 and started['id']=='summary-job'
            assert constructor.call_args.args[0]['task']=='history-summary'
            assert constructor.call_args.args[0]['items'][0]['id']==second
            assert request('/history/summaries?id=summary-job')[1]['status']=='running'
            assert request('/history/summaries?id=wrong')[0]==404
            assert request('/history/summaries/cancel',{'path':str(path),'id':'summary-job'})[0]==200
            job.cancel.assert_called_once()
            server.history_summary=None
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
        assert request('/history/diff', {**data, 'id':other_id, 'source':''})[0] == 400
        assert request('/history/restore', {**data, 'path':str(other), 'version':state()['version'], 'source':draft})[0] == 409
        assert request('/history/diff', {**data, 'id':True, 'source':''})[0] == 400
        assert request('/history/label', {**data, 'label':'x' * 121})[0] == 400
        assert request('/history/restore', {**data, 'source':draft})[0] == 400
        assert request('/history/diff', {**data, 'source':''}, origin='https://example.com')[0] == 403
        assert request('/history?path=' + quote(str(path)) + '&before=bad')[0] == 400
        assert request('/history?path=' + quote(str(other)))[0] == 409

        before = state()
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
    print('PASS: five-minute grouping, protected checkpoints, immutable backups, grouped pagination, history persistence, deduplication, diff, labels, failed compile, draft-safe restore, conflicts, file isolation, pagination and failed writes')
