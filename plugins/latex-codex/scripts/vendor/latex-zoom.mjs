export function attachPdfZoom({button, dial, preview, getZoom, setZoom, t}) {
  const rotor = dial.querySelector('.pdf-zoom-rotor');
  const radius = 190, step = Math.PI / 18, selectedAngle = Math.PI * .75;
  const anchors = [30, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500], cells = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let opened = false, inside = false, drag = null, closeTimer, snapTimer, frame = 0, lastFrame = 0;
  let target = getZoom(), applying = false;
  const clamp = value => Math.max(30, Math.min(500, value));
  // Keep the same glyphs throughout a rotation; only transforms and opacity change.
  for (let value = 30; value <= 500; value += 5) {
    const cell = document.createElement('span'), major = anchors.includes(value);
    cell.className = 'pdf-zoom-tick' + (major ? ' is-major' : '');
    if (major) cell.textContent = value + '%';
    rotor.append(cell); cells.push({value, cell, major});
  }
  function paint() {
    const value = getZoom();
    button.textContent = Math.round(value) + '%';
    dial.setAttribute('aria-valuenow', String(Math.round(value * 10) / 10));
    dial.setAttribute('aria-valuetext', Math.round(value) + '%');
    for (const {value: tick, cell, major} of cells) {
      const offset = (tick - value) / 25 * step, angle = selectedAngle + offset;
      cell.style.transform = `translate(-50%,-50%) translate(${Math.cos(angle) * radius}px,${Math.sin(angle) * radius}px) rotate(${offset}rad)`;
      cell.style.opacity = String(Math.max(0, Math.min(1, (Math.PI / 4 - Math.abs(offset)) / .22)) * (major ? 1 : .45));
      cell.classList.toggle('is-selected', major && Math.abs(tick - value) < .6);
    }
  }
  function update() {
    if (!applying) {
      target = getZoom(); clearTimeout(snapTimer);
      if (frame) cancelAnimationFrame(frame); frame = 0;
    }
    paint();
  }
  function apply(value) { applying = true; try { setZoom(value); } finally { applying = false; } }
  function animate(now) {
    frame = 0;
    const dt = Math.min(50, Math.max(1, now - lastFrame)); lastFrame = now;
    const value = getZoom(), next = value + (target - value) * (1 - Math.exp(-dt / (drag ? 65 : 120)));
    const settled = Math.abs(target - next) < .02;
    apply(settled ? target : next);
    if (!settled) frame = requestAnimationFrame(animate);
  }
  function moveTo(value, immediate = false) {
    target = clamp(value);
    if (immediate || reduced.matches) { if (frame) cancelAnimationFrame(frame); frame = 0; apply(target); return; }
    if (!frame) { lastFrame = performance.now(); frame = requestAnimationFrame(animate); }
  }
  function snap() {
    const nearest = anchors.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
    moveTo(Math.abs(nearest - target) <= 5 ? nearest : Math.round(target));
  }
  function place() {
    const rect = preview.getBoundingClientRect();
    const size = Math.min(200, preview.clientWidth, preview.clientHeight), scale = size / 240;
    dial.style.left = rect.left + preview.clientWidth - size + 'px'; dial.style.top = rect.top + 'px';
    dial.style.setProperty('--zoom-dial-scale', String(scale));
    dial.style.width = size + 'px'; dial.style.height = size + 'px';
  }
  function open() {
    clearTimeout(closeTimer);
    if (preview.inert) return;
    place();
    if (!opened) { dial.showPopover(); opened = true; button.setAttribute('aria-expanded', 'true'); }
  }
  function close() {
    clearTimeout(closeTimer); clearTimeout(snapTimer);
    if (drag) finishDrag(); else snap();
    if (opened) dial.hidePopover();
    opened = false; button.setAttribute('aria-expanded', 'false');
  }
  function leave() {
    inside = false;
    closeTimer = setTimeout(() => { if (!inside && !drag && !dial.contains(document.activeElement)) close(); }, 260);
  }
  function enter() { inside = true; open(); }
  button.onpointerenter = dial.onpointerenter = enter;
  button.onpointerleave = dial.onpointerleave = leave;
  button.onfocus = open; button.onblur = dial.onblur = leave;
  button.onclick = () => { clearTimeout(snapTimer); moveTo(100); open(); };
  function wheel(event) {
    if (preview.inert || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation(); open(); clearTimeout(snapTimer);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? preview.clientHeight : 1;
    moveTo(target - Math.max(-120, Math.min(120, event.deltaY * unit)) * 25 / 120);
    snapTimer = setTimeout(snap, 160);
  }
  button.addEventListener('wheel', wheel, {passive: false}); dial.addEventListener('wheel', wheel, {passive: false});
  const angle = event => Math.atan2(event.clientY - drag.y, event.clientX - drag.x);
  dial.onpointerdown = event => {
    if (event.button !== 0 || preview.inert) return;
    event.preventDefault(); clearTimeout(closeTimer); clearTimeout(snapTimer);
    const rect = dial.getBoundingClientRect();
    drag = {id: event.pointerId, x: rect.left + rect.width, y: rect.top,
      startX: event.clientX, startY: event.clientY, value: target, moved: false};
    drag.angle = angle(event); dial.setPointerCapture(event.pointerId); dial.classList.add('is-dragging');
  };
  dial.onpointermove = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3 && !drag.moved) return;
    drag.moved = true;
    moveTo(drag.value - (angle(event) - drag.angle) / step * 25);
  };
  function finishDrag(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const id = drag.id; drag = null; dial.classList.remove('is-dragging'); snap();
    if (dial.hasPointerCapture(id)) dial.releasePointerCapture(id);
    if (!inside) leave();
  }
  dial.onpointerup = dial.onpointercancel = dial.onlostpointercapture = finishDrag;
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); button.focus(); close(); return; }
    const offsets = {ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 25, PageDown: -25};
    if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation(); open(); clearTimeout(snapTimer);
    moveTo(event.key === 'Home' ? 30 : event.key === 'End' ? 500 : target + offsets[event.key]);
  }
  button.onkeydown = dial.onkeydown = keyboard;
  window.addEventListener('resize', () => { if (opened) place(); });
  new ResizeObserver(() => { if (opened) place(); }).observe(preview);
  window.addEventListener('blur', close);
  window.addEventListener('pointerdown', event => {
    if (opened && event.target !== button && !dial.contains(event.target)) close();
  });
  function language() {
    button.setAttribute('aria-label', t('PDF 缩放')); button.title = t('滚轮或拖动缩放，点击恢复适合宽度');
    dial.setAttribute('aria-label', t('PDF 缩放')); dial.setAttribute('aria-description', t('滚轮或拖动缩放，方向键微调'));
  }
  window.addEventListener('latex-language-change', language);
  language(); update(); return {update, close};
}
