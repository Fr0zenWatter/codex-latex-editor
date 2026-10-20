# Changelog / 更新日志

## Unreleased / 未发布

- Rename the project to **LaTeX in AI Sidebar** (formerly **codex-latex-editor / LaTeX Codex**) and introduce the AI sidebar workflow in both READMEs. Codex and DeepSeek Harness are supported; Claude integration is planned.
- Refresh plugin display names, editor titles and repository links. Keep plugin IDs, marketplace identity, installation commands, preferences and project history compatible.

项目更名为 **LaTeX in AI Sidebar**，突出 AI 侧边栏中的论文写作、修改与校对；保留原有安装入口、偏好与历史。此项记录尚未发布，不改写已有版本或标签。

## 0.3.8-deepseek.4 — 2026-10-20

- Resolve the DeepSeek skill's `scripts/editor.py` launcher explicitly and verify the served backend before opening or reusing an editor.
- Redirect direct execution of the packaged `runtime/editor.py` to the DeepSeek launcher, preserving document arguments, working directory and session environment instead of starting the shared Codex default.

修复从 DeepSeek 启动时误选共享运行模块而打开 Codex 后端的问题。技能明确正确入口，新包兼容误用的旧启动路径，两种入口均固定使用 DeepSeek。

Validation / 验证：standalone packaging and both installed entry paths passed on Windows, including rejecting Codex and preserving the Harness session. All 405 distributed files matched the ZIP by SHA-256. A live Harness-launched editor reported `data-ai-backend="deepseek"`, with its session linked and bridge available; no model request or main-chat message was sent. macOS/Linux hardware was not retested.

## 0.3.8-deepseek.3 — 2026-10-19

- Prevent corrupted citation URLs: give DeepSeek short reference IDs, then verify and restore complete source / PDF links in code before saving or displaying the answer. Compact historical assistant links too, while preserving source, selections and user requests.
- Recover legacy links with damaged context only when the project, file, complete quotation, range and line still match the current source exactly. Unknown IDs and invalid targets fail before applying a reply.

修复 DeepSeek 抄写长编码导致“引用链接无效”；保留已经保存的完整链接格式，并核实当前原句以恢复可验证的旧链接。

Validation / 验证：adapter, shared chat, reference / real PDF navigation and independent package checks passed on Windows. A real Harness account-model request returned two 21-character tool IDs that were restored to verified 994/1020-character URLs. The reported four links were checked against the current manuscript without editing it. macOS/Linux hardware was not retested.

## 0.3.8-deepseek.2 — 2026-10-19

- Enable the existing quotation toggle for DeepSeek TeX project chat. Use the same read-only `cite_tex` MCP server and verified source / PDF links as native Codex; encourage citations for specific paper passages.
- Keep every other tool blocked, and leave Markdown, inline completion and history summaries tool-free. Validate citation call/result pairs and reject failed, truncated or foreign tool events. Temporary quote snapshots and MCP configuration are removed after the request.

DeepSeek 打开引用开关后可主动生成论文原句定位链接；其他工具仍禁用。原生版本号保持 `0.3.8`。

Validation / 验证：DeepSeek adapter, tool boundary, shared chat, quotation / real PDF navigation and standalone package checks passed on Windows. A separate Harness account-model test called the real quotation tool and returned a verified link; no existing main chat was messaged. macOS/Linux hardware was not retested.

## 0.3.8 / 0.3.8-deepseek.1 — 2026-10-19

- Keep the compact chat bar open when clicking source or PDF text. Preserve the conversation reading position across expanded, compact, bubble and hidden states; newly received replies remain visible when reopening.
- Preserve the visible source text and PDF page position when resizing the window/sidebar or moving the source/PDF divider. Compensate for rewrapped source-line measurements, retain document identity guards and avoid PDF rescaling for height-only changes.
- Rebuild the independent DeepSeek package from the same shared editor snapshot. Native Codex is `0.3.8`; DeepSeek is `0.3.8-deepseek.1`, with separate plugin names, AI backends and installation locations.
- Add a portable DeepSeek ZIP builder and installation guide. Include all required runtime assets and licenses while excluding papers, credentials, history databases, development tests and Python caches.

