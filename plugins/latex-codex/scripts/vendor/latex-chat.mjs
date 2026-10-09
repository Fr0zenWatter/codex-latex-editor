import {t, preferences} from './latex-settings.mjs';
import {attachProofread} from './latex-proofread.mjs';
import {writingStyles, readWritingStyle, restoreWritingStyle, annotationRequest} from './latex-writing-styles.mjs';

export function colorReplacement(text, color, segments) {
  if (!color || !text || !segments || segments.map(part => part[0]).join('') !== text) return text;
  return segments.map(([part, kind]) => {
    if (!kind) return part;
    const marked = '{\\color{' + color + '}' + part + '}';
    return ['mathbin','mathrel','mathopen','mathclose'].includes(kind) ? '\\' + kind + marked : marked;
  }).join('');
}

export function attachSelectionChat(editor, request, paintAnnotations = () => {}, recordAnnotations = async () => {}) {
  const $ = id => document.querySelector('#' + id);
  const panel = $('chat-panel'), input = $('chat-input'), messages = $('chat-messages'), status = $('chat-status');
  let memoryRevision=null,memoryLoading=null,memoryEpoch=0;
  let history = [], marker = null, job = null, generation = 0, sending = false, proposal = null;
  const quick = $('chat-quick'), quickInput = $('chat-quick-input');
  let quickMarker = null, quickDoc = null, quickOriginal = '', quickPdf = null, editingAnnotation = null;
  let annotations = [], annotationId = 0, annotationSending = false, annotationCommitting = false;
  let mainSend = null, mainLinked = false, mainAvailable = false, mainRequest = null;
  if (document.documentElement?.dataset?.aiBackend === 'deepseek') {
    mainSend = document.createElement('button');
    mainSend.id = 'annotations-main-send'; mainSend.type = 'button'; mainSend.hidden = true;
    mainSend.textContent = t('发送到 DeepSeek 主对话');
    $('annotations-send').after(mainSend);
    request('/main-chat').then(result => {
      mainLinked = result.linked; mainAvailable = result.available; refreshAnnotations();
    }).catch(() => {});
    mainSend.onclick = sendToMainChat;
    window.addEventListener('latex-language-change', () => { mainSend.textContent = t('发送到 DeepSeek 主对话'); refreshAnnotations(); });
  }
  let color = '';
  const editorProofread = () => preferences.getItem('latex-codex-proofread-editor') !== 'off';
  const pdfProofread = () => preferences.getItem('latex-codex-proofread-pdf') !== 'off' && !/\.(md|markdown)$/i.test($('filename').title || '');
  let models = [], modelsLoaded = false, modelsLoading = false;
  const modelSelect = $('chat-model'), effortSelect = $('chat-effort');
  const quickBrain = $('chat-quick-brain'), quickSettings = $('chat-quick-settings');
  const quickEffort = $('chat-quick-effort');
  const quickHandle = $('chat-quick-handle');
  const styleSelect = $('chat-quick-style'), styleFile = $('chat-style-file');
  let styles = [...writingStyles], importingStyle = 0, styleValue = '';
  const selectedStyle = () => styles.find(item => item.id === styleValue);
  function renderStyle(value = styleValue) {
    styleValue = styles.some(item => item.id === value) ? value : '';
    styleSelect.replaceChildren(option('', t('无')), ...styles.map(item => option(item.id, item.name)), option('__import__', t('导入提示词') + '…'));
    styleSelect.value = styleValue;
    $('chat-style-control').dataset.active = String(!!selectedStyle());
  }
  function restoreDefaultStyle() {
    const saved = restoreWritingStyle(preferences.getItem('latex-codex-writing-style'));
    const existing = saved && styles.find(item => item.name === saved.name && item.prompt === saved.prompt);
    if (saved && !existing) styles.push(saved);
    renderStyle(existing?.id || saved?.id || '');
  }
  function saveDefaultStyle() {
    preferences.setItem('latex-codex-writing-style', JSON.stringify(selectedStyle() || null));
  }
  styleSelect.onchange = () => {
    importingStyle++;
    if (styleSelect.value === '__import__') { renderStyle(); styleFile.value = ''; styleFile.click(); return; }
    renderStyle(styleSelect.value); saveDefaultStyle(); quickNotice('');
  };
  styleFile.onchange = async () => {
    const file = styleFile.files?.[0];
    if (!file || sending || annotationCommitting) return;
    const token = ++importingStyle, target = quickMarker;
    try {
      const style = await readWritingStyle(file);
      if (token !== importingStyle || target !== quickMarker || !quick.matches(':popover-open') || sending || annotationCommitting) return;
      const existing = styles.find(item => item.name === style.name && item.prompt === style.prompt);
      if (!existing) styles.push({...style,id:'custom-' + token});
      renderStyle(existing?.id || 'custom-' + token); saveDefaultStyle(); quickNotice('');
    } catch (error) {
      if (token === importingStyle && target === quickMarker && quick.matches(':popover-open')) quickNotice(t(error.message), true);
    }
  };
  let quickDrag = null, quickAnchor = null, quickMoved = false;
  function positionQuick(left, top) {
    quick.style.left = Math.max(8, Math.min(left, window.innerWidth - quick.offsetWidth - 8)) + 'px';
    quick.style.top = Math.max(8, Math.min(top, window.innerHeight - quick.offsetHeight - 8)) + 'px';
  }
  function fitQuick() {
    if (!quick.matches(':popover-open')) return;
    if (quickMoved || !quickAnchor) return positionQuick(parseFloat(quick.style.left), parseFloat(quick.style.top));
    const {left, below, selectionTop} = quickAnchor;
    positionQuick(left, below + quick.offsetHeight + 8 <= window.innerHeight ? below : selectionTop - quick.offsetHeight - 12);
  }
  function sizeQuick(expanded = quick.dataset.expanded === 'true') {
    expanded ||= !!quickInput.value || !!$('chat-quick-status').textContent;
    quick.dataset.expanded = String(expanded);
    quickInput.style.height = 'auto';
    const height = expanded ? Math.max(68, Math.min(160, quickInput.scrollHeight)) : 48;
    quickInput.style.height = height + 'px';
    $('chat-quick-form').style.height = (height + (expanded ? 48 : 0)) + 'px';
    fitQuick();
  }
  quickInput.addEventListener('focus', () => sizeQuick(true));
  quickInput.addEventListener('click', () => sizeQuick(true));
  quickInput.addEventListener('input', () => sizeQuick(true));
  quick.addEventListener('focusout', event => {
    if (!quick.contains(event.relatedTarget) && !quickSettings.matches(':popover-open')) sizeQuick(false);
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    if (!quickDrag) sizeQuick();
  }).observe(quick);
  quickHandle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); quickSettings.hidePopover(); quickMoved = true;
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
    event.preventDefault(); quickSettings.hidePopover(); quickMoved = true;
    positionQuick(parseFloat(quick.style.left) + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0),
      parseFloat(quick.style.top) + (event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0));
  };
  window.addEventListener('resize', () => {
    sizeQuick(); fitQuick();
  });
  const effortNames = {off:'无',none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'极高'};
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
  quickEffort.onclick = () => {
    const selected = models.find(model => model.id === modelSelect.value);
    if (!selected || sending) return;
    const efforts = ['', ...selected.efforts];
    effortSelect.value = efforts[(efforts.indexOf(effortSelect.value) + 1) % efforts.length];
    renderQuickSettings();
  };
  function renderQuickSettings() {
    const selected = models.find(model => model.id === modelSelect.value);
    quickBrain.title = (selected?.name || t('跟随 Codex 默认')) + ' · ' + (effortSelect.value ? t(effortNames[effortSelect.value] || effortSelect.value) : t('默认思考等级'));
    $('chat-quick-model-name').textContent = selected?.name || t('跟随 Codex 默认');
    $('chat-quick-effort-name').textContent = effortSelect.value ? t(effortNames[effortSelect.value] || effortSelect.value) : t('跟随默认');
    quickEffort.disabled = sending || !selected;
    quickEffort.title = t('思考等级') + ' · ' + (effortSelect.value || selected?.default_effort || t('跟随默认'));
    quickEffort.setAttribute('aria-label', quickEffort.title);
    quickEffort.dataset.level = String(selected ? Math.ceil(3 * (selected.efforts.indexOf(effortSelect.value || selected.default_effort) + 1) / selected.efforts.length) : 0);
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
    sizeQuick(true); renderQuickSettings(); loadModels();
    const box = quick.getBoundingClientRect(), above = box.top > 100;
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
      // Harness account routes read the stored credentials; the API route needs DEEPSEEK_API_KEY.
      const preferred = models.find(model => model.id.startsWith('deepseek-account/') && model.default)
        || models.find(model => model.id.startsWith('deepseek-account/'));
      modelSelect.value = preferred ? preferred.id : '';
      updateEfforts(); modelsLoaded = true; $('chat-model-status').textContent = '';
    } catch(e) { $('chat-model-status').textContent = e.message; }
    finally { modelsLoading = false; renderQuickSettings(); }
  }
  const colorSelect = $('chat-color');
  colorSelect.value = preferences.getItem('latex-codex-chat-color') || '';
  if (!['','blue','red','teal','magenta','orange','violet'].includes(colorSelect.value)) colorSelect.value = '';
  color = colorSelect.value;
  function renderProposal() {
    if (proposal) $('chat-replacement').textContent = colorReplacement(proposal.replacement, color, proposal.segments) || t('（删除选区）');
  }
  colorSelect.onchange = () => {
    color = colorSelect.value;
    preferences.setItem('latex-codex-chat-color', color);
    renderProposal();
  };
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
    sizeQuick();
  }
  function annotationNotice(text, error = false) {
    $('annotations-status').textContent = text;
    $('annotations-status').dataset.error = String(error);
    $('annotations-review').showPopover();
  }
  function refreshAnnotations() {
    $('annotations-toggle').textContent = t('批注 · {count}', {count:annotations.length});
    $('annotations-toggle').hidden = !annotations.some(item => item.review);
    const waiting = annotations.some(item => !item.review);
    $('annotations-send').hidden = !waiting;
    $('annotations-send').disabled = sending || annotationCommitting || !waiting;
    if (mainSend) {
      mainSend.hidden = !waiting;
      mainSend.disabled = sending || annotationCommitting || !waiting || !mainLinked || !mainAvailable;
      mainSend.title = t(!mainLinked ? '请从 DeepSeek 主对话启动此编辑器。'
        : !mainAvailable ? '请先安装 DeepSeek 主对话桥接并刷新页面。' : '发送到 DeepSeek 主对话');
    }
    $('annotations-list').replaceChildren();
    for (const item of annotations) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'annotation-item'; button.disabled = sending || annotationCommitting;
      const quote = document.createElement('b'), requirement = document.createElement('span');
      quote.textContent = '#' + item.id + ' · ' + item.original;
      requirement.textContent = item.request;
      button.append(quote, requirement);
      button.onclick = () => editAnnotation(item, button.getBoundingClientRect());
      $('annotations-list').append(button);
      if (item.review) {
        item.review.setVisible(editorProofread(), item.marker.find());
        if (!editorProofread()) $('annotations-list').append(item.review.root);
      }
    }
    $('annotations-empty').hidden = !!annotations.length;
    annotations.forEach(item => item.review?.setBusy(sending || annotationCommitting));
    paintAnnotations(annotations, editAnnotation);
  }
  function validAnnotation(item) {
    const pos = item.marker?.find();
    return pos && editor.getDoc() === item.doc && editor.getRange(pos.from, pos.to) === item.original ? pos : null;
  }
  function saveAnnotation(close = true) {
    if (sending || annotationCommitting || !quickInput.value.trim()) return false;
    const pos = validAnnotation({marker:quickMarker,doc:quickDoc,original:quickOriginal});
    if (!pos) { quickNotice(t('选区已变化，请重新选择后添加批注。'), true); return false; }
    const start = editor.indexFromPos(pos.from), end = editor.indexFromPos(pos.to);
    if (annotations.some(item => {
      if (item === editingAnnotation) return false;
      const range = item.marker.find();
      return range && start < editor.indexFromPos(range.to) && end > editor.indexFromPos(range.from);
    })) { quickNotice(t('批注选区重叠，请编辑原批注或另选位置。'), true); return false; }
    if (!editingAnnotation && annotations.length >= 100) { quickNotice(t('每次最多发送 100 条批注。'), true); return false; }
    const chosen = selectedStyle(), style = chosen ? {id:chosen.id,name:chosen.name,prompt:chosen.prompt} : null;
    if (editingAnnotation) Object.assign(editingAnnotation, {request:quickInput.value.trim(),style});
    else annotations.push({id:++annotationId, marker:quickMarker, doc:quickDoc, original:quickOriginal,
      request:quickInput.value.trim(), pdf:quickPdf, style});
    quickInput.value = ''; editingAnnotation = null; quickMarker = null;
    refreshAnnotations();
    if (close) quick.hidePopover();
    return true;
  }
  function editAnnotation(item, anchor) {
    if (sending || annotationCommitting) return;
    if (item.review) {
      const pos = item.marker.find();
      if (pos) { editor.scrollIntoView(pos.from, 80); editor.focus(); }
      if (!editorProofread()) $('annotations-review').showPopover();
      return;
    }
    if (quickInput.value.trim() && !saveAnnotation(false)) return;
    if (!editingAnnotation) quickMarker?.clear();
    $('annotations-review').hidePopover();
    quickMarker = item.marker; quickDoc = item.doc; quickOriginal = item.original;
    quickPdf = item.pdf; editingAnnotation = item; quickInput.value = item.request;
    importingStyle++; renderStyle(item.style?.id || '');
    showQuick({...anchor,selectionTop:anchor.selectionTop ?? anchor.top,selectionBottom:anchor.selectionBottom ?? anchor.bottom ?? anchor.top});
    if (!validAnnotation(item)) quickNotice(t('选区已变化，请删除这条批注并重新选择。'), true);
  }
  $('chat-quick-delete').onclick = () => {
    if (sending || annotationCommitting || !editingAnnotation) return;
    annotations = annotations.filter(item => item !== editingAnnotation);
    editingAnnotation.marker.clear(); quickMarker = null; editingAnnotation = null; quickInput.value = '';
    quick.hidePopover(); refreshAnnotations();
  };
  $('chat-quick-cancel').onclick = () => { quickInput.value = ''; quick.hidePopover(); };
  $('annotations-review').addEventListener('beforetoggle', event => {
    $('annotations-toggle').setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    const anchor = !$('annotations-toggle').hidden ? $('annotations-toggle')
      : !$('annotations-send').hidden ? $('annotations-send') : $('app-toolbar');
    const box = anchor.getBoundingClientRect(), review = $('annotations-review');
    review.style.left = 'auto';
    review.style.right = '8px';
    review.style.top = box.bottom + 6 + 'px';
  });
  $('annotations-send').onclick = () => {
    if (quickInput.value.trim() && !saveAnnotation()) return;
    const batch = annotations.filter(item => !item.review);
    if (!batch.length || sending || annotationCommitting) return;
    if (batch.some(item => !validAnnotation(item))) {
      annotationNotice(t('批注选区已变化，未发送。请点批注检查并重新选择。'), true); return;
    }
    batch.sort((a,b) => editor.indexFromPos(a.marker.find().from) - editor.indexFromPos(b.marker.find().from));
    const question = batch.map(item => '#' + item.id + '\n' + item.request).join('\n\n');
    return send(question, null, batch);
  };
  async function sendToMainChat() {
    if (sending || annotationCommitting || !mainLinked || !mainAvailable) return;
    if (quickInput.value.trim() && !saveAnnotation()) return;
    const batch = annotations.filter(item => !item.review);
    if (!batch.length) return;
    annotationCommitting = true; refreshAnnotations();
    annotationNotice(t('正在转交主对话…'));
    try {
      const doc = editor.getDoc(), source = editor.getValue(), path = $('filename').title;
      const state = await request('/state');
      if (editor.getDoc() !== doc || editor.getValue() !== source || state.path !== path
          || state.source.replaceAll('\r\n', '\n') !== source) {
        throw new Error(t('请等待自动保存完成后再发送；批注保留。'));
      }
      const items = batch.map(item => {
        const pos = validAnnotation(item);
        if (!pos) throw new Error(t('批注选区已变化，未发送。请点批注检查并重新选择。'));
        return {id: item.id, start: Array.from(source.slice(0, editor.indexFromPos(pos.from))).length,
          end: Array.from(source.slice(0, editor.indexFromPos(pos.to))).length,
          selection: item.original, request: annotationRequest(item)};
      }).sort((a, b) => a.start - b.start);
      const payload = {path, source, version: state.version, selection: items[0].selection, annotations: items};
      const fingerprint = JSON.stringify(payload);
      if (mainRequest?.fingerprint !== fingerprint) mainRequest = {fingerprint, id: crypto.randomUUID().replaceAll('-', '')};
      const result = await request('/main-chat', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...payload, request_id: mainRequest.id})});
      if (!result.accepted) throw new Error(t('请求失败'));
      for (const item of batch) item.marker.clear();
      annotations = annotations.filter(item => !batch.includes(item)); mainRequest = null;
      annotationNotice(t('批注已转交 DeepSeek 主对话。'));
    } catch (error) { annotationNotice(error.message, true); }
    finally { annotationCommitting = false; refreshAnnotations(); }
  }
  $('annotations-stop').onclick = () => { if (annotationCommitting) return; stop(); annotationNotice(t('已停止，批注保留，可重新发送。')); };
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
    quickEffort.disabled = value || !modelSelect.value;
    styleSelect.disabled = value;
    if (value) quickSettings.hidePopover();
    $('chat-quick-send').disabled = value || !quickMarker;
    $('chat-quick-delete').disabled = value;
    quickInput.readOnly = value;
    $('annotations-send').setAttribute('aria-busy', String(value && annotationSending));
    $('annotations-stop').hidden = !value || !annotationSending;
    refreshAnnotations();
    sizeQuick();
  }
  function clearProposal() { proposal = null; $('chat-proposal').hidden = true; }
  function useSelection() {
    if (sending || annotationCommitting) return;
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
  $('chat-view').onclick = () => { $('settings-menu').hidePopover(); showPanel(); };
  function open() {
    showPanel();
    const previous = range(), from = editor.getCursor('from'), to = editor.getCursor('to');
    if (editor.somethingSelected() && !sending && (!previous || previous.from.line !== from.line || previous.from.ch !== from.ch || previous.to.line !== to.line || previous.to.ch !== to.ch)) useSelection();
    else if (!marker) notice(t('请先选中文本，再点“使用当前选区”。'));
    input.focus();
  }
  async function stop() {
    if (annotationCommitting) return;
    generation++; const id = job; job = null; annotationSending = false; setSending(false);
    if (id) { try { await request('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); } catch(e) { notice(e.message); } }
  }
  function reset(preserveAnnotations = false) {
    stop();
    if (!preserveAnnotations) quickInput.value = '';
    quick.hidePopover();
    if (!preserveAnnotations) {
      importingStyle++; styles = [...writingStyles]; restoreDefaultStyle();
      quickMarker?.clear(); quickMarker = null; editingAnnotation = null;
      annotations.forEach(item => { item.review?.destroy(); item.marker.clear(); }); annotations = []; annotationId = 0;
    }
    $('annotations-status').textContent = ''; refreshAnnotations();
    memoryEpoch++;memoryRevision=null;memoryLoading=null;history = []; marker?.clear(); marker = null; clearProposal();
    messages.replaceChildren(); input.value = ''; $('chat-selection').textContent = ''; panel.hidden = true; notice('');
  }
  quick.addEventListener('beforetoggle', event => {
    if (event.newState === 'closed') {
      importingStyle++;
      if (quickDrag) quickHandle.onpointercancel({pointerId:quickDrag.id});
      if (quickInput.value.trim() && !sending && !saveAnnotation(false)) {
        annotationNotice(t('批注草稿尚未保存，请重新打开并检查选区。'), true); return;
      }
      if (!editingAnnotation) quickMarker?.clear();
      quickMarker = null; editingAnnotation = null;
    }
  });
  function openQuick(anchor) {
    if (sending || annotationCommitting) return;
    if (quickInput.value.trim() && !saveAnnotation(false)) { quick.showPopover(); return; }
    quickAnchor = null; quickMoved = false;
    if (!editingAnnotation) quickMarker?.clear();
    quickMarker = null; editingAnnotation = null; quickInput.value = '';
    importingStyle++; restoreDefaultStyle();
    quickDoc = editor.getDoc(); quickOriginal = '';
    quickPdf = anchor.pdf || null;
    if (editor.somethingSelected() && editor.listSelections().length === 1) {
      const from = editor.getCursor('from'), to = editor.getCursor('to');
      const existing = annotations.find(item => {
        const pos = item.marker.find();
        return pos && editor.indexFromPos(pos.from) === editor.indexFromPos(from) && editor.indexFromPos(pos.to) === editor.indexFromPos(to);
      });
      if (existing) return editAnnotation(existing, anchor);
      quickOriginal = editor.getRange(from, to);
      quickMarker = editor.markText(from, to, {className:'chat-annotation',clearWhenEmpty:false});
    }
    showQuick(anchor);
  }
  function labelQuickAction() {
    const button = $('chat-quick-send'), label = t(editingAnnotation ? '保存批注' : '添加批注');
    button.setAttribute('aria-label', label); button.title = label + ' · Ctrl+Enter';
  }
  function showQuick(anchor) {
    quickAnchor = null; quickMoved = false;
    quickInput.placeholder = quickOriginal ? t('写下这处的修改要求…') : t('请先选中一段 LaTeX 源码');
    $('chat-quick-delete').hidden = !editingAnnotation;
    labelQuickAction();
    quickNotice('');
    $('chat-quick-send').disabled = sending || !quickOriginal;
    quick.showPopover();
    const selectionTop = anchor.selectionTop ?? (quickOriginal ? editor.charCoords(editor.getCursor('from'), 'window').top : anchor.top);
    const selectionBottom = anchor.selectionBottom ?? (quickOriginal ? editor.charCoords(editor.getCursor('to'), 'window').bottom : anchor.top);
    const below = Math.max(anchor.top + 18, selectionBottom + 12);
    quickAnchor = {left:anchor.left, below, selectionTop};
    sizeQuick(true); renderQuickSettings(); loadModels();
    quickInput.focus();
  }
  $('chat-quick-menu').onclick = () => {
    const anchor = $('editor-menu').getBoundingClientRect();
    $('editor-menu').hidePopover(); openQuick(anchor);
  };
  quickInput.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !quickInput.value && !$('chat-quick-status').textContent && !quickSettings.matches(':popover-open') && quick.dataset.expanded === 'true') {
      event.preventDefault(); event.stopPropagation(); sizeQuick(false); quickHandle.focus(); return;
    }
    if (event.key === 'Enter' && !event.isComposing && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); $('chat-quick-form').requestSubmit();
    }
  });
  $('chat-quick-form').onsubmit = async event => {
    event.preventDefault();
    return saveAnnotation();
  };
  $('chat-close').onclick = () => { panel.hidden = true; editor.focus(); };
  $('chat-end').onclick = async()=>{
    if (annotationCommitting) return;
    await stop();
    try{await request('/chat/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('filename').title})});reset(true);}
    catch(e){notice(e.message);}
  };
  $('chat-context-settings').addEventListener('toggle', event => { if (event.target.open) refreshContext(); });
  $('chat-use-selection').onclick = useSelection;
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
  async function send(text, draftInput, batch = null) {
    if (sending || annotationCommitting || !text.trim()) return;
    const selection = batch ? batch[0].original : selectedText(), question = text.trim();
    if (!selection) { notice(t('选区已失效，请重新选择文本。')); return; }
    const token = ++generation, doc = editor.getDoc();
    let conversation;
    annotationSending = !!batch;
    if (batch) annotationNotice(t('Codex 正在处理批注…'));
    clearProposal(); setSending(true); notice(t('Codex 正在思考…'));
    try {
      if(memoryRevision===null)await loadMemory();
      if(token!==generation||doc!==editor.getDoc())return;
      conversation=[...history.slice(-38),{role:'user',content:question}];
      message(t('你'),question);if(draftInput)draftInput.value='';
      const source = editor.getValue();
      const items = batch?.map(item => {
        const pos = validAnnotation(item);
        if (!pos) throw new Error(t('批注选区已变化，未发送。请点批注检查并重新选择。'));
        // Python uses Unicode code points; CodeMirror positions use UTF-16 offsets.
        return {id:item.id, start:Array.from(source.slice(0,editor.indexFromPos(pos.from))).length,
          end:Array.from(source.slice(0,editor.indexFromPos(pos.to))).length, selection:item.original, request:annotationRequest(item)};
      });
      const started = await request('/chat', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({source,selection,messages:conversation,remember:true,memory_revision:memoryRevision,model:modelSelect.value,effort:effortSelect.value,request_id:crypto.randomUUID().replaceAll('-',''),...(items ? {annotations:items} : {})})});
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
        history = [...conversation, {role:'assistant',content:JSON.stringify({reply:result.reply,replacement:result.replacement,...(batch ? {replacements:result.replacements} : {})})}];
        message('Codex', result.reply);
        if (batch) {
          await reviewAnnotations(batch, result.replacements, result.reply);
          annotationNotice(annotations.some(item => item.review) ? t('请逐处选择 Keep 或 Undo；也可在批注列表处理。') : result.reply);
        } else if (result.replacement !== null) {
          proposal = {doc, original:selection, replacement:result.replacement, segments:result.segments};
          renderProposal(); $('chat-proposal').hidden = false;
          notice(t('修改建议已就绪。可继续讨论，或应用到选区。'));
        } else {
          notice(t('可以继续追问；本次对话记忆保留。'));
        }
        messages.scrollTop = messages.scrollHeight;
        return;
      }
    } catch(e) {
      if (token === generation) { if(e.conflict)memoryRevision=null;notice(e.message); if (batch) annotationNotice(e.message, true); if(draftInput)draftInput.value = question; }
    } finally { if (token === generation) { annotationSending = false; job = null; setSending(false); } }
  }
  function annotationEdits(batch, replacements) {
    if (!Array.isArray(replacements) || replacements.length !== batch.length
        || new Set(replacements.map(item => item?.id)).size !== batch.length)
      throw new Error(t('批注修改返回不完整，未应用。请重试。'));
    return batch.map(item => {
      const pos = validAnnotation(item), result = replacements.find(result => result?.id === item.id);
      if (!pos || editor.getOption('readOnly')) throw new Error(t('批注选区已变化，未应用任何修改。批注已保留。'));
      if (!result || !(result.replacement === null || typeof result.replacement === 'string'))
        throw new Error(t('批注修改返回不完整，未应用。请重试。'));
      return {item, pos, result, start:editor.indexFromPos(pos.from), end:editor.indexFromPos(pos.to), replacement:result.replacement === null ? null : colorReplacement(result.replacement, color, result.segments)};
    }).sort((a,b) => b.start - a.start);
  }
  async function reviewAnnotations(batch, replacements, reply) {
    if (!editorProofread() && !pdfProofread()) return applyAnnotations(batch, replacements, reply);
    const edits = annotationEdits(batch, replacements);
    const unchanged = edits.filter(edit => edit.replacement === null || edit.replacement === edit.item.original);
    if (unchanged.length) await applyAnnotations(unchanged.map(edit => edit.item), unchanged.map(edit => edit.result), reply);
    for (const {item, pos, result, replacement} of edits) {
      if (replacement === null || replacement === item.original) continue;
      const prepared = {id:item.id, replacement};
      item.proposed = replacement;
      item.review = attachProofread(editor, pos.from, pos.to, item.original, replacement, result.changes,
        async () => {
          if (sending || annotationCommitting) throw new Error(t('正在保存，请稍后重试。'));
          await applyAnnotations([item], [prepared], reply);
        },
        () => {
          if (sending || annotationCommitting) return;
          item.review.destroy(); item.marker.clear();
          annotations = annotations.filter(other => other !== item); refreshAnnotations();
          notice(t('已撤销这处建议，原文保留。'));
        }, refreshAnnotations, editorProofread());
    }
    refreshAnnotations();
    const first = [...edits].reverse().find(edit => edit.item.review);
    if (first) editor.scrollIntoView(first.pos.from, 80);
  }
  async function applyAnnotations(batch, replacements, reply) {
    const edits = annotationEdits(batch, replacements);
    const before = editor.getValue();
    let after = before;
    for (const edit of edits) if (edit.replacement !== null) after = after.slice(0,edit.start) + edit.replacement + after.slice(edit.end);
    const change = {id:crypto.randomUUID().replaceAll('-',''), before, reply,
      items:[...edits].reverse().map(({item,start,end,replacement}) => ({id:item.id,
        start:Array.from(before.slice(0,start)).length, end:Array.from(before.slice(0,end)).length,
        selection:item.original, request:annotationRequest(item), replacement}))};
    annotationCommitting = true; $('annotations-stop').disabled = true; $('chat-stop').disabled = true; $('chat-end').disabled = true;
    refreshAnnotations();
    try { await recordAnnotations(after, change); }
    finally { annotationCommitting = false; $('annotations-stop').disabled = false; $('chat-stop').disabled = false; $('chat-end').disabled = false; refreshAnnotations(); }
    if (editor.getOption('keyMap').startsWith('vim')) CodeMirror.Vim.handleKey(editor, '<Esc>');
    editor.operation(() => {
      edits.forEach(({item,pos,replacement}) => {
        item.review?.destroy();
        item.marker.clear();
        if (replacement !== null && replacement !== item.original) editor.replaceRange(replacement,pos.from,pos.to,'codex-chat');
      });
    });
    annotations = annotations.filter(item => !batch.includes(item));
    refreshAnnotations();
    notice(t('批注与修改已保存到历史。'));
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
  editor.on('swapDoc', () => reset());
  window.addEventListener('latex-proofread-change', refreshAnnotations);
  window.addEventListener('latex-language-change', () => {
    const effort = effortSelect.value;
    updateEfforts(); effortSelect.value = effort; renderQuickSettings(); renderProposal();
    renderStyle();
    modelSelect.options[0].textContent = t('跟随 Codex 默认');
    quickInput.placeholder = quickOriginal ? t('写下这处的修改要求…') : t('请先选中一段 LaTeX 源码');
    labelQuickAction();
    refreshAnnotations();
    refreshContext();
  });
  window.addEventListener('pagehide', () => {
    if (job) fetch('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job}),keepalive:true});
  });
  window.addEventListener('beforeunload', event => {
    if (annotations.length || quickInput.value.trim()) { event.preventDefault(); event.returnValue = ''; }
  });
  restoreDefaultStyle(); refreshAnnotations();
  return {open, openQuick, refreshAnnotations, get busy() { return sending || annotationCommitting; },
    get hasAnnotations() { return !!annotations.length || !!quickInput.value.trim(); }};
}
