const english = {
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
  '正在编译历史版本并定位改动…':'Compiling historical versions and locating edits…',
  '两个版本没有需要预览的改动。':'These versions have no changes to preview.',
  '只显示改动附近，忽略后续排版移动。历史版本使用当前图片和引用等依赖重新编译。':'Only areas near source edits are shown; later reflow is ignored. Historical source is recompiled using current images, bibliography and other dependencies.',
  '改动 {number}':'Change {number}', '修改前':'Before', '修改后':'After', '查看修改前':'Show before', '查看修改后':'Show after', '此处新增':'Added here', '此处删除':'Deleted here',
  '这处源码没有直接对应的 PDF 内容，请查看源码对比。':'This source change has no directly mapped PDF content. See the source comparison.',
  '{side} · PDF 第 {page} 页':'{side} · PDF page {page}', 'PDF 对比失败：':'Unable to compare PDFs: ',
  'PDF 选区操作':'PDF selection actions',
  '无法唯一匹配选中的 PDF 文字，请在源码中选择。':'Cannot uniquely match the selected PDF text. Select it in the source editor.',
  '已精确选中对应 LaTeX 文字 · 第 {from}–{to} 行':'Selected exact LaTeX text · Lines {from}–{to}',
  '已匹配相似 LaTeX 选区 · 第 {from}–{to} 行':'Matched similar LaTeX selection · Lines {from}–{to}',
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
  '与上一版比较':'Previous snapshot', '当前编辑内容':'Current editor contents', '历史源码与差异':'Historical source and changes',
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
  '按住空格拖动 PDF':'Hold Space to pan the PDF',
  '拖动':'Pan', '选字':'Select text', '切换拖动页面与选择文字':'Switch between panning and text selection',
  '缩小 PDF':'Zoom out', '放大 PDF':'Zoom in', '适合宽度':'Fit width', '恢复适合宽度':'Reset to fit width', '编译后的 PDF':'Compiled PDF',
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
  '临时 Codex 对话':'Temporary Codex conversation', 'Codex · 临时对话':'Codex · Temporary conversation', '结束并清空':'End and clear', '收起临时对话':'Hide conversation',
  '当前选区与上下文':'Selection and context', '使用当前选区':'Use current selection', '携带论文全文；正在读取主对话…':'Includes the document; loading main chat…',
  '对话记录':'Conversation', '选区修改建议':'Proposed replacement', '应用到选区':'Apply to selection', '模型':'Model', '思考等级':'Reasoning effort',
  '跟随 Codex 默认':'Follow Codex default', '跟随默认':'Use default', '修改要求或问题':'Instructions or question',
  '例如：润色这段文字，保留公式和引用':'e.g. Polish this paragraph, preserving formulas and citations', '记住本次对话 · Ctrl+Enter 发送':'Remembers this conversation · Ctrl+Enter to send',
  '停止':'Stop', '发送':'Send', '修改标记颜色':'Replacement color', '修改标记颜色：无':'Replacement color: None', 'Codex 悬浮对话':'Quick Codex conversation',
  '拖动悬浮对话框':'Move quick conversation', '悬浮对话输入':'Quick conversation input', '询问 Codex…':'Ask Codex…', '选择模型和思考等级':'Choose model and reasoning effort',
  '发送 · Ctrl+Enter':'Send · Ctrl+Enter', '模型和思考等级':'Model and reasoning effort',
  '{name} · 停止输入 0.8 秒后自动保存并编译':'{name} · Autosave and compile after 0.8 s', '请求失败':'Request failed',
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
  '已应用。回到源码按 u 可撤销。':'Applied. Press u in the source editor to undo.'
};
export let language = 'zh-CN';
const bindings = new Map();
export function t(key, values = {}) {
  return (language === 'en' ? english[key] || key : key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
export function setText(element, key, values = {}) {
  bindings.set(element, [key, values]); element.textContent = t(key, values);
}
export function initSettings() {
  const $ = id => document.querySelector('#' + id);
  const languageSelect = $('language'), colorSelect = $('revision-color');
  const colors = {orange:'#b85c1c', blue:'#2563b0', purple:'#8252ad', green:'#267a42', red:'#b63a3a'};
  try { languageSelect.value = localStorage.getItem('latex-codex-language') || 'system'; colorSelect.value = localStorage.getItem('latex-codex-revision-color') || 'orange'; } catch {}
  if (!languageSelect.value) languageSelect.value = 'system';
  if (!colors[colorSelect.value]) colorSelect.value = 'orange';
  function applyLanguage() {
    language = languageSelect.value === 'system' ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en') : languageSelect.value;
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
    for (const attribute of ['title', 'aria-label', 'placeholder', 'label', 'alt']) for (const element of document.querySelectorAll('[data-i18n-' + attribute + ']')) element.setAttribute(attribute, t(element.getAttribute('data-i18n-' + attribute)));
    for (const [element, [key, values]] of bindings) element.textContent = t(key, values);
    try { localStorage.setItem('latex-codex-language', languageSelect.value); } catch {}
    window.dispatchEvent(new Event('latex-language-change'));
  }
  function applyColor() {
    document.documentElement.style.setProperty('--revision-color', colors[colorSelect.value]);
    try { localStorage.setItem('latex-codex-revision-color', colorSelect.value); } catch {}
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
