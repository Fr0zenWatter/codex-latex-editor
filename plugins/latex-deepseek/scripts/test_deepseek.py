"""Run: python test_deepseek.py (no model call or real chat message)."""
import json
from pathlib import Path
import sys
import tempfile
import threading
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'runtime'))

from chat import ChatJob, chat_context
from deepseek import dsh_answer, dsh_command, dsh_patch
from editor import make_server
from install_deepseek_bridge import install
from references import cite_tex, compact_quote_links, resolve_quote


answer = {'reply': 'Reviewed.', 'replacement': 'x' * 12000}
events = [{'type': 'text', 'text': 'truncated'}, {'type': 'final', 'text': json.dumps(answer)}]
stdout = '\n'.join(json.dumps(event) for event in events).encode()
assert dsh_answer(stdout, 0) == answer, 'Only final carries the complete, unbounded answer.'
for text in (json.dumps(answer), '```json\n' + json.dumps(answer) + '\n```'):
    assert dsh_answer(json.dumps({'type': 'final', 'text': text}).encode(), 0) == answer
for events, status in [([{'type': 'text', 'text': json.dumps(answer)}], 0),
                       ([[], {'type': 'final', 'text': json.dumps(answer)}], 0),
                       ([{'type': 'error'}, {'type': 'final', 'text': json.dumps(answer)}], 0),
                       ([{'type': 'tool_call'}, {'type': 'final', 'text': json.dumps(answer)}], 0),
                       ([{'type': 'final', 'text': json.dumps(answer)}], 1),
                       ([{'type': 'final', 'text': 'Explanation ' + json.dumps(answer)}], 0)]:
    try:
        dsh_answer('\n'.join(json.dumps(event) for event in events).encode(), status)
    except ValueError:
        pass
    else:
        raise AssertionError('Failed, tool-using, truncated or invalid output accepted.')

call = {'type': 'tool_call', 'callId': 'quote-1', 'tool': 'mcp__tex_quotes__cite_tex',
        'input': {'quote': 'Chosen.'}}
result = {'type': 'tool_result', 'callId': 'quote-1', 'status': 'completed', 'result': '{"matches": []}'}
final = {'type': 'final', 'text': json.dumps(answer)}
def encoded(events):
    return '\n'.join(json.dumps(event) for event in events).encode()
assert dsh_answer(encoded([call, result, final]), 0, references=True) == answer
for events in ([call, result, final], [call, final], [result, final], [call, result, result, final],
               [call, call, result, final], [{**call, 'tool': 'exec_command'}, result, final],
               [{**call, 'tool': 'mcp__other__cite_tex'}, result, final],
               [{**call, 'callId': []}, result, final], [call, {**result, 'status': 'error'}, final],
               [call, {**result, 'truncated': True}, final],
               [{**call, 'truncated': True}, result, final]):
    for enabled in (False, True):
        if events == [call, result, final] and enabled:
            continue
        try:
            dsh_answer(encoded(events), 0, references=enabled)
        except ValueError:
            pass
        else:
            raise AssertionError('Disabled, foreign, incomplete or malformed tool execution accepted.')

