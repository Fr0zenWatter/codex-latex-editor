[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex · DeepSeek Harness preview

Edit LaTeX and Markdown in the DeepSeek Harness side browser, with local previews, autosave and history.

- Source/PDF navigation, PDF text selection and formula box selection.
- **Send** proposes edits through your signed-in DeepSeek Harness; review each change with **Keep / Undo** in source and PDF.
- Harness model and reasoning controls, writing styles and project chat.
- Optional **Send to DeepSeek main chat** forwards saved comments to the conversation that launched the editor.
- Live Markdown previews and PDF compilation using your existing TeX installation.

Ask your DeepSeek main chat to run this from the extracted folder:

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex --ai-backend deepseek
```

Open the printed local URL in the side browser. Select source or PDF text, add comments and click **Send**.

For main-chat forwarding, run once:

```sh
python plugins/latex-codex/scripts/install_deepseek_bridge.py
```

Then launch the editor from your DeepSeek main chat. Add comments and choose **Send to DeepSeek main chat**. Keep the extracted folder: the bridge configuration references its module. See [AGENTS.md](AGENTS.md) for setup and maintenance.

This is a separate prerelease. The existing Codex version remains available in [Releases](https://github.com/Fr0zenWatter/codex-latex-editor/releases).
