# 项目约定

- README 写给使用者：只保留简短介绍、主要功能和最短用法。环境、安装命令和维护细节放在本文件。
- 插件源码在 `plugins/latex-codex/`，市场配置在 `.agents/plugins/marketplace.json`。修改仓库源码，不直接修改已安装的缓存副本。
- 不提交论文、实验备份、分享压缩包、文档历史数据库或凭据。

## LaTeX 默认打开方式

- 用户已指定本项目使用 LaTeX Codex。创建或修改 `.tex` 文稿后，默认按 `plugins/latex-codex/skills/latex-codex/SKILL.md` 的流程，在 Codex 右侧浏览器面板打开该文稿，使用本地 TeX 编译；用户明确要求内置编辑器时再使用内置编辑器。
- 同一文稿已有本对话启动的服务时复用，外部源码修改由编辑器正常同步；有未保存编辑或冲突时不得直接覆盖。切换文稿遵循插件的文件打开流程。
- 此约定控制代理的打开和编译流程，不替换应用自带的 `.tex` 文件预览入口。不要为此调用 `open_in_codex` 的文件目标或 `compile_latex_document`，应打开插件服务的浏览器 URL；不要修改应用内部文件或全局设置。

## 安装

先检查已登录的 Codex 桌面应用与 CLI、Python 3.10+、本地 TeX Live / MiKTeX / MacTeX。TeX 环境需提供 `xelatex` / `pdflatex`、`bibtex` 和 `synctex`。缺少依赖时说明缺项，不自动安装 TeX 环境或更改全局设置。前端资源已随插件附带，无需 npm、pip 或 Poppler 安装。PDF 页尺寸与文字位置由自带 PDF.js 读取，服务端只调用本地 TeX / SyncTeX。macOS 优先使用 PATH 中的 TeX，找不到时检查 `/Library/TeX/texbin`，不修改全局 PATH。Windows / Linux 的系统文件选择器使用可选的 tkinter；缺少时仍可通过启动命令打开文稿。macOS 使用系统原生文件选择器。

用户要求安装时，在仓库根目录执行：

```sh
codex plugin marketplace add .
codex plugin add latex-codex@latex-codex-shared
```

Windows 中 CLI 不在 PATH 时，优先使用当前桌面应用提供的 CLI：

```powershell
& $env:CODEX_CLI_PATH plugin marketplace add .
& $env:CODEX_CLI_PATH plugin add latex-codex@latex-codex-shared
```

安装后让用户新开对话，使用 latex-codex 打开指定的 `.tex` 文件。保持仓库目录可用，作为本地插件源。当前版本已在 Windows 验证；macOS 路径查找和文件选择器有模拟检查，仍需真机验证。迁移时复制仓库并在新电脑重新注册本地市场和安装插件，文稿相对依赖及 `.latex-codex/` 历史随项目目录一起复制。

安装机制参见 [官方文档](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)。

## 启动与数据

