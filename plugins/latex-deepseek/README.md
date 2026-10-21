# LaTeX in AI Sidebar for DeepSeek Harness

在 DeepSeek Harness 侧边栏中撰写 LaTeX 和 Markdown，与 AI 讨论论文、生成修改建议并逐处校对。

- 本地 PDF 编译、源码与 PDF 双向定位、选字及公式批注。
- 浮动项目对话、选文批注、多层侧边对话与分支树；支持重命名、确认删除和拖动分栏。
- 公式显示、单条回复导出和可选 AI 行内补全。
- 源码及 PDF 逐处 Keep / Undo、全部接受、项目修改校对及本地历史。

解压后，在此目录运行：

```sh
python scripts/editor.py /path/to/main.tex
```

在浏览器打开打印的本地地址。也支持 `.md` / `.markdown`。
安装到 Harness、更新和可选主对话桥接见 [AGENTS.md](AGENTS.md)。
