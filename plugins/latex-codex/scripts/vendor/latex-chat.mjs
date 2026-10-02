import {t} from './latex-settings.mjs';

export function colorReplacement(text, color, segments) {
  if (!color || !text || !segments || segments.map(part => part[0]).join('') !== text) return text;
  return segments.map(([part, kind]) => {
    if (!kind) return part;
    const marked = '{\\color{' + color + '}' + part + '}';
    return ['mathbin','mathrel','mathopen','mathclose'].includes(kind) ? '\\' + kind + marked : marked;
  }).join('');
}

export function attachSelectionChat(editor, request) {
  const $ = id => document.querySelector('#' + id);
  const panel = $('chat-panel'), input = $('chat-input'), messages = $('chat-messages'), status = $('chat-status');
  let memoryRevision=null,memoryLoading=null,memoryEpoch=0;
  let history = [], marker = null, job = null, generation = 0, sending = false, proposal = null;
  const quick = $('chat-quick'), quickInput = $('chat-quick-input');
  let quickMarker = null, quickDoc = null, quickOriginal = '', quickSending = false;
  let color = '';
  let models = [], modelsLoaded = false, modelsLoading = false;
  const modelSelect = $('chat-model'), effortSelect = $('chat-effort');
  const quickBrain = $('chat-quick-brain'), quickSettings = $('chat-quick-settings');
  const quickHandle = $('chat-quick-handle');
  let quickDrag = null;
  function positionQuick(left, top) {
    quick.style.left = Math.max(8, Math.min(left, window.innerWidth - quick.offsetWidth - 8)) + 'px';
    quick.style.top = Math.max(8, Math.min(top, window.innerHeight - quick.offsetHeight - 8)) + 'px';
  }
  quickHandle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); quickSettings.hidePopover();
    quickDrag = {id:event.pointerId, x:event.clientX, y:event.clientY, left:parseFloat(quick.style.left), top:parseFloat(quick.style.top)};
    quickHandle.setPointerCapture(event.pointerId); quick.dataset.dragging = 'true';
  };
  quickHandle.onpointermove = event => {
    if (!quickDrag || event.pointerId !== quickDrag.id) return;
    positionQuick(quickDrag.left + event.clientX - quickDrag.x, quickDrag.top + event.clientY - quickDrag.y);
  };
  quickHandle.onpointerup = quickHandle.onpointercancel = quickHandle.onlostpointercapture = event => {
    if (!quickDrag || event.pointerId !== quickDrag.id) return;
    quickDrag = null; delete quick.dataset.dragging;
    if (quickHandle.hasPointerCapture(event.pointerId)) quickHandle.releasePointerCapture(event.pointerId);
  };
  quickHandle.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); quickSettings.hidePopover();
    positionQuick(parseFloat(quick.style.left) + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0),
      parseFloat(quick.style.top) + (event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0));
  };
  window.addEventListener('resize', () => {
    if (quick.matches(':popover-open')) positionQuick(parseFloat(quick.style.left), parseFloat(quick.style.top));
  });
  const effortNames = {none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'极高'};
  function option(value, label) {
    const node = document.createElement('option'); node.value = value; node.textContent = label; return node;
  }
  function updateEfforts() {
    const selected = models.find(model => model.id === modelSelect.value);
    effortSelect.replaceChildren(option('', selected ? t('模型默认 · ') + (t(effortNames[selected.default_effort] || selected.default_effort)) : t('跟随默认')));
    selected?.efforts.forEach(effort => effortSelect.append(option(effort, (t(effortNames[effort] || effort)) + ' · ' + effort)));
    effortSelect.value = ''; effortSelect.disabled = sending || !selected;
    renderQuickSettings();
  }
  modelSelect.onchange = updateEfforts;
  effortSelect.onchange = renderQuickSettings;
  function renderQuickSettings() {
    const selected = models.find(model => model.id === modelSelect.value);
    quickBrain.title = (selected?.name || t('跟随 Codex 默认')) + ' · ' + (effortSelect.value ? t(effortNames[effortSelect.value] || effortSelect.value) : t('默认思考等级'));
    const modelList = $('chat-quick-models'), effortList = $('chat-quick-efforts');
    modelList.replaceChildren(); effortList.replaceChildren();
    for (const model of [{id:'', name:t('跟随 Codex 默认')}, ...models]) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = model.name + (model.id ? ' ›' : ''); button.disabled = sending;
      button.setAttribute('aria-pressed', String(model.id === modelSelect.value));
      button.onclick = () => {
        if (modelSelect.value !== model.id) { modelSelect.value = model.id; updateEfforts(); }
        if (!model.id) { quickSettings.hidePopover(); quickInput.focus(); }
        else effortList.firstElementChild?.focus();
      };
      modelList.append(button);
    }
    effortList.hidden = !selected;
    if (selected) for (const effort of ['', ...selected.efforts]) {
      const button = document.createElement('button'); button.type = 'button'; button.disabled = sending;
      button.textContent = effort ? t(effortNames[effort] || effort) : t('默认 · ') + (t(effortNames[selected.default_effort] || selected.default_effort));
      button.setAttribute('aria-pressed', String(effort === effortSelect.value));
      button.onclick = () => { effortSelect.value = effort; renderQuickSettings(); quickSettings.hidePopover(); quickInput.focus(); };
      effortList.append(button);
    }
    $('chat-quick-model-status').textContent = $('chat-model-status').textContent;
  }
  quickSettings.addEventListener('beforetoggle', event => {
    quickBrain.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    renderQuickSettings(); loadModels();
    const box = quickBrain.getBoundingClientRect(), above = box.top > window.innerHeight / 2;
    quickSettings.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 360)) + 'px';
    quickSettings.style.top = above ? 'auto' : box.bottom + 6 + 'px';
    quickSettings.style.bottom = above ? window.innerHeight - box.top + 6 + 'px' : 'auto';
    quickSettings.style.maxHeight = Math.max(60, (above ? box.top : window.innerHeight - box.bottom) - 14) + 'px';
  });
  async function loadModels() {
    if (modelsLoaded || modelsLoading) return;
    modelsLoading = true; $('chat-model-status').textContent = t('正在读取可用模型…'); renderQuickSettings();
    try {
      ({models} = await request('/chat/models'));
      modelSelect.replaceChildren(option('', t('跟随 Codex 默认')), ...models.map(model => option(model.id, model.name)));
      modelSelect.value = ''; updateEfforts(); modelsLoaded = true; $('chat-model-status').textContent = '';
    } catch(e) { $('chat-model-status').textContent = e.message; }
    finally { modelsLoading = false; renderQuickSettings(); }
  }
  const colors = [['','无','transparent'],['blue','蓝色','#3979ff'],['red','红色','#f45454'],['teal','青色','#009999'],['magenta','洋红','#eb46eb'],['orange','橙色','#ff9800'],['violet','紫色','#a66bdf']];
  const colorButton = $('chat-color'), palette = $('chat-colors');
  function renderProposal() {
    if (proposal) $('chat-replacement').textContent = colorReplacement(proposal.replacement, color, proposal.segments) || t('（删除选区）');
  }
  const colorOptions = colors.map(([value, label, swatch]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = t(label);
    button.setAttribute('aria-pressed', String(value === color));
    button.onclick = () => {
      color = value; colorButton.dataset.color = color; colorButton.style.background = swatch;
      colorButton.title = t('修改标记颜色：') + t(label); colorButton.setAttribute('aria-label', colorButton.title);
      colorOptions.forEach(([option, optionValue]) => option.setAttribute('aria-pressed', String(optionValue === color)));
      renderProposal(); palette.hidePopover();
    };
    palette.append(button); return [button, value];
  });
  palette.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    const box = colorButton.getBoundingClientRect();
    palette.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 290)) + 'px';
    palette.style.top = box.bottom + 6 + 'px'; palette.style.maxWidth = '280px';
  });
  async function refreshContext() {
    try {
      const context = await request('/chat/context');
      $('chat-context').textContent = context.available
        ? t('携带论文全文 + 主对话 ') + context.count + t(' 条消息') + (context.truncated ? t('（较早内容已省略）') : '')
        : t('携带论文全文；未关联主对话，请从 Codex 主对话启动编辑器。');
    } catch(e) { $('chat-context').textContent = t('主对话读取失败：') + e.message; }
  }
  const notice = text => status.textContent = text;
  function quickNotice(text, error = false) {
    $('chat-quick-status').textContent = text; $('chat-quick-status').dataset.error = String(error);
  }
  const range = () => marker?.find();
  const selectedText = () => { const pos = range(); return pos ? editor.getRange(pos.from, pos.to) : ''; };
  function message(who, text) {
    const item = document.createElement('div'); item.className = 'chat-message';
    const label = document.createElement('b'); label.textContent = who;
    const body = document.createElement('div'); body.textContent = text;
    item.append(label, body); messages.append(item); messages.scrollTop = messages.scrollHeight;
  }
  async function loadMemory() {
    if(memoryRevision!==null)return;
    if(memoryLoading)return memoryLoading;
    const doc=editor.getDoc(),epoch=memoryEpoch;
    const task=(async()=>{
      const data=await request('/chat/history');
      if(doc!==editor.getDoc()||epoch!==memoryEpoch)return;
      if(!Array.isArray(data.messages)||!Number.isInteger(data.revision))throw new Error(t('项目记忆读取失败，请重新打开对话。'));
      history=data.messages;memoryRevision=data.revision;messages.replaceChildren();
      for(const item of history){
        let text=item.content;
        if(item.role==='assistant'){try{text=JSON.parse(text).reply||text;}catch{}}
        message(item.role==='user'?t('你'):'Codex',text);
      }
    })();
    memoryLoading=task;
    try{await task;}finally{if(memoryLoading===task)memoryLoading=null;}
  }
  function setSending(value) {
    sending = value; $('chat-send').disabled = value; $('chat-stop').hidden = !value;
    $('chat-use-selection').disabled = value;
    modelSelect.disabled = value; effortSelect.disabled = value || !modelSelect.value;
    quickBrain.disabled = value;
    if (value) quickSettings.hidePopover();
    $('chat-quick-send').disabled = value || !quickMarker;
    const quickBusy = value && quickSending;
    $('chat-quick-send').setAttribute('aria-busy', String(quickBusy));
    $('chat-quick-send').setAttribute('aria-label', quickBusy ? t('正在修改选区') : t('发送'));
    quickInput.readOnly = quickBusy;
  }
  function clearProposal() { proposal = null; $('chat-proposal').hidden = true; }
  function useSelection() {
    if (sending) return;
    if (!editor.somethingSelected() || editor.listSelections().length !== 1) { notice(t('请先选中一段连续的 LaTeX 源码。')); return; }
    marker?.clear();
    marker = editor.markText(editor.getCursor('from'), editor.getCursor('to'), {className:'chat-selection', clearWhenEmpty:false});
    clearProposal(); $('chat-selection').textContent = selectedText(); notice(t('已带入选区和当前文档，可以连续追问。'));
  }
  function showPanel() {
    panel.hidden = false;
    refreshContext();
    loadMemory().catch(e=>notice(e.message));
    loadModels();
    input.focus();
  }
  function open() {
    showPanel();
    const previous = range(), from = editor.getCursor('from'), to = editor.getCursor('to');
    if (editor.somethingSelected() && !sending && (!previous || previous.from.line !== from.line || previous.from.ch !== from.ch || previous.to.line !== to.line || previous.to.ch !== to.ch)) useSelection();
    else if (!marker) notice(t('请先选中文本，再点“使用当前选区”。'));
    input.focus();
  }
  async function stop() {
    generation++; const id = job; job = null; quickSending = false; setSending(false);
    if (id) { try { await request('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); } catch(e) { notice(e.message); } }
  }
  function reset() {
    stop();
    quick.hidePopover(); quickInput.value = '';
    memoryEpoch++;memoryRevision=null;memoryLoading=null;history = []; marker?.clear(); marker = null; clearProposal();
    messages.replaceChildren(); input.value = ''; $('chat-selection').textContent = ''; panel.hidden = true; notice('');
  }
  $('chat-menu').onclick = () => { $('editor-menu').hidePopover(); open(); };
  quick.addEventListener('beforetoggle', event => {
    if (event.newState === 'closed') {
      if (quickDrag) quickHandle.onpointercancel({pointerId:quickDrag.id});
      quickMarker?.clear(); quickMarker = null;
      if (quickSending) { stop(); notice(t('已取消悬浮修改。')); }
    }
  });
  function openQuick(anchor) {
    loadMemory().catch(e=>quickNotice(e.message,true));
    quickMarker?.clear(); quickMarker = null;
    quickDoc = editor.getDoc(); quickOriginal = '';
    if (editor.somethingSelected() && editor.listSelections().length === 1) {
      const from = editor.getCursor('from'), to = editor.getCursor('to');
      quickOriginal = editor.getRange(from, to);
      quickMarker = editor.markText(from, to, {className:'chat-selection',clearWhenEmpty:false});
    }
    quickInput.placeholder = quickOriginal ? t('询问 Codex…') : t('请先选中一段 LaTeX 源码');
    quickNotice(sending ? t('Codex 正在回复，请稍后发送。') : '');
    $('chat-quick-send').disabled = sending || !quickOriginal;
    quick.showPopover();
    const selectionTop = anchor.selectionTop ?? (quickOriginal ? editor.charCoords(editor.getCursor('from'), 'window').top : anchor.top);
    const selectionBottom = anchor.selectionBottom ?? (quickOriginal ? editor.charCoords(editor.getCursor('to'), 'window').bottom : anchor.top);
    const below = Math.max(anchor.top + 18, selectionBottom + 12);
    positionQuick(anchor.left, below + quick.offsetHeight + 8 <= window.innerHeight ? below : selectionTop - quick.offsetHeight - 12);
    quickInput.focus();
  }
  $('chat-quick-menu').onclick = () => {
    const anchor = $('editor-menu').getBoundingClientRect();
    $('editor-menu').hidePopover(); openQuick(anchor);
  };
  quickInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); $('chat-quick-form').requestSubmit();
    }
  });
  $('chat-quick-form').onsubmit = async event => {
    event.preventDefault();
    if (sending || !quickInput.value.trim()) return;
    const pos = quickMarker?.find();
    if (!pos || editor.getDoc() !== quickDoc || editor.getRange(pos.from, pos.to) !== quickOriginal) {
      quickNotice(t('选区已变化，请重新选择后打开悬浮对话。'), true); return;
    }
    if (marker !== quickMarker) marker?.clear();
    marker = quickMarker;
    clearProposal(); $('chat-selection').textContent = quickOriginal;
    return send(quickInput.value, quickInput, true);
  };
  $('chat-close').onclick = () => { palette.hidePopover(); panel.hidden = true; editor.focus(); };
  $('chat-end').onclick = async()=>{
    await stop();
    try{await request('/chat/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('filename').title})});reset();}
    catch(e){notice(e.message);}
  };
  $('chat-use-selection').onclick = () => { useSelection(); input.focus(); };
  $('chat-stop').onclick = () => { stop(); notice(t('已停止，可继续提问。')); };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); panel.hidden = true; editor.focus(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('chat-form').requestSubmit(); }
  });
  $('chat-form').onsubmit = async event => {
    event.preventDefault();
    return send(input.value, input);
  };
  async function send(text, draftInput, autoApply = false) {
    if (sending || !text.trim()) return;
    const selection = selectedText(), question = text.trim();
    if (!selection) { notice(t('选区已失效，请重新选择文本。')); return; }
    const token = ++generation, doc = editor.getDoc();
    let conversation;
    quickSending = autoApply;
    if (autoApply) quickNotice('');
    clearProposal(); setSending(true); notice(t('Codex 正在思考…'));
    try {
      if(memoryRevision===null)await loadMemory();
      if(token!==generation||doc!==editor.getDoc())return;
      conversation=[...history.slice(-38),{role:'user',content:question}];
      message(t('你'),question);if(!autoApply)draftInput.value='';
      const started = await request('/chat', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({source:editor.getValue(),selection,messages:conversation,remember:true,memory_revision:memoryRevision,model:modelSelect.value,effort:effortSelect.value})});
      if (token !== generation) {
        await request('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:started.id})}); return;
      }
      job = started.id;
      while (token === generation) {
        const result = await request('/chat?id=' + encodeURIComponent(job));
        if (token !== generation) return;
        if (result.status === 'running') { await new Promise(resolve => setTimeout(resolve, 700)); continue; }
        if (result.status !== 'done') throw new Error(result.error || t('本次回复已停止。'));
        memoryRevision=result.memory_revision??memoryRevision;
        history = [...conversation, {role:'assistant',content:JSON.stringify({reply:result.reply,replacement:result.replacement})}];
        message('Codex', result.reply);
        if (result.replacement !== null) {
          proposal = {doc, original:selection, replacement:result.replacement, segments:result.segments};
          renderProposal(); $('chat-proposal').hidden = false;
          if (autoApply) {
            if (applyProposal()) {
              draftInput.value = ''; quickSending = false; quick.hidePopover(); editor.focus();
            } else quickNotice(status.textContent, true);
          } else notice(t('修改建议已就绪。可继续讨论，或应用到选区。'));
        } else {
          notice(t('可以继续追问；本次对话记忆保留。'));
          if (autoApply) { quickNotice(result.reply); draftInput.value = ''; }
        }
        messages.scrollTop = messages.scrollHeight;
        return;
      }
    } catch(e) {
      if (token === generation) { if(e.conflict)memoryRevision=null;notice(e.message); if (autoApply) quickNotice(e.message, true); draftInput.value = question; }
    } finally { if (token === generation) { quickSending = false; job = null; setSending(false); } }
  }
  function applyProposal() {
    const pos = range();
    if (!proposal || !pos || proposal.doc !== editor.getDoc() || selectedText() !== proposal.original || editor.getOption('readOnly')) {
      notice(t('选区内容已变化，未覆盖修改。请使用当前选区重新提问。')); return false;
    }
    const replacement = colorReplacement(proposal.replacement, color, proposal.segments), start = editor.indexFromPos(pos.from);
    const vim = editor.getOption('keyMap').startsWith('vim');
    if (vim) CodeMirror.Vim.handleKey(editor, '<Esc>');
    marker.clear(); marker = null;
    editor.replaceRange(replacement, pos.from, pos.to, 'codex-chat');
    const end = editor.posFromIndex(start + replacement.length);
    marker = editor.markText(pos.from, end, {className:'chat-selection',clearWhenEmpty:false});
    $('chat-selection').textContent = replacement;
    history.push({role:'user',content:'已将上一条修改应用到选区' + (color ? '，并只用 {\\color{' + color + '}...} 标记实际变化的内容' : '') + '。后续请以当前文档为准。'});
    clearProposal(); message(t('编辑器'), t('已应用到选区，将自动保存。')); notice(t(vim ? '已应用。回到源码按 u 可撤销。' : '已应用。回到源码按 Ctrl+Z / Cmd+Z 可撤销。'));
    editor.setCursor(end);
    return true;
  }
  $('chat-apply').onclick = applyProposal;
  editor.on('swapDoc', reset);
  window.addEventListener('latex-language-change', () => {
    const effort = effortSelect.value;
    updateEfforts(); effortSelect.value = effort; renderQuickSettings(); renderProposal();
    modelSelect.options[0].textContent = t('跟随 Codex 默认');
    colorOptions.forEach(([button], index) => { button.textContent = t(colors[index][1]); });
    colorButton.title = t('修改标记颜色：') + t(colors.find(([value]) => value === color)[1]);
    colorButton.setAttribute('aria-label', colorButton.title);
    quickInput.placeholder = quickOriginal ? t('询问 Codex…') : t('请先选中一段 LaTeX 源码');
    refreshContext();
  });
  window.addEventListener('pagehide', () => {
    if (job) fetch('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job}),keepalive:true});
  });
  return {open, openQuick, get busy() { return sending; }};
}
