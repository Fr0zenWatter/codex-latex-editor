// Destinations always refer to the displayed PDF, even with unsaved source edits.
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const searchable = value => clean(value).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

export async function readPdfOutline(pdf, fallback = []) {
  const bookmarks = await pdf.getOutline();
  const pages = new Map(), references = new Map();
  const page = number => {
    if (!pages.has(number)) pages.set(number, pdf.getPage(number));
    return pages.get(number);
  };
  async function destination(value) {
    try {
      const dest = typeof value === 'string' ? await pdf.getDestination(value) : value;
      if (!Array.isArray(dest)) return null;
      const ref = dest[0];
      let number;
      if (Number.isInteger(ref)) number = ref + 1;
      else if (ref && Number.isInteger(ref.num)) {
        const key = `${ref.num}:${ref.gen}`;
        if (!references.has(key)) references.set(key, pdf.getPageIndex(ref));
        number = (await references.get(key)) + 1;
      }
      if (!number || number < 1 || number > pdf.numPages) return null;
      const view = (await page(number)).view;
      const type = dest[1]?.name;
      const y = type === 'XYZ' ? dest[3] : /^(FitH|FitBH)$/.test(type) ? dest[2] : type === 'FitR' ? dest[5] : null;
      return {page: number, x: type === 'XYZ' && Number.isFinite(dest[2]) ? dest[2] : view[0], y: Number.isFinite(y) ? y : view[3], dest};
    } catch { return null; }
  }
  const entries = [];
  if (bookmarks?.length) {
    async function visit(items, depth = 0) {
      for (const item of items) {
        const target = await destination(item.dest);
        if (target) {
          const metadata = fallback.find(entry => entry.dest && entry.dest === item.dest);
          const title = clean(item.title);
          const numbered = title.match(/^((?:\d+|[A-Z])(?:\.\d+)*\.?)(?:\s+)(.+)$/);
          entries.push({...target, depth, title: numbered?.[2] || title,
            number: metadata?.number || numbered?.[1] || '', kind: metadata?.kind || (depth ? 'subsection' : 'section')});
        }
        await visit(item.items || [], depth + (target ? 1 : 0));
      }
    }
    await visit(bookmarks);
  }
  if (entries.length) return entries;
  const labels = await pdf.getPageLabels();
  const texts = new Map();
  const base = Math.min(...fallback.map(entry => entry.level));
  for (const entry of fallback) {
    let target = entry.dest ? await destination(entry.dest) : null;
    if (!target) {
      const index = labels ? labels.indexOf(entry.pageLabel) : Number(entry.pageLabel) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) continue;
      const number = index + 1, pdfPage = await page(number);
      if (!texts.has(number)) texts.set(number, pdfPage.getTextContent());
      const items = (await texts.get(number)).items.filter(item => typeof item.str === 'string');
      let text = '', offsets = [];
      for (const item of items) {
        const fragment = searchable(item.str);
        offsets.push({start: text.length, end: text.length + fragment.length, item});
        text += fragment;
      }
      const fullTitle = searchable(`${entry.number} ${entry.title}`), title = searchable(entry.title);
      let found = -1;
      for (const needle of [fullTitle, title]) {
        const at = needle ? text.indexOf(needle) : -1;
        if (at >= 0 && text.indexOf(needle, at + 1) < 0) { found = at; break; }
      }
      const item = offsets.find(item => found >= item.start && found < item.end)?.item;
      target = {page: number, x: pdfPage.view[0], y: item ? item.transform[5] + Math.abs(item.height || item.transform[3]) + 8 : pdfPage.view[3]};
    }
    entries.push({...entry, ...target, depth: entry.level - base});
  }
  return entries;
}

