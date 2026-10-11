export function attachInlineCompletion({editor, request, preferences, t, getPath, available}) {
  const status = document.querySelector('#inline-completion-status');
  let timer, pollTimer, anchor = null, pending = null, marker = null, suggestion = null;
  let serial = 0, composing = false, lastStarted = -Infinity;
  const post = data => request('/completion', {method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(data), keepalive:true});
  const cancel = id => post({action:'cancel', id}).catch(() => {});
  const effort = () => preferences.getItem('latex-codex-completion-effort') || 'low';
  const model = () => preferences.getItem('latex-codex-completion-model') || '';
  const ready = () => preferences.getItem('latex-codex-inline-completion') === 'on'
    && available() && editor.hasFocus() && !editor.getOption('readOnly') && !composing
    && !editor.somethingSelected() && editor.listSelections().length === 1 && !editor.state.completionActive
    && ['default','emacs','vim-insert'].includes(editor.getOption('keyMap'))
    && document.oai?.annotation?.isActive?.() !== true;
  function current(snapshot) {
    const cursor = editor.getCursor();
    return ready() && editor.getDoc() === snapshot.doc && editor.isClean(snapshot.generation)
      && getPath() === snapshot.path && effort() === snapshot.effort && model() === snapshot.model
      && cursor.line === snapshot.cursor.line && cursor.ch === snapshot.cursor.ch;
  }
  function clear() {
    serial++;
    clearTimeout(timer); clearTimeout(pollTimer);
    const old = marker; marker = null; old?.clear();
    if (pending) cancel(pending.id);
    anchor = pending = suggestion = null;
    status.textContent = '';
  }
  function fail(error, snapshot, ticket) {
    if (ticket !== serial) return;
    const show = current(snapshot);
    clear();
    if (show) status.textContent = t('AI 补全暂不可用：{message}', {message:error.message});
  }
  async function poll(snapshot, id, ticket) {
    try {
      const result = await request('/completion?id=' + id);
      if (ticket !== serial) return;
      if (!current(snapshot)) { clear(); return; }
      if (result.status === 'running') {
        if (Date.now() - lastStarted > 22000) throw new Error(t('AI 补全超时。'));
        pollTimer = setTimeout(() => poll(snapshot, id, ticket), 250);
        return;
      }
      pending = null;
      status.textContent = '';
      if (result.status === 'error') throw new Error(result.error);
      const text = result.completion;
      if (result.status !== 'done' || typeof text !== 'string' || !text.trim()
          || text.length > 240 || /[\r\n]/.test(text)) {
        status.textContent = t('AI 暂无建议，继续输入后再试。');
        return;
      }
      const widget = document.createElement('span');
      widget.className = 'latex-inline-completion'; widget.textContent = text;
      widget.setAttribute('aria-hidden', 'true');
      widget.title = t('Tab 接受 AI 建议，Esc 取消。');
      marker = editor.setBookmark(snapshot.cursor, {widget, insertLeft:true, handleMouseEvents:false});
      suggestion = {snapshot, text};
      status.textContent = t('Tab 接受 AI 建议，Esc 取消。');
    } catch (error) { fail(error, snapshot, ticket); }
  }
  async function start(snapshot, ticket) {
    if (ticket !== serial || !current(snapshot)) return;
    const source = editor.getValue(), index = editor.indexFromPos(snapshot.cursor);
    const before = source.slice(Math.max(0, index - 3000), index), after = source.slice(index, index + 500);
    if (before.trim().length < 8) return;
    const id = crypto.randomUUID().replaceAll('-', '');
    pending = {id}; lastStarted = Date.now();
    status.textContent = t('AI 正在补全…');
    try {
      await post({id, path:snapshot.path, before, after, model:snapshot.model, effort:snapshot.effort});
      if (ticket !== serial || !current(snapshot)) {
        if (ticket === serial) clear(); else cancel(id);
        return;
      }
      await poll(snapshot, id, ticket);
    } catch (error) { fail(error, snapshot, ticket); }
  }
  function schedule() {
    clear();
    if (!ready()) return;
    anchor = {doc:editor.getDoc(), generation:editor.changeGeneration(), cursor:editor.getCursor(),
      path:getPath(), model:model(), effort:effort()};
    const snapshot = anchor, ticket = serial;
    timer = setTimeout(() => start(snapshot, ticket), Math.max(350, 2500 - (Date.now() - lastStarted)));
  }
  editor.addKeyMap({
    Tab() {
      if (!suggestion || !current(suggestion.snapshot)) return CodeMirror.Pass;
      const {text, snapshot} = suggestion;
      clear();
      editor.operation(() => {
        editor.replaceRange(text, snapshot.cursor, snapshot.cursor, 'ai-completion');
        editor.setCursor({line:snapshot.cursor.line, ch:snapshot.cursor.ch + text.length});
      });
    },
    Esc() { clear(); return CodeMirror.Pass; },
  });
  editor.on('changes', (_cm, changes) => {
    if (changes.some(change => ['+input','+delete','complete'].includes(change.origin))) schedule();
    else clear();
  });
  editor.on('cursorActivity', () => { if (anchor && !current(anchor)) clear(); });
  for (const event of ['blur','swapDoc','startCompletion']) editor.on(event, clear);
  editor.on('optionChange', (_cm, option) => { if (['keyMap','readOnly'].includes(option)) clear(); });
  editor.getInputField().addEventListener('compositionstart', () => { composing = true; clear(); });
  editor.getInputField().addEventListener('compositionend', () => { composing = false; schedule(); });
  document.addEventListener('oaiannotationmodechange', clear);
  window.addEventListener('latex-completion-change', clear);
  window.addEventListener('pagehide', clear);
  return {clear};
}
