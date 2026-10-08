# 项目约定

- README 写给使用者：只保留简短介绍、主要功能和最短用法。环境、安装命令和维护细节放在本文件。
- 插件源码在 `plugins/latex-codex/`，市场配置在 `.agents/plugins/marketplace.json`。修改仓库源码，不直接修改已安装的缓存副本。
- 不提交论文、实验备份、分享压缩包、文档历史数据库或凭据。

## LaTeX 默认打开方式

- 用户已指定本项目使用 LaTeX Codex。创建或修改 `.tex` 文稿后，默认按 `plugins/latex-codex/skills/latex-codex/SKILL.md` 的流程，在 Codex 右侧浏览器面板打开该文稿，使用本地 TeX 编译；用户明确要求内置编辑器时再使用内置编辑器。
- 同一文稿已有本对话启动的服务时复用，外部源码修改由编辑器正常同步；有未保存编辑或冲突时不得直接覆盖。切换文稿遵循插件的文件打开流程。
- 此约定控制代理的打开和编译流程，不替换应用自带的 `.tex` 文件预览入口。不要为此调用 `open_in_codex` 的文件目标或 `compile_latex_document`，应打开插件服务的浏览器 URL；不要修改应用内部文件或全局设置。

## 安装

### DeepSeek Harness 预发布版本

此分支通过 `--ai-backend deepseek` 开启 DeepSeek 适配；不带参数仍使用 Codex。Python 和本地 TeX 依赖沿用下文。当前在 Windows、DeepSeek Harness `0.2.0-rc.2` 实测账号登录的 Send；其他平台尚未实机验证。服务在本机运行，浏览器需允许访问回环地址。

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex --ai-backend deepseek
python plugins/latex-codex/scripts/install_deepseek_bridge.py
```

第二条命令仅用于可选的主对话转发。它在 `$DSH_HOME/profiles/desktop/cordis.patch.yml`（默认 `~/.dsh`）追加 `latex-main-chat-bridge`，保留其他配置，不读取或复制凭据；解压目录需保留。重复执行不重复添加。支持普通 YAML 块列表和 JSON 列表；其他格式需手动添加以下条目，替换为模块的实际绝对路径。已有其他安装路径的同名桥接时，先移除旧条目。

```yaml
- insert:
    - id: latex-main-chat-bridge
      name: /path/to/plugins/latex-codex/scripts/deepseek-main-chat.mjs
