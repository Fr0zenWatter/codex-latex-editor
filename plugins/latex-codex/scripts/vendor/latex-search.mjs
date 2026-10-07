// Source search uses native RegExp matching and CodeMirror's normal edit/undo flow.
export function attachSourceSearch(editor, t) {
  const wrapper = editor.getWrapperElement(), panel = document.createElement('section');
  panel.className = 'source-search'; panel.hidden = true;
  panel.innerHTML = `<div class="source-search-top"><div class="source-search-field">
    <input class="source-search-query" type="text" autocomplete="off" spellcheck="false">
    <div class="source-search-options">
      <button type="button" data-option="case">Aa</button><button type="button" data-option="regex">[.*]</button>
      <button type="button" data-option="word">W</button>
      <button type="button" data-option="selection"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M3 8h14M3 12h14M3 16h14"/></svg></button>
    </div></div><button type="button" class="source-search-close">×</button></div>
    <div class="source-search-navigation">
      <button type="button" class="source-search-previous"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button>
      <button type="button" class="source-search-next"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
      <span class="source-search-status" role="status" aria-live="polite"></span>
    </div><input class="source-search-replacement" type="text" autocomplete="off" spellcheck="false">
    <div class="source-search-actions"><button type="button" class="source-search-replace"></button><button type="button" class="source-search-all"></button></div>`;
  wrapper.before(panel);
  const query = panel.querySelector('.source-search-query'), replacement = panel.querySelector('.source-search-replacement');
  const status = panel.querySelector('.source-search-status'), previous = panel.querySelector('.source-search-previous');
  const next = panel.querySelector('.source-search-next'), replace = panel.querySelector('.source-search-replace');
  const all = panel.querySelector('.source-search-all'), closeButton = panel.querySelector('.source-search-close');
  const options = {case: false, regex: false, word: false, selection: false};
  const labels = {case: '区分大小写', regex: '正则表达式', word: '整词匹配', selection: '仅在选区搜索'};
  const buttons = [...panel.querySelectorAll('[data-option]')];
  let matches = [], marks = [], scope = null, current = -1, error = '', editing = false;
  const offset = which => editor.indexFromPos(editor.getCursor(which));
  function clearMarks() { marks.forEach(mark => mark.clear()); marks = []; }
  function caption() {
    status.textContent = error || (!query.value ? '' : matches.length ? `${current + 1} / ${matches.length}` : t('无匹配'));
    query.setAttribute('aria-invalid', String(!!error));
    previous.disabled = next.disabled = !matches.length;
    replace.disabled = all.disabled = !matches.length || !!editor.getOption('readOnly');
    buttons.forEach(button => {
      const key = button.dataset.option;
      button.setAttribute('aria-pressed', String(options[key]));
      button.title = t(!options[key] && key === 'case' ? '不区分大小写' : !options[key] && key === 'regex' ? '普通文本' : labels[key]);
      if (key === 'selection') button.disabled = !scope?.find();
    });
  }
  function select(index) {
    if (!matches.length) return;
    current = (index + matches.length) % matches.length;
    const match = matches[current], from = editor.posFromIndex(match.index);
    const to = editor.posFromIndex(match.index + match[0].length);
    editor.setSelection(from, to); editor.scrollIntoView({from, to}, 60); caption();
  }
  function refresh(selectFirst = false) {
    if (panel.hidden || editing) return;
    clearMarks(); matches = []; current = -1; error = '';
    try {
      if (query.value) {
        const source = editor.getValue();
        let pattern = options.regex ? query.value : query.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.word) pattern = `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;
        const regex = new RegExp(pattern, 'gmu' + (options.case ? '' : 'i'));
        const range = options.selection ? scope?.find() : null;
        if (options.selection && !range) throw new Error(t('请先选择源码范围。'));
        const start = range ? editor.indexFromPos(range.from) : 0, end = range ? editor.indexFromPos(range.to) : source.length;
        matches = [...source.matchAll(regex)].filter(match => match.index >= start && match.index + match[0].length <= end);
        // Counts, navigation and replacement include every match; bound display marks for broad queries.
        editor.operation(() => { marks = matches.slice(0, 2000).filter(match => match[0].length).map(match =>
          editor.markText(editor.posFromIndex(match.index), editor.posFromIndex(match.index + match[0].length), {className: 'source-search-match'})); });
        current = matches.findIndex(match => match.index === offset('from') && match.index + match[0].length === offset('to'));
        if (selectFirst && matches.length) {
          const index = matches.findIndex(match => match.index >= offset('from'));
          select(index < 0 ? 0 : index);
        }
      }
    } catch (exception) { error = exception instanceof SyntaxError ? t('正则表达式无效：{message}', {message: exception.message}) : exception.message; }
    caption();
  }
  function navigate(direction) {
    refresh(); if (!matches.length) return;
    if (current >= 0) select(current + direction);
    else if (direction > 0) {
      const index = matches.findIndex(match => match.index >= offset('to'));
      select(index < 0 ? 0 : index);
    } else {
      const index = matches.findLastIndex(match => match.index <= offset('from'));
      select(index < 0 ? matches.length - 1 : index);
    }
  }
  function replacementText(match) {
    if (!options.regex) return replacement.value;
    // Expand regex captures while retaining the original full-source context for lookarounds.
    return replacement.value.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, group) => {
      if (group === '$') return '$';
      if (group === '&') return match[0];
      if (group === '`') return match.input.slice(0, match.index);
      if (group === "'") return match.input.slice(match.index + match[0].length);
      if (group.startsWith('<')) return match.groups ? match.groups[group.slice(1, -1)] ?? '' : token;
      const number = Number(group);
      if (number > 0 && number < match.length) return match[number] ?? '';
      if (group.length === 2 && Number(group[0]) > 0 && Number(group[0]) < match.length) return (match[Number(group[0])] ?? '') + group[1];
      return token;
    });
  }
  function performReplace(every = false) {
    refresh(); if (!matches.length || editor.getOption('readOnly')) return;
    if (!every && current < 0) { navigate(1); return; }
    const targets = every ? matches : [matches[current]];
    const last = targets.at(-1), resume = last.index + replacementText(last).length;
    editing = true;
    try {
      editor.operation(() => {
        for (const match of [...targets].reverse()) editor.replaceRange(replacementText(match),
          editor.posFromIndex(match.index), editor.posFromIndex(match.index + match[0].length), '+search-replace');
      });
      if (!every) editor.setCursor(editor.posFromIndex(resume));
    } finally { editing = false; }
    refresh(); if (!every) navigate(1);
  }
  function close(focus = true) {
    panel.hidden = true; clearMarks(); scope?.clear(); scope = null; options.selection = false;
    matches = []; current = -1;
    if (focus) {
      // Search selections can enter Vim Visual mode; return to Normal before editing/undo.
      if (/^vim/.test(editor.getOption('keyMap'))) CodeMirror.Vim.handleKey(editor, '<Esc>');
      editor.focus();
    }
  }
  function open() {
    if (panel.hidden) {
      scope?.clear(); scope = null;
      if (editor.somethingSelected() && editor.listSelections().length === 1) {
        scope = editor.markText(editor.getCursor('from'), editor.getCursor('to'), {inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false});
        const text = editor.getSelection(); if (text.length <= 200 && !text.includes('\n')) query.value = text;
      }
      editor.closeHint(); CodeMirror.commands.clearSearch(editor); panel.hidden = false; refresh(true);
    }
    query.focus(); query.select();
  }
  function language() {
    panel.setAttribute('aria-label', t('搜索与替换'));
    for (const [input, key] of [[query, '搜索内容'], [replacement, '替换为']]) {
      input.placeholder = t(key); input.setAttribute('aria-label', t(key));
    }
    for (const [button, key] of [[previous, '上一个匹配'], [next, '下一个匹配'], [closeButton, '关闭搜索']]) {
      button.title = t(key); button.setAttribute('aria-label', t(key));
    }
    buttons.forEach(button => button.setAttribute('aria-label', t(labels[button.dataset.option])));
    replace.textContent = t('替换'); all.textContent = t('全部替换'); caption();
  }
  buttons.forEach(button => { button.onclick = () => { const key = button.dataset.option; options[key] = !options[key]; refresh(true); }; });
  query.oninput = () => refresh(true); replacement.oninput = caption;
  previous.onclick = () => navigate(-1); next.onclick = () => navigate(1);
  replace.onclick = () => performReplace(); all.onclick = () => performReplace(true); closeButton.onclick = () => close();
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Enter' && (event.target === query || event.target === replacement)) {
      event.preventDefault();
      if (event.target === query) navigate(event.shiftKey ? -1 : 1);
      else performReplace(event.ctrlKey || event.metaKey);
    }
  });
  window.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key?.toLowerCase() !== 'f' || event.isComposing) return;
    if (event.target.closest?.('dialog[open]')) return;
    if (event.target.closest?.('input,textarea,[contenteditable=true]') && !wrapper.contains(event.target) && !panel.contains(event.target)) return;
    event.preventDefault(); event.stopPropagation(); open();
  }, true);
  editor.on('changes', () => refresh());
  editor.on('cursorActivity', () => {
    if (!panel.hidden) { current = matches.findIndex(match => match.index === offset('from') && match.index + match[0].length === offset('to')); caption(); }
  });
  editor.on('optionChange', () => { if (!panel.hidden) caption(); });
  editor.on('swapDoc', () => close(false));
  window.addEventListener('latex-language-change', language); language();
  return {open, close};
}
