"""Run: python -X utf8 test_completion.py (stdlib; no model or TeX calls)."""
import json
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile
import threading
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from chat import ChatJob, completion_context
from editor import make_server

data = {'before': 'Let $X$ be ', 'after': '.', 'effort': 'low'}
context = completion_context(data, Path('main.tex'))
assert context == {'task':'inline-completion', 'file':'main.tex', 'model':'', **data}
for bad in ({'before': ''}, {'before': 'a'*3001}, {'after': 'a'*501}, {'after': None},
            {'effort': []}, {'effort':'unknown'}, {'model': []}):
    try:
        completion_context({**data, **bad}, Path('main.tex'))
        raise AssertionError('Invalid context accepted')
    except ValueError:
        pass
with patch('chat.chat_models', return_value=[{'id':'gpt-6-luna','efforts':['low']}]) as catalog:
    light_context = completion_context({**data,'model':'gpt-6-luna'}, Path('main.tex'))
    assert light_context['model'] == 'gpt-6-luna'
    for model, effort in [('unknown','low'),('gpt-6-luna','high')]:
        try:
            completion_context({**data,'model':model,'effort':effort}, Path('main.tex'))
            raise AssertionError('Unavailable model or effort accepted')
        except ValueError:
            pass
    completion_context({**data,'model':'gpt-6-luna'}, Path('main.tex'), backend='deepseek')
    catalog.assert_called_with('deepseek')
process = Mock(returncode=0)
process.poll.return_value = 0
process.wait.return_value = 0
class InputBuffer(io.BytesIO):
    def close(self):
        self.closed_by_job = True
instructions = []
jobs = []
def fake_process(argv, **_kwargs):
    options = argv[argv.index('--ignore-user-config')+1:]
    instruction_path = next(item.split('=',1)[1] for item in options if item.startswith('model_instructions_file='))
    instructions.append(Path(json.loads(instruction_path)).read_text(encoding='utf-8'))
    return process
with patch('chat.codex_executable', return_value='codex'), patch('chat.subprocess.Popen', side_effect=fake_process) as spawn:
    def run(result, extra=None, terminal=True):
        events = [{'type':'item.completed', 'item':{'type':'agent_message', 'text':json.dumps(result)}}]
        if terminal:
            events.append({'type':'turn.completed'})
        process.stdin = InputBuffer()
        process.stdout = io.BytesIO(('\n'.join(json.dumps(event) for event in [*(extra or []), *events])+'\n').encode())
        process.stderr = io.BytesIO()
        job = ChatJob(context)
        jobs.append(job)
        job.run()
        assert job.context is None
        return job
    job = run({'completion':'an abelian category'})
    assert job.result == {'status':'done', 'completion':'an abelian category'}
    argv = spawn.call_args.args[0]
    assert '--ephemeral' in argv and '--output-schema' in argv
    assert '--ignore-user-config' in argv
    assert argv[argv.index('--sandbox')+1] == 'read-only'
    assert 'model_reasoning_effort="low"' in argv and '--model' not in argv
    assert 'Let $X$' not in ' '.join(argv)
    prompt = process.stdin.getvalue().decode()
    assert 'single short line' in instructions[-1] and 'single short line' not in prompt
    assert 'main_conversation' not in prompt and 'messages' not in prompt
    assert json.loads(prompt) == context and process.stdin.closed_by_job
    assert 'skills.max_context_tokens=1' in argv and 'web_search="disabled"' in argv
    assert process.communicate.call_count == 0, 'Completion must stream rather than wait for process teardown.'
    with patch.dict(context, {'model':'gpt-6-luna'}):
        assert run({'completion':'an object'}).result['status'] == 'done'
        argv = spawn.call_args.args[0]
        assert argv[argv.index('--model')+1] == 'gpt-6-luna' and '--ignore-user-config' in argv
    assert run({'completion':None}).result['status'] == 'done'
    for result in ({}, {'completion':123}, {'completion':'x'*241}, {'completion':'first\nsecond'}, {'completion':'x\0'}):
        assert run(result).result['status'] == 'error'
    assert run({'completion':'x'}, [{'type':'item.completed','item':{'type':'mcp_tool_call'}}]).result['status'] == 'error'
    assert run({'completion':'x'}, terminal=False).result['status'] == 'error', 'A final-looking fragment is not a completed turn.'
    assert run({'completion':'x'}, [{'type':'turn.failed','error':{'message':'Failure'}}]).result['status'] == 'error'
    with patch('chat.threading.Timer') as timer:
        timer.side_effect = lambda delay, callback: Mock(start=callback)
        timed = run({'completion':'too late'})
        assert timed.result['status'] == 'error' and '超时' in timed.result['error']
        assert timer.call_args.args[0] == 20
    entered, release = threading.Event(), threading.Event()
    def cleanup(**_kwargs):
        entered.set()
        assert release.wait(3)
        return 0
    with patch.object(process, 'wait', side_effect=cleanup), ThreadPoolExecutor(1) as pool:
        running = pool.submit(run, {'completion':'already complete'})
        try:
            assert entered.wait(2)
            job = jobs[-1]
            assert job.result == {'status':'done','completion':'already complete'}
            assert not running.done(), 'The result must be available before CLI cleanup finishes.'
            job.cancel()
            assert job.result['status'] == 'cancelled'
        finally:
            release.set()
        assert running.result(timeout=3).result['status'] == 'cancelled'
        assert job.result['status'] == 'cancelled', 'Cleanup must not revive a cancelled result.'
