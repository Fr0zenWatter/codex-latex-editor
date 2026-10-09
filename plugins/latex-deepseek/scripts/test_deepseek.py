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
from deepseek import dsh_answer, dsh_command
from editor import make_server
from install_deepseek_bridge import install


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
    finally:
        server.shutdown(); server.server_close(); server.build.cleanup(); worker.join()
print('PASS: complete DeepSeek output, stdin isolation, cleanup, profile preservation, exact main-chat targeting and idempotent forwarding')
