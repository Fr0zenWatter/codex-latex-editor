"""Bundle shared resources and optionally create a portable DeepSeek plugin ZIP."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
MODULES = ('editor.py', 'chat.py', 'history.py', 'markdown_source.py', 'obsidian_tex.py',
           'outline.py', 'preferences.py', 'project_review.py', 'proofread.py', 'references.py')


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


def build_archive(plugin, destination):
    plugin, destination = Path(plugin).resolve(), Path(destination).resolve()
    manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
    if manifest['name'] != 'latex-deepseek' or not (plugin / 'runtime/editor.py').is_file():
        raise ValueError('Build the DeepSeek runtime before creating its archive.')
    # Explicit roots keep papers, credentials, history and maintenance tests out of shared packages.
    files = [plugin / name for name in ('.codex-plugin/plugin.json', 'README.md', 'AGENTS.md')]
    files += [plugin / 'scripts' / name for name in
              ('editor.py', 'deepseek.py', 'deepseek-boundary.mjs', 'deepseek-main-chat.mjs',
               'install_deepseek_bridge.py')]
    for name in ('runtime', 'skills'):
        files += [path for path in (plugin / name).rglob('*') if path.is_file()
                  and not any(part in ('__pycache__', 'node_modules') for part in path.parts)
                  and path.suffix not in ('.pyc', '.pyo')]
    skill = (plugin / 'skills/latex-deepseek/SKILL.md').read_text(encoding='utf-8')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.deepseek-package-', dir=destination.parent) as directory:
        archive = Path(directory) / 'plugin.zip'
        with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as bundle:
            for path in sorted(files):
                bundle.write(path, 'latex-deepseek/' + path.relative_to(plugin).as_posix())
            # Harness discovers this directory as a skill; Codex retains its nested manifest skill.
            bundle.writestr('latex-deepseek/SKILL.md', skill.replace('../../scripts/editor.py', 'scripts/editor.py'))
        archive.replace(destination)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Also write a self-contained DeepSeek plugin ZIP.')
    args = parser.parse_args()
    runtime = build_runtime()
    print(build_archive(runtime.parent, args.output) if args.output else runtime)
