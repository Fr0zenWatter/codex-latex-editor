[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex — LaTeX and Markdown in the Codex Sidebar

**Keep your papers and notes beside your Codex conversation.** LaTeX Codex opens your source and preview in the Codex app's right sidebar. Collect annotations, send them together in the main chat, and review the results beside the conversation.

Once installed, just ask: **“Use latex-codex to open main.tex.”** Edit directly or tell Codex what to change; your files save automatically and the PDF updates using your local TeX engine. Built-in history snapshots let you restore earlier versions and compare source and PDF changes.

## Markdown and Obsidian

Open `.md` or `.markdown` notes by asking: **“Use latex-codex to open my-note.md.”**

- **Live preview:** Formulas, lists and tasks, tables, code blocks and local images, including Obsidian `![[image.png]]` embeds.
- **Editing:** Automatic saving, source history and AI selection edits without adding LaTeX color commands to Markdown.
- **PDF preview:** Render callouts and TikZ with local XeLaTeX, then use PDF navigation, annotations and history comparisons. Click **Live preview** to return to the HTML view.

See [what's new in 0.2.7](CHANGELOG.md).

## Demos

Click a preview to watch the full video. All demos include English and Chinese subtitles.

### Annotations (main chat)

Select source text, click the annotation icon, and save your requests. Send them together in the main Codex chat.

[![Watch the main chat annotation demo](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### Temporary annotations (kept out of the main chat)

Select a word, a paragraph, or text with equations in the PDF. Add comments and let Codex revise those passages, with the source and PDF updating together.

In **Select text** mode, drag from a blank area of the PDF page to box-select text or formulas, then right-click to add a comment. Dragging on text keeps ordinary text selection; **Esc** clears the box selection.

Choose a color under **gear → Replacement color** to mark actual annotation edits with LaTeX `\color`, making changes easy to spot in the PDF. Select **None** to turn color marking off.

[![Watch the annotation editing demo](docs/media/03-pdf-comments.gif)](docs/media/03-pdf-comments.mp4)

### LaTeX ↔ PDF

In hand mode, double-click the PDF to find its source. Double-click a line number or click the middle **→** to jump back to the PDF. The chapter wheel helps you move through longer documents; setting `main.tex` enables navigation across `\input` / `\include` files.

[![Watch the navigation demo](docs/media/01-navigation.gif)](docs/media/01-navigation.mp4)

### Local history

Edits are saved automatically. Compare source changes and the PDF before and after, then restore a previous version.

[![Watch the history demo](docs/media/02-history.gif)](docs/media/02-history.mp4)

### Editing and personalization

- **Editor features:** Standard editing by default, with optional Vim and Emacs modes, syntax highlighting, command completion, and inline formula previews.
- **Interface language:** Supports multiple languages and follows your system language, falling back to English. Choose a language manually via **gear → Language**.
- **Themes:** Switch between built-in light and dark themes, or upload or paste a screenshot to generate and save a custom color theme.

## Get started

1. Download this repository and open its folder in Codex.
2. Ask Codex: **“Install latex-codex following [AGENTS.md](AGENTS.md).”**
3. Start a new chat and say: **“Use latex-codex to open main.tex.”** You can also provide your document's path.

Edits save directly to your original `.tex`, `.md` or `.markdown` files.
