"""Add the optional main-chat pipe to the user's DeepSeek desktop profile."""
import json
import os
from pathlib import Path


def install(profile=None):
    home = Path(os.environ.get('DSH_HOME') or Path.home() / '.dsh').expanduser()
    profile = Path(profile) if profile else home / 'profiles/desktop/cordis.patch.yml'
    before = profile.read_text(encoding='utf-8')
    module = Path(__file__).with_name('deepseek-main-chat.mjs').resolve().as_posix()
    if 'latex-main-chat-bridge' in before:
        if module in before:
            return False
        raise ValueError('已有主对话桥接配置，请先移除旧版 latex-main-chat-bridge 配置。')
    entry = {'insert': [{'id': 'latex-main-chat-bridge', 'name': module}]}
    try:
        parsed = json.loads(before)
    except ValueError:
        parsed = None
    if isinstance(parsed, list):
        after = json.dumps([*parsed, entry], ensure_ascii=False, indent=2) + '\n'
    else:
        active = [line for line in before.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        if active and not active[0].startswith('- '):
            raise ValueError('此 profile 不是 YAML 块列表；请手动添加 AGENTS.md 中的桥接配置。')
        after = before.rstrip() + '\n\n# LaTeX editor: optional main-chat bridge\n- insert:\n'
        after += '    - id: latex-main-chat-bridge\n      name: ' + json.dumps(module, ensure_ascii=False) + '\n'
    if profile.read_text(encoding='utf-8') != before:
        raise ValueError('DeepSeek profile 已变化，请重试。')
    # Preserve all other profile settings and never read the credentials document.
    temporary = profile.with_name(profile.name + '.latex-tmp')
    created = False
    try:
        with temporary.open('x', encoding='utf-8', newline='\n') as stream:
            created = True
            stream.write(after)
        os.replace(temporary, profile)
    finally:
        if created:
            temporary.unlink(missing_ok=True)
    return True


if __name__ == '__main__':
    try:
        changed = install()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
    print('DeepSeek 主对话桥接已添加；HMR 会自动加载，未开启 HMR 时重启 Harness。' if changed else 'DeepSeek 主对话桥接已配置。')