修复悬浮栏自动收起及聊天滚动位置丢失；窗口、侧边栏和分界线调整后保留源码与 PDF 阅读位置。Codex 和 DeepSeek 使用同一份共享编辑器快照，分别发布为 `0.3.8` 和 `0.3.8-deepseek.1`，并提供可独立运行的 DeepSeek 打包流程。

Validation / 验证：shared UI/chat regressions, HTTP serving and standalone plugin packaging checks passed on Windows. Divider dragging was checked in the browser; sidebar/window geometry changes were simulated. No real model request or main-chat message was sent; macOS/Linux hardware was not retested.

## 0.3.7 — 2026-10-18

- Show PDF proofreading with dark text, pale red/green row backgrounds and deeper backgrounds for actual changes. Join adjacent changed words across spaces, while keeping separate lines and unchanged text distinct.
- Separate original and proposed prose into temporary preview paragraphs. Keep applies only the original replacement and never writes preview layout or markup to the document.
- Add **Undo all** beside **Accept all** for the current file. Preserve accepted/manual edits, unsent annotations and other files; validate versions and baselines before reverting external edits.
- Harden PDF markup around math selections, scripts, unbraced arguments, text inside math, table/environment parameters, accents and numeric primitives. Use a clearly identified unmarked revised preview when safe decoration is unavailable; invalid replacements still fail without modifying source or the formal PDF.

新增 PDF 校对两级背景及连续改词色块、预览分段和“全部 Undo”；修复公式与命令参数边界，增加安全回退，保留正式文稿结构和待确认建议。

Validation / 验证：28 boundary cases passed with each of pdfLaTeX and XeLaTeX (56 cases total), including fallback, invalid-replacement rejection and source/formal-PDF preservation. Targeted chat, project review, PDF geometry, UI and locale checks passed on Windows. macOS/Linux hardware was not retested; arbitrary custom macros may require the unmarked preview fallback.

## 0.3.6 — 2026-10-18

- Require the editor service to launch directly on the host, outside the agent sandbox, from its first launch. Prohibit sandboxed trial runs and fallbacks; report unavailable or denied host execution without changing global sandbox/network settings.
- Route explicit install/update requests, including “更新 latex-codex”, to an on-demand workflow. Resolve the requested GitHub source, replace stale marketplace registrations with failure recovery, and verify the actual installed path and distributed files by SHA-256 before reporting success.
- After an update, launch a fresh host-side service from the verified installation while preserving existing drafts and annotations. Keep ordinary document opening separate from plugin updates and retain the compact startup skill.
- Give this release a distinct native plugin version; keep the existing v0.3.5 tag and independent DeepSeek version unchanged. The Emacs shortcut fixes from 0.3.5 remain included.

明确要求编辑器首次启动就在宿主机沙盒外运行，禁止沙盒内试跑或回退；新增按需更新流程，处理旧市场绑定、失败恢复与真实安装文件核验。原生版本递增至 0.3.6，不再覆盖 0.3.5；保留已有 Emacs 快捷键修复。

Validation / 验证：skill metadata, reference paths and diff whitespace checked; local native installation verified against all 449 distributed files by SHA-256. No runtime code changed. Isolated-sandbox behavior and update-failure recovery were not exercised end to end.

## 0.3.5 — 2026-10-13

2026-10-18 startup guidance fix / 启动说明修复：

- Use a permitted persistent host-side launch when sandbox loopback isolation prevents browser access, respecting host permissions without changing sandbox or network settings.
- Finish after the browser-open request is accepted, including queued tabs, and report only confirmed state. Blocked browser inspection alone does not justify restarting the service; reading a file does not verify HTTP access or page rendering.

补充回环隔离时的启动方式，避免把浏览器检查受限误判为服务故障；页面打开请求被接受后结束，仅报告已确认状态。版本号保持 0.3.5。

Validation / 验证：startup skill content, reference paths and diff whitespace checked. Prompt-only change; isolated-sandbox behavior was not tested.

2026-10-16 updates / 补充更新：

- Reduce the startup skill from about 77 KB to 3.1 KB, retaining detailed editor instructions in an on-demand reference. Open the editor directly without routine environment/login checks or preloading the full guide.
- Keep Emacs Ctrl+F / Ctrl+E movement, Ctrl+S / Ctrl+R search and Ctrl+Q prefixes intact. Disable plugin search/chat interception and Ctrl-based source-to-PDF shortcuts in the Emacs source editor; retain the forward button, non-Ctrl shortcuts and Standard/Vim bindings.

