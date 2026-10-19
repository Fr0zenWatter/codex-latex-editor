# 项目约定

- README 写给使用者：只保留简短介绍、主要功能和最短用法。环境、安装命令和维护细节放在本文件。
- 原生 Codex 插件源码在 `plugins/latex-codex/`，DeepSeek 适配源码在 `plugins/latex-deepseek/`，两者的市场配置在 `.agents/plugins/marketplace.json`。修改仓库源码，不直接修改已安装的缓存副本。
- 不提交论文、实验备份、分享压缩包、文档历史数据库或凭据。

## LaTeX 默认打开方式

- 用户已指定本项目使用 LaTeX Codex。创建或修改 `.tex` 文稿后，默认按 `plugins/latex-codex/skills/latex-codex/SKILL.md` 的流程，在 Codex 右侧浏览器面板打开该文稿，使用本地 TeX 编译；用户明确要求内置编辑器时再使用内置编辑器。
- **编辑器服务必须从首次启动就直接运行在宿主机上、代理沙盒外；禁止先在沙盒内试启动，也禁止失败后回退到沙盒。** 工具默认使用沙盒时，须选择单次命令的沙盒外执行方式并遵循所需审批；不可用或被拒绝时停止并说明阻碍，不得修改全局沙盒或网络设置。
- 同一文稿已有本对话启动且确认在宿主机沙盒外运行的服务时复用，外部源码修改由编辑器正常同步；有未保存编辑或冲突时不得直接覆盖。切换文稿遵循插件的文件打开流程。
- 此约定控制代理的打开和编译流程，不替换应用自带的 `.tex` 文件预览入口。不要为此调用 `open_in_codex` 的文件目标或 `compile_latex_document`，应打开插件服务的浏览器 URL；不要修改应用内部文件或全局设置。

## 安装

### 原生 Codex（默认）

`latex-codex@latex-codex-shared` 是原生插件。普通安装和更新保持此 ID，不安装 DeepSeek。

先检查已登录的 Codex 桌面应用与 CLI、Python 3.10+、本地 TeX Live / MiKTeX / MacTeX。TeX 环境需提供 `xelatex` / `pdflatex` 和 `synctex`；文献按项目所选后端需要 `bibtex` 或 `biber`。缺少依赖时说明缺项，不自动安装 TeX 环境或更改全局设置。前端资源已随插件附带，无需 npm、pip 或 Poppler 安装。PDF 页尺寸与文字位置由自带 PDF.js 读取，服务端只调用本地 TeX / SyncTeX。macOS 优先使用 PATH 中的 TeX，找不到时检查 `/Library/TeX/texbin`，不修改全局 PATH。Windows / Linux 的系统文件选择器使用可选的 tkinter；缺少时仍可通过启动命令打开文稿。macOS 使用系统原生文件选择器。

原生插件的安装和更新遵循以下流程。

“更新 latex-codex”应触发技能中的按需 [更新流程](plugins/latex-codex/skills/latex-codex/references/update-guide.md)。先取得并确认用户要求的源码及提交，再安装；普通 GitHub 更新不得混入工作区未发布的改动。市场已绑定其他目录时，保留旧来源以便失败恢复，仅重新注册 `latex-codex-shared`；任何命令失败立即停止，不能继续从旧来源安装。安装后核对实际市场目录与 `plugin add --json` 返回的 `installedPath`，逐文件比较原生插件分发内容的 SHA-256；版本号相同或安装命令成功不足以证明更新完成。更新后打开文稿使用安装副本的新服务，并保留原服务未保存的草稿。

确认源码后，在其仓库根目录执行：

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

后续公开发布默认递增原生插件版本并创建新标签，保持已发布标签不变，避免不同代码共用同一版本号；版本递增不替代上述安装文件核验。

### 可选的独立 DeepSeek Harness 插件

版本前缀标记共享编辑器发布基线：原生 `0.3.8` 对应 DeepSeek `0.3.8-deepseek.1`，仅 DeepSeek 适配更新递增末尾编号。两个插件的 ID、安装目录与后端独立；共享修复发布时须从同一源码重新生成 DeepSeek runtime，不能只修改版本号或复制旧安装包。

独立包可通过 `python scripts/build_deepseek_plugin.py --output share/latex-deepseek-VERSION.zip` 生成，直接解压到 Harness 的技能目录。具体安装和可选桥接更新见 `plugins/latex-deepseek/AGENTS.md`；原生插件更新不安装 DeepSeek。

`latex-deepseek` 有独立的插件名、版本、技能和启动入口，默认使用 DeepSeek；原生 `latex-codex` 入口只接受 Codex。Python 和本地 TeX 依赖沿用上文。当前在 Windows、DeepSeek Harness `0.2.0-rc.2` 实测账号登录的 Send；其他平台尚未实机验证。服务在本机运行，浏览器需允许访问回环地址。

```sh
python scripts/build_deepseek_plugin.py
codex plugin add latex-deepseek@latex-codex-shared
python plugins/latex-deepseek/scripts/editor.py /path/to/main.tex
```

需要主对话转发时，另行执行：

```sh
python plugins/latex-deepseek/scripts/install_deepseek_bridge.py
```

最后一条命令仅用于用户要求的可选主对话转发，安装原生插件时不执行。它在 `$DSH_HOME/profiles/desktop/cordis.patch.yml`（默认 `~/.dsh`）追加 `latex-main-chat-bridge`，保留其他配置，不读取或复制凭据；解压目录需保留。重复执行不重复添加。支持普通 YAML 块列表和 JSON 列表；其他格式需手动添加以下条目，替换为模块的实际绝对路径。已有其他安装路径的同名桥接时，先移除旧条目。

