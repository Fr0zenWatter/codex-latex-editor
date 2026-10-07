# Changelog / 更新日志

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