精简启动技能，将详细操作说明移至按需参考；修复 Emacs 模式下搜索、定位及聊天快捷键对原生 Ctrl 操作的覆盖。版本号保持 0.3.5。

Validation / 验证：UI, search, chat and HTTP connection reuse checks passed; skill metadata and reference paths validated. Full model-to-browser startup time was not benchmarked.

2026-10-15 toolbar fix / 顶部栏修复：

- Keep toolbar status messages on one line with ellipsis, including narrow windows. Long compilation errors no longer expand the toolbar; full errors remain in the compilation log.

顶部状态提示保持单行，超长部分显示省略号，避免报错撑高工具栏；完整报错仍可在编译日志中查看。版本号保持 0.3.5。

Validation / 验证：UI checks and 12 browser layout scenarios passed, covering long English/Chinese errors, unbroken strings, narrow windows and queued annotation controls.

2026-10-15 update / 补充更新：

- Reuse HTTP/1.1 loopback connections for editor assets, state reads and saves, reducing fresh client-port allocations that can be rejected by Windows NAT port filters.
- Close error responses so an unread rejected request body cannot be parsed as the next request on a reused connection.

启用 HTTP/1.1 连接复用，减少页面加载时新建连接的次数；错误响应关闭连接，避免未读取的请求体干扰后续请求。版本号保持 0.3.5，不修改系统端口或防火墙设置。

Validation / 验证：HTTP connection reuse/error framing, Markdown and real TeX/BibTeX/SyncTeX integration checks passed on Windows. macOS/Linux hardware was not retested.

2026-10-14 update / 补充更新：

- Enable the read-only `cite_tex` tool with the floating conversation’s **”** toggle. The toggle remains highlighted while enabled; discussion of paper passages encourages verified links with theorem names or sentence text, including inline math. Links select source and navigate to PDF, with project/source/version guards.
- Split AI suggestions and external reviews into at most three short paragraphs per block; paragraphs over 400 source characters stand alone. Preserve complete TeX structures and independent Keep / Undo.
- Add **Accept all** as a floating capsule at the source pane’s upper-left corner. Accept the current file’s generated AI suggestions and external reviews, preserving unsent comments and other files’ pending changes. Validate stale ranges/baselines and retain unaccepted suggestions on failure.
- Remove the redundant follow-up/memory reminder after ordinary chat replies.

新增论文引用定位工具、分段校对及源码栏左上角“全部接受”；清理冗余聊天状态提示。版本号保持 0.3.5。

Supplemental validation / 补充验证：12 targeted checks passed on Windows for quotations, tool gating, chat, paragraph reviews, bulk acceptance, real TeX/PDF navigation and preview, UI, settings, Markdown and standalone plugin packaging. Browser behavior was also checked using synthetic test documents. macOS/Linux hardware was not retested.

- Replace the project chat sidebar with a movable floating conversation, including compact and expanded views, pinning, a persistent temporary chat bubble enabled by default, width/height controls, Ctrl+Q toggling and Ctrl+wheel text sizing. Preserve an explicitly saved off preference.
- Allow project questions without a source selection; force these replies to leave the source unchanged. Keep selected-text edits and per-change Keep / Undo.
- Render floating chat, saved chat history and annotation replies with literal macros from the paper, using the existing bounded macro parser. Main-file drafts supply their current definitions; included files use the main document. Cache definitions by source and isolate each reply's macro dictionary.
- Export individual saved AI replies to a localized Markdown notes file in the project directory, preserving formatting and checking the project/message identity. Repeated exports of the same reply are deduplicated.
- Add a TEMP icon for sending only the current annotation directly, retaining other queued annotations, saved writing styles and the existing review flow.
- Add original, black, gray, straw and green PDF reading backgrounds, saved across documents without modifying the PDF or its download.
- Open a single dropped `.tex`, `.md` or `.markdown` file through the existing file-switch flow when the browser supplies its original path. When the browser hides it, retain the current file and direct the user to the file menu.

新增浮动项目对话及无选区问答、单条 AI 回复的 Markdown 记录、当前批注直接发送、PDF 阅读底色和文件拖入打开。原生插件保持 Codex 后端；DeepSeek 保留独立版本。