```

默认 HMR 会加载新增配置；关闭 HMR 时重启 Harness。卸载仅移除该条目。不要修改安装目录的 `app.asar`。桥接使用 Windows named pipe 或权限 `0600` 的 Unix socket；网页只访问编辑器同源 `/main-chat`。启动时捕获 `DSH_SESSION_ID` 和工作目录，转发仅允许同一工作目录中的该会话仍在运行，不按最近记录选择会话，不使用 headless resume 争用主对话。因此需从 DeepSeek 主对话运行启动命令，再打开打印的 URL。

保存批注后，列表提供独立的“发送到 DeepSeek 主对话”。没有会话绑定或桥接不可用时禁用并说明原因。发送前核对自动保存内容、文件和版本，接收确认后才清除该批批注；失败保留，相同请求 ID 安全重试，改内容不能复用 ID。转交不直接改源码，不生成本地建议；主对话的修改仍走外部同步和项目校对。真实桥接加载、状态连接和测试替身中的转交流程已验证；向用户现有会话的实际提交由用户点击按钮触发。

Send、项目对话和历史摘要调用已安装的 `dsh headless --json -`。CLI 优先 `DSH_CLI_PATH`，其次 PATH；Windows 再查应用卸载注册信息，直接以 Electron Node 模式调用随应用附带的 CLI，避免可见窗口和命令 shell。认证由 Harness 完成，不把密钥加入参数。模型列表区分 Harness 账号与 API 路由；“跟随 DeepSeek 默认”沿用 **headless profile** 的默认模型，与桌面会话选择独立。主对话上下文暂不自动加入项目对话；项目本地记忆仍在原数据库。

每次调用使用只读运行，临时会话、projection storage 和配置覆盖用后清理。临时 Cordis 插件隐藏工具并用执行 guard 拒绝工具调用，关闭 skill 扫描、项目 instructions 和额外标题模型请求；不修改全局配置。只解析无截断的 `final` 并核对 replacements；失败、工具事件和不完整批次不能应用。DeepSeek 此调用没有强制 JSON Schema，格式失败保留批注供重试。检查包括 `test_deepseek.py`、`test_deepseek.mjs`、`test_chat_ui.mjs` 和既有 chat、HTTP、校对检查。

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

目录新增“章节时间线”：沿用 PDF 抓手的悬停、点击和关闭流程，竖线连接 section 大圆与 subsection 小胶囊，当前位置显示双层圆环。滚轮、拖动和方向键只浏览，点击或 Enter 跳转；目录样式沿用全局偏好保存。实现和检查在 `vendor/latex-outline.{mjs,css}`、`vendor/latex-settings.mjs`、`test_outline.mjs` 和 `test_settings.mjs`。

源码和 PDF 校对区提供“上方还有 N 处改动”和“下方还有 N 处改动”按钮，分别位于右上角与右下角，点击滚动到最近的上一处或下一处待处理修改，不接受或撤销建议。源码按 CodeMirror 标记的位置统计，可导航未渲染的改动；PDF 按当前校对预览的区域定位，同一建议跨页只计一次。滚动、缩放、分栏调整、Keep / Undo 和校对开关变化更新计数；某方向没有改动时隐藏对应按钮。实现和检查在 `vendor/latex-proofread.mjs`、`vendor/latex-proofread-pdf.mjs`、`test_proofread.mjs`、`test_proofread_pdf.mjs` 和 `test_ui.cjs`。

临时批注框工具栏的“Style”按钮位于思考等级后，未选风格为灰色，已选高亮；收起时只显示 Style，不展示名称，不另开对话框。点击原生下拉菜单选择“无”、预设或导入提示词。预设提供用户给定的 Tao Compact / Shelah Compact 中英文提示词，可导入 UTF-8 `.txt` / `.md`（最大 64 KiB、12000 字符）。预设及拼接逻辑在 `scripts/vendor/latex-writing-styles.mjs`，仅作为当前批注的提示词数据，不安装或执行技能。Style 选择（含导入提示词）自动存入用户全局偏好，新批注、刷新页面和切换文稿继续沿用，选择“无”清除默认风格。每条批注保存自己的风格快照；批量发送按各自快照把风格合入 `annotation.request`，当前修改要求优先。确认修改的历史保留实际发送的完整要求。仅当前默认导入项随全局偏好保存，其余导入项仍只保留在当前页面；检查覆盖 `test_chat_ui.mjs` 与 `test_preferences.py`。

PDF 的“选字”模式支持空格临时拖动；同时按住空格与 Alt，再按住左键向右下拖动可连续放大，向左上拖动可连续缩小，范围为 30%–500%。按下鼠标的位置作为缩放中心；每帧合并指针移动，通过 PDF.js 延迟栅格渲染保持拖动流畅，松开后立即补清晰渲染。松开任一快捷键、取消拖动、失焦、切换模式或替换 PDF 均结束手势，不触发框选批注或源码定位。检查覆盖 `test_ui.cjs`。

源码的 Ctrl+F / macOS Cmd+F 打开搜索替换面板，支持大小写、正则、整词与仅选区搜索，Enter / Shift+Enter 浏览匹配，Esc 关闭。默认不区分大小写、按普通文本搜索；选项按钮高亮表示开启，再次点击关闭，大小写与正则按钮的提示显示当前状态。替换通过 CodeMirror 的正常编辑与自动保存流程执行；全部替换为一次可撤销操作。实现位于 `plugins/latex-codex/scripts/vendor/latex-search.{mjs,css}`，检查覆盖 `test_search.mjs` 与 `test_ui.cjs`。PDF 右侧滚动手柄显示当前物理页码和总页数，默认宽度 26 px，较长页数自动撑开；无章节目录时仍保留页码与滚动，PDF 关闭时清除，检查覆盖 `test_outline.mjs`。

PDF 的“选字”模式保留文字上的原生拖选；从页面空白处按下左键拖动时，在起始页内框选文字或公式。框选按 PDF.js 字符几何位置判断，松开后才按页读取并缓存字符数据，拖动过程不调用 SyncTeX。右键“添加批注”沿用现有源码定位；公式优先核实编译位置并选中完整公式环境，行内公式也保留完整源码边界。同排显示的 `\paragraph` / `\subparagraph` 标题与正文可一起匹配，保留完整标题命令；只选正文时不带入标题。框选正文先做明确匹配；几何检测确认首末字符之间的文字完整覆盖时，可使用与拖选相同的有限相似匹配，容忍字符误读与公式排版差异。漏选中间字符时不启用相似匹配，多个同等匹配仍拒绝定位；无法匹配时扩大选框或在源码选择。Esc、切换拖动模式、缩放或替换 PDF 会清除框选。检查覆盖 `test_pdf_selection.mjs` 与 `test_ui.cjs`。历史 PDF 标红按完整句子展开，Markdown 同时以源码段落和标题为边界，跨图片后的下一段不并入前句；中文句号保留独立句子，换行造成的 PDF 文字片段拆合不算内容修改，正文页码不参与 Markdown 句子对比。检查覆盖 `test_history_pdf.py` 与 `test_markdown_pdf.py`。

PDF 正文定位识别主文件中直接声明的 `\newtheorem`（含星号及共享计数器）和 `proof`，将自动标题、编号、纯文本可选标题和证毕方块与对应源码边界核对。完整环境选区保留配对的 `\begin` / `\end`，部分正文保持精确范围；跨环境的部分选区、漏选正文和歧义匹配拒绝定位。宏生成标题、外部包定义的自定义环境及非标准标题布局仍需源码选择。实现与检查在 `editor.py`、`test_ui.cjs`。

设置中的“项目修改校对（主对话 / 外部修改）”默认关闭，开启后跟踪项目内 `.tex`（含子文件）的文件修改；手动输入及已 Keep 的插件建议正常保存，不重复校对。差异基线保存在项目历史数据库的独立表，刷新或重启不丢待确认修改；关闭开关仅隐藏，不自动接受。顶部“项目校对”列表定位文件，源码及临时 PDF 沿用各自 Proofread 开关与逐处 Keep / Undo。主对话 / 外部工具已经写入磁盘后才捕获差异，Keep 确认当前内容，Undo 校验最新文件与基线后撤销该处；不能在 Codex 文件工具写入前拦截。不覆盖未保存草稿；重叠的新修改需刷新校对。纯删除也保留可操作的标记，历史不保存临时红绿 PDF。主对话代理修改时先检查运行服务的 `/project-review`，启用时通过同源 POST `/project-review` 提交 `{action:"propose",path,version,source}`，使用最新文件版本，保留手动编辑与现有批注；该 API 会写入真实文件并保留校对基线。实现与检查在 `project_review.py`、`vendor/latex-project-review.mjs`、`test_project_review.py` 和 `test_project_review.mjs`。

用户界面偏好保存在用户目录的 `.latex-codex/preferences.sqlite3`，跨文稿和服务端口共享，包括语言、编辑模式、源码字号、目录样式、配色与自定义配色、修改标记色、修订色、自动编译、框选后自动弹出 PDF 批注对话框、默认写作风格（含导入提示词）和分栏比例。设置即时应用并自动保存，设置菜单的“保存设置”确认写入；失败显示提示并保留待保存值。浏览器 localStorage 只作兼容缓存，首次使用优先沿用当前地址下的旧偏好。设置库不随插件分发或提交。

历史胶囊标签的 React / TypeScript 源码在 `plugins/latex-codex/frontend/`，使用 Tailwind CSS 与 shadcn 风格的 Radix Tabs。组件统一放在 `frontend/components/ui/`；`@/components/ui` 别名和 `components.json` 都指向这里，避免组件导入与 shadcn CLI 生成路径不一致。样式入口为 `frontend/styles.css`。

维护时在该目录执行 `npm ci`、`npm run build`（包含 TypeScript 检查）；生成的 `scripts/vendor/history-tabs.{mjs,css}` 和许可证文件随插件一起分发，使用者不需要 Node。需要新增 shadcn 组件时可在该目录执行 `npx shadcn@latest add <组件名>`，保留现有适配。npm 依赖与锁文件保留在源码中，不分发 `node_modules`。

本地 AI 批注通过 Send 生成建议后，每处在源码编辑区显示红色原文、绿色修改和独立的 Keep / Undo。预览不改源码；Keep 先保存准确的当前草稿及该处修改，再以一次可撤销操作应用，Undo 只撤销该处建议并保留原文。其他编辑和待校对标记继续保留，后续 Send 只发送尚未生成建议的批注。每处 Keep 作为独立历史检查点，包含原选区、修改要求、源码行号和 AI 回复；无需修改的回答按批次记录。保存失败保留源码和建议；带唯一请求编号的批注保存可安全重试，普通保存不重试。未处理的建议沿用批注的关闭、切换与外部冲突保护。批注和校对预览不写入 `.tex` / Markdown 源码，旧对话不回填批注关联。实现为 `scripts/vendor/latex-proofread.{mjs,css}` 与 `latex-chat.mjs`，检查覆盖 `test_proofread.mjs`、`test_chat_ui.mjs` 和 `test_chat.py`。

设置提供独立的“编辑器校对（Proofread）”与“PDF 校对（Proofread）”开关，均默认开启，偏好跨项目保存。关闭编辑器校对时，待处理建议移至批注列表；关闭 PDF 校对时恢复正式 PDF，并忽略未完成预览请求的结果。两者都关闭后，新 Send 修改走原有直接保存应用流程；切换开关不自动接受或丢弃已生成建议。Markdown 仅使用编辑器校对开关，PDF 校对开关不启用其临时 PDF 编译。检查覆盖 `test_settings.mjs`、`test_preferences.py`、`test_proofread.mjs`、`test_proofread_pdf.mjs`、`test_chat_ui.mjs`。

LaTeX 批注建议同时生成临时 PDF 校对预览：原选区全文标红，建议全文标绿，PDF 页边的每处 Keep / Undo 与源码校对卡片共享操作。`/proofread` 在独立临时目录覆盖当前草稿并编译主文件（含子文件相对依赖）；不写真实源码、历史版本、历史 PDF 缓存，也不覆盖正式 PDF / SyncTeX。临时 PDF 仅在服务内存保留最近两份，临时源码和构建文件立即清理；普通 PDF 下载仍导出正式文稿。预览期间停用正式源码定位，处理完建议恢复正常 PDF；失败保留原 PDF 和建议。Keep 沿用正式保存及历史检查点流程，Undo 不新增历史。实现为 `scripts/proofread.py`、`vendor/latex-proofread-pdf.mjs` 和现有编译适配；检查覆盖 `test_proofread_pdf.py` / `.mjs`，共享的临时源码编译沿用 `test_history_pdf.py`。

历史活动流统一显示整个项目的记录，按每条记录所属源码文件的章节定位改动，同一文件的五分钟保存组与对比基线保持独立。恢复另一文件前保存当前编辑草稿，并校验当前文件与目标文件的版本。鼠标移入记录栏时，使用已登录的 Codex CLI 在后台概括尚未缓存的记录，每批最多 12 个；摘要跟随界面语言，按版本、对比基线和语言分别存入现有历史数据库，不进入项目问答。旧版摘要保留为简体中文缓存，切换语言会取消旧请求并复用或生成对应语言的摘要。摘要失败仍显示本地章节位置，关闭历史会取消未完成请求。

第三方资源许可证必须保留，来源和版本见 `plugins/latex-codex/scripts/vendor/README.md`。PDF.js 主程序、worker、viewer 和配套资源需一起更新。当前 API / worker 含两处本地扩展：暴露原始 MediaBox，并支持按 glyph 读取精确文字位置；更新上游时保留这些扩展和 `test_history_pdf.py` / `test_editor.py` 的裁切、跨页检查。Node 仅用于维护测试的 PDF.js runner，插件运行时无需 Node。

Python 检查位于 `plugins/latex-codex/scripts/test_*.py`，前端检查位于同目录的 `test_*.cjs` 和 `test_*.mjs`。按变更选择现有检查；文档修改只需核对内容、路径和 `git diff --check`。
