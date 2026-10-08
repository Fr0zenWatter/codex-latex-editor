# Changelog / 更新日志

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
