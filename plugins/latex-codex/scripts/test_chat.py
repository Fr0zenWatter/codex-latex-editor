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