Validation / 验证：14 targeted Python/JavaScript checks passed on Windows, covering project chat/export, history, preferences, editor/compile, UI, Markdown, proofreading, inline completion and standalone plugin packaging. AI calls and browser interactions use test doubles; no real model request or main-chat message was sent. The bundled SVG was inspected for content and external references. macOS/Linux hardware and live browser drag-and-drop have not been tested.

Additional macro-rendering fix / 宏渲染补充修复：6 targeted checks passed for Markdown/KaTeX, paper macro parsing, floating chat/history, main/child-file context, local editor compilation and plugin packaging. The regression reproduces an unknown paper macro before the fix and verifies inline/display math, parameters, operators, code isolation, changed definitions and no cross-document leakage. Only literal declarations supported by the existing parser and KaTeX are imported; TeX packages, conditional definitions and optional-default macros still require the PDF compiler.

## 0.3.4 — 2026-10-11

- Add optional AI inline completion with independent model and reasoning settings. Suggestions stay outside the source until accepted with Tab; Esc dismisses them. Use bounded cursor context, read-only ephemeral calls, cancellation and completed-turn validation.
- Compile after a full three-second typing pause. Preserve the current file, cursor and scroll position on errors; pause automatic compilation until a manual compile or save shortcut, and navigate to error lines only when requested.
- Complete common LaTeX commands with required argument braces and an insertion cursor. Add a configurable source-to-PDF shortcut, defaulting to Ctrl+E across normal, Vim and Emacs modes.
- Render project chat and annotation replies as sanitized Markdown with KaTeX formulas, and allow resizing the project chat panel.
- Coalesce PDF box dragging by animation frame. Improve numeric list selection and use compiled positions as an explicitly approximate fallback when text or formula matching fails, retaining source/PDF version checks and complete boundaries.
- Preserve valid bibliography caches and restore auxiliary files after ordinary source errors. Run BibTeX by job basename in the temporary build directory for TeX Live/MacTeX output restrictions; stage explicit relative bibliography/style inputs and clean them after success, failure or timeout.
- Store Windows preferences in the standard local application data directory, migrating readable legacy settings and recovering when the legacy directory is inaccessible.

新增可选 AI 行内补全、命令参数补全和可配置 Ctrl+E 定位快捷键；改进自动编译、错误跳转、聊天公式显示、聊天栏宽度和 PDF 选区定位。修复文献缓存、BibTeX 临时路径及 Windows 设置保存问题。DeepSeek 保留独立版本。

Validation / 验证：17 targeted Python/JavaScript checks passed on Windows, including real local TeX/PDF mapping, Biber/BibTeX, history/proofread previews and standalone plugin packaging. CLI completion calls are mocked; no real model request or main-chat message was sent. MacTeX discovery and TeX Live output restrictions are simulated; macOS/Linux hardware has not been tested. Diff and new-file whitespace checks passed.

## 0.3.3 — 2026-10-09

- Automatically run Biber for the current biblatex `.bcf` build job, followed by two TeX passes, without changing `backend=biber`. Keep the existing BibTeX workflow.
- Reuse unchanged bibliography results and refresh the live PDF when project-local `.bib` / `.bst` inputs change. Preserve relative bibliography paths and temporary build outputs.
- Report missing or failed processors and retain the last successful PDF. Recover from incompatible temporary bibliography auxiliaries when switching packages.
- Include bibliography dependencies in history/proofread overlays before the first successful live compilation, and reject proofreading results when bibliography inputs change during generation.

自动支持 `backend=biber` 文稿，解析引用并生成参考文献；项目内文献修改会刷新预览。兼容 BibTeX 和相对路径，失败保留正常 PDF，并补上首次历史／校对预览的文献依赖。

Validation / 验证：Windows with MiKTeX 26.5 and Biber 2.21; real plugin UI and PDF output verified. Regression checks cover fresh builds, cache reuse, bibliography/citation/style changes, relative paths, both TeX engines, history/proofread previews, BibTeX compatibility and safe failures. macOS tool discovery is simulated; macOS/Linux hardware has not been tested.

## 0.3.2 — 2026-10-09

