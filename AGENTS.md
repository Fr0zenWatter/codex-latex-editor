# 项目约定

- README 写给使用者：只保留简短介绍、主要功能和最短用法。环境、安装命令和维护细节放在本文件。
- 插件源码在 `plugins/latex-codex/`，市场配置在 `.agents/plugins/marketplace.json`。修改仓库源码，不直接修改已安装的缓存副本。
- 不提交论文、实验备份、分享压缩包、文档历史数据库或凭据。

## 安装

先检查已登录的 Codex 桌面应用与 CLI、Python 3.10+（含 tkinter）、TeX Live 或 MiKTeX，以及 Poppler 的 `pdfinfo`。TeX 环境需提供 `xelatex` / `pdflatex`、`bibtex` 和 `synctex`。缺少依赖时说明缺项，不自动安装 TeX 环境或更改全局设置。前端资源已随插件附带，无需 npm 安装。

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

安装后让用户新开对话，使用 latex-codex 打开指定的 `.tex` 文件。保持仓库目录可用，作为本地插件源。当前版本已在 Windows 验证，其他系统尚未实测。

安装机制参见 [官方文档](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)。

## 启动与数据

独立启动编辑器：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

打开终端打印的回环地址；AI 功能使用已登录的 Codex CLI。完整操作说明见 `plugins/latex-codex/skills/latex-codex/SKILL.md`。

编辑会自动保存到原始 `.tex` 文件；版本历史保存在文档旁的 `.latex-codex/history.sqlite3`。仅在查看历史“PDF 改动”时，将每处修改前后的 PNG 对比图（包含整句标红）存入 `.latex-codex/pdf-diff-cache/`；普通编译不保存完整 PDF 或 SyncTeX 存档。再次查看直接读图，缺失或损坏时按需编译生成；“重新编译”强制更新这一组对比图。跨页改动按页保存，新增或删除的一侧显示空白说明。缓存可删除，每项目上限 256 MiB，30 天未使用的存档在缓存读写时清理；源码历史不受影响。失败编译或未完成的渲染不覆盖已有对比图。旧版 `.latex-codex/pdf-cache/` 已停用，可删除。永久历史只记录入口文件，旧版本补编译会使用当前的图片、参考文献和引用文件。当前不支持多文件导航和 Biber。

## 维护

历史胶囊标签的 React / TypeScript 源码在 `plugins/latex-codex/frontend/`，使用 Tailwind CSS 与 shadcn 风格的 Radix Tabs。组件统一放在 `frontend/components/ui/`；`@/components/ui` 别名和 `components.json` 都指向这里，避免组件导入与 shadcn CLI 生成路径不一致。样式入口为 `frontend/styles.css`。

维护时在该目录执行 `npm ci`、`npm run build`（包含 TypeScript 检查）；生成的 `scripts/vendor/history-tabs.{mjs,css}` 和许可证文件随插件一起分发，使用者不需要 Node。需要新增 shadcn 组件时可在该目录执行 `npx shadcn@latest add <组件名>`，保留现有适配。npm 依赖与锁文件保留在源码中，不分发 `node_modules`。

历史活动流按入口文件的章节定位改动。鼠标移入记录栏时，使用已登录的 Codex CLI 在后台概括尚未缓存的记录，每批最多 12 个；结果存入现有历史数据库，不进入项目问答。摘要失败仍显示本地章节位置，关闭历史会取消未完成请求。

第三方资源许可证必须保留，来源和版本见 `plugins/latex-codex/scripts/vendor/README.md`。PDF.js 主程序、worker、viewer 和配套资源需一起更新。

Python 检查位于 `plugins/latex-codex/scripts/test_*.py`，前端检查位于同目录的 `test_*.cjs` 和 `test_*.mjs`。按变更选择现有检查；文档修改只需核对内容、路径和 `git diff --check`。
