[English](README.md) · [简体中文](README.zh-CN.md)

# LaTeX Codex — Codex 侧栏里的 LaTeX 工作区

**一边与 Codex 对话，一边看论文、改论文。** LaTeX Codex 将源码和 PDF 放进 Codex 应用的右侧栏。积累批注，在主对话中统一提交修改要求，再到旁边查看结果。

安装后，只需说：**“用 latex-codex 打开 main.tex。”** 可以直接编辑，也可以告诉 Codex 怎么改；文件自动保存，PDF 通过本地 TeX 编译更新。

## 开始使用

1. 下载本仓库，用 Codex 打开这个文件夹。
2. 对 Codex 说：**“请按 [AGENTS.md](AGENTS.md) 安装 latex-codex。”**
3. 安装后新开对话，说：**“用 latex-codex 打开 main.tex。”** 也可指定文稿路径。

编辑会直接保存到原始 `.tex` 文件。

## 功能演示

点击预览查看完整视频，演示均配有中英字幕。

### 批注直接交给 Codex 主对话

选中源码，点击批注图标并保存要求，在 Codex 主对话中统一提交。跨文件的修改可在历史中分别查看。

[![观看原对话框批注演示](docs/media/04-native-comments.gif)](docs/media/04-native-comments.mp4)

### 圈选内容，说出修改要求

在 PDF 中选中一个词、一段话，或带公式的段落，添加批注让 Codex 修改对应内容，源码与 PDF 一起更新。

[![观看批注修改演示](docs/media/03-pdf-comments.gif)](docs/media/03-pdf-comments.mp4)

### LaTeX ↔ PDF 跳转

抓手模式下双击 PDF，定位对应源码；双击行号或点击中间的 **→**，跳回 PDF。章节拨轮方便浏览长文，指定 `main.tex` 后，还能跨 `\input` / `\include` 文件跳转。

[![观看双向跳转演示](docs/media/01-navigation.gif)](docs/media/01-navigation.mp4)

### 本地历史

修改自动保存，可以对比源码变化、查看 PDF 修改前后的效果，并恢复历史版本。

[![观看历史演示](docs/media/02-history.gif)](docs/media/02-history.mp4)

也支持 Vim 快捷键、命令补全和行内公式预览。

**界面语言：** 默认跟随系统语言，无法识别时使用**英文**；如未自动生效，可在**齿轮 → 语言**中手动切换。
