[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex

在 Codex 侧边栏编辑 LaTeX 和 Markdown，支持本地预览、自动保存和历史。

- 源码与 PDF 双向跳转、PDF 选字与公式框选。
- **Send** 使用已登录的 Codex 生成修改建议，源码与 PDF 逐处 **Keep / Undo**。
- 支持模型与思考等级选择、写作风格和项目对话。
- Markdown 实时预览，以及通过现有 TeX 环境生成 PDF。

对 Codex 说：**使用 latex-codex 打开 main.tex**，或直接运行：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

在侧边浏览器打开打印的本地地址。选中源码或 PDF 内容，添加批注，然后点击 **Send**。

DeepSeek Harness 由独立的可选插件 **latex-deepseek** 提供；安装或更新 LaTeX Codex 始终保留原生 Codex 后端。两种插件的安装与维护细节见 [AGENTS.md](AGENTS.md)。
