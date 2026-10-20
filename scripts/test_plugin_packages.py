"""Verify both isolated plugin packages and backend defaults without model calls."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
from urllib.request import ProxyHandler, build_opener
from zipfile import ZipFile

from build_deepseek_plugin import ROOT, build_archive, build_runtime


def check_editor(plugin, backend, folder):
    entry = plugin / 'scripts/editor.py'
    other = 'deepseek' if backend == 'codex' else 'codex'
    rejected = subprocess.run([sys.executable, str(entry), str(folder / 'note.md'), '--ai-backend', other],
                              capture_output=True, timeout=20)
    assert rejected.returncode == 2, 'Each plugin must reject the other backend.'
    environment = {**os.environ, 'USERPROFILE': str(folder), 'HOME': str(folder),
                   'DSH_SESSION_ID': 'test-deepseek-session', 'CODEX_THREAD_ID': 'test-codex-thread'}
    environment.pop('PYTHONPATH', None)
    process = subprocess.Popen([sys.executable, '-u', str(entry), str(folder / 'note.md')],
                               cwd=folder, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True)
    lines = queue.Queue()
    threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
    try:
        base = lines.get(timeout=20).strip()
        assert base.startswith('http://127.0.0.1:'), base
        client = build_opener(ProxyHandler({}))
        with client.open(base, timeout=5) as response:
            page = response.read().decode()
            assert f'data-ai-backend="{backend}"' in page
            platform = 'Codex' if backend == 'codex' else 'DeepSeek Harness'
            assert f'<title>LaTeX in AI Sidebar · {platform}</title>' in page
        with client.open(base + 'state', timeout=5) as response:
            assert json.load(response)['source'] == 'Chosen.\n'
        for asset in ('latex-chat.mjs', 'latex-pdf-selection.mjs', 'pdfjs/build/pdf.mjs', 'pdfjs/build/pdf.worker.mjs'):
            with client.open(base + 'vendor/' + asset, timeout=5) as response:
                assert response.status == 200 and response.read(32)
    finally:
        process.terminate()
        process.communicate(timeout=10)


with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    (folder / 'note.md').write_text('Chosen.\n', encoding='utf-8', newline='\n')
    ignore = shutil.ignore_patterns('runtime', 'frontend', 'node_modules', '__pycache__', 'test_*', '*.pyc')
    native = folder / 'latex-codex'
    harness = folder / 'latex-deepseek'
    shutil.copytree(ROOT / 'plugins/latex-codex', native, ignore=ignore)
    shutil.copytree(ROOT / 'plugins/latex-deepseek', harness, ignore=ignore)
    assert not list((native / 'scripts').glob('*deepseek*')), 'Native package must exclude Harness adapters.'
    runtime = build_runtime(native / 'scripts', harness)
    (runtime / 'stale.py').write_text('old generated module', encoding='utf-8')
    build_runtime(native / 'scripts', harness)
    assert not (runtime / 'stale.py').exists(), 'Rebuilds must remove deleted runtime files.'
    before = (runtime / 'editor.py').read_bytes()
    try:
        build_runtime(folder / 'missing-core', harness)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError('An incomplete core must not replace the existing package.')
    assert (runtime / 'editor.py').read_bytes() == before
    assert (runtime / 'vendor/README.md').is_file(), 'Keep bundled third-party license documentation.'
    check_editor(native, 'codex', folder)
    # Relocate the package and remove the native source: Harness must have no cross-plugin dependency.
    assert native.resolve().parent == folder.resolve()
    shutil.rmtree(native)
    standalone = folder / 'standalone-deepseek'
    harness.rename(standalone)
    (standalone / '.env').write_text('do not package', encoding='utf-8')
    (standalone / 'paper.tex').write_text('private paper', encoding='utf-8')
    archive = build_archive(standalone, folder / 'deepseek.zip')
    with ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert bundle.testzip() is None
        assert 'latex-deepseek/runtime/vendor/pdfjs/build/pdf.worker.mjs' in names
        assert 'latex-deepseek/AGENTS.md' in names
        assert not any(name.endswith(('.env', '.tex', '.sqlite3', '.pyc')) for name in names)
        assert not any('/test_' in name or '/node_modules/' in name or '/__pycache__/' in name for name in names)
        skill = bundle.read('latex-deepseek/SKILL.md').decode('utf-8')
        assert '`scripts/editor.py` relative to this skill directory' in skill
        assert '../../scripts/editor.py' not in skill
        bundle.extractall(folder / 'extracted')
    assert standalone.resolve().parent == folder.resolve()
    shutil.rmtree(standalone)
    extracted = folder / 'extracted/latex-deepseek'
    check_editor(extracted, 'deepseek', folder)
    # Citation configuration and its MCP server must survive without the source checkout.
    (folder / 'citation.tex').write_text('Standalone quote.', encoding='utf-8')
    configure = '''import json, sys
from pathlib import Path
sys.path[:0] = [sys.argv[1], sys.argv[2]]
from deepseek import dsh_patch
context = {'root': sys.argv[3], 'path': 'citation.tex', 'source': 'Standalone quote.'}
print(Path(dsh_patch(sys.argv[3], references=context)).read_text(encoding='utf-8'))
'''
    configured = subprocess.run([sys.executable, '-X', 'utf8', '-c', configure,
                                 str(extracted / 'scripts'), str(extracted / 'runtime'), str(folder)],
                                capture_output=True, check=True, timeout=10)
    quote_server = next(item['config'] for entry in json.loads(configured.stdout)
                        for item in entry.get('insert', []) if item['id'] == 'latex-tex-quotes')
    assert Path(quote_server['args'][-2]).is_relative_to(extracted), 'Use this package’s own quotation server.'
    call = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
            'params': {'name': 'cite_tex', 'arguments': {'quote': 'Standalone quote.'}}}
    quoted = subprocess.run([quote_server['command'], *quote_server['args']],
                            input=(json.dumps(call) + '\n').encode(), capture_output=True, check=True, timeout=10)
    matches = json.loads(json.loads(quoted.stdout)['result']['content'][0]['text'])['matches']
    assert matches[0]['quote'] == 'Standalone quote.' and '/source-quote?ref=' in matches[0]['markdown']

market = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
assert {item['name'] for item in market['plugins']} == {'latex-codex', 'latex-deepseek'}
for item in market['plugins']:
    manifest = json.loads((ROOT / item['source']['path'] / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
    assert manifest['name'] == item['name']
    skill = ROOT / item['source']['path'] / 'skills' / item['name'] / 'SKILL.md'
    assert skill.is_file(), 'Each plugin must have its own discoverable skill.'
print('PASS: native isolation, independent defaults, complete rebuilds and standalone DeepSeek ZIP without private files')
