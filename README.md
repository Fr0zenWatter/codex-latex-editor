[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex

Edit LaTeX and Markdown in the Codex side panel, with local previews, autosave and history.

- Source/PDF navigation, PDF text selection and formula box selection.
- **Send** proposes edits through your signed-in Codex; review each change with **Keep / Undo** in source and PDF.
- Model and reasoning controls, writing styles and project chat.
- Live Markdown previews and PDF compilation using your existing TeX installation.

Ask Codex: **Use latex-codex to open main.tex**, or launch directly:

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

Open the printed local URL in the side browser. Select source or PDF text, add comments and click **Send**.

DeepSeek Harness support is a separate optional plugin, **latex-deepseek**. Installing or updating LaTeX Codex keeps the native Codex backend. See [AGENTS.md](AGENTS.md) for installation and maintenance of either plugin.
