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

打开终端打印的回环地址；AI 功能使用已登录的 Codex CLI。完整操作说明见 `plugins/latex-codex/skills/latex-codex/SKILL.md`。

编辑会自动保存到当前源码文件；主编译文件保持固定。默认项目根目录是主文件所在目录，可在“文件 → 项目设置”或启动参数 `--project-root` 中指定包含正文和附录的共同目录。TeX 的相对引用仍从主文件所在目录解析。源码文件选择器和 PDF 反向跳转可打开项目内的 `\input` / `\include` 文件；历史与对话统一保存在项目根目录的 `.latex-codex/history.sqlite3`，源码历史按项目相对路径区分。仅在查看历史“PDF 改动”时，将每处修改前后的 PNG 对比图（包含整句标红）存入 `.latex-codex/pdf-diff-cache/`；普通编译不保存完整 PDF 或 SyncTeX 存档。再次查看直接读图，缺失或损坏时按需编译生成；“重新编译”强制更新这一组对比图。跨页改动按页保存，新增或删除的一侧显示空白说明。缓存可删除，每项目上限 256 MiB，30 天未使用的存档在缓存读写时清理；源码历史不受影响。失败编译或未完成的渲染不覆盖已有对比图。旧版 `.latex-codex/pdf-cache/` 已停用，可删除。永久历史分别记录已打开的源码文件；子文件的历史 PDF 通过临时源码覆盖编译主文件，使用其余依赖的当前版本。切换源码前保存当前修改；未发送的批注或正在生成的回复需先处理。PDF 选区不可一次跨越多个源码文件。当前不支持 Biber。

## 维护

用户界面偏好保存在用户目录的 `.latex-codex/preferences.sqlite3`，跨文稿和服务端口共享，包括语言、编辑模式、源码字号、目录样式、配色与自定义配色、修改标记色、修订色、自动编译和分栏比例。设置即时应用并自动保存，设置菜单的“保存设置”确认写入；失败显示提示并保留待保存值。浏览器 localStorage 只作兼容缓存，首次使用优先沿用当前地址下的旧偏好。设置库不随插件分发或提交。

历史胶囊标签的 React / TypeScript 源码在 `plugins/latex-codex/frontend/`，使用 Tailwind CSS 与 shadcn 风格的 Radix Tabs。组件统一放在 `frontend/components/ui/`；`@/components/ui` 别名和 `components.json` 都指向这里，避免组件导入与 shadcn CLI 生成路径不一致。样式入口为 `frontend/styles.css`。

维护时在该目录执行 `npm ci`、`npm run build`（包含 TypeScript 检查）；生成的 `scripts/vendor/history-tabs.{mjs,css}` 和许可证文件随插件一起分发，使用者不需要 Node。需要新增 shadcn 组件时可在该目录执行 `npx shadcn@latest add <组件名>`，保留现有适配。npm 依赖与锁文件保留在源码中，不分发 `node_modules`。

历史活动流按当前源码文件的章节定位改动。鼠标移入记录栏时，使用已登录的 Codex CLI 在后台概括尚未缓存的记录，每批最多 12 个；摘要跟随界面语言，按版本、对比基线和语言分别存入现有历史数据库，不进入项目问答。旧版摘要保留为简体中文缓存，切换语言会取消旧请求并复用或生成对应语言的摘要。摘要失败仍显示本地章节位置，关闭历史会取消未完成请求。

第三方资源许可证必须保留，来源和版本见 `plugins/latex-codex/scripts/vendor/README.md`。PDF.js 主程序、worker、viewer 和配套资源需一起更新。当前 API / worker 含两处本地扩展：暴露原始 MediaBox，并支持按 glyph 读取精确文字位置；更新上游时保留这些扩展和 `test_history_pdf.py` / `test_editor.py` 的裁切、跨页检查。Node 仅用于维护测试的 PDF.js runner，插件运行时无需 Node。

Python 检查位于 `plugins/latex-codex/scripts/test_*.py`，前端检查位于同目录的 `test_*.cjs` 和 `test_*.mjs`。按变更选择现有检查；文档修改只需核对内容、路径和 `git diff --check`。
