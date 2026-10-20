# LaTeX in AI Sidebar for DeepSeek Harness：安装与维护

此包包含完整编辑器、PDF.js、字体及第三方许可证，不依赖原生 Codex 插件（latex-codex）或源码仓库，不需要 npm / pip 安装。

需要 Python 3.10+、已安装并登录的 DeepSeek Harness。LaTeX PDF 需要已有的 XeLaTeX / pdfLaTeX 和 SyncTeX；文献按项目需要 BibTeX 或 Biber。Markdown 实时预览不需要 TeX。不会自动安装 TeX 或修改全局环境。

## 安装到 DeepSeek Harness

1. 将压缩包中的整个 `latex-deepseek` 文件夹放到 `~/.dsh/skills/` 下；Windows 默认是 `%USERPROFILE%\.dsh\skills\latex-deepseek`。设置了 `DSH_HOME` 时使用该目录下的 `skills/`。保留其中的 `SKILL.md`、`scripts/` 和 `runtime/`。
2. 新开 DeepSeek 对话，输入“使用 latex-deepseek 打开指定文稿”。也可直接运行 `python scripts/editor.py /path/to/main.tex`，并打开打印的本地地址。

更新前关闭此插件启动的编辑器服务并保存草稿，再用新包替换整个插件文件夹；不要合并旧 runtime。文稿、`.latex-codex/` 项目历史、Harness 登录及用户偏好独立保存，不放进插件目录。

Codex 用户也可沿用仓库本地市场的 `latex-deepseek@latex-codex-shared` 安装入口；普通原生 Codex 更新仍使用独立的 `latex-codex` 插件。

## 可选主对话转发

只需要 Send 和项目对话时，无需安装桥接。需要“发送到 DeepSeek 主对话”时，在插件目录运行：

```sh
python scripts/install_deepseek_bridge.py
```

脚本仅向 Harness 的 `profiles/desktop/cordis.patch.yml` 添加桥接配置。已有旧安装位置时，先移除该文件内旧的 `latex-main-chat-bridge` 条目，再运行上述命令；保留其他配置。默认 HMR 会加载，关闭 HMR 时重启 Harness。

从目标 DeepSeek 主对话启动编辑器，才能绑定该会话；在外部终端启动时普通 Send 可用，但主对话转发不可用。实际消息只由用户点击转发按钮发送，更新与检查不向现有对话提交消息。安装目录移动后需更新桥接路径，不修改 Harness 的 `app.asar`。

## 行为及限制

AI 请求通过已安装的 Harness CLI 使用现有登录。模型菜单区分 Harness 账号与 API 路由；“跟随 DeepSeek 默认”沿用 headless profile，独立于桌面会话当前模型。CLI 未找到时可设置 `DSH_CLI_PATH`，不把凭据放入命令。

插件保持只读 AI 调用及完整回复校验，建议经过 Keep 才写入文稿。主对话上下文不自动加入项目对话。论文宏显示沿用有界 KaTeX 解析。TeX 项目对话打开标题栏的 `”` 引用开关后，仅为该请求启用只读 `mcp__tex_quotes__cite_tex`，主动为具体定义、引理、定理、公式和原句生成可点击的源码 / PDF 定位链接；关闭开关后禁用，刷新需重新开启。临时 MCP 配置与原句快照用后清理，不改全局 Harness 配置；其他工具仍隐藏并拒绝执行。Markdown、行内补全及历史摘要不启用工具。工具事件仅接受完整配对的引用调用与成功结果，失败、截断和其他工具不能应用回复。行内补全默认关闭，思考等级需由选中模型支持。

源码仓库维护者可运行 `python scripts/build_deepseek_plugin.py --output share/latex-deepseek-VERSION.zip` 重新生成独立分享包；压缩包只含插件及运行资源，不含论文、凭据、历史数据库、测试或 node_modules。

引用工具和历史助手消息向模型提供 21 字符短编号链接，回复完成后由程序核实原句并还原完整持久化链接，避免模型抄坏长编码；未知编号不能显示或应用回复。映射仅在本次请求内存中保存，不改文稿、当前选区、用户要求或历史数据库。旧长链接只有上下文损坏而项目、文件、完整原句、范围及行号仍与当前源码精确相符时可恢复；否则要求重新引用。
