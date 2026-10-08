[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex · DeepSeek Harness 测试版

在 DeepSeek Harness 的侧边浏览器里编辑 LaTeX 和 Markdown，沿用本地预览、自动保存和历史。

- 源码与 PDF 双向跳转、PDF 选字与公式框选。
- **Send** 使用已登录的 DeepSeek Harness 生成修改建议，源码与 PDF 逐处 **Keep / Undo**。
- 模型与思考等级由 Harness 提供；支持写作风格和项目对话。
- 可选的 **发送到 DeepSeek 主对话**，将保存的批注交给启动编辑器的对话处理。
- Markdown 实时预览，以及通过现有 TeX 环境生成 PDF。

在 DeepSeek 主对话中，让它从解压目录执行：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex --ai-backend deepseek
```

在侧边浏览器打开打印的本地地址。选中源码或 PDF 内容，添加批注，然后点击 **Send**。

需要主对话转发时，先运行一次：

```sh
python plugins/latex-codex/scripts/install_deepseek_bridge.py
```

然后从 DeepSeek 主对话启动编辑器；添加批注后选择 **发送到 DeepSeek 主对话**。保留解压目录，桥接配置会引用其中的模块。安装与维护细节见 [AGENTS.md](AGENTS.md)。

这是独立的预发布版本；现有 Codex 版本仍在 [Releases](https://github.com/Fr0zenWatter/codex-latex-editor/releases) 中。
