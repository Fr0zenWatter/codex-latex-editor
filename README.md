[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX in AI Sidebar

**Your LaTeX workspace inside your AI app.**

Bring the final step of research into your AI app's sidebar: write LaTeX and Markdown, discuss passages and formulas, and review AI edits alongside a local preview.

Ask Codex: **Use latex-codex to open main.tex**. For DeepSeek Harness, use **latex-deepseek**.

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
