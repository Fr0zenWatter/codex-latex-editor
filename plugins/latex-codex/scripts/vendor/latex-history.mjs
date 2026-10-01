import {t, language} from './latex-settings.mjs';

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

export function attachHistory(editor, request, getState, restore) {
  const $ = id => document.querySelector('#history-' + id);
  const dialog = $('dialog'), list = $('list'), code = $('code'), target = $('target'), pdf = $('pdf-view');
  const kinds = {open:'首次打开', save:'自动保存', external:'外部修改', restore:'恢复版本', 'before-restore':'恢复前的草稿'};
  let context, revisions = [], selected = null, detail = null, next = null, serial = 0, mode = 'diff', working = false;
  let pdfSerial = 0, pdfTasks = [];
  const comparison = () => target.value === 'previous' ? {compare:'previous'} : target.value === 'current' ? {source:context.source} : {target_id:Number(target.value)};
  const time = value => new Date(value).toLocaleString(language, {hour12:false});
  const title = row => row.label || t(kinds[row.kind] || '保存版本');
  const post = (route, data) => request('/history/' + route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:context.path, ...data})});
  function controls() {
    $('restore').disabled = working || !detail;
    $('confirm').disabled = working || !detail;
    $('cancel').disabled = working;
    $('label-save').disabled = working || !detail;
    $('label').disabled = working || !detail;
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
    for (const task of pdfTasks) task.destroy().catch(()=>{});
    pdfTasks = []; pdf.replaceChildren();
  }
  async function renderPdf() {
    const ticket = pdfSerial;
    pdf.textContent = t('正在编译历史版本并定位改动…');
    try {
      const data = await post('pdf', {id:selected, ...comparison()});
      if (ticket !== pdfSerial || mode !== 'pdf' || !dialog.open) return;
      pdf.replaceChildren();
      if (!data.changes.length) { pdf.textContent = t('两个版本没有需要预览的改动。'); return; }
      const note = document.createElement('p'); note.className = 'history-pdf-note';
      note.textContent = t('只显示改动附近，忽略后续排版移动。历史版本使用当前图片和引用等依赖重新编译。'); pdf.append(note);
      const pdfjs = await import('./pdfjs/build/pdf.mjs');
      if (ticket !== pdfSerial) return;
      const documents = {};
      for (const side of ['before','after']) {
        const task = pdfjs.getDocument({url:data[side],cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',isEvalSupported:false}); pdfTasks.push(task);
        documents[side] = await task.promise;
        if (ticket !== pdfSerial) return;
      }
      for (const [index, change] of data.changes.entries()) {
        if (ticket !== pdfSerial) return;
        const block = document.createElement('article'); block.className = 'history-pdf-change';
        const heading = document.createElement('h3'); heading.textContent = t('改动 {number}', {number:index+1}); block.append(heading);
        const pair = document.createElement('div'); pair.className = 'history-pdf-pair'; block.append(pair); pdf.append(block);
        for (const side of ['before','after']) {
          const column = document.createElement('section'), label = document.createElement('h4');
          label.textContent = t(side === 'before' ? '修改前' : '修改后'); column.append(label); pair.append(column);
          if (!change[side].length) {
            const empty = document.createElement('p');
            empty.textContent = t(side === 'before' && change.kind === 'insert' ? '此处新增' : side === 'after' && change.kind === 'delete' ? '此处删除' : '这处源码没有直接对应的 PDF 内容，请查看源码对比。'); column.append(empty);
          }
          for (const region of change[side]) {
            const page = await documents[side].getPage(region.page);
            if (ticket !== pdfSerial) return;
            const ratio = window.devicePixelRatio || 1, width = Math.max(240, column.clientWidth || pdf.clientWidth/2);
            const viewport = page.getViewport({scale:width/(region.rect[2]-region.rect[0])*ratio});
            const box = [...viewport.convertToViewportPoint(...region.rect.slice(0,2)),...viewport.convertToViewportPoint(...region.rect.slice(2))];
            const x = Math.floor(Math.min(box[0],box[2])), y = Math.floor(Math.min(box[1],box[3]));
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(Math.max(box[0],box[2]))-x; canvas.height = Math.ceil(Math.max(box[1],box[3]))-y;
            canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',t('{side} · PDF 第 {page} 页',{side:label.textContent,page:region.page})); column.append(canvas);
            await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:[1,0,0,1,-x,-y]}).promise;
            if (ticket !== pdfSerial) return;
          }
        }
      }
    } catch (error) { if (ticket === pdfSerial && dialog.open) pdf.textContent = t('PDF 对比失败：') + error.message; }
  }
  function renderCode() {
    clearPdf(); code.replaceChildren(); code.hidden = mode === 'pdf'; pdf.hidden = mode !== 'pdf';
    dialog.dataset.historyView = mode;
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
  function description() {
    if (!detail) return;
    $('status').textContent = time(detail.created) + ' · ' + title(detail) + ' · ' + (target.value === 'previous' ? t(detail.first ? '这是最早保存的版本。' : detail.same ? '两个版本内容相同。' : '上一版 → 此版本') : t(target.value === 'current' ? '打开／刷新历史时的编辑内容（含未保存修改）' : '所选对比版本'));
  }
  async function select(id) {
    const ticket = ++serial;
    $('confirmation').hidden = true; $('restore').hidden = false;
    selected = id; detail = null; clearPdf(); controls(); code.textContent = t('正在读取版本…'); $('next').hidden = true;
    for (const button of list.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.id) === id));
    try {
      const data = await post('diff', {id, ...comparison()});
      if (ticket !== serial || !dialog.open) return;
      detail = data; $('label').value = data.label;
      description(); code.scrollTop = 0; renderCode(); controls();
    } catch (error) { if (ticket === serial) { code.textContent = ''; $('status').textContent = t('读取失败：') + error.message; controls(); } }
  }
  function renderList() {
    list.replaceChildren();
    const previous = target.value;
    target.replaceChildren(new Option(t('与上一版比较'), 'previous'), new Option(t('当前编辑内容'), 'current'));
    for (const row of revisions) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.id = row.id;
      button.textContent = title(row); button.setAttribute('aria-pressed', String(row.id === selected));
      const stamp = document.createElement('small'); stamp.textContent = time(row.created); button.append(stamp);
      button.onclick = () => select(row.id); list.append(button);
      target.append(new Option(time(row.created) + ' · ' + title(row), String(row.id)));
    }
    target.value = [...target.options].some(option => option.value === previous) ? previous : 'previous';
    $('more').hidden = !next; controls();
  }
  async function refresh(more = false) {
    const ticket = ++serial;
    working = true; controls(); $('status').textContent = t('正在读取历史…');
    if (!more) { context = getState(); detail = null; revisions = []; next = null; renderCode(); renderList(); }
    $('file').textContent = context.path.split(/[\\/]/).at(-1); $('file').title = context.path;
    try {
      const data = await request('/history?path=' + encodeURIComponent(context.path) + (more && next ? '&before=' + next : ''));
      if (ticket !== serial || !dialog.open) return;
      working = false;
      revisions.push(...data.revisions); next = data.next; renderList();
      if (!more) selected = revisions[0]?.id ?? null;
      if (selected !== null) await select(selected);
      else $('status').textContent = t('暂时没有历史记录。');
    } catch (error) { if (ticket === serial) { working = false; $('status').textContent = t('历史读取失败：') + error.message; controls(); } }
  }
  $('open').onclick = () => { dialog.showModal(); refresh(); };
  $('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { serial++; clearPdf(); detail = null; working = false; });
  $('refresh').onclick = () => refresh();
  $('more').onclick = () => refresh(true);
  target.onchange = () => { if (selected !== null) select(selected); };
  for (const name of ['diff','pdf','source']) $(name).onclick = () => { mode = name; renderCode(); };
  $('label-form').onsubmit = async event => {
    event.preventDefault(); if (working || !detail) return;
    const id = selected, label = $('label').value, ticket = ++serial;
    working = true; controls();
    try {
      await post('label', {id, label});
      if (ticket !== serial || !dialog.open) return;
      const row = revisions.find(row => row.id === id); row.label = label.trim(); detail.label = row.label;
      renderList(); $('status').textContent = t(label.trim() ? '版本名称已保存。' : '版本名称已清除。');
    } catch (error) { if (ticket === serial) $('status').textContent = t('命名失败：') + error.message; }
    finally { if (ticket === serial) { working = false; controls(); } }
  };
  $('restore').onclick = () => {
    if (working || !detail) return;
    $('confirmation').hidden = false; $('restore').hidden = true; $('confirm').focus();
  };
  $('cancel').onclick = () => { $('confirmation').hidden = true; $('restore').hidden = false; $('restore').focus(); };
  $('confirm').onclick = async () => {
    if (working || !detail) return;
    working = true; controls(); $('status').textContent = t('正在保留当前内容并恢复…');
    try { await restore({...context, id:selected}); }
    catch (error) { $('status').textContent = t('恢复失败：') + error.message; }
    finally { working = false; controls(); }
  };
  editor.on('swapDoc', () => { if (dialog.open) dialog.close(); });
  code.addEventListener('scroll', updateNext);
  new ResizeObserver(updateNext).observe(code);
  window.addEventListener('latex-language-change', () => { if (dialog.open) { renderList(); description(); renderCode(); } });
}