export function attachPdfOutline({container, preview, viewer, eventBus, t, style: initialStyle = 'wheel'}) {
  let generation = 0, pageCount = 0, entries = [], active = -1, selected = -1, position = 0, target = 0;
  let style = initialStyle === 'cards' ? 'cards' : 'wheel', items = [], sections = [], subsections = [];
  let subSelected = -1, subPosition = 0, subTarget = 0;
  let opened = false, inside = false, keyboardFocus = false, drag = null, suppressClick = false, pressedIndex = null;
  let scrollDrag = null, suppressHandleClick = false, thumbCenter = 0, thumbTravel = 0, scrollRange = 0;
  let openTimer, closeTimer, snapTimer, animation = 0, tracking = 0, lastFrame = 0, clickedPosition = null;
  let width = 336, height = 344, scale = 1, radius = 327, step = 56 / 327, cardRadius = 253, subRadius = 148;
  const cells = new Map(), subCells = new Map(), children = new Map(), reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function element(tag, className, parent) {
    const node = document.createElement(tag);
    node.setAttribute('class', className); parent.append(node); return node;
  }
  // Put the entry first in Tab order; opening it makes the dial the next stop.
  const handle = element('button', 'pdf-dial-handle', container); handle.type = 'button';
  handle.setAttribute('aria-controls', 'pdf-outline-drawer'); handle.setAttribute('aria-expanded', 'false');
  const pageNumber = element('span', 'pdf-dial-page', handle); pageNumber.setAttribute('aria-hidden', 'true');
  const pageTotal = element('span', 'pdf-dial-total', handle); pageTotal.setAttribute('aria-hidden', 'true');
  const interaction = element('div', 'pdf-dial-interaction', container);
  const drawer = element('div', 'pdf-dial-drawer', interaction);
  drawer.id = 'pdf-outline-drawer'; drawer.inert = true;
  const dial = element('div', 'pdf-dial', drawer);
  dial.tabIndex = 0; dial.setAttribute('role', 'slider'); dial.setAttribute('aria-orientation', 'vertical');
  dial.setAttribute('aria-controls', 'preview');
  const rotor = element('div', 'pdf-dial-rotor', dial);
  const indicator = element('span', 'pdf-dial-indicator', dial); indicator.setAttribute('aria-hidden', 'true');
  const subdial = element('div', 'pdf-subdial', dial); subdial.hidden = true;
  subdial.tabIndex = 0; subdial.setAttribute('role', 'slider'); subdial.setAttribute('aria-orientation', 'vertical');
  subdial.setAttribute('aria-controls', 'preview');
  const subRotor = element('div', 'pdf-subdial-rotor', subdial);
  const subIndicator = element('span', 'pdf-dial-indicator', subdial); subIndicator.setAttribute('aria-hidden', 'true');
  const name = entry => entry ? `${entry.number} ${entry.title}`.trim() : '';
  const clamp = value => Math.max(0, Math.min(items.length - 1, value));
  const holdsFocus = () => keyboardFocus && container.contains(document.activeElement);
  function positionFor(index) {
    if (style === 'wheel') return Math.max(0, items.indexOf(index));
    let owner = 0;
    sections.forEach((section, i) => { if (section <= index) owner = i; });
    return owner;
  }
  function buildItems() {
    sections = entries.flatMap((entry, index) => entry.kind === 'section' ? [index] : []);
    if (!sections.length) sections = entries.flatMap((entry, index) => entry.depth === 0 ? [index] : []);
    children.clear();
    sections.forEach((section, i) => {
      const end = sections[i + 1] ?? entries.length;
      children.set(section, entries.flatMap((entry, index) => index > section && index < end &&
        entry.kind === 'subsection' && entry.depth === entries[section].depth + 1 ? [index] : []));
    });
    items = style === 'cards' ? sections : entries.map((_, index) => index);
    selected = subSelected = -1; subsections = [];
    cells.clear(); rotor.replaceChildren(); subCells.clear(); subRotor.replaceChildren();
    position = target = positionFor(active); subPosition = subTarget = 0;
    container.dataset.outlineStyle = style; container.hidden = !pageCount;
    preview.classList.toggle('outline-scrollbar', !!pageCount);
  }
  function refreshSubsections() {
    subsections = style === 'cards' ? children.get(selected) || [] : [];
    subdial.hidden = !subsections.length; subSelected = -1;
    subPosition = subTarget = Math.max(0, subsections.indexOf(active));
    subCells.clear(); subRotor.replaceChildren();
  }
  function updateCaption() {
    const entry = entries[selected]; if (!entry) return;
    dial.setAttribute('aria-valuemin', '1'); dial.setAttribute('aria-valuemax', String(items.length));
    dial.setAttribute('aria-valuenow', String(items.indexOf(selected) + 1)); dial.setAttribute('aria-valuetext', name(entry));
  }
  function language() {
    container.setAttribute('aria-label', t('章节目录'));
    updatePageCaption();
    handle.setAttribute('aria-description', t(items.length ? '方向键滚动 PDF，Enter 打开章节目录' : '方向键滚动 PDF'));
    dial.setAttribute('aria-label', t(style === 'cards' ? '章节卡片：方向键浏览，Enter 跳转' : '章节拨轮：方向键浏览，Enter 跳转'));
    subdial.setAttribute('aria-label', t('小节轮盘：方向键浏览，Enter 跳转'));
    for (const cell of [...cells.values(), ...subCells.values()]) cell.setAttribute('aria-label', t('跳转到章节') + ' ' + name(entries[Number(cell.dataset.index)]));
    updateCaption();
  }
  function clearTimers() { clearTimeout(openTimer); clearTimeout(closeTimer); clearTimeout(snapTimer); }
  function setOpen(value) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (value && !items.length || opened === value) return;
    opened = value; interaction.classList.toggle('is-open', value);
    handle.setAttribute('aria-expanded', String(value)); drawer.inert = !value;
    cancelAnimationFrame(animation); animation = 0;
    container.classList.toggle('is-open', value);
    if (value) { position = target = positionFor(active); selected = -1; updateScrollHandle(true); paint(); }
    else {
      clearTimeout(snapTimer);
      if (container.contains(document.activeElement)) preview.focus({preventScroll: true});
      keyboardFocus = false;
    }
  }
  function leaveLater() {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (!drag && !scrollDrag && !holdsFocus()) closeTimer = setTimeout(() => {
      if (!inside && !drag && !scrollDrag && !holdsFocus()) setOpen(false);
    }, 400);
  }
  interaction.onpointerenter = () => { inside = true; clearTimeout(closeTimer); };
  interaction.onpointerleave = () => { inside = false; leaveLater(); };
  handle.onpointerenter = () => {
    inside = true; clearTimeout(closeTimer); clearTimeout(openTimer);
    openTimer = setTimeout(() => { if (inside && !scrollDrag) setOpen(true); }, 150);
  };
  handle.onpointerleave = () => { inside = false; leaveLater(); };
  handle.onclick = event => {
    if (suppressHandleClick || scrollDrag) { event?.preventDefault(); suppressHandleClick = false; return; }
    setOpen(true);
  };
  drawer.onpointerenter = () => { inside = true; clearTimeout(closeTimer); };
  container.addEventListener('pointerdown', () => { keyboardFocus = false; });
  container.onfocusin = event => { if (event.target.matches(':focus-visible')) keyboardFocus = true; setOpen(true); };
  container.onfocusout = event => {
    if (!container.contains(event.relatedTarget)) { keyboardFocus = false; if (!inside) leaveLater(); }
  };
  document.addEventListener('pointerdown', event => {
    if (opened && !drag && !container.contains(event.target)) setOpen(false);
  });

  function updateScrollHandle(anchor = false) {
    updatePageCaption();
    const viewport = preview.clientHeight, documentHeight = preview.scrollHeight || viewport;
    scrollRange = Math.max(0, documentHeight - viewport);
    const thumbHeight = Math.min(viewport, scrollRange ? Math.max(36, Math.min(72, viewport * viewport / documentHeight)) : 52);
    thumbTravel = Math.max(0, viewport - thumbHeight);
    thumbCenter = scrollRange ? thumbHeight / 2 + thumbTravel * Math.max(0, Math.min(1, preview.scrollTop / scrollRange)) : viewport / 2;
    handle.style.height = `${thumbHeight}px`; handle.style.top = `${thumbCenter}px`;
    if (!opened || anchor) {
      const half = height * scale / 2 + 8;
      interaction.style.top = `${Math.max(half, Math.min(viewport - half, thumbCenter))}px`;
    }
  }
  function updatePageCaption() {
    const current = Math.max(1, Math.min(pageCount, viewer.currentPageNumber || 1));
    pageNumber.textContent = pageCount ? String(current) : '';
    pageTotal.textContent = pageCount ? `/ ${pageCount}` : '';
    const caption = pageCount ? t('PDF 第 {page} 页，共 {total} 页', {page: current, total: pageCount}) + ' · ' : '';
    const action = t(items.length ? '拖动滚动 PDF，悬停或点击打开章节目录' : '拖动滚动 PDF');
    handle.title = caption + action; handle.setAttribute('aria-label', handle.title);
  }
  handle.onpointerdown = event => {
    if (event.button !== 0 || drag || scrollDrag) return;
    event.preventDefault(); event.stopPropagation(); clearTimers();
    updateScrollHandle(); suppressHandleClick = false;
    scrollDrag = {id: event.pointerId, y: event.clientY, start: preview.scrollTop, moved: false};
    handle.setPointerCapture(event.pointerId);
  };
  handle.onpointermove = event => {
    if (!scrollDrag || event.pointerId !== scrollDrag.id) return;
    if (!scrollDrag.moved && Math.abs(event.clientY - scrollDrag.y) < 6) return;
    if (!scrollDrag.moved) setOpen(false);
    scrollDrag.moved = true; container.classList.add('is-scroll-dragging');
    preview.scrollTop = Math.max(0, Math.min(scrollRange, scrollDrag.start + (event.clientY - scrollDrag.y) * scrollRange / Math.max(1, thumbTravel)));
    updateScrollHandle(); scheduleTrack();
  };
  function endScrollDrag(event, cancelled = false) {
    if (!scrollDrag || (event.pointerId !== undefined && event.pointerId !== scrollDrag.id)) return;
    const id = scrollDrag.id; suppressHandleClick = scrollDrag.moved || cancelled; scrollDrag = null;
    container.classList.remove('is-scroll-dragging');
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    if (!inside) leaveLater();
  }
  handle.onpointerup = event => endScrollDrag(event);
  handle.onpointercancel = event => endScrollDrag(event, true);
  handle.onlostpointercapture = event => endScrollDrag(event, true);
  handle.addEventListener('wheel', event => {
    event.preventDefault(); event.stopPropagation();
    if (event.ctrlKey) {
      preview.dispatchEvent(new WheelEvent('wheel', {deltaY: event.deltaY, ctrlKey: true, cancelable: true}));
      return;
    }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? preview.clientHeight : 1;
    updateScrollHandle();
    preview.scrollTop = Math.max(0, Math.min(scrollRange, preview.scrollTop + event.deltaY * unit));
    if (event.deltaX) preview.scrollLeft += event.deltaX * unit;
    updateScrollHandle(); scheduleTrack();
  }, {passive: false});

  function makeCell(index, parent = rotor) {
    const entry = entries[index], cell = element('button', 'pdf-dial-tick', parent);
    cell.type = 'button'; cell.tabIndex = -1; cell.title = name(entry);
    cell.setAttribute('aria-label', t('跳转到章节') + ' ' + name(entry));
    cell.dataset.index = index; cell.classList.toggle('is-major', entry.depth === 0);
    if (style === 'wheel') {
      const number = element('span', 'pdf-dial-number', cell); number.textContent = entry.number || String(index + 1);
    } else if (parent === rotor) {
      const tag = element('span', 'pdf-card-tag', cell);
      tag.textContent = `Section ${entry.number || String(sections.indexOf(index) + 1)}`;
    }
    const title = element('span', 'pdf-dial-title', cell); title.textContent = entry.title;
    return cell;
  }
  function paint() {
    if (!items.length) return;
    const next = items[clamp(Math.round(position))];
    if (selected !== next) { selected = next; refreshSubsections(); updateCaption(); }
    // The circle's center is to the right; the visible arc faces left.
    // Keep spacing independent of document length, with no wrap-around.
    const visible = style === 'cards' ? height / 176 : height / 112, limit = visible + 1;
    const first = Math.max(0, Math.ceil(position - limit)), last = Math.min(items.length - 1, Math.floor(position + limit));
    for (const [index, cell] of cells) if (index < first || index > last) { cell.remove(); cells.delete(index); }
    for (let index = first; index <= last; index++) {
      const cell = cells.get(index) || makeCell(items[index]), offset = index - position, angle = offset * step;
      cells.set(index, cell);
      if (style === 'cards') {
        const spread = offset * 88 / cardRadius;
        const x = cardRadius * (1 - Math.cos(spread)), y = cardRadius * Math.sin(spread);
        // Reference carousel: upright cards recede in size and depth along the arc.
        cell.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${1 - Math.min(Math.abs(offset) * .1, .3)})`;
        cell.style.zIndex = String(100 - Math.round(Math.abs(offset) * 10));
      } else {
        const x = radius * (1 - Math.cos(angle)), y = radius * Math.sin(angle);
        cell.style.transform = `translate(${x}px,${y}px) translateY(-50%) rotate(${-angle * 180 / Math.PI}deg) scale(${1 - Math.min(Math.abs(offset) * .04, .3)})`;
      }
      // Keep readable cards opaque; only fade cards as they leave the visible arc.
      cell.style.opacity = String(style === 'cards' ? Math.max(0, Math.min(1, (visible - Math.abs(offset)) / .27)) :
        Math.cos(Math.min(Math.abs(offset) / visible, 1) * Math.PI / 2));
      cell.style.pointerEvents = Math.abs(offset) < visible ? 'auto' : 'none';
      const current = style === 'cards' ? index === positionFor(active) : items[index] === active;
      cell.classList.toggle('is-selected', items[index] === selected); cell.classList.toggle('is-current', current);
      cell.setAttribute('aria-current', current ? 'location' : 'false');
    }
    paintSubsections();
  }
  function paintSubsections() {
    if (!subsections.length) return;
    subSelected = subsections[Math.max(0, Math.min(subsections.length - 1, Math.round(subPosition)))];
    subdial.setAttribute('aria-valuemin', '1'); subdial.setAttribute('aria-valuemax', String(subsections.length));
    subdial.setAttribute('aria-valuenow', String(subsections.indexOf(subSelected) + 1));
    subdial.setAttribute('aria-valuetext', name(entries[subSelected]));
    const visible = Math.max(1, height / 88), limit = visible + 1;
    const first = Math.max(0, Math.ceil(subPosition - limit)), last = Math.min(subsections.length - 1, Math.floor(subPosition + limit));
    for (const [index, cell] of subCells) if (index < first || index > last) { cell.remove(); subCells.delete(index); }
    for (let index = first; index <= last; index++) {
      const cell = subCells.get(index) || makeCell(subsections[index], subRotor), offset = index - subPosition, angle = offset * 44 / subRadius;
      subCells.set(index, cell);
      cell.style.transform = `translate(${subRadius * (1 - Math.cos(angle))}px,${subRadius * Math.sin(angle)}px) translateY(-50%) rotate(${-angle * 180 / Math.PI}deg) scale(${1 - Math.min(Math.abs(offset) * .04, .2)})`;
      cell.style.opacity = String(Math.cos(Math.min(Math.abs(offset) / visible, 1) * Math.PI / 2));
      cell.style.pointerEvents = Math.abs(offset) < visible ? 'auto' : 'none';
      cell.classList.toggle('is-selected', subsections[index] === subSelected);
      cell.classList.toggle('is-current', subsections[index] === active);
      cell.setAttribute('aria-current', subsections[index] === active ? 'location' : 'false');
    }
  }
  function animate(time) {
    const dt = lastFrame ? Math.min(48, time - lastFrame) : 16; lastFrame = time;
    position += (target - position) * (1 - Math.exp(-dt / (style === 'cards' ? 130 : 55)));
    subPosition += (subTarget - subPosition) * (1 - Math.exp(-dt / 55));
    if (Math.abs(position - target) < .002) position = target;
    if (Math.abs(subPosition - subTarget) < .002) subPosition = subTarget;
    paint();
    if (position !== target || subPosition !== subTarget) animation = requestAnimationFrame(animate);
    else { animation = 0; lastFrame = 0; }
  }
  function moveTo(value, immediate = false) {
    target = clamp(value);
    if (immediate || reducedMotion.matches) {
      cancelAnimationFrame(animation); animation = 0; lastFrame = 0; position = target; paint();
    } else if (!animation) { lastFrame = 0; animation = requestAnimationFrame(animate); }
  }
  function moveSubTo(value, immediate = false) {
    if (!subsections.length) return;
    subTarget = Math.max(0, Math.min(subsections.length - 1, value));
    if (immediate || reducedMotion.matches) { subPosition = subTarget; paintSubsections(); }
    else if (!animation) { lastFrame = 0; animation = requestAnimationFrame(animate); }
  }
  function snap() { moveTo(Math.round(target)); moveSubTo(Math.round(subTarget)); }
  drawer.addEventListener('wheel', event => {
    if (!opened) return;
    event.preventDefault(); event.stopPropagation(); if (drag) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const delta = (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
    if (subdial.contains(event.target)) moveSubTo(subTarget + Math.max(-3, Math.min(3, delta / 80)));
    else moveTo(target + Math.max(-3, Math.min(3, delta / 80)));
    clearTimeout(snapTimer); snapTimer = setTimeout(snap, 140);
  }, {passive: false});

  dial.onpointerdown = event => {
    if (drag || event.button !== 0 || !opened) return;
    event.preventDefault(); clearTimeout(snapTimer); clearTimeout(closeTimer);
    cancelAnimationFrame(animation); animation = 0; target = position; subTarget = subPosition; suppressClick = false;
    const cell = event.target.closest('.pdf-dial-tick'); pressedIndex = cell ? Number(cell.dataset.index) : null;
    const area = subdial.contains(event.target) ? 'sub' : 'main';
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, area, rotation: area === 'sub' ? subPosition : position, moved: false};
    dial.setPointerCapture(event.pointerId);
  };
  dial.onpointermove = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true; interaction.classList.add('is-dragging');
    if (drag.area === 'sub') moveSubTo(drag.rotation - (event.clientY - drag.y) / (44 * scale), true);
    else moveTo(drag.rotation - (event.clientY - drag.y) / ((style === 'cards' ? 88 : 56) * scale), true);
  };
  function endDrag(event, cancelled = false) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    suppressClick = drag.moved || cancelled;
    const id = drag.id; drag = null; interaction.classList.remove('is-dragging');
    if (dial.hasPointerCapture(id)) dial.releasePointerCapture(id);
    snap();
    const box = interaction.getBoundingClientRect();
    inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) leaveLater();
  }
  dial.onpointerup = event => endDrag(event);
  dial.onpointercancel = event => endDrag(event, true);
  dial.onlostpointercapture = event => endDrag(event, true);
  window.addEventListener('blur', () => { if (drag) endDrag({}, true); if (scrollDrag) endScrollDrag({}, true); });
  dial.onclick = event => {
    if (suppressClick || drag) { event.preventDefault(); return; }
    const cell = event.target.closest('.pdf-dial-tick');
    const index = cell && (rotor.contains(cell) || subRotor.contains(cell)) ? Number(cell.dataset.index) : pressedIndex;
    pressedIndex = null; if (index !== null) jump(index);
  };
  function jump(index) {
    const entry = entries[index]; if (!entry) return;
    moveTo(positionFor(index));
    if (style === 'cards' && subsections.includes(index)) moveSubTo(subsections.indexOf(index));
    viewer.scrollPageIntoView({pageNumber: entry.page,
      destArray: [null, {name: 'XYZ'}, entry.x, entry.y, null], ignoreDestinationZoom: true});
    clickedPosition = preview.scrollTop; mark(index);
  }
  container.onkeydown = event => {
    keyboardFocus = true;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (drag) endDrag({}, true); if (scrollDrag) endScrollDrag({}, true); setOpen(false); return; }
    if (event.target === handle) {
      const offsets = {ArrowUp: -40, ArrowDown: 40, PageUp: -preview.clientHeight * .9, PageDown: preview.clientHeight * .9};
      if (event.key in offsets || event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); event.stopPropagation();
        updateScrollHandle();
        preview.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? scrollRange : Math.max(0, Math.min(scrollRange, preview.scrollTop + offsets[event.key]));
        updateScrollHandle(); scheduleTrack();
      }
      return;
    }
    const inSubdial = subdial.contains(event.target), list = inSubdial ? subsections : items;
    const move = inSubdial ? moveSubTo : moveTo, cursor = inSubdial ? subTarget : target;
    const offsets = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 5, PageUp: -5};
    if (event.key in offsets || event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); event.stopPropagation(); clearTimeout(snapTimer);
      move(event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : Math.round(cursor) + offsets[event.key]);
    } else if ((event.key === 'Enter' || event.key === ' ') && (event.target === dial || event.target === subdial)) {
      // Confirm the latest keyboard step even if its easing has not finished.
      event.preventDefault(); event.stopPropagation(); jump(list[Math.round(cursor)]);
    }
  };
  function mark(index) {
    if (active === index) return;
    active = index;
    if (!opened) moveTo(positionFor(index), true);
    updateCaption(); paint();
  }
  function track() {
    tracking = 0;
    updateScrollHandle();
    if (!entries.length || container.hidden) return;
    if (clickedPosition !== null && Math.abs(preview.scrollTop - clickedPosition) < 1) return;
    clickedPosition = null;
    const probe = preview.scrollTop + 8;
    let index = 0, nearest = -Infinity;
    entries.forEach((entry, i) => {
      const view = viewer.getPageView(entry.page - 1); if (!view?.viewport) return;
      const top = view.div.offsetTop + view.viewport.convertToViewportPoint(entry.x, entry.y)[1];
      if (top <= probe && top >= nearest) { nearest = top; index = i; }
    });
    mark(index);
  }
  function scheduleTrack() { if (!tracking) tracking = requestAnimationFrame(track); }
  function resize() {
    width = 336; height = style === 'cards' ? 400 : 344;
    // Scale the complete composition together, while keeping it inside the preview.
    scale = .8 * Math.max(.1, Math.min(1.4, Math.max(.72, preview.clientWidth / 800),
      preview.clientWidth / width, Math.max(1, preview.clientHeight - 16) / height));
    interaction.style.setProperty('--dial-scale', String(scale));
    radius = Math.max(160, height * .95); step = 56 / radius;
    interaction.style.width = `${width}px`; interaction.style.height = `${height}px`;
    const apex = Math.min(62, width * .2);
    rotor.style.setProperty('--dial-apex', `${apex}px`);
    rotor.style.setProperty('--dial-label-width', `${width - apex - 28}px`);
    const cardApex = width * .27, subLeft = width * .55;
    // Both concentric arcs share (width + 8, height / 2), just beyond the right edge.
    cardRadius = width + 8 - cardApex; subRadius = width - subLeft;
    rotor.style.setProperty('--dial-card-apex', `${cardApex}px`);
    rotor.style.setProperty('--dial-card-width', `${Math.min(144, width * .43)}px`);
    subdial.style.left = `${subLeft}px`;
    indicator.style.left = `${apex - 18}px`;
    cells.clear(); rotor.replaceChildren(); subCells.clear(); subRotor.replaceChildren(); updateScrollHandle(true); paint(); scheduleTrack();
  }
  new ResizeObserver(resize).observe(preview);
  new ResizeObserver(scheduleTrack).observe(viewer.viewer || preview.firstElementChild || preview);
  preview.addEventListener('scroll', scheduleTrack, {passive: true});
  eventBus.on('pagesinit', scheduleTrack); eventBus.on('pagerendered', scheduleTrack); eventBus.on('updateviewarea', scheduleTrack); eventBus.on('pagechanging', scheduleTrack);
  window.addEventListener('latex-language-change', language);
  function clear() {
    generation++; clearTimers(); setOpen(false); if (drag) endDrag({}, true);
    if (scrollDrag) endScrollDrag({}, true);
    clearTimers(); cancelAnimationFrame(animation); cancelAnimationFrame(tracking); animation = tracking = 0;
    pageCount = 0; updatePageCaption(); entries = []; items = sections = subsections = []; children.clear();
    cells.clear(); rotor.replaceChildren(); subCells.clear(); subRotor.replaceChildren(); subdial.hidden = true;
    active = selected = subSelected = -1; position = target = subPosition = subTarget = 0; clickedPosition = null;
    suppressClick = false; pressedIndex = null; suppressHandleClick = false;
    preview.classList.remove('outline-scrollbar');
    container.hidden = true;
  }
  language(); clear(); resize();
  return {
    clear,
    setStyle(value) {
      const next = value === 'cards' ? 'cards' : 'wheel'; if (style === next) return;
      if (drag) endDrag({}, true);
      clearTimers(); cancelAnimationFrame(animation); animation = 0;
      style = next; buildItems(); resize(); language();
      if (!items.length) setOpen(false);
    },
    async load(pdf, fallback) {
      clear(); const revision = generation;
      try {
        await viewer.pagesPromise;
        if (revision !== generation || viewer.pdfDocument !== pdf) return;
        pageCount = pdf.numPages; buildItems(); resize(); track(); language();
        const result = await readPdfOutline(pdf, fallback);
        if (revision !== generation || viewer.pdfDocument !== pdf) return;
        entries = result; buildItems(); resize(); track(); language();
      } catch (error) {
        console.warn('PDF outline unavailable', error);
      }
    },
  };
}
