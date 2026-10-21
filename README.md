[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX in AI Sidebar

**Your LaTeX workspace inside your AI app.**

Bring the final step of research into your AI app's sidebar: write LaTeX and Markdown, discuss passages and formulas, and review AI edits alongside a local preview.

Supports **Codex** and **DeepSeek Harness** through separate plugins. Claude integration is planned. Formerly **codex-latex-editor / LaTeX Codex**.

- Select source text or box-select PDF text and formulas, add internal annotations and click **Send** for AI suggestions. Review each change with **Keep / Undo** in source and PDF, or **Accept all**.
- Discuss your paper in floating project chat, with model and reasoning controls, writing styles and Markdown reply notes. Enable **”** for clickable paper quotations and PDF links.
- Select chat text to quote it in a follow-up or open a nested sidebar discussion. Switch branches in the horizontal conversation tree while keeping the main chat visible.
- Preview Markdown live, compile PDFs with your existing TeX installation, and revisit autosaved source and PDF history.

Ask Codex: **Use latex-codex to open main.tex**, or launch directly:

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

Open the printed local URL in the side browser. Select source or PDF text, add comments and click **Send**.
Drag one `.tex`, `.md` or `.markdown` file onto the editor or preview to open the original. If the browser hides its path, use **File → Open file**.

Use **latex-codex** for Codex or the independent **latex-deepseek** plugin for DeepSeek Harness. Existing installation commands and local history remain compatible. See [AGENTS.md](AGENTS.md) for installation and maintenance.

## Demos

All demos include English and Chinese subtitles. Click an image to view the GIF at full size or watch the full video.

### Annotations (main chat)

Select source text, click the annotation icon, and save your requests. Send them together in the main Codex chat.

[![Watch the main chat annotation demo](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### Internal annotations (kept out of the main chat)

**Box selection.** Select text or box-select formulas and passages in the PDF to locate their source and add an internal annotation. Right-click to add a comment, or enable automatic comments after box selection in settings.

[![Box selection and internal annotations](docs/media/01-internal-annotations.gif)](docs/media/01-internal-annotations.gif)

**AI editing and Proofread.** Enter your request and click **Send**, then review the red/green changes in source and PDF. **Keep** saves each change; **Undo** preserves the original. Toggle source and PDF proofreading separately under **gear**, or enable **Project change review** for edits made by the main chat or external tools.

[![AI editing and source/PDF Proofread](docs/media/02-internal-proofread.gif)](docs/media/02-internal-proofread.gif)

Choose prompt instructions with **Style** in the annotation toolbar. To mark edits for reviewers, choose **gear → Replacement color**.

### Paper citations and side conversations

Enable **”** in floating project chat to get clickable paper citations. Follow a citation to locate the original passage in source and PDF. Switch between the chat bubble, compact bar and full conversation as you read.

[![Paper citations and chat display modes](docs/media/04-cite-chat.gif)](docs/media/04-cite-chat.gif)

Select chat text to add a quoted annotation or ask in a side conversation. Keep following up in nested branches while the main chat stays visible. Toggle the conversation tree to switch, rename or delete branches with confirmation; drag the divider to resize the two panes.

[![Citation navigation and nested side conversations](docs/media/05-cite-branches.gif)](docs/media/05-cite-branches.gif)

### Local history

Edits are saved automatically. Compare source changes and the PDF before and after, then restore a previous version.

[![Source and PDF history comparisons](docs/media/03-local-history.gif)](docs/media/03-local-history.gif)

### Editing and personalization

- **Editor features:** Standard editing by default, with optional Vim and Emacs modes, syntax highlighting, command completion, and inline formula previews.
- **Interface language:** Supports multiple languages and follows your system language, falling back to English. Choose a language manually via **gear → Language**.
- **Themes:** Switch between built-in light and dark themes, or upload or paste a screenshot to generate and save a custom color theme.

### Markdown → PDF

Open `.md` or `.markdown` notes with live preview. Click **PDF preview** to compile tables, equations and TikZ diagrams using your local TeX engine. Markdown also supports source ↔ PDF navigation, AI annotations and history comparisons.

[![Watch the Markdown compilation demo](docs/media/05-markdown.gif)](docs/media/05-markdown.mp4)

See [Releases](https://github.com/Fr0zenWatter/latex-in-ai-sidebar/releases) for version updates. To subscribe, choose **Watch → Custom → Releases** on GitHub.
