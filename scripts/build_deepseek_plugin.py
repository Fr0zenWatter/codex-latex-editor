"""Bundle shared editor resources into the separately installed DeepSeek plugin."""
import json
from pathlib import Path
import shutil
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MODULES = ('editor.py', 'chat.py', 'history.py', 'markdown_source.py', 'obsidian_tex.py',
           'outline.py', 'preferences.py', 'project_review.py', 'proofread.py')


def build_runtime(core_scripts=ROOT / 'plugins/latex-codex/scripts',
                  plugin=ROOT / 'plugins/latex-deepseek'):
    core_scripts, plugin = Path(core_scripts).resolve(), Path(plugin).resolve()
    manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
    if manifest['name'] != 'latex-deepseek':
        raise ValueError('Expected the latex-deepseek plugin directory.')
    target = plugin / 'runtime'
    if target.is_symlink() or target.resolve() != target:
        raise ValueError('The generated runtime must stay inside the DeepSeek plugin directory.')
    # Stage a complete snapshot before replacing generated files; never copy project data or credentials.
    with tempfile.TemporaryDirectory(prefix='.runtime-', dir=plugin) as directory:
        snapshot = Path(directory) / 'runtime'
        snapshot.mkdir()
        for name in MODULES:
            shutil.copy2(core_scripts / name, snapshot / name)
        shutil.copytree(core_scripts / 'vendor', snapshot / 'vendor',
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '*.pyo', 'node_modules'))
        if target.exists():
            shutil.rmtree(target)
        snapshot.replace(target)
    return target


if __name__ == '__main__':
    print(build_runtime())
