[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex — Codex 侧栏里的 LaTeX 工作区

**一边与 Codex 对话，一边看论文、改论文。** LaTeX Codex 将源码和 PDF 放进 Codex 应用的右侧栏。积累批注，在主对话中统一提交修改要求，再到旁边查看结果。

安装后，只需说：**“用 latex-codex 打开 main.tex。”** 可以直接编辑，也可以告诉 Codex 怎么改；文件自动保存，PDF 通过本地 TeX 编译更新。内置历史快照系统，支持回溯历史版本、对比源码与 PDF 改动。

## 功能演示

点击预览查看完整视频，演示均配有中英字幕。

### 批注（主对话框）

选中源码，点击批注图标并保存要求，在 Codex 主对话中统一提交。

[![观看原对话框批注演示](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### 临时批注（不占主对话框）

在 PDF 中选中一个词、一段话，或带公式的段落，添加批注让 Codex 修改对应内容，源码与 PDF 一起更新。

可在**齿轮 → 修改标记颜色**中选择颜色，用 LaTeX `\color` 标注批注中实际修改的内容，方便在 PDF 中查看；选择“无”即可关闭颜色标注。

[![观看批注修改演示](docs/media/03-pdf-comments.gif)](docs/media/03-pdf-comments.mp4)

### LaTeX ↔ PDF 跳转

抓手模式下双击 PDF，定位对应源码；双击行号或点击中间的 **→**，跳回 PDF。章节拨轮方便浏览长文，指定 `main.tex` 后，还能跨 `\input` / `\include` 文件跳转。

[![观看双向跳转演示](docs/media/01-navigation.gif)](docs/media/01-navigation.mp4)

### 本地历史

修改自动保存，可以对比源码变化、查看 PDF 修改前后的效果，并恢复历史版本。

[![观看历史演示](docs/media/02-history.gif)](docs/media/02-history.mp4)

### 编辑与个性化

- **编辑功能：** 默认普通编辑，支持切换 Vim 和 Emacs 模式，以及语法高亮、命令补全、行内公式预览等常用功能。
- **界面语言：** 支持多语言切换，默认跟随系统语言，无法识别时使用英文；可在**齿轮 → 语言**中手动选择。
- **主题风格：** 支持多种浅色、深色主题切换，也可上传或粘贴截图，生成并保存自定义配色。

## 开始使用

1. 下载本仓库，用 Codex 打开这个文件夹。
2. 对 Codex 说：**“请按 [AGENTS.md](AGENTS.md) 安装 latex-codex。”**
3. 安装后新开对话，说：**“用 latex-codex 打开 main.tex。”** 也可指定文稿路径。

编辑会直接保存到原始 `.tex` 文件。
