import {pdfTextRect} from './latex-pdf-analysis.mjs';

// Keep PDF content order for source matching, but select by geometry, not DOM order.
export function boxedPdfContent(content, page, box, excluded = []) {
  const fragments = [], parts = [];
  const lineBreak = () => {
    if (!parts.length || parts.at(-1) === '\n') return;
    parts.push('\n');if (fragments.length) fragments.at(-1).text += '\n';
  };
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue;
    // PDF.js emits line breaks as empty items with zero-size geometry.
    if (!item.str) { if (item.hasEOL) lineBreak();continue; }
    const rect = pdfTextRect(item, content.styles);
    const [left,bottom,right,top] = rect, width = right-left, height = top-bottom;
    if (!(width > 0 && height > 0)) continue;
    const x = (left+right)/2, y = (bottom+top)/2;
    if (excluded.some(([l,b,r,t]) => x >= l && x <= r && y >= b && y <= t)) continue;
    const overlapX = Math.max(0, Math.min(right,box[2])-Math.max(left,box[0]));
    const overlapY = Math.max(0, Math.min(top,box[3])-Math.max(bottom,box[1]));
    if (overlapX*overlapY < width*height*.25) continue;
    if (item.str.trim()) fragments.push({page,rect,text:item.str});
    parts.push(item.str);if (item.hasEOL) lineBreak();
  }
  if (!fragments.length) return null;
  const anchor = fragment => ({page,x:(fragment.rect[0]+fragment.rect[2])/2,y:(fragment.rect[1]+fragment.rect[3])/2});
  const points = [anchor(fragments[0]),anchor(fragments.at(-1))];
  if (fragments.length > 2) for (const index of [Math.floor(fragments.length/3),Math.floor(fragments.length*2/3)]) {
    const point = anchor(fragments[index]);
    if (!points.some(p => p.x === point.x && p.y === point.y)) points.push(point);
  }
  return {kind:'box',points,fragments,rectangles:fragments.map(({page,rect}) => ({page,rect})),text:parts.join('').trim()};
}

export function attachPdfBoxSelection({preview,viewer,capture,onSelect,message,excludedRects = () => []}) {
  const document = preview.ownerDocument, window = document.defaultView;
  const cache = new WeakMap();
  let drag = null, selection = null, epoch = 0, marks = [];
  const removeMarks = () => { marks.forEach(mark => mark.remove()); marks = []; };
  const release = id => { if (preview.hasPointerCapture(id)) preview.releasePointerCapture(id); };
  const clear = () => {
    const old = drag; drag = null; selection = null; epoch++;
    preview.classList.remove('box-selecting');removeMarks();onSelect(null);
    if (old) release(old.id);
  };
  const toPdf = (state,x,y) => {
    const rect = state.element.getBoundingClientRect(), {viewport} = state.view;
    // The captured drag stays on its starting page, even outside the pane.
    x = Math.max(0,Math.min(state.element.clientWidth,x-rect.left-state.element.clientLeft));
    y = Math.max(0,Math.min(state.element.clientHeight,y-rect.top-state.element.clientTop));
    return viewport.convertToPdfPoint(x*viewport.width/state.element.clientWidth,y*viewport.height/state.element.clientHeight);
  };
  const rectangle = (a,b) => [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
  const paint = (state,rect,className) => {
    const a = state.view.viewport.convertToViewportPoint(rect[0],rect[1]);
    const b = state.view.viewport.convertToViewportPoint(rect[2],rect[3]);
    const mark = document.createElement('div');mark.className = className;mark.setAttribute('aria-hidden','true');
    Object.assign(mark.style,{left:Math.min(a[0],b[0])+'px',top:Math.min(a[1],b[1])+'px',width:Math.abs(b[0]-a[0])+'px',height:Math.abs(b[1]-a[1])+'px'});
    state.element.append(mark);marks.push(mark);return mark;
  };
  const readPage = (pdf,page) => {
    if (!cache.has(pdf)) cache.set(pdf,new Map());
    const pages = cache.get(pdf);
    if (!pages.has(page)) {
      const pending = pdf.getPage(page).then(p => p.getTextContent({disableNormalization:true,disableCombineTextItems:true}));
      pages.set(page,pending);
      pending.catch(() => { if (pages.get(page) === pending) pages.delete(page); });
    }
    return pages.get(page);
  };
  const finish = async state => {
    const token = epoch;
    message('正在读取框选区域…');
    try {
      const content = await readPage(state.pdf,state.page);
      if (token !== epoch || viewer.pdfDocument !== state.pdf) return;
      const selected = boxedPdfContent(content,state.page,state.box,excludedRects(state.element));
      if (!selected) { removeMarks();message('框内没有可选择的文字，请扩大选框。');return; }
      selection = {...selected,...state.snapshot};
      removeMarks();
      for (const {rect} of selection.rectangles) paint(state,rect,'pdf-box-highlight');
      message('已框选 PDF 内容，右键添加批注 · Esc 取消');
      if (onSelect(selection) === false) { clear();return; }
    } catch (error) {
      if (token !== epoch) return;
      removeMarks();message('框选失败：{message}',{message:error.message});
    }
  };
  return {
    get selection() { return selection; },
    clear,
    start(event) {
      clear();
      if (event.button !== 0 || event.pointerType !== 'mouse' || event.detail > 1 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
      if (window.getComputedStyle(event.target).cursor === 'text') return false;
      const element = event.target.closest('.page'), page = Number(element?.dataset.pageNumber), view = viewer.getPageView(page-1);
      if (!element || !viewer.pdfDocument || !view?.viewport) return false;
      event.preventDefault();window.getSelection()?.removeAllRanges();
      drag = {id:event.pointerId,page,element,view,pdf:viewer.pdfDocument,snapshot:capture(),x:event.clientX,y:event.clientY};
      drag.anchor = toPdf(drag,event.clientX,event.clientY);drag.box = rectangle(drag.anchor,drag.anchor);
      preview.setPointerCapture(event.pointerId);return true;
    },
    move(event) {
      if (!drag || drag.id !== event.pointerId) return false;
      if (!(event.buttons & 1)) { clear();return true; }
      event.preventDefault();
      if (!drag.frame && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 4) return true;
      drag.box = rectangle(drag.anchor,toPdf(drag,event.clientX,event.clientY));
      removeMarks();drag.frame = paint(drag,drag.box,'pdf-box-frame');preview.classList.add('box-selecting');
      return true;
    },
    end(event) {
      if (!drag || drag.id !== event.pointerId) return false;
      const state = drag;drag = null;preview.classList.remove('box-selecting');release(state.id);
      if (event.type !== 'pointerup' || !state.frame) { clear();return true; }
      state.box = rectangle(state.anchor,toPdf(state,event.clientX,event.clientY));
      void finish(state);return true;
    },
    bounds() {
      if (!marks.length || !selection) return null;
      const rects = marks.map(mark => mark.getBoundingClientRect());
      return {left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
    },
  };
}