- Keep the native `latex-codex` plugin on Codex and move the optional Harness adapter into the independently installed `latex-deepseek` plugin. The DeepSeek package uses a generated, self-contained runtime and retains its own version.
- Improve PDF text and box selection with compiled row geometry, nearby source lookup and context for repeated text. Verify theorem headings and proof endings before matching formula-heavy prose; reject ambiguous and incomplete selections.
- Show the chapter timeline as fixed nodes across the preview height, with compact titles, keyboard navigation and PDF scrolling.
- Shorten both READMEs and document installation, packaging and maintenance in `AGENTS.md`.

原生 `latex-codex` 保持 Codex 后端，DeepSeek 适配拆为独立插件并保留独立版本；改进 PDF 拖选、框选与定理正文定位，章节时间线改为固定节点布局。安装与维护说明集中在 `AGENTS.md`。

Validation / 验证：6 Python checks and 7 JavaScript checks passed, covering local TeX compilation, PDF mapping, UI interactions, native backend isolation and standalone DeepSeek packaging. No real model request or main-chat message was sent.

## 0.3.1-deepseek.1 — 2026-10-08 (prerelease)

- Add `--ai-backend deepseek` for Send, project chat and history summaries through the installed DeepSeek Harness CLI. Preserve local source/PDF previews and per-change Keep / Undo.
- Discover Harness account and API models and their supported reasoning levels. Parse complete final responses, validate every replacement and prevent selection requests from executing tools.
- Add optional forwarding of saved comments to the exact DeepSeek main chat that launched the editor, using a user-profile bridge. Check saved source and version, retain failed comments and reuse request identities on retry.
- Keep Codex as the default backend; hide its native annotation button in DeepSeek mode.

Verified on Windows with DeepSeek Harness 0.2.0-rc.2: a real account-model Send request and local PDF compilation. Main-chat bridge loading and status are verified; submission to an existing user chat remains for a user click. Other platforms have not been tested on hardware.

本版本独立预发布。Send 已接入 DeepSeek，源码和 PDF 校对沿用现有 Keep / Undo；可选主对话桥接绑定启动会话，不按最近记录选择。已实测 Windows 账号模型请求及本地 PDF 编译，主对话实际送达仍需用户从目标对话启动后点击验证。

## 0.3.0 — 2026-10-08

### English

- Review AI annotation suggestions with red/green source cards and independent **Keep / Undo** actions. Keep saves one change and its annotation history; Undo preserves the original. Failed saves retain the suggestion for retry, and pending suggestions protect document switching and external conflicts.
- Preview LaTeX suggestions in a temporary red/green PDF, with Keep / Undo beside each change. Preview compilation preserves real source, the regular PDF / SyncTeX and history. Editor and PDF proofreading have separate settings, enabled by default; Markdown uses editor proofreading only.
- Add optional **Project change review** for main-chat and external edits to project `.tex` files, including child files. Pending changes survive refreshes and restarts, support per-change Keep / Undo and preserve unrelated manual edits. This setting defaults to off; external changes are reviewed after they reach disk.
- Add a **Style** selector to the comment toolbar: English and Chinese Tao Compact / Shelah Compact presets, plus UTF-8 `.txt` / `.md` prompt import. Remember the default across documents and retain a separate style snapshot for each comment; the current edit request takes priority.
- Hold **Alt + Space** and drag in PDF Select text mode to zoom around the initial pointer, from 30% to 500%; Space alone pans. Finish with a sharp render and cancel safely when keys are released, focus is lost or the PDF changes.
- Improve PDF source matching for directly declared `\newtheorem` environments and `proof`, including generated headings, numbering and proof endings. Ambiguous or incomplete selections still require source selection.
- Enable automatic opening of the comment composer after successful box-selection mapping by default. Existing explicit preferences are preserved; opening the composer does not send an AI request.
- Document proofreading, writing styles, PDF gestures and GitHub release subscriptions in both READMEs.

Validation: 8 Python checks and 10 JavaScript checks passed, including local PDF compilation, source preservation, per-change review, shared preferences, project files, SyncTeX, Markdown PDF conversion and history comparisons. `git diff --check` passed.

### 简体中文

