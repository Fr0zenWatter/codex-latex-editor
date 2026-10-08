"""Run: python test_chat.py (stdlib; no model call)."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from unittest.mock import Mock, patch
from chat import ChatJob, chat_context, chat_models, codex_executable, main_chat_context, revision_segments


with tempfile.TemporaryDirectory() as directory:
    current_cli = Path(directory) / 'codex.exe'
    current_cli.touch()
    with patch.dict('os.environ', {'CODEX_CLI_PATH':str(current_cli)}), patch('chat.shutil.which', return_value='older-codex.exe'):
        assert codex_executable() == str(current_cli), 'Use the running desktop CLI ahead of stale PATH entries.'
        current_cli.unlink()
        assert codex_executable() == 'older-codex.exe', 'Keep PATH fallback for launches outside the app.'

data = {'source': 'Before. Selected. After.', 'selection': 'Selected.',
        'messages': [{'role': 'user', 'content': 'Polish this.'}]}
context = chat_context(data, Path('paper.tex'))
assert context['document'] == data['source'] and context['file'] == 'paper.tex'
assert not context['main_conversation']['available']
with tempfile.TemporaryDirectory() as directory:
    rollout = Path(directory) / 'main.jsonl'
    def record(role, text, phase=None):
        return json.dumps({'type':'response_item','payload':{'type':'message','role':role,'phase':phase,
                          'content':[{'type':'input_text' if role != 'assistant' else 'output_text','text':text}]}}) + '\n'
    rollout.write_text(record('developer', 'Hidden instructions') + record('user', 'Keep my terminology.')
                       + record('assistant', 'Progress only', 'commentary')
                       + record('assistant', 'We agreed on notation.', 'final_answer')
                       + '{"type":"response_item","payload":{"type":"function_call_output","output":"tool secret"}}\n'
                       + '{"unfinished":', encoding='utf-8')
    with patch('chat.main_chat_path', return_value=rollout):
        main = main_chat_context('parent')
        assert [m['content'] for m in main['messages']] == ['Keep my terminology.', 'We agreed on notation.']
        assert not main['truncated']
        with rollout.open('a', encoding='utf-8') as stream:
            stream.write('\n' + record('user', 'A new preference.'))
        context = chat_context(data, Path('paper.tex'), 'parent')
        assert context['main_conversation']['messages'][-1]['content'] == 'A new preference.'
        rollout.write_text(record('user', 'x' * 90_000), encoding='utf-8')
        bounded = main_chat_context('parent')
        assert bounded['truncated'] and len(bounded['messages'][0]['content']) == 80_000
for invalid in ({**data, 'selection': 'not in document'}, {**data, 'messages': []},
                {**data, 'messages': [{'role': 'system', 'content': 'bad'}]}):
    try:
        chat_context(invalid, Path('paper.tex'))
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid input accepted')
answer = {'reply': '已准备建议。', 'replacement': 'Revised.'}
event = {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': json.dumps(answer)}}
process = Mock(returncode=0)
process.communicate.return_value = (json.dumps(event).encode(), b'')
with patch('chat.shutil.which', return_value='codex.exe'), patch('chat.subprocess.Popen', return_value=process) as spawn:
    job = ChatJob(context)
    job.run()
    assert job.result == {'status': 'done', **answer, 'segments': revision_segments(data['selection'], answer['replacement'])}
    assert job.context is None
    argv = spawn.call_args.args[0]
    assert '--ephemeral' in argv and argv[argv.index('--sandbox') + 1] == 'read-only'
    prompt = process.communicate.call_args.args[0].decode()
    assert 'Before. Selected. After.' in prompt and 'Polish this.' in prompt
    assert 'Keep my terminology.' in prompt and 'A new preference.' in prompt
    assert 'Hidden instructions' not in prompt and 'tool secret' not in prompt
    assert 'Selected.' not in ' '.join(argv), 'Context belongs on stdin, not command arguments.'
    assert '--model' not in argv and '-c' not in argv, 'Default must preserve the CLI configuration.'
    markdown_job = ChatJob(chat_context(data, Path('note.md'))); markdown_job.run()
    assert markdown_job.result == {'status':'done', **answer, 'segments':None}
    markdown_prompt = process.communicate.call_args.args[0].decode()
    assert 'project Markdown selection assistant' in markdown_prompt
    assert 'COMPLETE Markdown text' in markdown_prompt and 'extra code fence' in markdown_prompt
    assert 'COMPLETE LaTeX text' not in markdown_prompt
    with patch('chat.chat_models', return_value=[{'id':'test-model','efforts':['low','high'],'default_effort':'low'}]) as catalog:
        configured = chat_context({**data, 'model':'test-model','effort':'high'}, Path('paper.tex'))
        ChatJob(configured).run()
        argv = spawn.call_args.args[0]
        assert argv[argv.index('--model') + 1] == 'test-model'
        assert argv[argv.index('-c') + 1] == 'model_reasoning_effort="high"'
        assert chat_context({**data,'model':'test-model'}, Path('paper.tex'))['effort'] == 'low'
        for model, effort in [('unknown','low'), ('test-model','ultra'), ('','high'), ([], '')]:
            try:
                chat_context({**data, 'model':model,'effort':effort}, Path('paper.tex'))
            except ValueError:
                pass
            else:
                raise AssertionError('Invalid model/effort accepted')
    process.communicate.return_value = (b'{"type":"turn.failed","error":{"message":"Offline"}}', b'')
    process.returncode = 1
    failed = ChatJob(context); failed.run()
    assert failed.result == {'status': 'error', 'error': 'Offline'}
    cancelled = ChatJob(context); cancelled.cancel(); cancelled.run()
    assert cancelled.result['status'] == 'cancelled'
print('PASS: selection validation, ephemeral/read-only invocation, context, output, errors and cancellation')

batch = {'source': '😀 chosen gap chosen.', 'selection': 'chosen',
         'messages': [{'role': 'user', 'content': 'Apply both comments.'}],
         'annotations': [{'id': 1, 'start': 2, 'end': 8, 'selection': 'chosen', 'request': 'Polish first.'},
                         {'id': 2, 'start': 13, 'end': 19, 'selection': 'chosen', 'request': 'Polish second.'}]}
batch_context = chat_context(batch, Path('paper.tex'))
assert [{key: item[key] for key in batch['annotations'][0]} for item in batch_context['annotations']] == batch['annotations']
assert batch_context['annotations'][1]['context_before'] == '😀 chosen gap '
assert batch_context['annotations'][1]['context_after'] == '.'
large_source = 'UNRELATED PREAMBLE' + 'x' * 5000 + '\nFirst nearby: chosen.\n' + 'y' * 5000 + '\nSecond nearby: chosen.\n' + 'z' * 5000 + 'UNRELATED END'
ranges = [large_source.index('chosen'), large_source.rindex('chosen')]
local_batch = {**batch, 'source': large_source,
               'messages': [{'role': 'user', 'content': 'UNRELATED OLD QUESTION'}, *batch['messages']],
               'annotations': [{**item, 'start': start, 'end': start + len(item['selection'])}
                               for item, start in zip(batch['annotations'], ranges)]}
with patch('chat.main_chat_context', side_effect=AssertionError('Batch requests must not read the main chat.')):
    local_context = chat_context(local_batch, Path('paper.tex'), 'parent')
assert 'document' not in local_context and 'main_conversation' not in local_context
assert local_context['messages'] == batch['messages']
assert 'First nearby:' in local_context['annotations'][0]['context_before']
assert 'Second nearby:' in local_context['annotations'][1]['context_before']
assert all(len(item[key]) <= 1200 for item in local_context['annotations'] for key in ('context_before', 'context_after'))
for bad in ([], [None], [{**batch['annotations'][0], 'start': 3}],
            [{**batch['annotations'][0], 'id': True}],
            [batch['annotations'][0], batch['annotations'][0]],
            [{**batch['annotations'][0], 'request': ' '}],
            list(reversed(batch['annotations']))):
    try:
        chat_context({**batch, 'annotations': bad}, Path('paper.tex'))
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid annotations accepted')
with patch('chat.codex_executable', return_value='codex.exe'), patch('chat.subprocess.Popen') as spawn:
    process = Mock(returncode=0)
    spawn.return_value = process

    def run_batch(replacements):
        process.communicate.return_value = (json.dumps({'type': 'item.completed', 'item': {
            'type': 'agent_message', 'text': json.dumps({'reply': 'Reviewed.', 'replacements': replacements})}}).encode(), b'')
        job = ChatJob(batch_context)
        job.run()
        return job.result

    result = run_batch([{'id': 2, 'replacement': None}, {'id': 1, 'replacement': 'better'}])
    assert result['status'] == 'done' and result['replacement'] is None
    assert result['replacements'][1]['segments'] == revision_segments('chosen', 'better')
    changes = result['replacements'][1]['changes']
    assert ''.join(run['text'] for run in changes if run['kind'] != 'insert') == 'chosen'
    assert ''.join(run['text'] for run in changes if run['kind'] != 'delete') == 'better'
    assert result['replacements'][0]['changes'] is None
    prompt = process.communicate.call_args.args[0].decode()
    assert 'multiple annotations' in prompt and 'Polish second.' in prompt
    assert 'context_before' in prompt and 'context_after' in prompt
    assert 'chosen' not in ' '.join(spawn.call_args.args[0])
    for malformed in ([], [{'id': 1, 'replacement': 'partial'}],
                      [{'id': 1, 'replacement': 'a'}, {'id': 1, 'replacement': 'b'}],
                      [{'id': 1, 'replacement': 'a'}, {'id': 9, 'replacement': 'b'}],
                      [{'id': 1, 'replacement': 'a'}, {'id': 2, 'replacement': 123}]):
        assert run_batch(malformed)['status'] == 'error', 'Do not apply incomplete or mismatched batches.'
    ChatJob(local_context).run()
    local_prompt = process.communicate.call_args.args[0].decode()
    assert 'First nearby:' in local_prompt and 'Second nearby:' in local_prompt
    assert all(noise not in local_prompt for noise in ('UNRELATED PREAMBLE', 'UNRELATED END', 'UNRELATED OLD QUESTION', 'main_conversation'))
    assert len(local_prompt) < len(large_source)
print('PASS: batch range validation, repeated text/Unicode anchors and complete per-comment responses')
print('PASS: batch prompts contain only annotated ranges and bounded nearby source, without document or chat history')

items = [{'id':7,'baseline':1,'sections':['2.1 Stability'],'diff':'- x^2\n+ x^3'}]
summaries = [{'id':7,'summary':'将稳定性估计中的平方项改为立方项。'}]
with patch('chat.codex_executable',return_value='codex.exe'), patch('chat.subprocess.Popen') as spawn:
    process = Mock(returncode=0)
    process.communicate.return_value=(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps({'summaries':summaries})}}).encode(),b'')
    spawn.return_value=process
    for language, name in [('en','English'),('zh-CN','Simplified Chinese'),('zh-TW','Traditional Chinese'),('ja','Japanese'),
                           ('fr','French'),('de','German'),('es','Spanish'),('invalid','English')]:
        memory=Mock()
        job=ChatJob({'task':'history-summary','items':items,'effort':'low','language':language},memory); job.run()
        expected = 'en' if language=='invalid' else language
        assert job.result=={'status':'done','summaries':summaries,'language':expected}
        memory.save_summaries.assert_called_once_with(items,summaries,expected)
        assert f'concise {name} for a history activity feed' in process.communicate.call_args.args[0].decode()
        assert job.context is None

catalog = {'models':[{'slug':'visible','display_name':'Visible','visibility':'list',
                     'default_reasoning_level':'low','supported_reasoning_levels':[{'effort':'low'}]},
                    {'slug':'hidden','visibility':'hide'}]}
with patch('chat.codex_executable', return_value='codex.exe'), patch('chat.subprocess.run', return_value=Mock(returncode=0,stdout=json.dumps(catalog).encode())) as run:
    chat_models.cache_clear()
    assert chat_models() == [{'id':'visible','name':'Visible','efforts':['low'],'default_effort':'low'}]
    assert chat_models() == chat_models() and run.call_count == 1
    chat_models.cache_clear()

def colored(before, after):
    segments = revision_segments(before, after)
    assert ''.join(text for text, _ in segments) == after
    return [text for text, kind in segments if kind]

assert colored('$x+y=z$ The method is good and stable.', '$x+y=z$ The method is accurate and stable.') == ['accurate']
assert colored('same $x^2$', 'same $x^2$') == []
assert colored('remove this', '') == []
assert colored('A good and good method.', 'A robust and good approach.') == ['robust','approach']
assert colored('Stable.', 'Very stable.') == ['Very','stable']
assert colored(r'{\color{blue}good}', r'{\color{blue}better}') == ['better']
assert colored('old% comment', 'new% changed comment') == ['new']
assert colored(r'$\frac{x_i}{y}$', r'$\frac{x_j}{z}$') == ['j','z']
assert colored(r'$\frac12$', r'$\frac34$') == ['3','4']
assert colored(r'$x^a$', r'$x^bc$') == ['b','c']
assert colored(r'\cite{old} \label{old}', r'\cite{new} \label{new}') == []
assert colored(r'\begin{equation}x=1\end{equation}', r'\begin{equation}x=2\end{equation}') == ['2']
assert colored(r'$\left(x\right)$', r'$\left[y\right]$') == ['y']
assert colored(r'\verb|old| \unknown{old}', r'\verb|new| \unknown{new}') == []
assert colored('A', 'A 😀') == ['😀']
print('PASS: catalog validation, model/effort overrides and change-only TeX segments')

if shutil.which('pdflatex') and shutil.which('node'):
    pairs = [('$x+y=z$ The method is good and stable.', '$x+y=z$ The method is accurate and stable.'),
             (r'$\frac{x_i}{y}+\frac12=x^a$', r'$\frac{x_j}{z}-\frac34=x^bc$'),
             (r'$\left(x\right)$', r'$\left[y\right]$'),
             (r'{\color{blue}good} % old comment', r'{\color{blue}better} % new comment'),
             (r'$\alpha+\beta$', r'$\gamma-\beta$')]
    payload = [{'text': new, 'segments':revision_segments(old, new)} for old, new in pairs]
    module = (Path(__file__).parent / 'vendor/latex-chat.mjs').as_uri()
    script = 'import {colorReplacement} from ' + json.dumps(module) + '; import fs from "node:fs"; const data=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(data.map(p=>colorReplacement(p.text,"red",p.segments)).join("\\n\\n"));'
    marked = subprocess.run(['node','--input-type=module','-e',script],input=json.dumps(payload).encode(),capture_output=True,check=True).stdout.decode()
    assert '$x+y=z$ The method is {\\color{red}accurate} and stable.' in marked
    with tempfile.TemporaryDirectory(prefix='latex-revision-test-') as directory:
        source = Path(directory) / 'test.tex'
        source.write_text('\\documentclass{article}\n\\usepackage{xcolor,amsmath}\n\\begin{document}\n' + marked + '\n\\end{document}\n',encoding='utf-8')
        compiled = subprocess.run(['pdflatex','-no-shell-escape','-halt-on-error','-interaction=nonstopmode',source.name],cwd=directory,capture_output=True,timeout=40)
        assert compiled.returncode == 0, compiled.stdout.decode(errors='replace')[-3000:]
    print('PASS: frontend-rendered changes compile (formulas, scripts, comments and existing color)')
