import {translations} from './latex-locales.mjs';

export const english = {
  '项目修改校对（主对话 / 外部修改）':'Project change review (main chat / external edits)',
  '记录项目 TeX 修改，逐处 Keep / Undo；手动输入照常保存。':'Review project TeX changes with Keep / Undo. Manual typing saves normally.',
  '项目校对 · {count}':'Project review · {count}',
  '请先保存编辑草稿，再处理项目校对。':'Save the editor draft before reviewing project changes.',
  '项目修改已变化，请刷新校对后重试。':'Project changes have changed. Refresh the review and retry.',
  '写作风格':'Writing style', '导入提示词':'Import prompt',
  '请选择不超过 64 KB 的 UTF-8 .txt 或 .md 提示词文件。':'Choose a UTF-8 .txt or .md prompt file up to 64 KB.',
  '提示词需包含 1–12000 个字符。':'The prompt must contain 1–12000 characters.',
  '编辑器校对（Proofread）':'Editor proofreading',
  'PDF 校对（Proofread）':'PDF proofreading',
  '都关闭时，Send 直接应用新修改；已有建议仍可在批注列表确认。':'With both off, Send applies new changes directly. Existing suggestions remain in the comment list.',
  '请逐处选择 Keep 或 Undo；也可在批注列表处理。':'Choose Keep or Undo for each suggestion, also available in the comment list.',
  '已恢复正式 PDF。':'Restored the regular PDF.',
  '正在编译 PDF 校对预览…':'Compiling PDF proofread preview…',
  'PDF 校对预览：红色删除，绿色保留；不写入历史。':'PDF proofread: red is removed, green is kept. No history entry.',
  'PDF 校对预览失败：{message}':'PDF proofread preview failed: {message}',
  '请先处理 PDF 校对建议，再进行源码定位。':'Resolve PDF proofread suggestions before source navigation.',
  '校对修改':'Proofread changes', '撤销这处建议':'Undo this suggestion', '保留这处修改':'Keep this change',
  '请在源码逐处选择 Keep 或 Undo。':'Choose Keep or Undo for each change in the source.',
  '正在保存，请稍后重试。':'Saving. Please try again shortly.', '已撤销这处建议，原文保留。':'Suggestion undone. Original text preserved.',
  'Markdown 源码':'Markdown source', 'Markdown 预览':'Markdown preview',
  'PDF 预览':'PDF preview', '实时预览':'Live preview', '已切换到实时预览':'Switched to live preview',
  '保存并预览':'Save and preview', '下载源码':'Download source',
  '定位光标到预览':'Locate cursor in preview',
  '已保存 · 预览已更新':'Saved · Preview updated',
  '{name} · 自动保存与实时预览':'{name} · Autosave and live preview',
  '请在系统窗口中选择 .tex 或 .md 文件…':'Choose a .tex or .md file in the system dialog…',
  'AI 批注 · {count}':'AI comments · {count}',
  '批注与 AI 回复 · {count}':'Comments and AI reply · {count}',
  '第 {first}–{last} 行':'Lines {first}–{last}', '原选区':'Original selection', 'AI 回复':'AI reply',
  '批注与修改已保存到历史。':'Comments and changes saved to history.',
  '搜索与替换':'Find and replace', '搜索内容':'Search for', '替换为':'Replace with',
  '上一个匹配':'Previous match', '下一个匹配':'Next match', '关闭搜索':'Close search',
  '区分大小写':'Match case', '正则表达式':'Regular expression', '整词匹配':'Whole word', '仅在选区搜索':'Search in selection',
  '不区分大小写':'Ignore case', '普通文本':'Plain text',
  '替换':'Replace', '全部替换':'Replace All', '无匹配':'No matches', '请先选择源码范围。':'Select a source range first.',
  '正则表达式无效：{message}':'Invalid regular expression: {message}',
  'PDF 第 {page} 页，共 {total} 页':'PDF page {page} of {total}',
  '拖动滚动 PDF':'Drag to scroll PDF', '方向键滚动 PDF':'Arrow keys scroll PDF',
  '正在读取框选区域…':'Reading the boxed selection…',
  '框内没有可选择的文字，请扩大选框。':'No selectable text inside the box. Enlarge the selection.',
  '已框选 PDF 内容，右键添加批注 · Esc 取消':'PDF content selected. Right-click to add a comment · Esc to clear',
  '框选失败：{message}':'Box selection failed: {message}',
  '框选后自动弹出 PDF 批注对话框（无需右键）':'Automatically open PDF comments after box selection (no right-click)',
  '源码字号':'Source font size', '保存设置':'Save settings',
  '设置更改会自动保存，并在下次打开时恢复。':'Settings are saved automatically and restored next time.',
  '正在保存设置…':'Saving settings…', '设置已保存，下次打开会恢复。':'Settings saved. They will be restored next time.',
  '设置保存失败：{message}':'Could not save settings: {message}',
  '章节目录':'Section outline',
  '轮盘':'Dial', '章节卡片 + 小节轮盘':'Section cards + subsection dial',
  '章节卡片：方向键浏览，Enter 跳转':'Section cards: arrow keys to browse, Enter to jump',
  '小节轮盘：方向键浏览，Enter 跳转':'Subsection dial: arrow keys to browse, Enter to jump',
  '打开章节拨轮':'Open section dial', '章节拨轮：方向键浏览，Enter 跳转':'Section dial: arrow keys to browse, Enter to jump',
  '拖动滚动 PDF，悬停或点击打开章节目录':'Drag to scroll PDF; hover or click to open outline',
  '方向键滚动 PDF，Enter 打开章节目录':'Arrow keys scroll PDF; Enter opens outline',
  '跳转到章节':'Jump to section', '点击跳转':'Click to jump', 'PDF 当前':'PDF position',
  '项目设置':'Project settings', '项目根目录':'Project folder', '主编译文件':'Main TeX file', '项目源码':'Project source', '应用':'Apply',
  '主文件：{name}':'Main: {name}',
  '选择包含主文件和附录的文件夹。主编译文件可填写相对路径；切换源码始终编译此文件。':'Choose the folder containing the main file and appendices. The main file can use a relative path; it is compiled when editing any source.',
  '请先保存修改、处理冲突，并发送或删除批注，再切换源码。':'Save edits, resolve conflicts, and send or delete comments before switching source.',
  '项目文件已变化，请重新编译后定位。':'Project files changed. Recompile before navigating.',
  '选区跨越多个源码文件，请分别选择。':'This selection spans multiple source files. Select each file separately.',
  '编译失败 · {name} 第 {line} 行：{message}':'Compilation failed · {name}, line {line}: {message}',
  '查看对话':'View conversation', '上下文记录':'Context record',
  '添加批注':'Add comment', '保存批注':'Save comment', '删除批注':'Delete comment',
  'PDF 批注':'PDF comment', '拖动批注框':'Move comment', '批注要求':'Comment request',
  '写下这处的修改要求…':'Describe the change here…', '保存批注 · Ctrl+Enter':'Save comment · Ctrl+Enter',
  '批注 · {count}':'Comments · {count}', '编辑批注 {number}':'Edit comment {number}',
  '发送全部批注':'Send all comments', '待发送批注':'Pending comments',
  '选中 PDF 文字，写下要求，再点顶部 Send。':'Select PDF text, add a request, then click Send above.',
  '选区已变化，请重新选择后添加批注。':'The selection changed. Select it again to add a comment.',
  '选区已变化，请删除这条批注并重新选择。':'The selection changed. Delete this comment and select the text again.',
  '批注选区重叠，请编辑原批注或另选位置。':'Comments overlap. Edit the existing comment or choose another range.',
  '每次最多发送 100 条批注。':'Send up to 100 comments at a time.',
  '批注选区已变化，未发送。请点批注检查并重新选择。':'A commented selection changed. Nothing was sent. Review the comments and select again.',
  '批注草稿尚未保存，请重新打开并检查选区。':'The comment draft is unsaved. Reopen it and check the selection.',
  '已停止，批注保留，可重新发送。':'Stopped. Your comments are kept for retry.',
  'Codex 正在处理批注…':'Codex is processing comments…',
  '批注修改返回不完整，未应用。请重试。':'The comment response is incomplete. No edits were applied. Retry.',
  '批注选区已变化，未应用任何修改。批注已保留。':'A commented selection changed. No edits were applied. Your comments are kept.',
  '批注已处理，修改将自动保存。':'Comments processed. Edits will be saved automatically.',
  '打开其他文件会放弃未发送批注和未保存修改。继续？':'Opening another file discards pending comments and unsaved edits. Continue?',
  '重新读取会放弃未发送批注和未保存修改。继续？':'Reloading discards pending comments and unsaved edits. Continue?',
  '请先发送或删除批注，再恢复历史。':'Send or delete pending comments before restoring a version.',
  '色盘':'Color wheel', '中性色':'Neutral colors', '色盘颜色 {color}':'Color wheel swatch {color}', '色相位置 · 中性色按明暗排列':'Hue positions · Neutrals ordered by brightness', '语法配色 · 可逐项微调':'Syntax colors · Adjust individually', '备用色':'Unused swatch', '面板':'Panel', '边框':'Border', '注释':'Comments', '命令':'Commands', '公式':'Math', '运算符':'Operators', '引用':'References', '环境':'Environments', '数字':'Numbers', '环境命令':'Environment commands',
  '识别出的配色':'Extracted palette', '识别出的配色 · 点击色块设为背景':'Extracted palette · Click a swatch to set the background', '将 {color} 设为背景':'Use {color} as background', '识别到 {count} 种配色，面积最大颜色已设为背景。':'Extracted {count} colors; the largest area color is the background.',
  '请输入主题名称。':'Enter a theme name.', '截图生成主题':'Theme from screenshot', '关闭':'Close', '自定义':'Custom', '上传截图':'Upload screenshot', '生成配色':'Generate theme', '主题名称':'Theme name', '例如：Modern Minimal':'e.g. Modern Minimal', '配色预览':'Theme preview', '保存并使用':'Save and use', '更新并使用':'Update and use', '背景':'Background', '主色':'Primary', '撞色':'Accent', '主题截图':'Theme screenshot',
  '截取带色块的主题卡片，上传或在此粘贴截图。':'Capture a theme card with color swatches, upload it or paste it here.',
  '未识别到配色，请截取带色块的主题卡片。':'No palette found. Capture a theme card with color swatches.',
  '请选择 PNG、JPG 或 WebP 图片（不超过 10 MB）。':'Choose a PNG, JPG or WebP image (up to 10 MB).',
  '截图已就绪，点击生成配色。':'Screenshot ready. Click Generate theme.', '图片读取失败，请换一张截图。':'Unable to read this image. Try another screenshot.',
  '配色已生成，可微调颜色后保存。':'Theme generated. Adjust colors if needed, then save.', '无法保存主题，请检查浏览器存储空间。':'Unable to save the theme. Check browser storage.',

  '固定记录栏':'Pin activity sidebar', '取消固定记录栏':'Unpin activity sidebar', '历史记录操作':'History entry actions', '重命名':'Rename', '重命名版本':'Rename version',
  '历史视图':'History views', '展开改动记录':'Expand change activity', '改动记录':'Change activity', '正文':'Body', '导言区':'Preamble', '摘要':'Abstract',
  '文档初始版本':'Initial document', '首次保存的版本':'First saved version', '调整文档设置':'Updated document settings', '调整公式与论述':'Updated formulas and discussion', '更新正文':'Updated text',
  '文档格式':'Document formatting', '检查点':'Checkpoint', '调整空白或换行':'Adjusted whitespace or line endings', '内容与上一版相同':'Same contents as previous version',
  'AI 正在概括改动…':'AI is summarizing edits…', 'AI 摘要暂不可用，章节位置已保留':'AI summaries are unavailable; section locations are shown.',
  'PDF 改动':'PDF changes', '改动附近的 PDF 对比':'PDF comparison near edits',
  '正在读取历史对比图，缺失时编译生成…':'Loading comparison images; compiling missing previews…',
  '重新编译':'Recompile', '历史对比图缓存未保存：{message}':'Comparison image cache was not saved: {message}',
  '两个版本没有需要预览的改动。':'These versions have no changes to preview.',
  '只显示改动附近，忽略后续排版移动。历史版本使用当前图片和引用等依赖重新编译。':'Only areas near source edits are shown; later reflow is ignored. Historical source is recompiled using current images, bibliography and other dependencies.',
  '改动 {number}':'Change {number}', '修改前':'Before', '修改后':'After', '查看修改前':'Show before', '查看修改后':'Show after', '此处新增':'Added here', '此处删除':'Deleted here',
  '这处源码没有直接对应的 PDF 内容，请查看源码对比。':'This source change has no directly mapped PDF content. See the source comparison.',
  '{side} · PDF 第 {page} 页':'{side} · PDF page {page}', 'PDF 对比失败：':'Unable to compare PDFs: ',
  'PDF 选区操作':'PDF selection actions',
  '无法唯一匹配选中的 PDF 文字，请在源码中选择。':'Cannot uniquely match the selected PDF text. Select it in the source editor.',
  '已精确选中对应 LaTeX 文字 · 第 {from}–{to} 行':'Selected exact LaTeX text · Lines {from}–{to}',
  '已匹配相似 LaTeX 选区 · 第 {from}–{to} 行':'Matched similar LaTeX selection · Lines {from}–{to}',
  '已按 PDF 位置选中正文及完整公式 · 第 {from}–{to} 行':'Selected prose and complete math by PDF position · Lines {from}–{to}',
  '源码范围无效。':'Invalid source range.',
  'PDF 或源码已变化，请重新选择 PDF 文字。':'The PDF or source changed. Select the PDF text again.',
  '无法确定对应段落，请在源码中选择。':'Unable to locate the paragraph. Select it in the source editor.',
  '已选中对应 LaTeX 段落 · 第 {from}–{to} 行':'Selected matching LaTeX paragraphs · Lines {from}–{to}',
  '正在编译或定位，请稍后重试。':'Compiling or locating. Try again when it finishes.',
  '正在精确匹配选中的 LaTeX 文字…':'Matching the selected LaTeX text precisely…',
  '文件':'File', '打开文件':'Open file', '重新读取文件':'Reload file', '下载 PDF':'Download PDF', '历史':'History', '设置':'Settings',
  '编辑模式':'Editing mode', '普通编辑':'Standard editing',
  '已应用。回到源码按 Ctrl+Z / Cmd+Z 可撤销。':'Applied. Press Ctrl+Z / Cmd+Z in the source editor to undo.',
  '语言':'Language', '跟随系统':'System default', '配色':'Color theme', '当前用户修订色':'Your revision color', '当前用户':'You',
  '橙色':'Orange', '蓝色':'Blue', '紫色':'Purple', '绿色':'Green', '红色':'Red', '青色':'Teal', '洋红':'Magenta', '无':'None',
  'Cobalt · 深蓝':'Cobalt · Deep blue', 'Dracula · 紫灰':'Dracula · Purple', 'Monokai · 炭黑':'Monokai · Charcoal', 'Nord · 冷灰':'Nord · Cool gray',
  '浅色':'Light', '深色':'Dark', 'Eclipse · 白底':'Eclipse · White', 'IDEA · 白底':'IDEA · White', 'Neo · 简洁白':'Neo · Clean white', 'Base16 · 浅灰':'Base16 · Light gray', 'Solarized · 暖白':'Solarized · Warm light', 'Material · 深灰':'Material · Dark gray', 'Palenight · 蓝紫':'Palenight · Blue violet', 'Ayu · 深夜':'Ayu · Night', 'Gruvbox · 暖黑':'Gruvbox · Warm dark', 'Solarized · 深青':'Solarized · Dark cyan',
  '版本历史':'Version history', '刷新':'Refresh', '关闭历史':'Close history', '改动对比':'Changes', '此版本源码':'Source', '对比':'Compare',
  '与上一版比较':'Previous snapshot', '当前编辑内容':'Current editor contents', '文件当前内容':'Current file contents', '历史源码与差异':'Historical source and changes',
  '版本名称':'Version name', '例如：投稿前定稿':'e.g. Before submission', '保存名称':'Save name', '加载更早版本':'Load earlier versions',
  '按时间排列的版本':'Versions by date', '恢复此版本':'Restore this version', '确定恢复？':'Restore this version?', '取消':'Cancel', '确认恢复':'Confirm restore',
  '自动记录按 5 分钟合并显示；命名版本单独保留。':'Automatic saves are grouped every 5 minutes; named versions remain separate.',
  '本地保存；恢复前会保留当前内容和未保存草稿。':'Stored locally. Restoring preserves current contents and unsaved drafts.',
  '首次打开':'First opened', '自动保存':'Saved', '外部修改':'External edit', '恢复版本':'Restored version', '恢复前的草稿':'Draft before restore',
  '保存版本':'Saved version', '正在读取版本…':'Loading version…', '正在读取历史…':'Loading history…', '暂时没有历史记录。':'No versions yet.',
  '这是最早保存的版本。':'This is the earliest saved version.', '两个版本内容相同。':'These versions are identical.',
  '打开／刷新历史时的编辑内容（含未保存修改）':'Editor contents captured on open/refresh, including unsaved changes', '所选对比版本':'Comparison version',
  '上一版 → 此版本':'Previous snapshot → Selected version', '版本名称已保存。':'Version name saved.', '版本名称已清除。':'Version name cleared.',
  '正在保留当前内容并恢复…':'Preserving current contents and restoring…', '读取失败：':'Unable to load: ', '历史读取失败：':'Unable to load history: ',
  '命名失败：':'Unable to rename: ', '恢复失败：':'Unable to restore: ', '下方还有 {count} 处改动':'{count} more updates below',
  '新增':'Added', '删除':'Deleted', '删除的行':'Deleted line',
  '正在打开…':'Opening…', 'LaTeX 源码':'LaTeX source', '问 Codex':'Ask Codex', '选中文本后与 Codex 对话':'Select text to ask Codex',
  'i 插入 · Esc 普通模式 · / 搜索 · :w 保存并编译':'i Insert · Esc Normal · / Search · :w Save and compile',
  '调整 LaTeX 和 PDF 宽度':'Resize source and PDF', '拖动调整宽度 · 双击恢复各半':'Drag to resize · Double-click for equal widths',
  '定位光标到 PDF':'Locate cursor in PDF', '跳到光标对应的 PDF 位置':'Jump to cursor location in PDF',
  '自动编译':'Automatic compilation', '编译选项':'Compilation options',
  '{name} · 自动保存，手动编译':'{name} · Autosave, manual compilation', '正在保存…':'Saving…', '已保存 · 自动编译已关闭':'Saved · Automatic compilation is off',
  '保存并编译':'Save and compile', '正在编译…':'Compiling…', '本机编译 · PDF 预览':'Local compiler · PDF preview',
  '空格拖动 · Alt + 空格缩放':'Space: pan · Alt+Space: zoom',
  '拖动':'Pan', '选字':'Select text', '切换拖动页面与选择文字':'Switch between panning and text selection',
  '缩小 PDF':'Zoom out', '放大 PDF':'Zoom in', '适合宽度':'Fit width', 'PDF 缩放':'PDF zoom', '滚轮或拖动缩放，点击恢复适合宽度':'Scroll or drag to zoom; click to fit width', '滚轮或拖动缩放，方向键微调':'Scroll or drag to zoom; arrow keys fine-tune', '恢复适合宽度':'Reset to fit width', '编译后的 PDF':'Compiled PDF',
  '编译日志':'Compilation log', '源码操作':'Source actions', '注释 / 取消注释':'Toggle comment', '询问 Codex / 修改选区':'Ask Codex / Edit selection',
  '停止输入 0.8 秒后自动保存并编译':'Autosave and compile after 0.8 s', '尚未保存…':'Unsaved changes…', '请先处理文件冲突':'Resolve the file conflict first',
  '正在保存并编译…':'Saving and compiling…', '已保存 · 编译成功':'Saved · Compilation succeeded', '已保存 · 编译失败，请查看日志':'Saved · Compilation failed; see log',
  '已保存 · 编译成功，PDF 预览加载失败':'Saved · Compiled, but PDF preview failed to load', '文件已被外部修改，请先重新读取':'File changed externally; reload first',
  '保存状态待确认，请重新读取':'Save status uncertain; reload to check', '请在系统窗口中选择 .tex 文件…':'Select a .tex file in the file picker…',
  '已取消打开':'Open cancelled', '打开失败：':'Unable to open: ', '定位失败：':'Unable to locate: ', '请先处理文件冲突。':'Resolve the file conflict first.',
  '请先成功编译当前修改，再定位。':'Compile the current changes successfully before synchronizing.', 'PDF 已更新，请重新编译。':'The PDF changed. Compile again.',
  '编辑内容已变化，请刷新历史后重试。':'Editor contents changed. Refresh history and try again.', '历史版本已恢复，正在编译…':'Version restored. Compiling…',
  '文件已被外部修改；保留了编辑框内容，请先处理冲突':'File changed externally. Your editor contents are preserved; resolve the conflict first.',
  '打开其他文件会放弃尚未保存的修改。继续？':'Opening another file discards unsaved editor changes. Continue?',
  '重新读取会放弃编辑框中尚未保存的修改。继续？':'Reloading discards unsaved editor changes. Continue?',
  '编译失败 · 第 {line} 行：{message}':'Compilation failed · Line {line}: {message}', '已定位到 PDF 第 {page} 页':'Located on PDF page {page}',
  '已定位到源码第 {line} 行':'Located on source line {line}',
  '收起项目对话':'Hide project chat', '项目侧边聊天':'Project side chat', 'Codex · 项目对话':'Codex · Project chat', '新对话':'New chat', '在侧边聊天中提问':'Ask in side chat', '项目记忆自动保存 · Ctrl+Enter 发送':'Project memory autosaved · Ctrl+Enter to send', '项目记忆读取失败，请重新打开对话。':'Unable to load project memory. Reopen the chat.',
  '原生批注选区':'Annotate selection in Codex', '关闭选区预览':'Close selection preview', '请先选择需要批注的 LaTeX 文字。':'Select the LaTeX text to annotate first.', '请选一个连续的文字范围。':'Select a single continuous text range.', '原生文字批注最多 20000 个字符，请缩小选区。':'Native text annotations support up to 20,000 characters. Select a smaller range.', '已请求原生批注，请在原生界面保存后随主对话发送。':'Native annotation requested. Save it in the browser UI and send it with your main-chat message.', '请开启浏览器原生批注，再点击下方的完整选区文字块。':'Enable browser annotations, then click the complete selected passage below.',
  '原生批量批注：逐条保存，最后在主对话统一发送。':'Native batch annotations: save each comment, then send them together from the main chat.',
  '返回编辑':'Return to editing',
  '保存批注后按 Esc 返回编辑，已保存批注可在主对话统一发送。':'After saving the annotation, press Esc to return to editing. Send saved annotations together from the main chat.',
  '按 Esc 返回编辑':'Press Esc to return to editing',
  '已保存批注可在主对话统一发送。':'Send saved annotations together from the main chat.',
  '原生批注暂不可用，请通过浏览器批注选择源码。':'Native annotation requests are unavailable. Use browser annotations to select the source.',
  '临时 Codex 对话':'Temporary Codex conversation', 'Codex · 临时对话':'Codex · Temporary conversation', '结束并清空':'End and clear', '收起临时对话':'Hide conversation',
  '当前选区与上下文':'Selection and context', '使用当前选区':'Use current selection', '携带论文全文；正在读取主对话…':'Includes the document; loading main chat…',
  '对话记录':'Conversation', '选区修改建议':'Proposed replacement', '应用到选区':'Apply to selection', '模型':'Model', '思考等级':'Reasoning effort',
  '跟随 Codex 默认':'Follow Codex default', '跟随默认':'Use default', '修改要求或问题':'Instructions or question',
  '例如：润色这段文字，保留公式和引用':'e.g. Polish this paragraph, preserving formulas and citations', '记住本次对话 · Ctrl+Enter 发送':'Remembers this conversation · Ctrl+Enter to send',
  '停止':'Stop', '发送':'Send', '修改标记颜色':'Replacement color', '修改标记颜色：无':'Replacement color: None', 'Codex 悬浮对话':'Quick Codex conversation',
  '拖动悬浮对话框':'Move quick conversation', '悬浮对话输入':'Quick conversation input', '询问 Codex…':'Ask Codex…', '选择模型和思考等级':'Choose model and reasoning effort',
  '发送 · Ctrl+Enter':'Send · Ctrl+Enter', '模型和思考等级':'Model and reasoning effort',
  '{name} · 停止输入 0.8 秒后自动保存并编译':'{name} · Autosave and compile after 0.8 s', '请求失败':'Request failed',
  '本地编辑器连接中断，请稍后重试。':'Connection to the local editor was interrupted. Please try again.',
  '打开失败：{message}':'Unable to open: {message}', '读取失败：{message}':'Unable to load: {message}', '定位失败：{message}':'Unable to locate: {message}',
  '最低':'Minimal', '低':'Low', '中':'Medium', '高':'High', '很高':'Very high', '最高':'Maximum', '极高':'Ultra',
  '模型默认 · ':'Model default · ', '默认 · ':'Default · ', '默认思考等级':'Default reasoning effort', '正在读取可用模型…':'Loading available models…',
  '修改标记颜色：':'Replacement color: ', '（删除选区）':'(Delete selection)', '携带论文全文 + 主对话 ':'Includes the document + main chat: ',
  ' 条消息':' messages', '（较早内容已省略）':' (earlier content omitted)', '主对话读取失败：':'Unable to read main chat: ',
  '携带论文全文；未关联主对话，请从 Codex 主对话启动编辑器。':'Includes the document. Launch from a Codex chat to link that conversation.',
  '正在修改选区':'Editing selection', '请先选中一段连续的 LaTeX 源码。':'Select a continuous range of LaTeX source first.',
  '已带入选区和当前文档，可以连续追问。':'Selection and document included. You can ask follow-up questions.',
  '请先选中文本，再点“使用当前选区”。':'Select text, then click “Use current selection”.', '已取消悬浮修改。':'Quick edit cancelled.',
  '请先选中一段 LaTeX 源码':'Select some LaTeX source first', 'Codex 正在回复，请稍后发送。':'Codex is replying. Send after it finishes.',
  '选区已变化，请重新选择后打开悬浮对话。':'The selection changed. Select it again and reopen the quick conversation.',
  '已停止，可继续提问。':'Stopped. You can ask another question.', '选区已失效，请重新选择文本。':'The selection is no longer valid. Select text again.',
  'Codex 正在思考…':'Codex is thinking…', '你':'You', '本次回复已停止。':'This reply was stopped.',
  '修改建议已就绪。可继续讨论，或应用到选区。':'Replacement ready. Continue the conversation or apply it to the selection.',
  '可以继续追问；本次对话记忆保留。':'You can follow up; this conversation is remembered.',
  '选区内容已变化，未覆盖修改。请使用当前选区重新提问。':'Selection changed; edits were preserved. Use the current selection and ask again.',
  '编辑器':'Editor', '已应用到选区，将自动保存。':'Applied to selection. Autosave will follow.',
  '已应用。回到源码按 u 可撤销。':'Applied. Press u in the source editor to undo.',
  '跟随系统语言；无法识别时使用英文。可在齿轮设置中手动切换。':'Follows your system language; falls back to English. Change it in the gear settings if needed.',
  '章节目录样式':'Outline style'
};
export const supportedLanguages = ['en', 'zh-CN', 'zh-TW', 'ja', 'fr', 'de', 'es'];
export let language = 'en';
const bindings = new Map();
const preferenceKeys = ['language','revision-color','outline-style','theme','custom-themes',
  'editor-mode','source-font-size','chat-color','auto-compile','pdf-box-auto-comment','proofread-editor','proofread-pdf','proofread-project','writing-style','split'].map(name=>'latex-codex-'+name);
