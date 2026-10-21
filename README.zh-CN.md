[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX in AI Sidebar

**在 AI 应用的侧边栏里完成论文写作、修改与校对。**

把研究的最后一步带进 AI 应用的侧边栏：撰写 LaTeX 与 Markdown，与 AI 讨论原文和公式，并结合本地预览逐处审阅 AI 的修改。

目前通过独立插件支持 **Codex** 和 **DeepSeek Harness**，Claude 适配在规划中。项目原名 **codex-latex-editor / LaTeX Codex**。

- 选中源码，或在 PDF 中选字、框选公式及段落，添加内部批注，点击 **Send** 生成 AI 建议；在源码与 PDF 中逐处 **Keep / Undo**，或点击**全部接受**。
- 在浮动项目对话中讨论论文，选择模型、思考等级和写作风格，并将回复记录为 Markdown；开启 **”** 可获取论文原句的 PDF 跳转链接。
- 选中对话文字可引用追问，或打开可嵌套的侧边子对话；用横向对话树切换分支，主对话保持可见。
- Markdown 实时预览、使用现有 TeX 环境编译 PDF，并回看自动保存的源码历史与 PDF 改动。

对 Codex 说：**使用 latex-codex 打开 main.tex**，或直接运行：

```sh
python plugins/latex-codex/scripts/editor.py /path/to/main.tex
```

在侧边浏览器打开打印的本地地址。选中源码或 PDF 内容，添加批注，然后点击 **Send**。
可将单个 `.tex`、`.md` 或 `.markdown` 文件拖到编辑区或预览区打开原文件；若浏览器隐藏路径，请用“文件 → 打开文件”。

Codex 使用 **latex-codex**，DeepSeek Harness 使用独立的 **latex-deepseek** 插件。原有安装命令及本地历史继续兼容，安装与维护细节见 [AGENTS.md](AGENTS.md)。

## 功能演示

演示均配有中英字幕，点击图片可放大 GIF 或查看完整视频。

### 批注（主对话框）

选中源码，点击批注图标并保存要求，在 Codex 主对话中统一提交。

[![观看原对话框批注演示](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### 内部批注（不占主对话框）

**框选。** 在 PDF 中选字，或框选公式与段落，定位对应源码并添加内部批注。右键添加批注，也可在设置中开启框选后自动弹出批注。

[![框选与内部批注演示](docs/media/01-internal-annotations.gif)](docs/media/01-internal-annotations.gif)

**AI 修改与 Proofread。** 输入要求并点击 **Send**，在源码和 PDF 中查看红绿改动：**Keep** 保存该处修改，**Undo** 保留原文。在**齿轮**中分别开关编辑器与 PDF 校对；开启**项目修改校对**，还可审阅主对话或外部工具的修改。

[![AI 修改与源码及 PDF Proofread 演示](docs/media/02-internal-proofread.gif)](docs/media/02-internal-proofread.gif)

批注工具栏的 **Style** 提供前置提示词；**齿轮 → 修改标记颜色**可为修改添加颜色，方便向审稿人展示变动。

### 原文引用与侧边对话

开启浮动项目对话标题栏的 **”**，让 AI 提供可点击的论文原句引用。点击链接即可定位源码与 PDF 原文；阅读时可在圆球、短栏和完整对话框之间切换。

[![原文引用跳转与对话框切换演示](docs/media/04-cite-chat.gif)](docs/media/04-cite-chat.gif)

选中对话文字，可添加引用批注或在侧边对话中提问，继续嵌套追问时主对话保持可见。展开对话树即可切换、重命名或确认删除分支，拖动中间分隔线可调整两栏大小。

[![引用跳转与侧边聊天分支演示](docs/media/05-cite-branches.gif)](docs/media/05-cite-branches.gif)

### 本地历史

修改自动保存，可以对比源码变化、查看 PDF 修改前后的效果，并恢复历史版本。

[![历史源码与 PDF 对比演示](docs/media/03-local-history.gif)](docs/media/03-local-history.gif)

### 编辑与个性化

- **编辑功能：** 默认普通编辑，支持切换 Vim 和 Emacs 模式，以及语法高亮、命令补全、行内公式预览等常用功能。
- **界面语言：** 支持多语言切换，默认跟随系统语言，无法识别时使用英文；可在**齿轮 → 语言**中手动选择。
- **主题风格：** 支持多种浅色、深色主题切换，也可上传或粘贴截图，生成并保存自定义配色。

### Markdown → PDF

打开 `.md` 或 `.markdown` 笔记，实时预览；点击 **PDF 预览**，使用本地 TeX 将表格、公式和 TikZ 图编译成 PDF。Markdown 同样支持源码与 PDF 双向跳转、AI 批注修改和历史对比。

[![观看 Markdown 编译演示](docs/media/05-markdown.gif)](docs/media/05-markdown.mp4)

版本更新见 [Releases](https://github.com/Fr0zenWatter/latex-in-ai-sidebar/releases)。订阅新版本：在 GitHub 点击 **Watch → Custom → Releases**。