- AI 批注建议以红绿源码卡片显示，逐处 **Keep / Undo**。Keep 保存该处修改及批注历史，Undo 保留原文；保存失败保留建议供重试，未处理建议继续保护文件切换与外部冲突。
- LaTeX 建议生成临时红绿 PDF，每处修改旁提供 Keep / Undo。预览保留真实源码、正式 PDF / SyncTeX 及历史；编辑器与 PDF 校对分别开关，默认开启。Markdown 仅使用编辑器校对。
- 新增可选的**项目修改校对**，审阅主对话或外部工具对项目 `.tex`（含子文件）的修改。待确认修改在刷新与重启后保留，支持逐处 Keep / Undo，并保留无关手动编辑；默认关闭，外部修改写入磁盘后才进入校对。
- 批注工具栏新增 **Style**，提供 Tao Compact / Shelah Compact 中英文预设，以及 UTF-8 `.txt` / `.md` 提示词导入。默认风格跨文稿记忆，每条批注保留自己的风格快照，当前修改要求优先。
- PDF 选字模式中按住 **Alt + 空格**拖动，以按下位置为中心连续缩放，范围为 30%–500%；空格单独拖动页面。松开后补清晰渲染，释放按键、失焦或替换 PDF 时安全结束手势。
- 改进直接声明的 `\newtheorem` 与 `proof` 环境的 PDF 源码定位，核对自动标题、编号及证毕符号；歧义或不完整选区仍需在源码选择。
- 成功框选定位后，默认自动打开批注框；保留用户已有的显式设置，弹出批注框不会自动发送 AI 请求。
- 中英文 README 补充校对、写作风格、PDF 手势和 GitHub 新版本订阅入口。

验证：8 组 Python 检查与 10 组 JavaScript 检查通过，覆盖本地 PDF 编译、源码保留、逐处校对、共享偏好、项目子文件、SyncTeX、Markdown PDF 转换及历史对比；`git diff --check` 通过。

## 0.2.7 — 2026-10-07

### English

- Open UTF-8 `.md` and `.markdown` files, including Obsidian notes, in the existing editor. Live HTML preview supports math, lists and tasks, tables, fenced code and local images, including `![[image.png]]` embeds.
- Save notes automatically and reuse source history, Vim/Emacs editing, search, source annotations and AI selection edits. Markdown replacements preserve Markdown without inserting LaTeX revision-color commands.
- Switch to PDF preview to compile notes with local XeLaTeX. The converter handles YAML frontmatter, callouts, wikilink display text and TikZ blocks, and keeps source line mapping for PDF navigation, annotations and history comparisons. Opening and compiling preserve the original note bytes; converted TeX and copied images stay in the temporary build directory.
- Add an optional setting to open the PDF comment composer automatically after successful box-selection mapping. It defaults to off and is remembered across documents. Opening the composer does not send an AI request.
- Improve PDF history highlighting: keep Chinese sentences separate, respect Markdown paragraph and heading boundaries, exclude body page numbers, and avoid reporting line-wrap text splitting as a content change.
- Refresh the version-history demo and document the new Markdown workflow in both READMEs.

Validation: 12 Python checks and 13 JavaScript checks passed, including Markdown conversion, local PDF compilation, SyncTeX, history comparisons, annotations and preferences.

### 简体中文

- 在现有编辑器中打开 UTF-8 `.md` 和 `.markdown`，包括 Obsidian 笔记。实时 HTML 预览支持公式、列表与待办、表格、代码块和本地图片，包括 `![[image.png]]` 引用。
- 笔记自动保存，沿用源码历史、Vim/Emacs、搜索、源码批注和 AI 选区修改。Markdown 修改保持原格式，不插入 LaTeX 修订颜色命令。
- 切换到 PDF 预览后，使用本地 XeLaTeX 编译笔记。转换支持 YAML frontmatter、定理框与提示框、双链显示文本和 TikZ，保留源码行号映射，沿用 PDF 双向跳转、批注和历史对比。打开和编译保留原笔记字节；临时 TeX 和图片副本只在构建目录生成。
- 新增“框选后自动弹出 PDF 批注对话框”设置，成功定位源码后可直接填写批注。默认关闭，跨文稿记忆；弹出对话框不会自动发送 AI 请求。
- 改进历史 PDF 标红：中文句子保持独立，Markdown 按段落和标题划分边界，忽略正文页码及换行导致的文字拆合，减少无关标红。
- 更新历史功能演示，并在中英文 README 中集中介绍 Markdown 用法。

验证：12 组 Python 检查和 13 组 JavaScript 检查通过，覆盖 Markdown 转换、本地 PDF 编译、SyncTeX、历史对比、批注与偏好设置。
