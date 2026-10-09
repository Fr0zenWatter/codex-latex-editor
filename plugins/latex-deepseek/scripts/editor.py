"""Launch the independently packaged DeepSeek Harness editor."""
from pathlib import Path
import sys


if __name__ == '__main__':
    runtime = Path(__file__).resolve().parents[1] / 'runtime'
    if not (runtime / 'editor.py').is_file():
        raise SystemExit('DeepSeek 编辑器资源尚未生成。请在仓库根目录运行 python scripts/build_deepseek_plugin.py 后重新安装。')
    sys.path.insert(0, str(runtime))
    from editor import main
    main(ai_backend='deepseek')