```yaml
- insert:
    - id: latex-main-chat-bridge
      name: /path/to/plugins/latex-deepseek/scripts/deepseek-main-chat.mjs
```

默认 HMR 会加载新增配置；关闭 HMR 时重启 Harness。卸载仅移除该条目。不要修改安装目录的 `app.asar`。桥接使用 Windows named pipe 或权限 `0600` 的 Unix socket；网页只访问编辑器同源 `/main-chat`。启动时捕获 `DSH_SESSION_ID` 和工作目录，转发仅允许同一工作目录中的该会话仍在运行，不按最近记录选择会话，不使用 headless resume 争用主对话。因此需从 DeepSeek 主对话运行启动命令，再打开打印的 URL。

保存批注后，列表提供独立的“发送到 DeepSeek 主对话”。没有会话绑定或桥接不可用时禁用并说明原因。发送前核对自动保存内容、文件和版本，接收确认后才清除该批批注；失败保留，相同请求 ID 安全重试，改内容不能复用 ID。转交不直接改源码，不生成本地建议；主对话的修改仍走外部同步和项目校对。真实桥接加载、状态连接和测试替身中的转交流程已验证；向用户现有会话的实际提交由用户点击按钮触发。

Send、项目对话和历史摘要调用已安装的 `dsh headless --json -`。CLI 优先 `DSH_CLI_PATH`，其次 PATH；Windows 再查应用卸载注册信息，直接以 Electron Node 模式调用随应用附带的 CLI，避免可见窗口和命令 shell。认证由 Harness 完成，不把密钥加入参数。模型列表区分 Harness 账号与 API 路由；“跟随 DeepSeek 默认”沿用 **headless profile** 的默认模型，与桌面会话选择独立。主对话上下文暂不自动加入项目对话；项目本地记忆仍在原数据库。

每次调用使用只读运行，临时会话、projection storage 和配置覆盖用后清理。临时 Cordis 插件默认隐藏工具并用执行 guard 拒绝工具调用；TeX 对话开启引用时，仅放行临时 MCP 服务的 `mcp__tex_quotes__cite_tex`，校验调用 ID、成功结果与完整回复，关闭 skill 扫描、项目 instructions 和额外标题模型请求；不修改全局配置。只解析无截断的 `final` 并核对 replacements；失败、未授权或不完整的工具事件和不完整批次不能应用。DeepSeek 此调用没有强制 JSON Schema，格式失败保留批注供重试。适配检查在 `plugins/latex-deepseek/scripts/test_deepseek.py` 和 `.mjs`；共享界面沿用原生目录中的 `test_chat_ui.mjs` 和既有 chat、HTTP、校对检查。

DeepSeek 安装前需运行上面的打包命令。`scripts/build_deepseek_plugin.py` 只把原生目录中的十个运行模块和完整 vendor（含 PDF.js worker、字体及许可证）复制到 `plugins/latex-deepseek/runtime/`；该目录是忽略提交的生成资源，不含文稿、凭据、历史库或 frontend/node_modules。适配模块和技能保留在 DeepSeek 自己的源码目录。安装快照包含 runtime，可以单独迁移和启动，不读取原生插件的缓存路径。共享模块里的后端分支供 DeepSeek 包复用，原生安装不含 Harness 适配模块或桥接安装脚本。打包时先生成完整资源再替换旧目录；更新 DeepSeek 前停止其服务、重新打包再执行它自己的安装命令，按需更新 DeepSeek manifest 版本。原生更新无需打包或安装 DeepSeek，不合并两者的版本号。

运行 `python scripts/test_plugin_packages.py` 验证两种默认后端、拒绝切换到另一后端、失败打包保留旧资源、删除旧生成文件，以及移走仓库和原生插件后 DeepSeek 独立启动与资源读取；不发真实模型请求或主对话消息。

## 启动与数据