with tempfile.TemporaryDirectory() as directory:
    quote_context = {'root': directory, 'path': 'demo.tex', 'source': 'Chosen.'}
    (Path(directory) / 'demo.tex').write_text(quote_context['source'], encoding='utf-8')
    quoted = cite_tex(quote_context, call['input'])
    short = cite_tex(quote_context, call['input'], compact=True)
    short_answer = {'reply': short['matches'][0]['markdown'], 'replacement': None}
    short_final = {'type': 'final', 'text': json.dumps(short_answer)}
    tool_result = {**result, 'result': json.dumps(short)}
    restored = dsh_answer(encoded([call, tool_result, short_final]), 0, references=quote_context)
    assert restored['reply'] == quoted['matches'][0]['markdown']
    token = restored['reply'].split('ref=')[1][:-1]
    assert resolve_quote(directory, token, quote_context)['quote'] == 'Chosen.'
    past_links = {}
    compact_quote_links(quoted['matches'][0]['markdown'], past_links)
    assert dsh_answer(encoded([short_final]), 0, references=quote_context, quote_links=past_links) == restored
    with_replacement = {**short_answer, 'replacement': short_answer['reply']}
    untouched = dsh_answer(encoded([call, tool_result, {**short_final, 'text': json.dumps(with_replacement)}]),
                           0, references=quote_context)
    assert untouched['reply'] == restored['reply'] and untouched['replacement'] == with_replacement['replacement']
    for reply in ('[fake](/source-quote?ref=q00000000000000000000)', quoted['matches'][0]['markdown']):
        try:
            dsh_answer(encoded([{**short_final, 'text': json.dumps({**short_answer, 'reply': reply})}]),
                       0, references=quote_context)
        except ValueError:
            pass
        else:
            raise AssertionError('Unverified citation escaped into the final response.')
    for options in ({}, {'catalog': True, 'references': quote_context}):
        entries = json.loads(Path(dsh_patch(directory, **options)).read_text(encoding='utf-8'))
        assert not any(item.get('id') == 'latex-tex-quotes' for entry in entries for item in entry.get('insert', []))
    tex_context = chat_context({'source': 'Chosen.', 'selection': '',
                               'messages': [{'role': 'user', 'content': 'Explain.'}]},
                              Path('demo.tex'), backend='deepseek')
    tex_context['messages'].insert(0, {'role': 'assistant', 'content': quoted['matches'][0]['markdown']})
    tex_context['document'] += '\n' + quoted['matches'][0]['markdown']
    tex_context['messages'][-1]['content'] += quoted['matches'][0]['markdown']
    def communicate(prompt, timeout):
        assert b'mcp__tex_quotes__cite_tex' in prompt and b'proactively call cite_tex' in prompt
        payload = json.loads(prompt.decode().splitlines()[-1])
        assert payload['messages'][0]['content'] == short['matches'][0]['markdown']
        assert payload['messages'][-1] == tex_context['messages'][-1], 'Keep the current user request intact.'
        assert payload['document'] == tex_context['document'], 'Never compact source URLs or replacements.'
        args = spawn.call_args.args[0]
        patch_path = Path(args[args.index('--patch') + 1])
        entries = json.loads(patch_path.read_text(encoding='utf-8'))
        server = next(item['config'] for entry in entries for item in entry.get('insert', [])
                      if item['id'] == 'latex-tex-quotes')
        assert server['serverName'] == 'tex_quotes'
        assert server['command'] == sys.executable and server['failOnStartupError'] is True
        assert json.loads(Path(server['args'][-1]).read_text(encoding='utf-8')) == {**quote_context, 'compact_links': True}
        return encoded([call, tool_result, short_final]), b''
    with patch('deepseek.dsh_command', return_value=(['dsh'], {})), patch('chat.subprocess.Popen') as spawn:
        spawn.return_value = Mock(returncode=0)
        spawn.return_value.communicate.side_effect = communicate
        job = ChatJob(tex_context, backend='deepseek', references=quote_context)
        job.run()
        assert job.result['status'] == 'done', job.result
        assert job.result['reply'] == quoted['matches'][0]['markdown']
        assert not Path(spawn.call_args.kwargs['cwd']).exists()

data = {'source': 'Before. Chosen. After.', 'selection': 'Chosen.',
        'messages': [{'role': 'user', 'content': 'Polish.'}]}
with patch('chat.main_chat_context', return_value={'available': False, 'messages': [], 'truncated': False}) as main:
    context = chat_context(data, Path('demo.md'), 'codex-parent', backend='deepseek')
    main.assert_called_once_with(None)
process = Mock(returncode=0)
process.communicate.return_value = (stdout, b'private provider reasoning')
with patch('deepseek.dsh_command', return_value=(['dsh'], {'DSH_PERMISSION_MODE': 'read-only'})), \
     patch('chat.subprocess.Popen', return_value=process) as spawn:
    job = ChatJob(context, backend='deepseek')
    job.run()
    assert job.result['status'] == 'done' and job.result['replacement'] == answer['replacement']
    args = spawn.call_args.args[0]
    assert 'headless' in args and '--json' in args and args[-1] == '-'
    assert 'Chosen.' not in ' '.join(args), 'Source must stay on stdin.'
    assert b'Chosen.' in process.communicate.call_args.args[0]
    assert 'private provider reasoning' not in str(job.result)
    assert not Path(spawn.call_args.kwargs['cwd']).exists(), 'Transient sessions and patches must be cleaned.'

