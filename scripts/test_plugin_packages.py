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

from build_deepseek_plugin import ROOT, build_runtime


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
            assert f'data-ai-backend="{backend}"' in response.read().decode()
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
    check_editor(standalone, 'deepseek', folder)

market = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
assert {item['name'] for item in market['plugins']} == {'latex-codex', 'latex-deepseek'}
for item in market['plugins']:
    manifest = json.loads((ROOT / item['source']['path'] / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
    assert manifest['name'] == item['name']
    skill = ROOT / item['source']['path'] / 'skills' / item['name'] / 'SKILL.md'
    assert skill.is_file(), 'Each plugin must have its own discoverable skill.'
print('PASS: native isolation, independent defaults, complete rebuilds and standalone DeepSeek package')
