[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex — LaTeX and Markdown in the Codex Sidebar

**Keep your papers and notes beside your Codex conversation.** LaTeX Codex opens your source and preview in the Codex app's right sidebar. Collect annotations, send them together in the main chat, and review the results beside the conversation.

Once installed, just ask: **“Use latex-codex to open main.tex.”** Edit directly or tell Codex what to change; your files save automatically and the PDF updates using your local TeX engine. Built-in history snapshots let you restore earlier versions and compare source and PDF changes.

Supports `.md` and `.markdown` notes. Just say: **“$Latex codex open xx”**.

Also supports [DeepSeek Harness (preview)](https://github.com/Fr0zenWatter/codex-latex-editor/releases/tag/v0.3.1-deepseek.1).

## Demos

Click a preview to watch the full demo. All demos include English and Chinese subtitles.

### Annotations (main chat)

Select source text, click the annotation icon, and save your requests. Send them together in the main Codex chat.

[![Watch the main chat annotation demo](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### Temporary annotations (kept out of the main chat)

Switch between **Select text / Pan** above the PDF. In Select text mode, hold **Space** to pan, or **Space + Alt** and drag vertically to zoom. Box-select or drag directly over text, then right-click to add a comment. Settings can open comments automatically after box selection.

Review each suggestion in the source and a temporary red/green PDF preview. **Keep** saves that change; **Undo** preserves the original. Editor and PDF proofreading can be toggled separately under **gear**. Enable **Project change review** to review changes made by the main chat or external tools across project TeX files.

**Style** in the comment toolbar provides prompt instructions for your edits.

Under **gear → Replacement color**, add LaTeX `\color` to edits to show PDF changes to reviewers.

[![Watch the annotation editing demo](docs/media/03-pdf-comments.gif)](docs/media/03-pdf-comments.mp4)

### LaTeX ↔ PDF

In hand mode, double-click the PDF to find its source. Double-click a line number or click the middle **→** to jump back to the PDF. The chapter wheel helps you move through longer documents; setting `main.tex` enables navigation across `\input` / `\include` files.

In **Select text** mode, hold **Space** to pan, or **Alt + Space** and drag to zoom from 30% to 500%.

[![Watch the navigation demo](docs/media/01-navigation.gif)](docs/media/01-navigation.mp4)

### Local history

Edits are saved automatically. Compare source changes and the PDF before and after, then restore a previous version.

[![Watch the history demo](docs/media/02-history.gif)](docs/media/02-history.mp4)

### Editing and personalization

- **Editor features:** Standard editing by default, with optional Vim and Emacs modes, syntax highlighting, command completion, and inline formula previews.
- **Interface language:** Supports multiple languages and follows your system language, falling back to English. Choose a language manually via **gear → Language**.
- **Themes:** Switch between built-in light and dark themes, or upload or paste a screenshot to generate and save a custom color theme.

### Markdown → PDF

Open `.md` or `.markdown` notes with live preview. Click **PDF preview** to compile tables, equations and TikZ diagrams using your local TeX engine. Markdown also supports source ↔ PDF navigation, AI annotations and history comparisons.

[![Watch the Markdown compilation demo](docs/media/05-markdown.gif)](docs/media/05-markdown.mp4)

## Get started

1. Download this repository and open its folder in Codex.
2. Ask Codex: **“Install latex-codex following [AGENTS.md](AGENTS.md).”**
3. Start a new chat and say: **“Use latex-codex to open main.tex.”** You can also provide your document's path.

Edits save directly to your original `.tex`, `.md` or `.markdown` files.

See [Releases](https://github.com/Fr0zenWatter/codex-latex-editor/releases) for version updates. To subscribe, choose **Watch → Custom → Releases** on GitHub.
