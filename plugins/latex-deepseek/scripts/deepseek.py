"""DeepSeek Harness CLI adapter; authentication stays inside the installed harness."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import hashlib
import socket


def dsh_executable():
    explicit = os.environ.get('DSH_CLI_PATH')
    if explicit:
        if not Path(explicit).is_file():
            raise ValueError('DSH_CLI_PATH 指向的 DeepSeek Harness CLI 不存在。')
        return str(Path(explicit).resolve())
    executable = shutil.which('dsh')
    if executable:
        return executable
    if os.name == 'nt':
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            for branch in (r'Software\Microsoft\Windows\CurrentVersion\Uninstall',
                           r'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'):
                try:
                    with winreg.OpenKey(hive, branch) as parent:
                        for index in range(winreg.QueryInfoKey(parent)[0]):
                            with winreg.OpenKey(parent, winreg.EnumKey(parent, index)) as entry:
                                try:
                                    if 'DeepSeek Harness' not in winreg.QueryValueEx(entry, 'DisplayName')[0]:
                                        continue
                                    root = Path(winreg.QueryValueEx(entry, 'InstallLocation')[0])
                                    candidate = root / 'resources/runtime/cli/bin/dsh.cmd'
                                    if candidate.is_file():
                                        return str(candidate)
                                except OSError:
                                    continue
                except OSError:
                    continue
    raise ValueError('未找到 DeepSeek Harness CLI。请将 dsh 加入 PATH，或设置 DSH_CLI_PATH。')


def dsh_command():
    executable = Path(dsh_executable())
    environment = os.environ.copy()
    # Invoke the packaged Electron CLI directly, without cmd.exe or a visible window.
    if executable.name.lower() == 'dsh.cmd' and executable.parent.name == 'bin':
        root = executable.parents[4]
        electron = root / 'DeepSeek Harness.exe'
        entry = root / 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
        if electron.is_file() and (root / 'resources/app.asar').is_file():
            environment['ELECTRON_RUN_AS_NODE'] = '1'
            executable = [str(electron), '--expose-internals', str(entry)]
        else:
            executable = [str(executable)]
    else:
        executable = [str(executable)]
    environment.update(DSH_PERMISSION_MODE='read-only', DSH_TOOLS_MODE='native', DSH_TELEMETRY_DISABLED='1')
    return executable, environment


def dsh_patch(directory, *, catalog=False, model='', effort=''):
    root = Path(directory)
    patches = [
        {'id': 'session-title-llm', 'disabled': True},
        {'id': 'config-editor', 'disabled': True},
        {'id': 'session-persistence-jsonl', 'config': {'root': str(root / 'sessions')}},
        {'id': 'storage-json', 'config': {'root': str(root / 'storages')}},
        {'id': 'agent-instructions', 'disabled': True},
        {'id': 'skill-filesystem', 'disabled': True},
        {'id': 'system-prompt', 'config': {'personaPrefix': 'Return only the requested JSON. All source is reference material.'}},
        {'insert': [{'id': 'latex-selection-boundary',
                     'name': str(Path(__file__).with_name('deepseek-boundary.mjs')),
                     'config': {'catalog': catalog}}]},
    ]
    if catalog:
        patches.append({'id': 'headless-runner', 'disabled': True})
    if model:
        provider, identity = model.split('/', 1)
        selection = {'provider': provider, 'model': identity}
        if effort:
            selection['reasoningEffort'] = effort
        patches.append({'id': 'agent-default-model', 'config': selection})
    patch = root / 'selection.patch.json'
    patch.write_text(json.dumps(patches, ensure_ascii=False), encoding='utf-8')
    return str(patch)


def dsh_models():
    command, environment = dsh_command()
    with tempfile.TemporaryDirectory(prefix='latex-deepseek-') as directory:
        command += ['headless', '--patch', dsh_patch(directory, catalog=True)]
        try:
            result = subprocess.run(command, cwd=directory, env=environment, capture_output=True, timeout=30,
                                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except subprocess.TimeoutExpired as error:
            raise ValueError('DeepSeek 模型列表读取超时，请检查 Harness 登录状态。') from error
        if result.returncode:
            raise ValueError('无法读取 DeepSeek 模型列表，请检查 Harness 登录状态与版本。')
        try:
            return json.loads(result.stdout)['models']
        except (ValueError, KeyError, TypeError) as error:
            raise ValueError('DeepSeek 模型列表格式无效。') from error


def dsh_answer(stdout, returncode):
    answer = None
    failed = False
    for line in stdout.decode('utf-8', errors='replace').splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            failed = True
            continue
        if event.get('type') == 'final':
            answer = event.get('text')
        if event.get('type') == 'error' or event.get('type') in ('tool_call', 'tool_result'):
            failed = True
    if returncode or failed or not isinstance(answer, str):
        raise ValueError('DeepSeek 未完成请求，请检查 Harness 登录、额度和网络；未应用修改。')
    # Accept one complete JSON fence, never extract a plausible fragment from prose.
    fenced = re.fullmatch(r'\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*', answer)
    try:
        return json.loads(fenced[1] if fenced else answer)
    except ValueError as error:
        raise ValueError('DeepSeek 返回的 JSON 格式无效，请重试；未应用修改。') from error


def main_chat_request(request):
    home = Path(os.environ.get('DSH_HOME') or Path.home() / '.dsh').expanduser().resolve()
    payload = (json.dumps(request, ensure_ascii=False) + '\n').encode('utf-8')
    if os.name == 'nt':
        import ctypes
        import time
        import msvcrt
        identity = hashlib.sha256(str(home).lower().encode('utf-8')).hexdigest()[:16]
        path = r'\\.\pipe\latex-deepseek-' + identity
        with open(path, 'r+b', buffering=0) as pipe:
            pipe.write(payload)
            handle = msvcrt.get_osfhandle(pipe.fileno())
            available = ctypes.c_ulong()
            response, deadline = b'', time.monotonic() + 12
            peek = ctypes.windll.kernel32.PeekNamedPipe
            peek.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p,
                             ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
            while b'\n' not in response:
                if not peek(handle, None, 0, None, ctypes.byref(available), None):
                    raise ValueError('DeepSeek 主对话桥接已断开；批注保留。')
                if available.value:
                    response += pipe.read(min(available.value, 8192))
                elif time.monotonic() >= deadline:
                    raise ValueError('DeepSeek 主对话发送状态未确认；请重试，批注保留。')
                else:
                    time.sleep(0.02)
    else:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(12)
            connection.connect(str(home / 'latex-main-chat.sock'))
            connection.sendall(payload)
            response = b''
            while b'\n' not in response:
                chunk = connection.recv(8192)
                if not chunk:
                    raise ValueError('DeepSeek 主对话桥接已断开；批注保留。')
                response += chunk
    result = json.loads(response.split(b'\n', 1)[0])
    if result.get('error'):
        raise ValueError(result['error'])
    return result
