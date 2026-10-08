// Coordinates disposable PDF previews. This never invokes /save or /compile.
export function attachProofreadPdf({request, capture, display, restore, message, changed=()=>{}}) {
  let signature = '', generation = 0, timer = null, shown = null, pending = false;
  function invalidate() {
    clearTimeout(timer); generation++; signature = ''; shown = null; pending = false;
    changed();
  }
  function update(annotations) {
    const state = capture(), items = [];
    if (state.latex && state.enabled !== false) for (const item of annotations) {
      const pos = item.marker?.find();
      if (!item.review || !pos || item.doc !== state.doc || state.range(pos.from,pos.to) !== item.original) continue;
      items.push({id:item.id, start:Array.from(state.source.slice(0,state.index(pos.from))).length,
        end:Array.from(state.source.slice(0,state.index(pos.to))).length, selection:item.original, replacement:item.proposed, ...(item.projectReview?{display_original:item.displayOriginal}:{})});
    }
    const next = items.length ? JSON.stringify([state.path,state.version,state.source,items]) : '';
    if (next === signature) return;
    signature = next; const token = ++generation; clearTimeout(timer);
    const current = () => token === generation;
    if (!items.length) {
      pending = false;
      changed();
      if (shown) { shown = null; void restore(current).catch(error => { if(current())message('PDF 校对预览失败：{message}',{message:error.message}); }); }
      return;
    }
    pending = true;
    changed();
    timer = setTimeout(async () => {
      message('正在编译 PDF 校对预览…');
      try {
        const data = await request('/proofread',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({path:state.path,version:state.version,source:state.source,items})});
        if (!current()) return;
        shown = data;
        if (await display(data,current) === false || !current()) return;
        message('PDF 校对预览：红色删除，绿色保留；不写入历史。');
      } catch (error) {
        if (current()) {
          shown = null;
          await restore(current).catch(()=>{});
          message('PDF 校对预览失败：{message}',{message:error.message});
        }
      } finally { if(current()){pending = false;changed();} }
    },200);
  }
  return {update,invalidate,get active(){return pending || !!shown;},get data(){return shown;}};
}

export function paintProofreadActions(viewer, data, annotations, build, translate) {
  if (!data || data.pdf_revision !== build) return;
  const rows = new Map();
  for (const region of data.regions) {
    const item = annotations.find(item=>item.id===region.id && item.review);
    const view = viewer.getPageView(region.page-1);
    if (!item || !view?.viewport) continue;
    if (data.top_origin && !view.pdfPage) continue;
    const [left,,,topEdge] = data.top_origin ? view.pdfPage.mediaBox : [0,0,0,0];
    const point = view.viewport.convertToViewportPoint(left+region.rect[0],topEdge+region.rect[3]);
    let top = Math.max(4,point[1]-4);
    const occupied = rows.get(region.page) || [];
    while (occupied.some(row=>Math.abs(row-top)<62)) top += 62;
    occupied.push(top); rows.set(region.page,occupied);
    const identifier = item.displayId ?? item.id;
    const group = document.createElement('div'); group.className = 'pdf-proofread-actions';
    group.setAttribute('role','group'); group.setAttribute('aria-label',translate('校对修改')+' #'+identifier);
    group.style.left = '4px'; group.style.top = top+'px';
    const number = document.createElement('span'); number.textContent = '#'+identifier;
    const undo = document.createElement('button'), keep = document.createElement('button');
    undo.type = keep.type = 'button'; undo.textContent = 'Undo'; keep.textContent = 'Keep';
    undo.title = translate('撤销这处建议'); keep.title = translate('保留这处修改');
    undo.setAttribute('aria-label','Undo #'+identifier); keep.setAttribute('aria-label','Keep #'+identifier);
    keep.className = 'proofread-keep'; undo.disabled = keep.disabled = item.review.busy;
    undo.onclick = ()=>item.review.undo(); keep.onclick = ()=>item.review.keep();
    group.append(number,undo,keep); view.div.append(group);
  }
}