独立启动编辑器（必须在宿主机终端、代理沙盒外运行）：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
# 主文件和附录分布在不同子目录时，指定共同的项目根目录
python plugins/latex-codex/scripts/editor.py /path/to/project/paper/main.tex --project-root /path/to/project
# macOS / Linux 通常使用 python3
```

同一启动命令也支持 UTF-8 `.md` / `.markdown`；默认在浏览器本地实时预览，不调用 TeX。支持常用 Markdown、代码块、表格、KaTeX 公式及 Obsidian `![[图片名.png]]` 引用；图片限于笔记目录或其 Obsidian 库内，实时预览允许 PNG/JPG/GIF/WebP/AVIF。点击“PDF 预览”使用本地 XeLaTeX，将笔记转换为行号对应的临时 TeX，跳过 YAML frontmatter，渲染 callout、双链显示文本和 TikZ 代码块，沿用 PDF 目录、SyncTeX 双向跳转、选字/框选批注、下载及历史 PDF 对比；点击“实时预览”切回 HTML。PDF 图片支持 PNG/JPG/PDF，其他格式显示提示；TikZ 需现有 TeX 环境提供相应包，缺少时不自动安装。打开和编译保留原笔记字节，转换文件和图片副本仅在构建目录中生成。自动保存、Vim/Emacs、搜索、源码批注、AI 修改和历史沿用现有流程；Markdown AI 修改不插入 TeX 颜色命令。HTML 渲染与定位在 `scripts/vendor/latex-markdown.{mjs,css}`，资源边界在 `scripts/markdown_source.py`；PDF 转换在 `scripts/obsidian_tex.py`，适配自用户提供的 LaTeX Sidecar 16.22.00。检查在 `test_markdown.py`、`test_markdown.mjs`、`test_markdown_pdf.py`、`test_highlight.cjs` 和 `test_ui.cjs`。

打开终端打印的回环地址；AI 功能使用已登录的 Codex CLI。启动入口在 `plugins/latex-codex/skills/latex-codex/SKILL.md`；详细操作说明在同目录的 `references/editor-guide.md`，仅按当前任务需要读取，普通打开文稿不预读整份说明。

编辑会自动保存到当前源码文件；主编译文件保持固定。默认项目根目录是主文件所在目录，可在“文件 → 项目设置”或启动参数 `--project-root` 中指定包含正文和附录的共同目录。TeX 的相对引用仍从主文件所在目录解析。源码文件选择器和 PDF 反向跳转可打开项目内的 `\input` / `\include` 文件；历史与对话统一保存在项目根目录的 `.latex-codex/history.sqlite3`，源码历史保留项目相对路径，历史面板按时间统一显示主文件与所有子文件的记录；每条记录显示文件名，对比和恢复使用该记录所属的文件。项目内所有 UTF-8 `.tex` / `.md` / `.markdown` 源码在启动及状态轮询时记录，未打开的子文件修改也会被捕获。仅在查看历史“PDF 改动”时，将每处修改前后的 PNG 对比图（包含整句标红）存入 `.latex-codex/pdf-diff-cache/`；普通编译不保存完整 PDF 或 SyncTeX 存档。再次查看直接读图，缺失或损坏时按需编译生成；“重新编译”强制更新这一组对比图。跨页改动按页保存，新增或删除的一侧显示空白说明。缓存可删除，每项目上限 256 MiB，30 天未使用的存档在缓存读写时清理；源码历史不受影响。失败编译或未完成的渲染不覆盖已有对比图。旧版 `.latex-codex/pdf-cache/` 已停用，可删除。永久历史在同一项目数据库中记录各源码文件；子文件的历史 PDF 通过临时源码覆盖编译主文件，使用其余依赖的当前版本。切换源码前保存当前修改；未发送的批注或正在生成的回复需先处理。PDF 选区不可一次跨越多个源码文件。文献编译根据本次 TeX 生成的 `.bcf` / `.aux` 自动选择 Biber / BibTeX，处理后再运行两遍 TeX；控制文件和文献内容未变时复用结果。项目内 `.bib` / `.bst` 修改会使自动预览和源码定位失效。Biber 从主文稿所在目录解析相对文献路径，产物保留在临时构建目录；历史和校对预览共用此流程。缺工具或处理失败保留上一份正常 PDF 并报告失败，不自动安装。切换文献包导致旧辅助文件不兼容时仅清理临时文献产物并重试一次。远程或通配文献输入不缓存；项目根外的文献修改尚不自动跟踪；`makeindex` 等其他外部处理器目前不自动调用。检查在 `test_bibliography.py` 和 `test_editor.py`。

普通源码语法错误不清理有效的文献缓存，也不额外重跑 TeX；恢复失败运行前的临时 `.aux`，避免引用编号和交叉引用被截断。修复后文献输入未变时继续复用 Biber / BibTeX 结果。仅本次 TeX 日志将错误定位到临时 `.aux` / `.bbl`，或明确报告 `.bbl` 不是由 biblatex 生成时，才按原流程清理不兼容辅助文件并重试一次。检查覆盖 `test_bibliography.py`。

BibTeX 在临时构建目录内以主文稿基名运行，避免 TeX Live / MacTeX 的 `openout_any=p` 拒绝绝对 `.blg` / `.bbl` 输出路径。`./` / `../` 开头的文献与样式不走 Kpathsea 搜索路径，因此本次调用将它们复制到构建目录，并临时替换 `.aux` 中的输入名称；结束、失败或超时均恢复原 `.aux` 并清理副本，不修改文稿或全局 TeX 安全设置。检查覆盖严格输出规则、相对资源、嵌套辅助文件、带空格路径、历史／校对预览及失败清理；macOS 仍需真机验证。

## 维护

调整 Codex 侧边栏、浏览器窗口或 TeX/PDF 分界线时，源码按顶部可见字符及屏幕偏移恢复位置，PDF 按页码及页内相对位置恢复。分界线拖动仍合并布局更新，松手统一刷新；补偿 CodeMirror 的换行高度再测量，仅改变高度不额外缩放 PDF，切换文稿不使用旧锚点。检查在 `editor.py` 和 `test_ui.cjs`。

项目浮动对话的圆球单击展开为短栏后，点击源码或 PDF 保持短栏；缩小按钮切回圆球。完整对话框沿用固定开关与点击外部收起；再次展开保留聊天阅读位置，新回复仍滚动到末尾。检查在 `test_chat_ui.mjs`。

论文原句引用通过浮动对话中的开关启用。显示历史消息的项目浮动对话窗口标题栏中“新对话”旁边的 `”` 按钮是定位工具开关，点击后持续高亮并打开引用列表，为本页面后续原生 Codex 或 DeepSeek 的 TeX 对话请求启用只读 `cite_tex` 工具；再次点击关闭，收起列表或对话窗口、点击引用链接均不改变开启状态，刷新后需重新点击。开启时提示 AI 在讨论论文中的具体定义、引理、定理、公式或原句时主动使用 `cite_tex`，无需等用户要求定位；涉及多个不同段落时提供相关链接，避免重复链接。工具可通过 `text` 参数返回“Lemma 2.3”等名称作为超链接文字，默认以原句作链接文字，定位仍按验证的原句范围；查找项目内 TeX 原句，返回含项目、文件和源码摘要的 Markdown 链接。点击链接通过现有源码切换和 SyncTeX 正向定位，保留源码选区并从句子起点定位；源码其他位置修改、原句移位或空白换行变化后，按完整原句重新查找当前范围；重复原句用前后上下文区分，找不到或无法唯一确定时提示重新引用。整份源码摘要只用于未变化时复用原范围，点击期间的文件和草稿版本保护保留；旧版短引用可重新定位，只有截断预览的旧版长引用需重新生成。不支持 Markdown 引用、行内补全或历史摘要工具。DeepSeek 使用同一只读原句 MCP 服务，仅允许 `mcp__tex_quotes__cite_tex`，其他工具仍隐藏并由执行 guard 拒绝。DeepSeek 工具及历史助手消息只向模型展示 21 字符短编号，完成后按本次调用核实并还原完整引用链接；未知编号拒绝回复，映射仅在请求内存中保留，不改当前源码、选区或用户要求。旧长链接的上下文损坏时，只在项目、文件、完整原句、范围和行号仍与当前源码精确相符时恢复。每次引用调用使用临时 MCP 配置并忽略用户配置，不改全局设置，仅允许原句工具。实现与检查在 `references.py`、`vendor/latex-references.mjs`、`test_references.py` / `.mjs` 和 `test_ui.cjs`。

目录“章节时间线”在悬停或点击 PDF 抓手后隐藏抓手，以整条预览区高度展示固定章节点；竖线贴近右侧边框，连接 section 大圆与 subsection 小胶囊，当前位置显示双层圆环；较小的标题放在线左侧，单行超出时显示省略号，悬停可看完整标题，背景为磨砂半透明，宽度随最长标题收窄，左侧通过渐变遮罩平缓淡出。所有节点按章节顺序同时排列，点击节点跳转，Tab 与 Enter / Space 使用原生按钮操作；滚轮沿用 PDF 滚动和 Ctrl 缩放，不旋转或重新排列目录，拖动目录也不改变节点。密集目录缩小节点，标题在悬停或键盘聚焦时显示；离开后恢复抓手。目录样式沿用全局偏好保存，其他轮盘样式保留原交互。实现和检查在 `vendor/latex-outline.{mjs,css}`、`test_outline.mjs` 和 `test_settings.mjs`。

源码和 PDF 校对区提供“上方还有 N 处改动”和“下方还有 N 处改动”按钮，分别位于右上角与右下角，点击滚动到最近的上一处或下一处待处理修改，不接受或撤销建议。源码按 CodeMirror 标记的位置统计，可导航未渲染的改动；PDF 按当前校对预览的区域定位，同一建议跨页只计一次。滚动、缩放、分栏调整、Keep / Undo 和校对开关变化更新计数；某方向没有改动时隐藏对应按钮。实现和检查在 `vendor/latex-proofread.mjs`、`vendor/latex-proofread-pdf.mjs`、`test_proofread.mjs`、`test_proofread_pdf.mjs` 和 `test_ui.cjs`。

临时批注框工具栏的“Style”按钮位于思考等级后，未选风格为灰色，已选高亮；收起时只显示 Style，不展示名称，不另开对话框。点击原生下拉菜单选择“无”、预设或导入提示词。预设提供用户给定的 Tao Compact / Shelah Compact 中英文提示词，可导入 UTF-8 `.txt` / `.md`（最大 64 KiB、12000 字符）。预设及拼接逻辑在 `scripts/vendor/latex-writing-styles.mjs`，仅作为当前批注的提示词数据，不安装或执行技能。Style 选择（含导入提示词）自动存入用户全局偏好，新批注、刷新页面和切换文稿继续沿用，选择“无”清除默认风格。每条批注保存自己的风格快照；批量发送按各自快照把风格合入 `annotation.request`，当前修改要求优先。确认修改的历史保留实际发送的完整要求。仅当前默认导入项随全局偏好保存，其余导入项仍只保留在当前页面；检查覆盖 `test_chat_ui.mjs` 与 `test_preferences.py`。

PDF 的“选字”模式支持空格临时拖动；同时按住空格与 Alt，再按住左键向右下拖动可连续放大，向左上拖动可连续缩小，范围为 30%–500%。按下鼠标的位置作为缩放中心；每帧合并指针移动，通过 PDF.js 延迟栅格渲染保持拖动流畅，松开后立即补清晰渲染。松开任一快捷键、取消拖动、失焦、切换模式或替换 PDF 均结束手势，不触发框选批注或源码定位。检查覆盖 `test_ui.cjs`。

普通和 Vim 模式下，源码的 Ctrl+F / macOS Cmd+F 打开搜索替换面板；Emacs 模式保留 Ctrl+F 前移及 Ctrl+S / Ctrl+R 原生搜索，Cmd+F 仍可打开此面板，支持大小写、正则、整词与仅选区搜索，Enter / Shift+Enter 浏览匹配，Esc 关闭。默认不区分大小写、按普通文本搜索；选项按钮高亮表示开启，再次点击关闭，大小写与正则按钮的提示显示当前状态。替换通过 CodeMirror 的正常编辑与自动保存流程执行；全部替换为一次可撤销操作。实现位于 `plugins/latex-codex/scripts/vendor/latex-search.{mjs,css}`，检查覆盖 `test_search.mjs` 与 `test_ui.cjs`。PDF 右侧滚动手柄显示当前物理页码和总页数，默认宽度 26 px，较长页数自动撑开；无章节目录时仍保留页码与滚动，PDF 关闭时清除，检查覆盖 `test_outline.mjs`。

源码补全用 Enter / Tab 确认常用命令时，同时插入必需参数的花括号并将光标放入第一组，例如 `\frac{}{}`、`\sqrt{}`、`\textbf{}`。命令后已有花括号或可选参数时（含空白或换行）保留原参数，不重复添加；未知或自定义命令仅补名称，不推测参数数目。环境沿用 `\begin` / `\end` 成对插入，补全替换使用正常编辑与自动保存流程。实现与检查在 `vendor/latex-hint.js`、`test_hint.cjs` 和 `test_ui.cjs`。

自动编译开启时，LaTeX 或 Markdown PDF 源码每次修改都重新计时，停止编辑 3 秒后才自动保存并编译；连续输入不触发编译。编译失败保留当前源码文件、光标和滚动位置，打开日志但不自动跳转；日志中的错误行按钮才执行跳转（支持项目子文件），源码变化后清除旧跳转。失败后暂停自动编译，编辑仍按 800 ms 自动保存，文件轮询和定位不重试编译；再次使用手动编译按钮或保存快捷键才恢复，仍失败则继续暂停。不修改全局自动编译偏好。手动按钮和保存快捷键仍立即编译。关闭自动编译或使用 Markdown 实时预览时，自动保存保留 800 ms 延迟。检查覆盖 `test_ui.cjs`。

设置中的“AI 行内补全”提供独立开关，默认关闭；“AI 补全思考等级”默认 low，可选 low / medium / high，“AI 补全模型”从当前插件后端的可用列表选择，默认跟随 CLI 默认；三项偏好跨文稿和端口保存。所选模型及思考等级在服务端核对后按请求传入，不影响主对话或批注模型。开启后在源码停顿 350 ms 时，用已登录的当前插件 AI 后端生成一条短灰色续写；请求最小间隔 2.5 秒，只传光标前最多 3000 字符、后最多 500 字符及文件名，不传全文、主对话或项目记忆。复用 `ChatJob` 的临时只读调用；原生 Codex 使用 CLI 内置默认或该次选定模型与现有登录，仅本次调用忽略用户配置，以补全专用短指令替换通用编程指令，限制技能目录和项目指令并关闭搜索等无关工具；校验完整成功回合后立即提供结果，不等待 CLI 退出收尾。独立设置补全思考等级，不改全局配置，超时 20 秒。建议为显示书签，不写入源码、自动保存或历史；Tab 通过正常编辑接受，可撤销，Esc 丢弃并保留原模式的 Esc 行为。继续输入、移动光标、失焦、切文件、IME 输入、原生命令补全、只读状态或开关 / 模型 / 等级变化取消旧任务，核对文稿、草稿版本和光标后才显示或接受。`/completion` 使用独立锁和任务，不阻塞编译、不占用批注对话；任务 ID 支持重复确认与定向取消。未写完的正文可给中性连接短语，不编造数学结论；等待、无建议和失败状态显示在源码文件名旁，不弹日志或反复重试。后台文件状态轮询及 PDF 定位不取消有效源码补全。实现与检查在 `chat.py`、`editor.py`、`vendor/latex-completion.{mjs,css}`、`test_completion.py` / `.mjs` 和已有设置、偏好、对话检查。

源码定位 PDF 默认快捷键为 Ctrl+E（macOS 也保持 Ctrl+E），在普通和 Vim 模式调用现有正向定位流程；Emacs 模式保留 Ctrl+E 为行尾移动，保留保存、编译、冲突及版本检查；Markdown 实时预览定位当前源码块。设置中的“源码定位 PDF 快捷键”直接输入 Ctrl / Alt / Cmd 组合键名称或 F1–F12，Enter 或离开输入框保存，Esc 取消，不提供恢复默认按钮；不要求实际按组合键，以免桌面或浏览器先截获关闭页面的快捷键。修饰键顺序及字母大小写自动规范，无效输入保留原设置。偏好 `latex-codex-forward-shortcut` 使用 CodeMirror 键名保存，跨文稿和端口共享，即时更新 extraKeys，不重置 Vim Insert 或 Emacs 状态；仅源码编辑器生效，普通和 Vim 模式下自定义键优先于原绑定；Emacs 模式停用含 Ctrl 的定位组合，保留编辑按键及组合键前缀，定位按钮与不含 Ctrl 的定位组合仍可用，系统或浏览器保留键仍可能无法用于源码定位。检查覆盖 `test_ui.cjs`、`test_settings.mjs` 和 `test_preferences.py`。

PDF 的“选字”模式保留文字上的原生拖选；从页面空白处按下左键拖动时，在起始页内框选文字或公式。框选拖动每个屏幕刷新周期合并鼠标移动，复用同一个选框，按当前页面位置更新；松手立即使用最终位置，取消时清除待更新任务。框选按 PDF.js 字符几何位置判断，松开后才按页读取并缓存字符数据，拖动过程不调用 SyncTeX。右键“添加批注”沿用现有源码定位；公式优先核实编译位置并选中完整公式环境，行内公式也保留完整源码边界。同排显示的 `\paragraph` / `\subparagraph` 标题与正文可一起匹配，保留完整标题命令；只选正文时不带入标题。框选正文先做明确匹配；几何检测确认首末字符之间的文字完整覆盖时，可使用与拖选相同的有限相似匹配，容忍字符误读与公式排版差异。漏选中间字符时不启用文字相似匹配；文字定位失败后可使用下述编译位置兜底。Esc、切换拖动模式、缩放或替换 PDF 会清除框选。检查覆盖 `test_pdf_selection.mjs` 与 `test_ui.cjs`。历史 PDF 标红按完整句子展开，Markdown 同时以源码段落和标题为边界，跨图片后的下一段不并入前句；中文句号保留独立句子，换行造成的 PDF 文字片段拆合不算内容修改，正文页码不参与 Markdown 句子对比。检查覆盖 `test_history_pdf.py` 与 `test_markdown_pdf.py`。

PDF 正文定位识别主文件中直接声明的 `\newtheorem`（含星号及共享计数器）和 `proof`，将自动标题、编号、纯文本可选标题和证毕方块与对应源码边界核对。选区开头的标题及末尾的证毕方块核实后，允许正文沿用有限相似匹配，容忍公式脚标顺序或字形差异；不完整框选仍不启用相似匹配，选区中间的自动标题仍须明确匹配边界。完整环境选区保留配对的 `\begin` / `\end`，部分正文保持精确范围；文字匹配阶段拒绝跨环境的部分选区、漏选正文和歧义匹配；失败后可按编译位置近似选中源码。宏生成标题、外部包定义的自定义环境及非标准标题布局不做标题文字投影，可使用位置兜底。实现与检查在 `editor.py`、`test_ui.cjs` 和 `test_pdf_mapping.py`。

正文定位先按原有精确匹配及最多 20% 字符差异处理，经过逐行 PDF 区域核实的长选区可尝试最多 35% 差异。仍失败时，以定位成功为优先，不再要求文字相似度：根据已编译的 PDF 区域选择对应的完整源码行，容忍未知行内宏、公式重排、大量误读及不完整框选。区域重叠时优先最近的 PDF 行中心，再用反向 SyncTeX 行号区分；首末字形须有对应区域，至少 75% 非空字形须有位置支持，且选区各页都须有字形位置支持。近似范围保留完整公式、格式分组和被截断的环境边界，最多 401 行，并显示“已按 PDF 位置近似选中源码”。精确定位仍优先，不增加正常匹配的查询；文件、草稿及编译版本保护不变。数字引用的无编号文字兜底仍保持最多 5% / 12 字符。检查覆盖 `test_ui.cjs` 和真实编译的 `test_pdf_mapping.py`。

PDF 拖选和框选共用正文定位规则，并保留选区前后各最多 80 字符的 PDF 上下文，用于区分同一源码行中的重复文字；同一完整公式内的重复符号视为同一源码候选。原段落匹配失败后，查询该次编译缓存的逐行 PDF 区域，在段落及锚点前后 12 行内补查正文和公式，候选必须覆盖所选 PDF 字形，查询最多 401 行，末尾换行不算额外源码行。`/synctex` 的 `range` 返回兼容原有 `regions` 的逐行 `lines`；子文件沿用自己的 SyncTeX tag。拖选与框选都支持源码 `\item` 边界上的自动数字编号，以及 `\href` 的显示文字和 `\url`。数字 `\cite` / `\citep` 支持一段纯文本后注或两段纯文本前后注，按当前编译编号投影，说明中的 `--` / `---` 对应 PDF 长横线；只选引用也保留完整命令。带说明的引用缺少编译编号时不跳过说明，说明中的宏、公式和嵌套方括号仍保持拒绝。文字匹配阶段仍拒绝无法由上下文或位置区分的候选；不完整框选不启用文字相似匹配，但两者均可使用编译位置兜底。新增查询前后的源码 / PDF 版本保护与原流程一致。检查在 `test_pdf_selection.mjs`、`test_ui.cjs`、`test_pdf_mapping.py`、`test_editor.py` 和 `test_project_files.py`；`test_pdf_mapping.py` 使用真实编译、PDF.js 字形和 HTTP 定位接口串联验证。

设置中的“项目修改校对（主对话 / 外部修改）”默认关闭，开启后跟踪项目内 `.tex`（含子文件）的文件修改；手动输入及已 Keep 的插件建议正常保存，不重复校对。差异基线保存在项目历史数据库的独立表，刷新或重启不丢待确认修改；关闭开关仅隐藏，不自动接受。顶部“项目校对”列表定位文件，源码及临时 PDF 沿用各自 Proofread 开关与逐处 Keep / Undo。主对话 / 外部工具已经写入磁盘后才捕获差异，Keep 确认当前内容，Undo 校验最新文件与基线后撤销该处；不能在 Codex 文件工具写入前拦截。不覆盖未保存草稿；重叠的新修改需刷新校对。纯删除也保留可操作的标记，历史不保存临时红绿 PDF。主对话代理修改时先检查运行服务的 `/project-review`，启用时通过同源 POST `/project-review` 提交 `{action:"propose",path,version,source}`，使用最新文件版本，保留手动编辑与现有批注；该 API 会写入真实文件并保留校对基线。项目校对和 AI 批注建议共用段落拆分规则：每块最多三个短段，原文或修改后任一段超过 400 个源码字符时单独成块；空行和显式 `\par` 作为段落边界，命令分组、公式及完整环境保持结构完整。各块在源码和 PDF 中拥有独立的 Keep / Undo，接受一块不会处理其他块，每块分别记录批注历史。TeX 源码栏左上角并排提供绿色“全部接受”与深色“全部 Undo”，采用与改动导航相同的悬浮胶囊样式，仅当前文件有待确认校对时显示；一次接受或撤销当前文件的外部修改及已生成的 AI 建议，未发送批注和其他文件的待确认修改保留。“全部 Undo”对项目校对使用带文件版本及基线签名校验的 `undo-all`，恢复当前校对基线，保留已接受及手动编辑；AI 建议仅清理预览，不写源码或新增历史。保存失败不清除 AI 建议，两按钮共用生成、保存、只读和冲突保护。接受前校验源码范围、文件版本及校对基线，保存失败保留尚未接受的建议；批量 AI 建议每次最多 100 处写入现有历史，不重复请求模型。拆分结果按新旧源码范围校验，保留未修改内容、Unicode 定位和版本保护。普通问答完成后不再显示“可以继续追问；本次对话记忆保留。”。实现与检查在 `project_review.py`、`chat.py`、`vendor/latex-project-review.mjs`、`vendor/latex-chat.mjs`、`test_project_review.py` / `.mjs`、`test_chat.py`、`test_chat_ui.mjs` 和 `test_proofread_pdf.py`。

用户界面偏好在 Windows 保存在 `%LOCALAPPDATA%/latex-codex/preferences.sqlite3`，其他系统保存在用户目录的 `.latex-codex/preferences.sqlite3`；Windows 兼容读取旧位置，首次保存将可读取的旧设置迁入新位置并保留旧文件，旧目录访问被拒绝时仍可在新位置保存。显式传入的设置路径保持不变。设置跨文稿和服务端口共享，包括语言、编辑模式、源码字号、目录样式、配色与自定义配色、修改标记色、修订色、自动编译、框选后自动弹出 PDF 批注对话框、默认写作风格（含导入提示词）和分栏比例。设置即时应用并自动保存，设置菜单的“保存设置”确认写入；失败显示提示并保留待保存值。浏览器 localStorage 只作兼容缓存，首次使用优先沿用当前地址下的旧偏好。设置库不随插件分发或提交。

历史胶囊标签的 React / TypeScript 源码在 `plugins/latex-codex/frontend/`，使用 Tailwind CSS 与 shadcn 风格的 Radix Tabs。组件统一放在 `frontend/components/ui/`；`@/components/ui` 别名和 `components.json` 都指向这里，避免组件导入与 shadcn CLI 生成路径不一致。样式入口为 `frontend/styles.css`。

维护时在该目录执行 `npm ci`、`npm run build`（包含 TypeScript 检查）；生成的 `scripts/vendor/history-tabs.{mjs,css}` 和许可证文件随插件一起分发，使用者不需要 Node。需要新增 shadcn 组件时可在该目录执行 `npx shadcn@latest add <组件名>`，保留现有适配。npm 依赖与锁文件保留在源码中，不分发 `node_modules`。

项目对话记录（包括临时批注进入的对话）及完成的批注回复使用现有 Markdown / KaTeX 渲染器显示加粗、斜体、列表、代码块和公式；历史记录重新打开时同样渲染。输入框和替换源码仍保留原文，代码中的公式不渲染。项目对话使用浮动窗口，可拖动位置、调整宽高、收起及置顶；“常驻临时对话圆球”默认开启，保留用户已保存的关闭选择；Ctrl+Q 切换展开，Emacs 源码编辑区保留此键为原生组合键前缀；展开时 Ctrl+滚轮调节对话字号。拖动按屏幕刷新合并更新，大小与位置限制在可用窗口内，支持键盘操作。无源码选区时可直接提问，服务端强制不产生源码替换。生成的 HTML 经 DOMPurify 清理，回复不自动加载图片，链接在独立页面打开。实现与检查在 `vendor/latex-chat.mjs`、`vendor/latex-markdown.{mjs,css}`、`test_chat_ui.mjs`、`test_chat.py` 和 `test_markdown.mjs`。

悬浮项目对话、重新打开的聊天历史和批注反馈共用论文宏渲染：复用源码公式预览的 `documentMacros` 解析器，只读取可支持的字面声明。编辑主文件时使用当前草稿，编辑子文件时读取主文稿源码；按源码缓存宏表，每条回复复制宏表，避免回复中的定义污染后续对话或其他项目。Markdown 文稿保持原渲染。KaTeX 不支持的 TeX 包、条件宏和默认可选参数仍需查看编译 PDF。实现与检查在 `vendor/latex-chat.mjs`、`vendor/latex-markdown.mjs`、`editor.py`、`test_markdown.mjs`、`test_chat_ui.mjs`、`test_ui.cjs` 和 `test_hover.mjs`。

保存的 AI 回复可逐条记录为项目根目录下的 Markdown 文件，名称跟随界面语言；简体中文为 `AI对话记录.md`。通过 `/chat/export` 核对当前项目和数据库中的回复编号，保留公式、列表及代码原文，以回复编号标记避免重复记录。只由用户点击触发，不自动导出对话或修改文稿。实现与检查在 `history.py`、`editor.py`、`vendor/latex-chat.mjs` 和 `test_chat_export.py`。临时批注框中的 TEMP 图标只发送当前批注，保留其他排队批注，并沿用风格快照、保存及 Keep / Undo 流程；资源在 `vendor/gpt-temp-mark.svg`，检查覆盖 `test_chat_ui.mjs`。

PDF 阅读底色可选择原始、黑、灰、淡黄或淡绿，跨文稿保存，仅改变浏览器显示，不修改 PDF 或下载文件。编辑区和预览区支持拖入单个 `.tex` / `.md` / `.markdown` 原文件；只在浏览器提供可核对的原始路径时使用现有 `/open` 流程，浏览器隐藏路径时保留当前文稿并提示使用文件菜单。未保存修改、待处理批注和编译状态沿用现有保护。实现与检查在 `editor.py`、`vendor/latex-settings.mjs`、`test_editor.py`、`test_ui.cjs`、`test_settings.mjs` 和 `test_preferences.py`。

本地 AI 批注通过 Send 生成建议后，每处在源码编辑区显示红色原文、绿色修改和独立的 Keep / Undo。预览不改源码；Keep 先保存准确的当前草稿及该处修改，再以一次可撤销操作应用，Undo 只撤销该处建议并保留原文。其他编辑和待校对标记继续保留，后续 Send 只发送尚未生成建议的批注。每处 Keep 作为独立历史检查点，包含原选区、修改要求、源码行号和 AI 回复；无需修改的回答按批次记录。保存失败保留源码和建议；带唯一请求编号的批注保存可安全重试，普通保存不重试。未处理的建议沿用批注的关闭、切换与外部冲突保护。批注和校对预览不写入 `.tex` / Markdown 源码，旧对话不回填批注关联。实现为 `scripts/vendor/latex-proofread.{mjs,css}` 与 `latex-chat.mjs`，检查覆盖 `test_proofread.mjs`、`test_chat_ui.mjs` 和 `test_chat.py`。

设置提供独立的“编辑器校对（Proofread）”与“PDF 校对（Proofread）”开关，均默认开启，偏好跨项目保存。关闭编辑器校对时，待处理建议移至批注列表；关闭 PDF 校对时恢复正式 PDF，并忽略未完成预览请求的结果。两者都关闭后，新 Send 修改走原有直接保存应用流程；切换开关不自动接受或丢弃已生成建议。Markdown 仅使用编辑器校对开关，PDF 校对开关不启用其临时 PDF 编译。检查覆盖 `test_settings.mjs`、`test_preferences.py`、`test_proofread.mjs`、`test_proofread_pdf.mjs`、`test_chat_ui.mjs`。

LaTeX 批注建议同时生成临时 PDF 校对预览：文字保持正常深色，原文与修改稿分别使用浅红／浅绿背景，实际改动的词和数学符号另叠加较深背景，与源码校对的两级背景一致。沿用 `revision_segments` 的 TeX 词法差异，未知宏参数、引用及元数据不拆开标记。临时 TeX 通过兼容 pdfLaTeX／LuaLaTeX／XeLaTeX 的 PDF literal 为安全文字词和数学原子写入逐词 marked-content 标签，不改变数学原子类型或词间换行。公式内部选区通过 `revision_segments(prefix=...)` 扫描选区前的真实源码，继承数学定界符及环境上下文，避免把 `L^2`、上下标或无花括号分数参数当成普通文字插入 literal。PDF 专用 `safe=True` 扫描跳过环境的列格式、维数和可选参数，以及重音、数值原语、未知宏的无花括号参数；公式内文本命令整体作为安全原子处理，不往其正文插入数学类命令。预览分段使用受保护宏，避免在非 long 命令参数中放入字面的 `\par`。选区紧跟多参数数学命令时直接使用修改后预览；其他装饰编译失败时仅重试一次完全不带装饰的准确候选源码，并返回 `plain_preview` 让界面提示在源码对比原文。候选自身的语法错误仍报错，不写真实文稿、接受建议或覆盖正式 PDF。未知宏与跨结构选区可回退，不承诺对任意 TeX 宏展开做精确标记。真实双引擎边界检查在 `test_proofread_safety.py`，涵盖公式文字、上下标、分数、表格、环境参数、注释、verbatim、不完整选区及失败保留。浏览器使用 PDF.js 字形位置按行绘制浅背景、按改词绘制深背景；同一建议同一侧中，同一行相邻的连续改词合并为一整块深背景，包含词间空格，遇到未改文字（含未标记的宏输出）、换行或远距离列间空白则断开；背景忽略鼠标事件，随缩放重绘，Keep／Undo、替换 PDF 或关闭校对时清除，异步结果不得回填已移除的预览。项目校对按基线原文与当前内容比较。PDF 页边的每处 Keep / Undo 与源码校对卡片共享操作。`/proofread` 在独立临时目录覆盖当前草稿并编译主文件（含子文件相对依赖）；不写真实源码、历史版本、历史 PDF 缓存，也不覆盖正式 PDF / SyncTeX。临时 PDF 仅在服务内存保留最近两份，临时源码和构建文件立即清理；普通 PDF 下载仍导出正式文稿。预览期间停用正式源码定位，处理完建议恢复正常 PDF；失败保留原 PDF 和建议。Keep 沿用正式保存及历史检查点流程，Undo 不新增历史。实现为 `scripts/proofread.py`、`vendor/latex-proofread-pdf.mjs` 和现有编译适配；检查覆盖 `test_proofread_pdf.py` / `.mjs`，共享的临时源码编译沿用 `test_history_pdf.py`。

PDF 校对临时预览中，正文的浅红原文与浅绿修改分别另起段落，段前留少量间距；TeX 运行时通过 `\ifmmode` / `\ifinner` 避免在数学内部或表格单元格等受限盒子中插入段落。此排版仅由 `proofread_source` 添加到临时编译源码，Keep 仍应用原始 replacement，不把预览的段落命令写入正式文稿。检查覆盖实际 PDF 文字纵向位置、数学内部及表格单元格编译，沿用源码和历史不变检查。

历史活动流统一显示整个项目的记录，按每条记录所属源码文件的章节定位改动，同一文件的五分钟保存组与对比基线保持独立。恢复另一文件前保存当前编辑草稿，并校验当前文件与目标文件的版本。鼠标移入记录栏时，使用已登录的 Codex CLI 在后台概括尚未缓存的记录，每批最多 12 个；摘要跟随界面语言，按版本、对比基线和语言分别存入现有历史数据库，不进入项目问答。旧版摘要保留为简体中文缓存，切换语言会取消旧请求并复用或生成对应语言的摘要。摘要失败仍显示本地章节位置，关闭历史会取消未完成请求。

第三方资源许可证必须保留，来源和版本见 `plugins/latex-codex/scripts/vendor/README.md`。PDF.js 主程序、worker、viewer 和配套资源需一起更新。当前 API / worker 含两处本地扩展：暴露原始 MediaBox，并支持按 glyph 读取精确文字位置；更新上游时保留这些扩展和 `test_history_pdf.py` / `test_editor.py` 的裁切、跨页检查。Node 仅用于维护测试的 PDF.js runner，插件运行时无需 Node。

Python 检查位于 `plugins/latex-codex/scripts/test_*.py`，前端检查位于同目录的 `test_*.cjs` 和 `test_*.mjs`。按变更选择现有检查；文档修改只需核对内容、路径和 `git diff --check`。
