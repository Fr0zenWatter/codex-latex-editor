# LaTeX Codex

在 Codex 侧边栏编辑 LaTeX，自动保存并预览本地编译的 PDF。

- Vim 快捷键、命令补全和公式即时预览。
- 源码与 PDF 双向定位，支持缩放、拖动和选字。
- 选中源码或 PDF 文字后向 Codex 提问、修改选区。
- 本地版本历史，可比较源码和 PDF 改动、恢复旧版本。

## 准备

需要已登录的 Codex 桌面应用和 CLI、Python 3.10+（含 tkinter）、TeX Live 或 MiKTeX，以及 Poppler 的 `pdfinfo`。TeX 环境需提供 `xelatex` / `pdflatex`、`bibtex` 和 `synctex`。

前端资源已随插件附带，无需 npm 安装。当前版本在 Windows 上验证，其他系统尚未实测。

## 安装与使用

克隆或下载本仓库，在仓库根目录运行：

```sh
codex plugin marketplace add .
codex plugin add latex-codex@latex-codex-shared
```

如果 Windows 中找不到 `codex`，可在 Codex 的 PowerShell 终端使用：

```powershell
& $env:CODEX_CLI_PATH plugin marketplace add .
& $env:CODEX_CLI_PATH plugin add latex-codex@latex-codex-shared
```

重新打开对话后，告诉 Codex：**“用 latex-codex 打开我的 LaTeX 文件”**，并提供 `.tex` 文件路径。

也可以独立启动编辑器：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

打开终端打印的本地地址即可使用；AI 功能仍需已登录的 Codex CLI。

编辑会自动保存到原始 `.tex` 文件；历史保存在文档旁的 `.latex-codex/`。历史只记录入口文件，旧版本编译会使用当前的图片、参考文献和引用文件。目前不支持多文件导航和 Biber。

第三方资源的许可证随源码保留，详情见 [资源说明](plugins/latex-codex/scripts/vendor/README.md)。安装机制参见 [官方文档](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)。