with tempfile.TemporaryDirectory() as directory:
    cli = Path(directory) / 'dsh'; cli.touch()
    with patch.dict('os.environ', {'DSH_CLI_PATH': str(cli), 'DSH_PERMISSION_MODE': 'danger-full-access'}):
        _, environment = dsh_command()
        assert environment['DSH_PERMISSION_MODE'] == 'read-only'
        assert environment['DSH_TOOLS_MODE'] == 'native'

with tempfile.TemporaryDirectory() as directory:
    profile = Path(directory) / 'cordis.patch.yml'
    original = '# Keep my configuration\n- id: unrelated\n  disabled: true\n'
    profile.write_text(original, encoding='utf-8')
    assert install(profile)
    assert profile.read_text(encoding='utf-8').startswith(original)
    assert not install(profile), 'Repeated installation must not duplicate the bridge.'
    profile.write_text('[]\n', encoding='utf-8')
    assert install(profile) and len(json.loads(profile.read_text(encoding='utf-8'))) == 1

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'demo.md'
    path.write_text('Chosen.', encoding='utf-8')
    with patch.dict('os.environ', {'DSH_SESSION_ID': 'session-launcher'}):
        server = make_server(path, preferences_path=Path(directory) / 'prefs.sqlite3', ai_backend='deepseek')
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    def request(route, data=None, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin: headers['Origin'] = origin
        req = Request(base + route, None if data is None else json.dumps(data).encode(), headers)
        try:
            with build_opener(ProxyHandler({})).open(req, timeout=5) as response:
                body = response.read()
                return response.status, json.loads(body) if route != '/' else body.decode()
        except HTTPError as error:
            return error.code, json.loads(error.read())
    try:
        assert 'data-ai-backend="deepseek"' in request('/')[1]
        state = request('/state')[1]
        payload = {'path': str(path), 'source': state['source'], 'version': state['version'],
                   'request_id': '1' * 32, 'selection': 'Chosen.',
                   'annotations': [{'id': 1, 'start': 0, 'end': 7, 'selection': 'Chosen.', 'request': 'Polish.'}],
                   'session_id': 'session-wrong'}
        with patch('deepseek.main_chat_request', return_value={'accepted': True}) as send:
            assert request('/main-chat', {**payload, 'source': 'Unsaved.'})[0] == 409
            assert request('/main-chat', payload, 'https://unrelated.example')[0] == 403
            assert send.call_count == 0
            assert request('/main-chat', payload)[0] == 200
            assert send.call_args.args[0]['session_id'] == 'session-launcher', 'Browser cannot change the destination.'
            assert path.read_text(encoding='utf-8') == 'Chosen.', 'Forwarding must not apply local edits.'
            path.write_text('External change.', encoding='utf-8')
            assert request('/main-chat', payload)[0] == 200 and send.call_count == 1, 'Lost acknowledgement retries must not send twice.'
            assert request('/main-chat', {**payload, 'selection': 'Changed.'})[0] == 409
        with patch('editor.ChatJob.start', autospec=True, side_effect=lambda job: setattr(job, 'result', {'status': 'done'}) or job) as started:
            chat_data = {'source': 'External change.', 'selection': '', 'messages': data['messages'], 'references': True}
            assert request('/chat', chat_data)[0] == 200
            assert started.call_args.args[0].references is None, 'Markdown remains tool-free.'
            tex = Path(directory) / 'citation.tex'
            tex.write_text('Chosen.', encoding='utf-8')
            assert request('/open', {'path': str(tex)})[0] == 200
            for enabled in (False, True):
                assert request('/chat', {**chat_data, 'source': 'Chosen.', 'references': enabled})[0] == 200
                quote_context = started.call_args.args[0].references
                assert bool(quote_context) == enabled
                if enabled:
                    assert quote_context == {'root': directory, 'path': 'citation.tex', 'source': 'Chosen.'}
    finally:
        server.shutdown(); server.server_close(); server.build.cleanup(); worker.join()
print('PASS: complete DeepSeek output, stdin isolation, cleanup, profile preservation, exact main-chat targeting and idempotent forwarding')
