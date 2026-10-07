import {t, language} from './latex-settings.mjs';
import {analyzePdf} from './latex-pdf-analysis.mjs';

export function pdfChangeCard(index) {
  const block = document.createElement('article'); block.className = 'history-pdf-change';
  const header = document.createElement('div'); header.className = 'history-pdf-heading';
  const heading = document.createElement('h3'), state = document.createElement('span'), toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'history-pdf-toggle';
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3H3v18h9"/><path d="M12 3h9v18h-9M12 3v18" stroke-dasharray="3 3"/></svg>';
  const view = document.createElement('div'); view.className = 'history-pdf-image';
  const columns = {};
  for (const side of ['after','before']) {
    columns[side] = document.createElement('section'); view.append(columns[side]);
  }
  let side = 'after';
  function update() {
    block.dataset.side = side;
    heading.textContent = t('改动 {number}', {number:index+1}) + ' · ';
    state.textContent = t(side === 'after' ? '修改后' : '修改前'); state.className = side === 'after' ? 'history-after-label' : '';
    heading.append(state);
    for (const name of ['before','after']) columns[name].hidden = name !== side;
    const label = t(side === 'after' ? '查看修改前' : '查看修改后');
    toggle.title = label; toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(side === 'before'));
  }
  toggle.onclick = () => { side = side === 'after' ? 'before' : 'after'; update(); };
  header.append(heading, toggle); block.append(header, view); update();
  return {block, columns};
}

export function markPdfText(canvas, viewport, x, y, rectangles) {
  const context = canvas.getContext('2d');
  for (const rect of rectangles) {
    const box = [...viewport.convertToViewportPoint(...rect.slice(0,2)),...viewport.convertToViewportPoint(...rect.slice(2))];
    const left = Math.max(0, Math.floor(Math.min(box[0],box[2])-x));
    const top = Math.max(0, Math.floor(Math.min(box[1],box[3])-y));
    const right = Math.min(canvas.width, Math.ceil(Math.max(box[0],box[2])-x));
    const bottom = Math.min(canvas.height, Math.ceil(Math.max(box[1],box[3])-y));
    if (right <= left || bottom <= top) continue;
    const pixels = context.getImageData(left,top,right-left,bottom-top);
    for (let i=0; i<pixels.data.length; i+=4) {
      const ink = 1-Math.min(...pixels.data.subarray(i,i+3))/255;
      pixels.data[i] = 255-35*ink; pixels.data[i+1] = pixels.data[i+2] = 255-217*ink;
    }
    context.putImageData(pixels,left,top);
  }
}

export function sourceRows(runs) {
  const rows = []; let number = 1, row = {number:null, parts:[], changed:false};
  for (const run of runs) for (const part of run.text.split(/(\r\n|\n|\r)/)) {
    if (!part) continue;
    if (run.kind !== 'equal') row.changed = true;
    if (run.kind !== 'delete') row.number = number;
    if (/^[\r\n]+$/.test(part)) {
      rows.push(row); if (run.kind !== 'delete') number++;
      row = {number:null, parts:[], changed:false};
    } else row.parts.push({kind:run.kind, text:part});
  }
  row.number ??= number; rows.push(row);
  let previousNumber = 0;
  for (const row of rows) {
    if (row.number === previousNumber) row.number = '';
    else if (row.number !== null) previousNumber = row.number;
  }
  return rows;
}

