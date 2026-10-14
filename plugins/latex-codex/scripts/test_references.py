"""Run: python test_references.py (local pdfLaTeX/SyncTeX, no model requests)."""
import base64
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from chat import ChatJob, chat_context, codex_executable
from editor import PAGE, make_server
from references import cite_tex, decode_quote, mcp_config, resolve_quote


def token(match):
    return re.search(r'ref=([A-Za-z0-9_-]+)', match['markdown'])[1]


def rejects(call, pattern):
    try:
        call()
    except ValueError as error:
        assert re.search(pattern, str(error)), error
    else:
        raise AssertionError('Invalid reference accepted')


class QuoteLayout(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parents, self.ancestors, self.attributes = [], {}, {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('id') in ('source-quotes-open', 'source-quotes'):
            self.ancestors[values['id']] = [identity for _, identity in self.parents]
            self.attributes[values['id']] = values
        if tag not in ('meta', 'link', 'input', 'br', 'img', 'hr'):
            self.parents.append((tag, values.get('id')))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        for index in range(len(self.parents) - 1, -1, -1):
            if self.parents[index][0] == tag:
                del self.parents[index:]
                break


layout = QuoteLayout()
layout.feed(PAGE)
assert 'chat-bar' in layout.ancestors['source-quotes-open']
assert layout.attributes['source-quotes-open']['type'] == 'button', 'Quote controls must not submit the annotation form.'
assert layout.attributes['source-quotes-open']['aria-pressed'] == 'false', 'Quote tools start disabled.'
assert layout.attributes['source-quotes-open']['aria-controls'] == 'source-quotes'
assert 'popovertarget' not in layout.attributes['source-quotes-open'], 'Only the tool switch controls the quote popover.'
assert 'chat-panel' in layout.ancestors['source-quotes'] and 'app-toolbar' not in layout.ancestors['source-quotes-open']
assert 'chat-quick' not in layout.ancestors['source-quotes-open'], 'The quote entry belongs to the conversation history window.'


with tempfile.TemporaryDirectory(prefix='latex quotes ') as directory:
    root = Path(directory).resolve()
    main = root / 'main.tex'
    child = root / 'chapters' / 'child.tex'
    child.parent.mkdir()
    main.write_text('\n'.join(['% !TeX program = pdflatex', '% 😀', r'\documentclass{article}',
                               r'\begin{document}', 'First sentence.\nRepeated sentence.',
                               'Repeated sentence.', r'\input{chapters/child}', r'\end{document}']), encoding='utf-8')
    child.write_bytes('\ufeff\\newpage\r\nA child sentence across\r\ntwo lines.\r\n'.encode('utf-8'))
    context = {'root': str(root), 'path': 'main.tex', 'source': main.read_text(encoding='utf-8')}
    original = {main: main.read_bytes(), child: child.read_bytes()}
    first = cite_tex(context, {'quote': 'First sentence.'})['matches'][0]
    assert first['markdown'].startswith('[First sentence.]('), 'Inline quotations should be the hyperlink text.'
    named = cite_tex(context, {'quote': 'First sentence.', 'text': 'Lemma 2.3'})['matches'][0]
    assert named['markdown'].startswith('[Lemma 2.3](') and token(named) == token(first), 'Changing the label must not change its verified target.'
    math_link = cite_tex(context, {'quote': 'First sentence.', 'text': r'$M_{[1]}$ is simple.'})['matches'][0]
    assert math_link['markdown'].startswith(r'[$M_{[1]}$ is simple.](')
    plain_link = cite_tex(context, {'quote': 'First sentence.', 'text': '<img src=x> [test] *name*'})['matches'][0]
    assert plain_link['markdown'].startswith(r'[&lt;img src=x&gt; \[test\] \*name\*](')
    selected = resolve_quote(root, token(first), context)
    assert selected['line'] == 5 and selected['quote'] == 'First sentence.'
    assert selected['start'] == context['source'].index('First sentence.') + 1, 'Browser offsets count emoji as two UTF-16 units.'
    repeated = cite_tex(context, {'quote': 'Repeated sentence.'})['matches']
    assert [item['line'] for item in repeated] == [6, 7]
    assert len(cite_tex(context, {'quote': 'Repeated sentence.', 'path': 'main.tex', 'line': 7})['matches']) == 1
    quoted_child = cite_tex(context, {'quote': 'A child sentence across two lines.'})['matches'][0]
    assert quoted_child['path'] == 'chapters/child.tex' and quoted_child['line'] == 2
    assert resolve_quote(root, token(quoted_child))['quote'] == 'A child sentence across\ntwo lines.'
    draft = {**context, 'source': context['source'].replace('First sentence.', 'Unsaved draft sentence.')}
    assert not cite_tex(draft, {'quote': 'First sentence.'})['matches']
    draft_quote = cite_tex(draft, {'quote': 'Unsaved draft sentence.'})['matches'][0]
    assert resolve_quote(root, token(draft_quote), draft)['quote'] == 'Unsaved draft sentence.'
    rejects(lambda: resolve_quote(root, token(first), draft), '源码已变化')
    rejects(lambda: resolve_quote(root.parent, token(first)), '其他项目')
    rejects(lambda: resolve_quote(root, token(draft_quote)), '源码已变化')
    for args in (None, {'quote': ''}, {'quote': 'word', 'line': True}, {'quote': 'word', 'path': '../outside.tex'},
                 {'quote': 'word', 'path': str(main)}, {'quote': 'word', 'path': 'note.md'}, {'quote': 'word', 'extra': 1},
                 {'quote': 'word', 'text': ''}, {'quote': 'word', 'text': True}, {'quote': 'word', 'text': 'x' * 4001}):
        rejects(lambda: cite_tex(context, args), '.')
    for value in ('broken!', '', 'a' * 4097, 'e30'):
        rejects(lambda: decode_quote(value), '无效')
    data = decode_quote(token(first))
    data['line'] += 1
    bad = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
    rejects(lambda: resolve_quote(root, bad), '位置无效')
    outside = root.parent / (root.name + '-outside.tex')
    outside.write_text('Outside secret sentence.', encoding='utf-8')
    try:
        link = root / 'linked.tex'
        try:
            link.symlink_to(outside)
        except OSError:
            pass
        else:
            assert not cite_tex(context, {'quote': 'Outside secret sentence.'})['matches']
            rejects(lambda: cite_tex(context, {'quote': 'Outside secret sentence.', 'path': 'linked.tex'}), '项目内')
    finally:
        outside.unlink()

    config = mcp_config(context, root)
    messages = [dict(jsonrpc='2.0', id=1, method='initialize', params={'protocolVersion': '2024-11-05'}),
                dict(jsonrpc='2.0', method='notifications/initialized'), dict(jsonrpc='2.0', id=2, method='tools/list'),
                dict(jsonrpc='2.0', id=3, method='tools/call', params={'name': 'cite_tex', 'arguments': {'quote': 'First sentence.'}}),
                dict(jsonrpc='2.0', id=4, method='tools/call', params={'name': 'cite_tex', 'arguments': {'quote': ''}}),
                dict(jsonrpc='2.0', id=5, method='tools/call', params={'name': 'write_file', 'arguments': {}})]
    process = subprocess.run([sys.executable, '-u', '-X', 'utf8', str(Path(__file__).with_name('references.py')), str(root / 'quote-context.json')],
                             input='\n'.join(json.dumps(item) for item in messages) + '\n', text=True, encoding='utf-8',
                             capture_output=True, check=True, timeout=10)
    responses = [json.loads(line) for line in process.stdout.splitlines()]
    assert len(responses) == 5 and responses[0]['result']['serverInfo']['name'] == 'tex_quotes'
    assert [item['name'] for item in responses[1]['result']['tools']] == ['cite_tex']
    assert json.loads(responses[2]['result']['content'][0]['text'])['matches'] == [first]
    assert responses[3]['result']['isError'] and responses[4]['error']['code'] == -32601
    # Validate CLI TOML parsing without exposing configured environment values or requesting a model.
    listed = subprocess.run([codex_executable(), 'mcp', 'list', '--json', '-c', config], capture_output=True, timeout=15, check=True)
    configured = next(item for item in json.loads(listed.stdout) if item['name'] == 'tex_quotes')
    assert configured['enabled'] and configured['transport']['command'] == sys.executable
    print('PASS: project quotations, drafts, Unicode offsets, ambiguity, stale links, boundaries and read-only MCP/CLI configuration')

    answer = {'reply': first['markdown'], 'replacement': None}
    chat_data = {'source': context['source'], 'selection': '', 'messages': [{'role': 'user', 'content': 'Quote the first sentence.'}]}
    with patch('chat.codex_executable', return_value='codex.exe'), patch('chat.subprocess.Popen') as spawn:
        ai = Mock(returncode=0)
        spawn.return_value = ai
        def communicate(prompt, timeout):
            argv = spawn.call_args.args[0]
            assert '--ignore-user-config' in argv, 'Isolate the reference tool from other configured MCP servers.'
            assert any(item.startswith('mcp_servers={tex_quotes=') for item in argv)
            assert 'cite_tex' in prompt.decode() and 'Never invent a source link' in prompt.decode()
            assert 'proactively call cite_tex' in prompt.decode() and 'even if the user did not ask for navigation' in prompt.decode()
            return ('\n'.join(json.dumps(item) for item in [
                {'type': 'item.completed', 'item': {'type': 'mcp_tool_call', 'server': 'tex_quotes', 'tool': 'cite_tex'}},
                {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': json.dumps(answer)}}]).encode(), b'')
        ai.communicate.side_effect = communicate
        job = ChatJob(chat_context(chat_data, main), references=context)
        job.run()
        assert job.result['status'] == 'done' and job.result['reply'] == first['markdown'], job.result
        for item in ({'type': 'command_execution'}, {'type': 'web_search'},
                     {'type': 'mcp_tool_call', 'server': 'other', 'tool': 'cite_tex'},
                     {'type': 'mcp_tool_call', 'server': 'tex_quotes', 'tool': 'write_file'}):
            guarded = ChatJob({}, references=context)
            guarded.process = ai
            rejects(lambda: guarded.codex_answer(json.dumps({'item': item}).encode()), '只允许')
    assert ChatJob({}, backend='deepseek', references=context).references is None

    server = make_server(main, main_thread='', preferences_path=root / 'preferences.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    direct = build_opener(ProxyHandler({}))
    def request(route, data=None, origin=None):
        headers = {'Content-Type': 'application/json', **({'Origin': origin} if origin else {})}
        req = Request(base + route, None if data is None else json.dumps(data).encode(), headers)
        try:
            with direct.open(req, timeout=55) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)
    try:
        current = request('/state')[1]
        with patch('editor.ChatJob.start', autospec=True, side_effect=lambda job: setattr(job, 'result', {'status': 'done'}) or job) as started:
            for incoming in (chat_data, {**chat_data, 'references': False}):
                assert request('/chat', incoming)[0] == 200
                assert started.call_args.args[0].references is None, 'The tool must stay unavailable until the user enables quotations.'
            assert request('/chat', {**chat_data, 'references': True})[0] == 200
            assert started.call_args.args[0].references == context
            assert request('/chat', {'selection': '', 'messages': chat_data['messages']})[0] == 400
        payload = {'path': str(main), 'source': context['source'], 'version': current['version'], 'reference': token(first)}
        code, result = request('/source-quote', payload)
        assert code == 200 and result['quote'] == 'First sentence.' and result['version'] == current['version'], result
        assert request('/source-quote', {**payload, 'version': 'stale'})[0] == 409
        assert request('/source-quote', {**payload, 'source': draft['source']})[0] == 400
        assert request('/source-quote', payload, 'https://example.com')[0] == 403
        code, target = request('/source-quote', {**payload, 'reference': token(quoted_child)})
        assert code == 200 and target['path'] == str(child), target
        code, switched = request('/source', {'path': target['path'], 'version': current['version']})
        assert code == 200 and switched['version'] == target['version'], switched
        code, compiled = request('/compile', {'source': switched['source'], 'version': switched['version']})
        assert code == 200 and compiled['ok'], compiled
        code, located = request('/synctex', {'direction': 'forward', 'line': target['line'], 'column': 1,
                                           'version': compiled['version'], 'pdf_revision': compiled['pdf_revision'],
                                           'boxes': [[0, 0, 612, 792], [0, 0, 612, 792]]})
        assert code == 200 and located['page'] == 2, located
        assert request('/source-quote', payload)[0] == 409
        child.write_text('Changed child sentence.', encoding='utf-8')
        current = request('/state')[1]
        assert request('/source-quote', {'path': str(child), 'source': current['source'], 'version': current['version'],
                                         'reference': token(quoted_child)})[0] == 400
        child.write_bytes(original[child])
        note = root / 'note.md'
        note.write_text('# Note', encoding='utf-8')
        assert request('/open', {'path': str(note)})[0] == 200
        with patch('editor.ChatJob.start', autospec=True, side_effect=lambda job: setattr(job, 'result', {'status': 'done'}) or job) as started:
            assert request('/chat', {**chat_data, 'source': '# Note', 'references': True})[0] == 200
            assert started.call_args.args[0].references is None, 'Markdown chat keeps its existing tool-free behavior.'
    finally:
        server.shutdown()
        server.server_close()
        server.build.cleanup()
    assert all(file.read_bytes() == content for file, content in original.items()), 'Reference navigation must leave source bytes intact.'
    print('PASS: chat whitelist, HTTP versions/origin, included-file quotes and real PDF page navigation without source changes')
