"""Run: python -B test_chat_branches.py (stdlib; no model requests)."""
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import tempfile
from unittest.mock import Mock, patch

from chat import ChatJob, chat_context
from history import History


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'paper.tex'
    path.write_text('Original source.', encoding='utf-8')
    with ThreadPoolExecutor(4) as pool:
        states = list(pool.map(lambda _: History(path).chat_read(),range(4)))
    assert all(state == states[0] for state in states), 'Concurrent startup must migrate the database only once.'
    memory = History(path)
    answer = {'reply': 'Explain **energy norm**.', 'replacement': None}
    main = memory.chat_read()
    revision = memory.chat_append(0, 'Discuss the theorem.', answer, str(path), '')
    branch = memory.chat_branch(main['thread'], revision, 'energy norm')
    assert branch['quote'] == 'energy norm' and branch['revision'] == 0
    assert branch['root'] == main['thread'] and branch['messages'] == []
    assert next(node for node in branch['threads'] if node['id'] == branch['thread'])['has_messages'] is False
    assert memory.chat_read()['revision'] == revision, 'Creating a branch cannot change its parent history.'
    seed = memory.chat_seed(branch['thread'])
    assert seed['messages'][-1]['content'] == json.dumps(answer, ensure_ascii=False)
    sibling = memory.chat_branch(main['thread'], revision, 'theorem')
    newer = memory.chat_append(revision, 'Later parent discussion.', answer, str(path), '')
    assert memory.chat_seed(branch['thread']) == seed, 'The fork context must stay frozen.'
    branch_revision = memory.chat_append(0, 'Explain this term.', answer, str(path), '', branch['thread'])
    assert next(node for node in memory.chat_read()['threads'] if node['id'] == branch['thread'])['has_messages'] is True
    assert memory.chat_read()['revision'] == newer
    assert memory.chat_read(sibling['thread'])['messages'] == []
    nested = memory.chat_branch(branch['thread'], branch_revision, 'norm')
    assert next(node for node in nested['threads'] if node['id'] == nested['thread'])['parent'] == branch['thread']
    assert len(memory.chat_seed(nested['thread'])['messages']) == 5
    assert any(item['content'].endswith('energy norm') for item in memory.chat_seed(nested['thread'])['messages'])
    for parent, message_id, quote in [(None,revision,'x'),('missing',revision,'x'),
                                      (branch['thread'],revision,'x'),(main['thread'],revision,''),
                                      (main['thread'],revision,'x'*12001),(main['thread'],True,'x')]:
        try: memory.chat_branch(parent,message_id,quote)
        except ValueError: pass
        else: raise AssertionError('Accepted an invalid or cross-thread fork.')
    try: memory.chat_append(0,'Stale',answer,str(path),'',branch['thread'])
    except ValueError: pass
    else: raise AssertionError('Accepted a stale branch write.')
    current = memory.chat_new()
    assert current['messages'] == [] and current['thread'] != main['thread']
    assert memory.chat_read(main['thread'])['revision'] == newer
    assert memory.chat_read(branch['thread'])['revision'] == branch_revision
    before_rename = memory.chat_read(branch['thread'])
    assert memory.chat_rename(branch['thread'], '  Renamed discussion  ') == {'thread':branch['thread'], 'title':'Renamed discussion'}
    after_rename = History(path).chat_read(branch['thread'])
    assert next(node for node in after_rename['threads'] if node['id'] == branch['thread'])['title'] == 'Renamed discussion'
    assert after_rename['messages'] == before_rename['messages'] and after_rename['revision'] == branch_revision
    assert after_rename['quote'] == before_rename['quote'] and memory.chat_seed(branch['thread']) == seed
    for thread, title in [(None,'Name'),('missing','Name'),(branch['thread'],None),(branch['thread'],''),
                          (branch['thread'],' '*4),(branch['thread'],'x'*121),(branch['thread'],'Two\nlines')]:
        try: memory.chat_rename(thread,title)
        except ValueError: pass
        else: raise AssertionError('Accepted an invalid conversation rename.')
    assert History(path).chat_read(nested['thread']) == memory.chat_read(nested['thread']), 'Branches survive a fresh History instance.'
    # The real job saves the answer in its captured branch even if a new main chat was opened.
    context = chat_context({'source':'Original source.','selection':'','messages':[{'role':'user','content':'Continue the branch.'}]},path)
    context.update(memory_thread=branch['thread'],branch_context=seed)
    process = Mock(returncode=0)
    process.communicate.return_value = (json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps(answer)}}).encode(),b'')
    with patch('chat.codex_executable',return_value='codex.exe'),patch('chat.subprocess.Popen',return_value=process):
        job = ChatJob(context,memory,branch_revision); job.run()
    assert job.result['status'] == 'done'
    assert memory.chat_read()['messages'] == []
    assert memory.chat_read(branch['thread'])['messages'][-2]['content'] == 'Continue the branch.'
    assert path.read_text(encoding='utf-8') == 'Original source.'
    exported = memory.chat_export(job.result['memory_revision'])
    assert 'Explain **energy norm**.' in (path.parent / exported['file']).read_text(encoding='utf-8')
    parent_before = memory.chat_read(main['thread'])
    sibling_before = memory.chat_read(sibling['thread'])
    for thread, descendants in [(None,[]),(main['thread'],[main['thread']]),('missing',['missing']),
                                 (branch['thread'],[branch['thread']]),(branch['thread'],[branch['thread'],nested['thread'],sibling['thread']]),
                                 (branch['thread'],[branch['thread'],branch['thread']]),(branch['thread'],[True])]:
        try: memory.chat_delete(thread,descendants)
        except ValueError: pass
        else: raise AssertionError('Accepted an invalid, root or stale subtree deletion.')
    removed = memory.chat_delete(branch['thread'],[branch['thread'],nested['thread']])
    assert set(removed['deleted']) == {branch['thread'],nested['thread']}
    assert not any(node['id'] in removed['deleted'] for node in removed['threads'])
    assert memory.chat_read(main['thread'])['messages'] == parent_before['messages']
    assert memory.chat_read(sibling['thread'])['messages'] == sibling_before['messages']
    reopened = History(path)
    for thread in removed['deleted']:
        for action in [lambda:reopened.chat_read(thread),lambda:reopened.chat_seed(thread),
                       lambda:reopened.chat_append(0,'Do not resurrect',answer,str(path),'',thread),
                       lambda:reopened.chat_rename(thread,'Do not resurrect')]:
            try: action()
            except ValueError: pass
            else: raise AssertionError('A deleted branch remains accessible.')
    try: reopened.chat_export(job.result['memory_revision'])
    except ValueError: pass
    else: raise AssertionError('An old reply link exported a deleted conversation.')
    latest = reopened.chat_append(0,'Unrelated sibling question',answer,str(path),'',sibling['thread'])
    assert latest > job.result['memory_revision'], 'Deleting recent replies cannot reuse their message IDs.'
    assert path.read_text(encoding='utf-8') == 'Original source.'

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'old.tex'
    folder = path.parent / '.latex-codex'; folder.mkdir()
    with closing(sqlite3.connect(folder / 'history.sqlite3')) as db, db:
        db.execute("CREATE TABLE chat_messages(id INTEGER PRIMARY KEY,role TEXT NOT NULL,content TEXT NOT NULL,file TEXT NOT NULL DEFAULT '',selection TEXT NOT NULL DEFAULT '')")
        db.executemany('INSERT INTO chat_messages(role,content) VALUES (?,?)',
                       [('user','Old question'),('assistant','Old answer'),('boundary',''),('user','Current question'),('assistant','Current answer')])
    memory = History(path)
    assert memory.chat_read()['thread'] == 'main:3'
    assert [item['content'] for item in memory.chat_read()['messages']] == ['Current question','Current answer']
    assert [item['content'] for item in memory.chat_read('main:0')['messages']] == ['Old question','Old answer']
    assert History(path).chat_read() == memory.chat_read(), 'Migration must be repeatable.'

print('PASS: nested persistent forks, frozen ancestors, sibling/main isolation, scoped stale writes, legacy migration and captured job routing')
