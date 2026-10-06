[English](README.md) · [简体中文](README.zh-CN.md)

**Interface language:** Follows your system language, falling back to **English**. Switch manually via **gear → Language**.

# LaTeX Codex — AI LaTeX Editor with PDF Preview

Write LaTeX in the **Codex sidebar**, with source and PDF side by side. Compile with **your local TeX engine** and ask Codex for precise edits where you need them.

## Demos

Click a preview to watch the full video. All demos include English and Chinese subtitles.

### AI edits with annotations

#### Annotations

Select a word, a paragraph, or text with equations. Add comments and let Codex revise those passages, with the source and PDF updating together.

[![Watch the annotation editing demo](docs/media/03-pdf-comments.gif)](docs/media/03-pdf-comments.mp4)

#### Main chat annotations

Select source text, click the annotation icon, and save your requests. Send them together in the main Codex chat, then review changes across files in History.

[![Watch the main chat annotation demo](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### LaTeX ↔ PDF

In hand mode, double-click the PDF to find its source. Double-click a line number or click the middle **→** to jump back to the PDF. The chapter wheel helps you move through longer documents; setting `main.tex` enables navigation across `\input` / `\include` files.

[![Watch the navigation demo](docs/media/01-navigation.gif)](docs/media/01-navigation.mp4)

### Local history

Edits are saved automatically. Compare source changes and the PDF before and after, then restore a previous version.

[![Watch the history demo](docs/media/02-history.gif)](docs/media/02-history.mp4)

Vim shortcuts, command completion, and inline formula previews are also included.

## Get started

1. Download this repository and open its folder in Codex.
2. Ask Codex: **“Install latex-codex following [AGENTS.md](AGENTS.md).”**
3. Start a new chat and say: `$latex-codex open main.tex`, or provide your document's path.

Edits save directly to your original `.tex` files.