print('PASS: short dedicated instructions, low/default model, ephemeral read-only CLI, streaming terminal validation, timeout, cancellation and result before cleanup')

with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'main.tex'; source.write_text('Unchanged source.', encoding='utf-8')
    with patch('editor.compiler', return_value=('xelatex','unused')):
        server = make_server(source, main_thread='', preferences_path=Path(directory)/'preferences.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    opener = build_opener(ProxyHandler({}))
    def request(route, body=None, origin=None):
        headers = {'Content-Type':'application/json'}
        if origin: headers['Origin'] = origin
        req = Request(f'http://127.0.0.1:{server.server_port}' + route,
                      None if body is None else json.dumps(body).encode(), headers)
        try:
            with opener.open(req, timeout=3) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())
    created = []
    def fake_job(*args, **kwargs):
        job = Mock(result={'status':'running'}); job.start.return_value = job
        created.append(job)
        return job
    payload = {**data,'path':str(source.resolve()),'id':'1'*32}
    try:
        with patch('editor.ChatJob', side_effect=fake_job) as spawn:
            assert request('/completion', payload) == (200, {'id':'1'*32})
            assert request('/completion', payload)[0] == 200 and spawn.call_count == 1
            assert request('/completion', {**payload,'before':'Changed.'})[0] == 409
            assert request('/completion?id='+'1'*32)[1]['status'] == 'running'
            assert request('/completion', {**payload,'id':'2'*32})[0] == 200
            assert created[0].cancel.call_count == 1 and server.chat is None
            assert request('/completion', {'action':'cancel','id':'1'*32})[0] == 200
            assert created[1].cancel.call_count == 0, 'Old cancellation must not stop a new request.'
            created[1].result = {'status':'done','completion':'an object'}
            assert request('/completion?id='+'2'*32)[1]['completion'] == 'an object'
            for bad, expected in (({'id':'bad'},400), ({'path':'other.tex'},409), ({'effort':'x'},400),
                                  ({'before':'a'*3001},400), ({'action':'unknown'},400)):
                assert request('/completion', {**payload, **bad})[0] == expected
            assert request('/completion', payload, 'https://example.com')[0] == 403
            assert request('/completion', {'action':'cancel','id':'2'*32})[0] == 200
            assert created[1].cancel.call_count == 1
            assert request('/completion?id='+'2'*32)[0] == 404
            with patch('chat.chat_models', return_value=[{'id':'gpt-6-luna','efforts':['low']}]):
                assert request('/completion', {**payload,'id':'4'*32,'model':'gpt-6-luna'})[0] == 200
                assert spawn.call_args.args[0]['model'] == 'gpt-6-luna'
                assert request('/completion', {**payload,'model':'unknown'})[0] == 400
                assert request('/completion', {**payload,'model':'gpt-6-luna','effort':'high'})[0] == 400
            # A slow compilation holds the document lock; completion uses its own lock.
            entered, release = threading.Event(), threading.Event()
            def slow_compile(*_args, **_kwargs):
                entered.set()
                assert release.wait(3)
                raise ValueError('Intentional compile error.')
            revision = request('/state')[1]['version']
            with patch('editor.compiler', return_value=('xelatex','unused')), \
                    patch('editor.compile_tex', side_effect=slow_compile), ThreadPoolExecutor(1) as pool:
                compiling = pool.submit(request, '/compile', {'source':'Unchanged source.','version':revision})
                try:
                    assert entered.wait(2)
                    assert request('/completion', {**payload,'id':'3'*32})[0] == 200
                finally:
                    release.set()
                assert compiling.result(timeout=3)[0] == 400
        assert source.read_text(encoding='utf-8') == 'Unchanged source.'
    finally:
        server.shutdown(); server.server_close(); server.build.cleanup()
print('PASS: independent completion jobs, same-origin and context validation, idempotence, targeted cancellation and unchanged source')
