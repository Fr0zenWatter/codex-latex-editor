---
name: latex-codex
description: Open LaTeX or Markdown in the local LaTeX Codex browser editor with local TeX or live Markdown preview. Also install or update this native plugin when requested, including "更新 latex-codex". Use this editor when project instructions select it.
---

# LaTeX Codex

For install/update requests, follow [the update workflow](references/update-guide.md). An ordinary document-open request does not update the plugin.

For an ordinary open request, launch and show the editor directly. Detailed feature instructions are optional; do not load them or inspect the implementation before opening a document.

## Open a document

1. Resolve the requested `.tex`, `.md` or `.markdown` path from the user's project. If omitted, use an unambiguous `main.tex`; ask only when the entry file is unclear. Preserve existing content. Reuse only a known host-side server already started for this document in this chat.
2. Use `../../scripts/editor.py` relative to this skill directory. Start Python in a persistent host shell **outside the agent sandbox**:
   ```text
   <python> -u <absolute-editor.py> <absolute-document>
   ```
   Use `python` on Windows or `python3` on macOS/Linux when available. Add `--project-root <absolute-common-root>` only when the main file and included sources need a shared root. Request a short initial tool yield when supported; read the printed loopback URL without waiting for compilation.
   **The first launch must already be outside the sandbox; never try a sandboxed launch or fall back to one.** Use per-command host/unsandboxed execution and any required approval when the tool defaults to sandboxing. If unavailable or denied, stop and report the blocker. Do not change global sandbox/network settings.
3. Immediately call `open_in_codex` with that URL, target type `browser`, and placement `right`. If unavailable, return the URL. The page initializes source and preview itself; PDF compilation can finish after the page opens.
4. Finish after the browser-open request is accepted, including `queued`; report only the confirmed state. Browser automation is not required for routine opening; blocked inspection alone is not evidence of a dead service and does not justify restarting it. File readability does not verify HTTP access, and a queued tab does not verify rendering. Do not repeat environment/login checks, inspect the whole project, run tests or browse documentation for a routine launch. If startup reports a missing interpreter or TeX tool, diagnose that specific failure. Codex's bundled Python is available through `load_workspace_dependencies` when needed.

## Preserve the editing workflow

- This native plugin uses Codex; DeepSeek has its own plugin. No npm, pip, Poppler or server installation is needed to open a document.
- Use this browser editor and local TeX when the project selects LaTeX Codex; do not substitute the built-in file preview/compiler. Markdown opens in live preview without TeX.
- Keep unsaved drafts, pending annotations and conflicts intact. Reuse the running editor's normal file-switch and synchronization flow. Do not overwrite either side of a conflict.
- Before main-chat source edits, check the running editor's `/project-review`. When enabled, submit the latest `{action:"propose",path,version,source}` there. Otherwise use normal file edits and let external synchronization pick them up.
- Compilation errors preserve source/cursor position; use the log's error-line button for explicit navigation. Missing TeX dependencies are reported, not installed automatically. Do not change global settings.

## Details only when needed

For questions or actions involving settings, annotations, chat, quotations, history, PDF selection, Markdown PDF, bibliography or keyboard controls, search [the editor reference](references/editor-guide.md) for that topic and read the relevant passages. This reference is not a startup prerequisite.