export function historyTime(value) {
  const date = new Date(value), pad = value => String(value).padStart(2,'0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())}`;
}

export function attachHistory(editor, request, getState, restore) {
  const $ = id => document.querySelector('#history-' + id);
  const dialog = $('dialog'), list = $('list'), code = $('code'), target = $('target'), pdf = $('pdf-view');
  let context, revisions = [], selected = null, detail = null, next = null, serial = 0, mode = 'diff', working = false;
  let pdfSerial = 0, pdfTasks = [], pdfRequest = null, summaryJob = null, summaryLoading = false, summarySerial = 0;
  let menuId = null, editingId = null, currentFile = null;
  const comparison = () => target.value === 'previous' ? {compare:'previous'} : target.value === 'current'
    ? {compare:'current', ...(revisions.find(row=>row.id===selected)?.file === currentFile ? {source:context.source} : {})}
    : {target_id:Number(target.value)};
  const time = historyTime;
  const title = row => row.label || (row.annotation_count ? t('AI 批注 · {count}',{count:row.annotation_count}) : '') || row.sections?.slice(0,2).map(section=>t(section)).join(' · ') || t('正文');
  const needsSummary = row => row.baseline && !row.summaries?.[language] && !['调整空白或换行','内容与上一版相同'].includes(row.description);
  const post = (route, data, options={}) => request('/history/' + route, {...options, method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:context.path, ...data})});
  const notice = (text='') => { $('status').textContent = text; $('status').hidden = !text; };
  function renderTargets() {
    const previous = target.value, file = revisions.find(row=>row.id===selected)?.file;
    target.replaceChildren(new Option(t('与上一版比较'), 'previous'), new Option(t(file === currentFile ? '当前编辑内容' : '文件当前内容'), 'current'));
    for (const row of revisions.filter(row=>row.file === file)) target.append(new Option(time(row.created) + ' · ' + title(row), String(row.id)));
    target.value = [...target.options].some(option => option.value === previous) ? previous : 'previous';
    $('file').textContent = file || currentFile || ''; $('file').title = file || currentFile || '';
  }
  function controls() {
    $('restore').disabled = working || !detail?.current_version;
    $('confirm').disabled = working || !detail?.current_version;
    $('cancel').disabled = working;
    $('label-save').disabled = working;
    $('label').disabled = working;
    $('refresh').disabled = working;
    $('more').disabled = working;
    target.disabled = working;
    for (const button of list.querySelectorAll('button')) button.disabled = working;
  }
  function updateNext() {
    const bottom = code.getBoundingClientRect().bottom;
    const below = [...code.querySelectorAll('.history-change-start')].filter(row => row.getBoundingClientRect().top >= bottom - 1);
    $('next').hidden = mode !== 'diff' || !below.length;
    $('next-label').textContent = t('下方还有 {count} 处改动', {count:below.length});
    $('next').onclick = () => {
      if (below[0]) code.scrollTo({top:code.scrollTop + below[0].getBoundingClientRect().top - code.getBoundingClientRect().top - 24, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    };
  }
  function clearPdf() {
    pdfSerial++;
    if (pdfRequest) {
      const obsolete = pdfRequest; pdfRequest = null;
      obsolete.controller.abort();
      post('pdf-cancel', {path:obsolete.path, request_id:obsolete.id}).catch(()=>{});
    }
    for (const task of pdfTasks) task.destroy().catch(()=>{});
    pdfTasks = []; pdf.replaceChildren();
  }
  async function renderPdf(recompile = false) {
    const ticket = pdfSerial;
    const pending = {id:crypto.randomUUID(), path:context.path, controller:new AbortController()};
    pdfRequest = pending;
    const selection = {id:selected, ...comparison()};
    $('recompile').disabled = true;
    pdf.textContent = t('正在读取历史对比图，缺失时编译生成…');
    try {
      let data = await post('pdf', {...selection, recompile, request_id:pending.id}, {signal:pending.controller.signal});
      if (ticket !== pdfSerial || mode !== 'pdf' || !dialog.open) return;
      if (!data.needs_analysis && !data.changes.length) { pdf.textContent = t('两个版本没有需要预览的改动。'); return; }
      const documents = {};
      if (!data.images) {
        const pdfjs = await import('./pdfjs/build/pdf.mjs');
        if (ticket !== pdfSerial) return;
        for (const side of ['before','after']) {
          const task = pdfjs.getDocument({url:data[side],cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',isEvalSupported:false}); pdfTasks.push(task);
          documents[side] = await task.promise;
          if (ticket !== pdfSerial) return;
        }
        if (data.needs_analysis) {
          const analysis = {};
          const check = () => {
            if (ticket !== pdfSerial || pending.controller.signal.aborted) throw new DOMException('Canceled','AbortError');
          };
          for (const side of ['before','after']) {
            analysis[side] = {revision:data.revisions[side], ...await analyzePdf(documents[side],check)};
          }
          check();
          // Reuse these exact compiled snapshots; never recompile between extraction and matching.
          data = await post('pdf', {...selection, analysis, request_id:pending.id}, {signal:pending.controller.signal});
          if (ticket !== pdfSerial || mode !== 'pdf' || !dialog.open) return;
          if (data.needs_analysis) throw new Error(t('历史 PDF 已变化，请重新打开对比。'));
        }
      }
      pdf.replaceChildren();
      if (!data.changes.length) { pdf.textContent = t('两个版本没有需要预览的改动。'); return; }
      const images = [];
      for (const [index, change] of data.changes.entries()) {
        if (ticket !== pdfSerial) return;
        const {block, columns} = pdfChangeCard(index); pdf.append(block);
        const saved = {kind:change.kind, before:[], after:[]}; images.push(saved);
        for (const side of ['after','before']) {
          const column = columns[side], label = t(side === 'before' ? '修改前' : '修改后');
          if (!change[side].length) {
            const empty = document.createElement('p');
            empty.textContent = t(side === 'before' && change.kind === 'insert' ? '此处新增' : side === 'after' && change.kind === 'delete' ? '此处删除' : '这处源码没有直接对应的 PDF 内容，请查看源码对比。'); column.append(empty);
          }
          for (const region of change[side]) {
            if (data.images) {
              const image = document.createElement('img'); image.src = region.image;
              image.alt = t('{side} · PDF 第 {page} 页',{side:label,page:region.page});
              image.onerror = () => { if (ticket === pdfSerial && dialog.open) { clearPdf(); renderPdf(true); } };
              column.append(image); continue;
            }
            const page = await documents[side].getPage(region.page);
            if (ticket !== pdfSerial) return;
            // ponytail: fixed 1400px crops; regenerate at a higher size if export needs it.
            const viewport = page.getViewport({scale:1400/(region.rect[2]-region.rect[0])});
            const box = [...viewport.convertToViewportPoint(...region.rect.slice(0,2)),...viewport.convertToViewportPoint(...region.rect.slice(2))];
            const x = Math.floor(Math.min(box[0],box[2])), y = Math.floor(Math.min(box[1],box[3]));
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(Math.max(box[0],box[2]))-x; canvas.height = Math.ceil(Math.max(box[1],box[3]))-y;
            canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',t('{side} · PDF 第 {page} 页',{side:label,page:region.page})); column.append(canvas);
            await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:[1,0,0,1,-x,-y]}).promise;
            if (ticket !== pdfSerial) return;
            if (side === 'after') markPdfText(canvas,viewport,x,y,region.highlights || []);
            saved[side].push({page:region.page, png:canvas.toDataURL('image/png')});
          }
        }
      }
      if (!data.images && ticket === pdfSerial) {
        try {
          const result = await post('pdf-cache', {...selection, images});
          if (ticket === pdfSerial && result.cache_error) notice(t('历史对比图缓存未保存：{message}', {message:result.cache_error}));
        } catch (error) {
          if (ticket === pdfSerial) notice(t('历史对比图缓存未保存：{message}', {message:error.message}));
        }
      }
    } catch (error) { if (ticket === pdfSerial && dialog.open) pdf.textContent = t('PDF 对比失败：') + error.message; }
    finally {
      if (pdfRequest === pending) pdfRequest = null;
      if (ticket === pdfSerial) $('recompile').disabled = false;
    }
  }
  function renderAnnotations() {
    const panel = $('annotations'), items = detail?.annotations || [], body = $('annotation-list');
    panel.hidden = !items.length; body.replaceChildren();
    $('annotation-title').textContent = t('批注与 AI 回复 · {count}',{count:items.length});
    for (const item of items) {
      const entry = document.createElement('article'), label = document.createElement('strong'), request = document.createElement('p');
      label.textContent = '#' + item.id + ' · ' + t('第 {first}–{last} 行',{first:item.first_line,last:item.last_line});
      request.textContent = item.request;
      const selection = document.createElement('details'), summary = document.createElement('summary'), source = document.createElement('pre');
      summary.textContent = t('原选区'); source.textContent = item.selection;
      selection.append(summary,source); entry.append(label,request,selection); body.append(entry);
    }
    if (items.length && detail.annotation_reply) {
      const reply = document.createElement('article'), label = document.createElement('strong'), text = document.createElement('p');
      label.textContent = t('AI 回复'); text.textContent = detail.annotation_reply; reply.append(label,text); body.append(reply);
    }
  }
  function renderCode() {
    renderAnnotations();
    clearPdf(); code.replaceChildren(); code.hidden = mode === 'pdf'; pdf.hidden = mode !== 'pdf';
    dialog.dataset.historyView = mode;
    $('recompile').hidden = mode !== 'pdf'; $('recompile').disabled = !detail;
    $('panes').setAttribute('aria-labelledby','history-'+mode);
    $('pdf').setAttribute('aria-pressed', String(mode === 'pdf'));
    $('diff').setAttribute('aria-pressed', String(mode === 'diff'));
    $('source').setAttribute('aria-pressed', String(mode === 'source'));
    $('next').hidden = true;
    if (!detail) return;
    if (mode === 'pdf') { renderPdf(); return; }
    const rows = sourceRows(mode === 'source' ? [{kind:'equal', text:detail.source}] : detail.changes);
    const fragment = document.createDocumentFragment();
    let previousChanged = false;
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'history-row' + (row.changed ? ' changed' + (!previousChanged ? ' history-change-start' : '') : '');
      const gutter = document.createElement('span'); gutter.className = 'history-line-number';
      gutter.textContent = row.number ?? '−'; gutter.setAttribute('aria-hidden','true');
      const content = document.createElement('span'); content.className = 'history-line-text';
      for (const part of row.parts) {
        const span = document.createElement(part.kind === 'insert' ? 'ins' : part.kind === 'delete' ? 'del' : 'span');
        span.textContent = part.text;
        if (part.kind !== 'equal') span.title = t(part.kind === 'insert' ? '新增' : '删除');
        content.append(span);
      }
      if (!row.parts.length) content.textContent = ' ';
      line.append(gutter, content); fragment.append(line); previousChanged = row.changed;
    }
    code.append(fragment); updateNext();
  }
  async function select(id) {
    const ticket = ++serial;
    if ($('confirmation').open) $('confirmation').close(); notice();
    selected = id; detail = null; renderAnnotations(); clearPdf(); controls(); code.textContent = t('正在读取版本…'); $('next').hidden = true;
    renderTargets();
    for (const button of list.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.id) === id));
    try {
      const data = await post('diff', {id, ...comparison()});
      if (ticket !== serial || !dialog.open) return;
      detail = {...revisions.find(row=>row.id===id),...data};
      code.scrollTop = 0; renderCode(); controls();
    } catch (error) { if (ticket === serial) { code.textContent = ''; notice(t('读取失败：') + error.message); controls(); } }
  }
  function renderList() {
    const scroll = list.scrollTop || 0;
    list.replaceChildren();
    for (const row of revisions) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.id = row.id;
      button.className = 'history-entry'; button.setAttribute('aria-pressed', String(row.id === selected));
      const icon = document.createElement('span'); icon.className = 'history-entry-icon'; icon.setAttribute('aria-hidden','true');
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6"/></svg>';
      const text = document.createElement('span'); text.className = 'history-entry-text';
      const heading = document.createElement('strong'); heading.textContent = title(row); heading.title = (row.sections || []).join(' · ');
      const summary = document.createElement('span'); summary.className = 'history-entry-summary';
      const file = document.createElement('small'); file.className = 'history-entry-file'; file.textContent = row.file; file.title = row.file;
      summary.textContent = row.summaries?.[language] || t(row.description || '更新正文');
      if (row.summaries?.[language]) { const badge = document.createElement('small'); badge.className = 'history-ai-badge'; badge.textContent = 'AI'; text.append(badge); }
      text.append(heading, file, summary);
      const stamp = document.createElement('time'); stamp.textContent = time(row.created); stamp.setAttribute('datetime',row.created);
      button.append(icon,text,stamp);
      button.onclick = () => select(row.id); list.append(button);
      button.setAttribute('aria-haspopup','menu');
      button.oncontextmenu = event => { if (!event.shiftKey) showActions(row,event); };
      button.onkeydown = event => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) showActions(row,event); };
    }
    renderTargets();
    list.scrollTop = scroll;
    $('more').hidden = !next; controls();
  }
  function showActions(row,event) {
    if (working) return;
    event.preventDefault(); menuId = row.id;
    const menu = $('actions'), rect = event.currentTarget?.getBoundingClientRect() || {left:0,bottom:0};
    menu.style.left = Math.max(8,Math.min(event.clientX ?? rect.left,window.innerWidth-190))+'px';
    menu.style.top = Math.max(8,Math.min(event.clientY ?? rect.bottom,window.innerHeight-100))+'px';
    menu.showPopover(); $('rename').focus();
  }
  async function loadSummaries() {
    if (summaryLoading || !dialog.open || !revisions.some(needsSummary)) return;
    const path = context.path, ticket = summarySerial, locale = language;
    summaryLoading = true; $('summary-status').textContent = t('AI 正在概括改动…');
    try {
      const start = await post('summaries',{ids:revisions.filter(needsSummary).slice(0,100).map(row=>row.id),language:locale});
      if (ticket !== summarySerial || !dialog.open || context.path !== path) {
        if (start.id) request('/history/summaries/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,id:start.id})}).catch(()=>{});
        return;
      }
      summaryJob = start.id || null;
      let result = start;
      while (result.id || result.status === 'running') {
        await new Promise(resolve=>setTimeout(resolve,1200));
        if (ticket !== summarySerial || !dialog.open || context.path !== path) return;
        result = await request('/history/summaries?id='+encodeURIComponent(summaryJob));
      }
      if (ticket !== summarySerial || !dialog.open || context.path !== path) return;
      if (result.status !== 'done') throw new Error(result.error || t('本次回复已停止。'));
      if (result.language !== locale) throw new Error(t('AI 摘要暂不可用，章节位置已保留'));
      for (const saved of result.summaries) { const row = revisions.find(row=>row.id===saved.id); if (row) (row.summaries ??= {})[locale] = saved.summary; }
      renderList(); $('summary-status').textContent = '';
    } catch (error) {
      if (ticket === summarySerial && dialog.open) { $('summary-status').textContent = t('AI 摘要暂不可用，章节位置已保留'); $('summary-status').title = error.message; }
    } finally { if (ticket === summarySerial) { summaryLoading = false; summaryJob = null; } }
  }
  function cancelSummaries() {
    summarySerial++;
    if (summaryJob) post('summaries/cancel',{id:summaryJob}).catch(()=>{});
    summaryJob = null; summaryLoading = false; $('summary-status').textContent = '';
  }
  $('sidebar').onpointerenter = () => { $('sidebar-toggle').setAttribute('aria-expanded','true'); loadSummaries(); };
  $('sidebar').onpointerleave = () => $('sidebar-toggle').setAttribute('aria-expanded',String(dialog.dataset.sidebarOpen==='true'));
  function pinSidebar(open) {
    dialog.dataset.sidebarOpen = String(open);
    $('sidebar-toggle').setAttribute('aria-expanded',String(open));
    $('sidebar-pin').setAttribute('aria-pressed',String(open));
    const label = t(open ? '取消固定记录栏' : '固定记录栏');
    $('sidebar-pin').title = label; $('sidebar-pin').setAttribute('aria-label',label);
    if (open) loadSummaries();
  }
  $('sidebar-toggle').onclick = $('sidebar-pin').onclick = () => pinSidebar(dialog.dataset.sidebarOpen !== 'true');
  $('sidebar').onfocusin = loadSummaries;
  async function refresh(more = false, keepSelection = false) {
    const ticket = ++serial;
    working = true; controls(); notice();
    if (!more) { context = getState(); detail = null; revisions = []; next = null; renderCode(); renderList(); }
    try {
      const data = await request('/history?path=' + encodeURIComponent(context.path) + (more && next ? '&before=' + next : ''));
      if (ticket !== serial || !dialog.open) return;
      working = false;
      currentFile = data.file;
      revisions.push(...data.revisions); next = data.next;
      if (!more && (!keepSelection || !revisions.some(row=>row.id===selected))) selected = revisions[0]?.id ?? null;
      renderList();
      if (selected !== null) await select(selected);
      else code.textContent = t('暂时没有历史记录。');
    } catch (error) { if (ticket === serial) { working = false; notice(t('历史读取失败：') + error.message); controls(); } }
  }
  $('open').onclick = () => { dialog.showModal(); refresh(); };
  $('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    serial++; cancelSummaries(); clearPdf(); detail = null; working = false;
    pinSidebar(false);
    $('actions').hidePopover();
    for (const name of ['name-dialog','confirmation']) if ($(name).open) $(name).close();
    menuId = editingId = null;
  });
  $('refresh').onclick = () => refresh();
  $('recompile').onclick = () => { notice(); clearPdf(); renderPdf(true); };
  $('more').onclick = () => refresh(true);
  target.onchange = () => { if (selected !== null) select(selected); };
  for (const name of ['diff','pdf','source']) $(name).onclick = () => { if (mode === name) return; mode = name; renderCode(); };
  $('rename').onclick = () => {
    editingId = menuId ?? selected; menuId = null; $('actions').hidePopover();
    $('label').value = revisions.find(row=>row.id===editingId)?.label || '';
    $('label-error').textContent = ''; $('name-dialog').showModal(); $('label').focus(); $('label').select();
  };
  $('label-cancel').onclick = () => $('name-dialog').close();
  $('label-form').onsubmit = async event => {
    event.preventDefault(); if (working || editingId === null) return;
    const id = editingId, label = $('label').value, ticket = serial;
    working = true; controls();
    try {
      await post('label', {id, label});
      if (ticket !== serial || !dialog.open) return;
      $('name-dialog').close(); editingId = null; await refresh(false,true);
    } catch (error) { if (ticket === serial) $('label-error').textContent = t('命名失败：') + error.message; }
    finally { if (ticket === serial) { working = false; controls(); } }
  };
  $('restore').onclick = async () => {
    if (working || !detail) return;
    const id = menuId ?? selected; menuId = null; $('actions').hidePopover();
    if (id !== selected) await select(id);
    if (!detail?.current_version || working || !dialog.open) return;
    $('confirm-title').textContent = t('确定恢复？') + ' · ' + detail.file;
    $('confirmation').showModal(); $('confirm').focus();
  };
  $('cancel').onclick = () => $('confirmation').close();
  $('confirm').onclick = async () => {
    if (working || !detail?.current_version) return;
    working = true; controls(); notice(t('正在保留当前内容并恢复…'));
    try { await restore({...context, id:selected, ...(detail.file !== currentFile ? {target_version:detail.current_version} : {})}); }
    catch (error) { notice(t('恢复失败：') + error.message); }
    finally { working = false; controls(); }
  };
  editor.on('swapDoc', () => { if (dialog.open) dialog.close(); });
  code.addEventListener('scroll', updateNext);
  new ResizeObserver(updateNext).observe(code);
  window.addEventListener('latex-language-change', () => {
    cancelSummaries(); pinSidebar(dialog.dataset.sidebarOpen==='true');
    if (dialog.open) { renderList(); renderCode(); loadSummaries(); }
  });
}