let persisted = null, pending = {}, saveTimer, saveQueue = Promise.resolve();
function preferenceData() {
  if (persisted === null) {
    const json = document.querySelector('#user-preferences')?.textContent;
    persisted = json ? JSON.parse(json) : undefined;
  }
  return persisted;
}
function preferenceNotice(key, values = {}, error = false) {
  const status = document.querySelector('#settings-save-status');
  if (status) { setText(status, key, values); status.dataset.error = String(error); }
}
export const preferences = {
  getItem(key) {
    const saved = preferenceData();
    if (saved && Object.hasOwn(saved, key)) return saved[key];
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    value = String(value);
    try { localStorage.setItem(key, value); } catch {}
    const saved = preferenceData();
    if (!saved || saved[key] === value) return;
    saved[key] = value; pending[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { savePreferences().catch(() => {}); }, 250);
  }
};
export function savePreferences(all = false) {
  clearTimeout(saveTimer);
  if (all) for (const key of preferenceKeys) {
    const value = preferences.getItem(key);
    if (value != null) pending[key] = value;
  }
  if (!Object.keys(pending).length) return saveQueue;
  const changes = pending; pending = {};
  const body = JSON.stringify(changes);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    preferenceNotice('正在保存设置…');
    const response = await fetch('/preferences', {method:'POST', headers:{'Content-Type':'application/json'},
      body, keepalive: new TextEncoder().encode(body).length < 60000});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.status);
    preferenceNotice('设置已保存，下次打开会恢复。');
  }).catch(error => {
    for (const [key, value] of Object.entries(changes)) {
      if (preferences.getItem(key) === value && !Object.hasOwn(pending, key)) pending[key] = value;
    }
    preferenceNotice('设置保存失败：{message}', {message:error.message}, true);
    throw error;
  });
  return saveQueue;
}
export function resolveLanguage(preferences = []) {
  for (const preference of preferences) {
    if (typeof preference !== 'string') continue;
    const parts = preference.trim().replaceAll('_', '-').toLowerCase().split('-');
    const base = parts[0];
    if (base === 'zh') {
      if (parts.includes('hant')) return 'zh-TW';
      if (parts.includes('hans')) return 'zh-CN';
      return parts.some(part => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
    }
    if (supportedLanguages.includes(base)) return base;
  }
  return 'en';
}
export function t(key, values = {}) {
  const fallback = english[key] || key;
  const text = language === 'zh-CN' ? key : translations[fallback]?.[language] || fallback;
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
export function setText(element, key, values = {}) {
  bindings.set(element, [key, values]); element.textContent = t(key, values);
}
export function initSettings() {
  const $ = id => document.querySelector('#' + id);
  const languageSelect = $('language'), colorSelect = $('revision-color'), outlineSelect = $('outline-style');
  const colors = {orange:'#b85c1c', blue:'#2563b0', purple:'#8252ad', green:'#267a42', red:'#b63a3a'};
  $('settings-save').onclick = async () => {
    $('settings-save').disabled = true;
    try {
      for (const [id, name] of [['language','language'],['revision-color','revision-color'],
        ['outline-style','outline-style'],['theme','theme'],['editor-mode','editor-mode'],
        ['source-font-size','source-font-size'],['chat-color','chat-color']]) {
        preferences.setItem('latex-codex-'+name, $(id).value);
      }
      preferences.setItem('latex-codex-auto-compile', $('auto-compile').checked ? 'on' : 'off');
      preferences.setItem('latex-codex-pdf-box-auto-comment', $('pdf-box-auto-comment').checked ? 'on' : 'off');
      for (const name of ['proofread-editor','proofread-pdf']) preferences.setItem('latex-codex-'+name, $(name).checked ? 'on' : 'off');
      preferences.setItem('latex-codex-proofread-project', $('proofread-project').checked ? 'on' : 'off');
      await savePreferences(true);
    } catch {}
    finally { $('settings-save').disabled = false; }
  };
  window.addEventListener?.('pagehide', () => { savePreferences().catch(() => {}); });
  const projectReview = $('proofread-project');
  projectReview.checked = preferences.getItem('latex-codex-proofread-project') === 'on';
  projectReview.onchange = () => {
    preferences.setItem('latex-codex-proofread-project', projectReview.checked ? 'on' : 'off');
    window.dispatchEvent(new Event('latex-project-review-change'));
  };
  const boxAutoComment = $('pdf-box-auto-comment');
  boxAutoComment.checked = preferences.getItem('latex-codex-pdf-box-auto-comment') !== 'off';
  boxAutoComment.onchange = () => {
    preferences.setItem('latex-codex-pdf-box-auto-comment', boxAutoComment.checked ? 'on' : 'off');
  };
  for (const name of ['proofread-editor','proofread-pdf']) {
    const control = $(name);
    control.checked = preferences.getItem('latex-codex-'+name) !== 'off';
    control.onchange = () => {
      preferences.setItem('latex-codex-'+name, control.checked ? 'on' : 'off');
      window.dispatchEvent(new Event('latex-proofread-change'));
    };
  }
  try { languageSelect.value = preferences.getItem('latex-codex-language') || 'system'; colorSelect.value = preferences.getItem('latex-codex-revision-color') || 'orange'; } catch {}
  if (!['system', ...supportedLanguages].includes(languageSelect.value)) languageSelect.value = 'system';
  if (!colors[colorSelect.value]) colorSelect.value = 'orange';
  try { outlineSelect.value = preferences.getItem('latex-codex-outline-style') || 'wheel'; } catch {}
  if (!['wheel', 'cards'].includes(outlineSelect.value)) outlineSelect.value = 'wheel';
  outlineSelect.onchange = () => {
    if (!['wheel', 'cards'].includes(outlineSelect.value)) outlineSelect.value = 'wheel';
    try { preferences.setItem('latex-codex-outline-style', outlineSelect.value); } catch {}
    window.dispatchEvent(new Event('latex-outline-change'));
  };
  function applyLanguage() {
    if (!['system', ...supportedLanguages].includes(languageSelect.value)) languageSelect.value = 'system';
    language = languageSelect.value === 'system'
      ? resolveLanguage([...(navigator.languages || []), navigator.language])
      : languageSelect.value;
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
    for (const attribute of ['title', 'aria-label', 'placeholder', 'label', 'alt']) for (const element of document.querySelectorAll('[data-i18n-' + attribute + ']')) element.setAttribute(attribute, t(element.getAttribute('data-i18n-' + attribute)));
    for (const [element, [key, values]] of bindings) element.textContent = t(key, values);
    try { preferences.setItem('latex-codex-language', languageSelect.value); } catch {}
    window.dispatchEvent(new Event('latex-language-change'));
  }
  function applyColor() {
    document.documentElement.style.setProperty('--revision-color', colors[colorSelect.value]);
    try { preferences.setItem('latex-codex-revision-color', colorSelect.value); } catch {}
  }
  languageSelect.onchange = applyLanguage; colorSelect.onchange = applyColor; applyLanguage(); applyColor();
  for (const name of ['file', 'settings', 'compile']) {
    const menu = $(name + '-menu'), button = $(name + '-menu-button');
    menu.addEventListener('beforetoggle', event => {
      button.setAttribute('aria-expanded', String(event.newState === 'open'));
      if (event.newState !== 'open') return;
      const rect = (name === 'compile' ? $('compile') : button).getBoundingClientRect();
      menu.style.top = rect.bottom + 6 + 'px';
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 280)) + 'px';
    });
    if (name === 'file') menu.addEventListener('click', event => { if (event.target.closest('button,a')) menu.hidePopover(); });
  }
}
