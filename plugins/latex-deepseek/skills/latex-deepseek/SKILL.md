---
name: latex-deepseek
description: Open local LaTeX or Markdown in the LaTeX DeepSeek editor when the user requests DeepSeek Harness or this plugin. Uses the installed signed-in Harness CLI for AI edits, project chat and history summaries.
---

# LaTeX DeepSeek

Use `../../scripts/editor.py` relative to this skill directory. This launcher always uses DeepSeek Harness. Native Codex users use the separate `latex-codex` plugin.

Launch `<python-interpreter> -u <absolute-editor.py> <absolute-document>` in a persistent shell session, then open its printed loopback URL in the requested application's side browser. Use Python 3.10+ (`python` on Windows, usually `python3` elsewhere). Reuse a server already started for this file in this chat. The file may be `.tex`, `.md` or `.markdown`; add `--project-root <folder>` when the main file and appendices need a common root. Keep the main compilation file fixed when editing included sources.

An installed package includes its editor and browser resources; it does not need the native Codex plugin or a checkout. If launching from an unbuilt source checkout reports missing resources, run `python scripts/build_deepseek_plugin.py` from the repository root and retry. Install or update only `latex-deepseek@latex-codex-shared` for Harness; its version and update identity are independent of `latex-codex`.

LaTeX compiles with the existing local TeX installation and SyncTeX; do not install missing TeX dependencies automatically. Markdown defaults to live HTML preview, with an optional XeLaTeX PDF preview. The editor autosaves the real source and shares project history in `.latex-codex/history.sqlite3`. Source changes made outside the editor synchronize only when there are no pending edits; preserve drafts and resolve conflicts before reloading. Before modifying a document from the main chat, inspect the running service's `/project-review`; when enabled, submit the current `{action:"propose",path,version,source}` there to retain the review baseline.

PDF text selections and box selections use verified source matching. Source/PDF navigation is unavailable while a temporary proofread PDF is shown. Ordinary **Send** generates local suggestions: review each with **Keep / Undo**; only Keep saves it. A failed AI reply or compilation retains comments and proposals. Do not bypass the editor's stale-version, autosave or source-boundary checks.

Send, project chat and history summaries use `dsh headless` through the Harness login. Do not read credentials yourself or change global model settings. Model choices distinguish account and API routes; the default follows the **headless profile**, independently of the desktop session's selected model. Project chat has project-local saved memory; main-chat context is not automatically added. Requests run read-only, with tools excluded, and accept only complete validated final output. Do not replace this flow with a native Codex CLI call.

For optional **Send to DeepSeek main chat**, run this plugin's `scripts/install_deepseek_bridge.py` only when the user requests that bridge, and keep its installation directory available. Launch from the intended DeepSeek main chat so `DSH_SESSION_ID` binds the destination. The bridge checks the live session and workspace; never choose another conversation by recency or use headless resume to submit messages. The user clicks the forwarding button to send saved comments; acknowledgement clears only that batch, and failures retain it for a safe retry. Forwarding itself does not apply local source edits. Ordinary Send retains its own Keep / Undo flow.