独立启动编辑器：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
# 主文件和附录分布在不同子目录时，指定共同的项目根目录
python plugins/latex-codex/scripts/editor.py /path/to/project/paper/main.tex --project-root /path/to/project
# macOS / Linux 通常使用 python3
```

同一启动命令也支持 UTF-8 `.md` / `.markdown`；默认在浏览器本地实时预览，不调用 TeX。支持常用 Markdown、代码块、表格、KaTeX 公式及 Obsidian `![[图片名.png]]` 引用；图片限于笔记目录或其 Obsidian 库内，实时预览允许 PNG/JPG/GIF/WebP/AVIF。点击“PDF 预览”使用本地 XeLaTeX，将笔记转换为行号对应的临时 TeX，跳过 YAML frontmatter，渲染 callout、双链显示文本和 TikZ 代码块，沿用 PDF 目录、SyncTeX 双向跳转、选字/框选批注、下载及历史 PDF 对比；点击“实时预览”切回 HTML。PDF 图片支持 PNG/JPG/PDF，其他格式显示提示；TikZ 需现有 TeX 环境提供相应包，缺少时不自动安装。打开和编译保留原笔记字节，转换文件和图片副本仅在构建目录中生成。自动保存、Vim/Emacs、搜索、源码批注、AI 修改和历史沿用现有流程；Markdown AI 修改不插入 TeX 颜色命令。HTML 渲染与定位在 `scripts/vendor/latex-markdown.{mjs,css}`，资源边界在 `scripts/markdown_source.py`；PDF 转换在 `scripts/obsidian_tex.py`，适配自用户提供的 LaTeX Sidecar 16.22.00。检查在 `test_markdown.py`、`test_markdown.mjs`、`test_markdown_pdf.py`、`test_highlight.cjs` 和 `test_ui.cjs`。

打开终端打印的回环地址；AI 功能使用已登录的 Codex CLI。完整操作说明见 `plugins/latex-codex/skills/latex-codex/SKILL.md`。

编辑会自动保存到当前源码文件；主编译文件保持固定。默认项目根目录是主文件所在目录，可在“文件 → 项目设置”或启动参数 `--project-root` 中指定包含正文和附录的共同目录。TeX 的相对引用仍从主文件所在目录解析。源码文件选择器和 PDF 反向跳转可打开项目内的 `\input` / `\include` 文件；历史与对话统一保存在项目根目录的 `.latex-codex/history.sqlite3`，源码历史保留项目相对路径，历史面板按时间统一显示主文件与所有子文件的记录；每条记录显示文件名，对比和恢复使用该记录所属的文件。项目内所有 UTF-8 `.tex` / `.md` / `.markdown` 源码在启动及状态轮询时记录，未打开的子文件修改也会被捕获。仅在查看历史“PDF 改动”时，将每处修改前后的 PNG 对比图（包含整句标红）存入 `.latex-codex/pdf-diff-cache/`；普通编译不保存完整 PDF 或 SyncTeX 存档。再次查看直接读图，缺失或损坏时按需编译生成；“重新编译”强制更新这一组对比图。跨页改动按页保存，新增或删除的一侧显示空白说明。缓存可删除，每项目上限 256 MiB，30 天未使用的存档在缓存读写时清理；源码历史不受影响。失败编译或未完成的渲染不覆盖已有对比图。旧版 `.latex-codex/pdf-cache/` 已停用，可删除。永久历史在同一项目数据库中记录各源码文件；子文件的历史 PDF 通过临时源码覆盖编译主文件，使用其余依赖的当前版本。切换源码前保存当前修改；未发送的批注或正在生成的回复需先处理。PDF 选区不可一次跨越多个源码文件。当前不支持 Biber。

## 维护

源码的 Ctrl+F / macOS Cmd+F 打开搜索替换面板，支持大小写、正则、整词与仅选区搜索，Enter / Shift+Enter 浏览匹配，Esc 关闭。默认不区分大小写、按普通文本搜索；选项按钮高亮表示开启，再次点击关闭，大小写与正则按钮的提示显示当前状态。替换通过 CodeMirror 的正常编辑与自动保存流程执行；全部替换为一次可撤销操作。实现位于 `plugins/latex-codex/scripts/vendor/latex-search.{mjs,css}`，检查覆盖 `test_search.mjs` 与 `test_ui.cjs`。PDF 右侧滚动手柄显示当前物理页码和总页数，默认宽度 26 px，较长页数自动撑开；无章节目录时仍保留页码与滚动，PDF 关闭时清除，检查覆盖 `test_outline.mjs`。

PDF 的“选字”模式保留文字上的原生拖选；从页面空白处按下左键拖动时，在起始页内框选文字或公式。框选按 PDF.js 字符几何位置判断，松开后才按页读取并缓存字符数据，拖动过程不调用 SyncTeX。右键“添加批注”沿用现有源码定位；公式优先核实编译位置并选中完整公式环境，行内公式也保留完整源码边界。框选正文要求明确匹配，不用编辑距离猜测被矩形漏掉的文字；无法匹配时扩大选框或在源码选择。Esc、切换拖动模式、缩放或替换 PDF 会清除框选。检查覆盖 `test_pdf_selection.mjs` 与 `test_ui.cjs`。历史 PDF 标红按完整句子展开，Markdown 同时以源码段落和标题为边界，跨图片后的下一段不并入前句；中文句号保留独立句子，换行造成的 PDF 文字片段拆合不算内容修改，正文页码不参与 Markdown 句子对比。检查覆盖 `test_history_pdf.py` 与 `test_markdown_pdf.py`。

用户界面偏好保存在用户目录的 `.latex-codex/preferences.sqlite3`，跨文稿和服务端口共享，包括语言、编辑模式、源码字号、目录样式、配色与自定义配色、修改标记色、修订色、自动编译、框选后自动弹出 PDF 批注对话框和分栏比例。设置即时应用并自动保存，设置菜单的“保存设置”确认写入；失败显示提示并保留待保存值。浏览器 localStorage 只作兼容缓存，首次使用优先沿用当前地址下的旧偏好。设置库不随插件分发或提交。

历史胶囊标签的 React / TypeScript 源码在 `plugins/latex-codex/frontend/`，使用 Tailwind CSS 与 shadcn 风格的 Radix Tabs。组件统一放在 `frontend/components/ui/`；`@/components/ui` 别名和 `components.json` 都指向这里，避免组件导入与 shadcn CLI 生成路径不一致。样式入口为 `frontend/styles.css`。

维护时在该目录执行 `npm ci`、`npm run build`（包含 TypeScript 检查）；生成的 `scripts/vendor/history-tabs.{mjs,css}` 和许可证文件随插件一起分发，使用者不需要 Node。需要新增 shadcn 组件时可在该目录执行 `npx shadcn@latest add <组件名>`，保留现有适配。npm 依赖与锁文件保留在源码中，不分发 `node_modules`。

成功处理的本地 AI 批注批次作为独立检查点保存，包含原选区、修改要求、源码行号和 AI 回复；历史记录可展开查看。应用前保存准确的编辑草稿和修改后源码，包括同时在其他位置完成的编辑。保存失败保留源码和待处理批注；带唯一请求编号的批注保存可安全重试，普通保存不重试。批注不写入 `.tex` 源码，未发送、失败或取消的批注仍仅保留在当前页面；旧对话不回填批注关联。

历史活动流统一显示整个项目的记录，按每条记录所属源码文件的章节定位改动，同一文件的五分钟保存组与对比基线保持独立。恢复另一文件前保存当前编辑草稿，并校验当前文件与目标文件的版本。鼠标移入记录栏时，使用已登录的 Codex CLI 在后台概括尚未缓存的记录，每批最多 12 个；摘要跟随界面语言，按版本、对比基线和语言分别存入现有历史数据库，不进入项目问答。旧版摘要保留为简体中文缓存，切换语言会取消旧请求并复用或生成对应语言的摘要。摘要失败仍显示本地章节位置，关闭历史会取消未完成请求。

第三方资源许可证必须保留，来源和版本见 `plugins/latex-codex/scripts/vendor/README.md`。PDF.js 主程序、worker、viewer 和配套资源需一起更新。当前 API / worker 含两处本地扩展：暴露原始 MediaBox，并支持按 glyph 读取精确文字位置；更新上游时保留这些扩展和 `test_history_pdf.py` / `test_editor.py` 的裁切、跨页检查。Node 仅用于维护测试的 PDF.js runner，插件运行时无需 Node。

Python 检查位于 `plugins/latex-codex/scripts/test_*.py`，前端检查位于同目录的 `test_*.cjs` 和 `test_*.mjs`。按变更选择现有检查；文档修改只需核对内容、路径和 `git diff --check`。
