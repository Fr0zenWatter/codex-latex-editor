// Quotation links share the editor's existing source/PDF navigation.
const prefix = '/source-quote?ref=';
export function referenceToken(href) {
  const token = typeof href === 'string' && href.startsWith(prefix) ? href.slice(prefix.length) : '';
  return /^[A-Za-z0-9_-]{1,4096}$/.test(token) ? token : null;
}
export function attachSourceQuotes({button, panel, list, empty, capture, request, navigate, message, translate}) {
  let enabled = false, navigating = false, project;
  const unique = new Map();
  const entries = () => {
    const currentProject = capture().project;
    if (project !== currentProject) { unique.clear();project = currentProject; }
    for (const link of document.querySelectorAll('.chat-markdown a')) {
      const token = referenceToken(link.getAttribute('href'));
      if (!token) continue;
      try {
        const bytes = Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')), char => char.charCodeAt(0));
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (typeof data.preview !== 'string' || typeof data.path !== 'string' || !Number.isInteger(data.line)) continue;
        unique.set(token, {token, ...data, title:link.textContent?.trim() || data.preview});
      } catch { /* Invalid links are rejected by the server on click. */ }
      link.removeAttribute('target');link.classList.add('source-quote-link');
    }
    while (unique.size > 60) unique.delete(unique.keys().next().value);
    return [...unique.values()];
  };
  async function open(token) {
    if (navigating) return;
    const state = capture();
    if (!state.available) { message(translate('请先保存修改、处理批注或等待当前操作完成。')); return; }
    navigating = true;
    try {
      const result = await request('/source-quote', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reference:token,path:state.path,source:state.source,version:state.version})});
      const current = capture();
      if (state.doc !== current.doc || state.path !== current.path || state.version !== current.version || state.source !== current.source)
        throw new Error(translate('源码已变化，请重新点击引用。'));
      panel.hidePopover();await navigate(result);
    } catch (error) { message(translate('引用定位失败：{message}', {message:error.message})); }
    finally { navigating = false; }
  }
  function refresh() {
    const values = entries();list.replaceChildren();empty.hidden = !!values.length;
    for (const item of values) {
      const entry = document.createElement('button');entry.type = 'button';entry.className = 'source-quote-item';
      const quote = document.createElement('span'), location = document.createElement('small');
      quote.textContent = item.title;location.textContent = item.path + ':' + item.line;
      entry.append(quote,location);entry.onclick = () => open(item.token);list.append(entry);
    }
    button.dataset.count = String(values.length);
  }
  function positionPanel() {
    const box = button.closest('#chat-bar').getBoundingClientRect(), above = box.top > 100;
    const width = Math.min(400, window.innerWidth - 24);
    panel.style.left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8)) + 'px';
    panel.style.top = above ? 'auto' : box.bottom + 6 + 'px';
    panel.style.bottom = above ? window.innerHeight - box.top + 6 + 'px' : 'auto';
    panel.style.maxHeight = Math.max(60, (above ? box.top : window.innerHeight - box.bottom) - 14) + 'px';
  }
  button.addEventListener('click', () => {
    enabled = !enabled;button.setAttribute('aria-pressed', String(enabled));
    if (enabled) { refresh();panel.showPopover(); }
    else panel.hidePopover();
  });
  panel.addEventListener('beforetoggle', event => {
    button.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'open') { refresh();positionPanel(); }
  });
  window.addEventListener('resize', () => { if (panel.matches(':popover-open')) positionPanel(); });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('.chat-markdown a');
    const token = link && referenceToken(link.getAttribute('href'));
    if (!token || event.button && event.button !== 0) return;
    event.preventDefault();void open(token);
  });
  window.addEventListener('latex-source-quotes-change', refresh);
  return {refresh, get enabled() { return enabled; }};
}
