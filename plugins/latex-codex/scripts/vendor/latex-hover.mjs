// Local source previews; parsing and rendering never save or compile the document.
const mathEnvironment = /^(?:math|displaymath|equation|align|alignat|gather|multline|flalign|aligned|alignedat|gathered|split|cases|[bpvBV]?matrix|smallmatrix|array)\*?$/;

export function findMathRanges(source) {
  const ranges = [];
  // Consume escaped characters, comments and verbatim text before looking for delimiters.
  const tokens = /%[^\r\n]*|\\verb\*?([^\w\s])[^\r\n]*?\1|\\(?:begin|end)\s*\{[^}]*\}|\\(?:[A-Za-z@]+|[\s\S])|\$\$?|[{}]/g;
  let open = null, braces = 0, nesting = 0;
  for (let match; (match = tokens.exec(source));) {
    const token = match[0], from = match.index, to = tokens.lastIndex;
    if (token.startsWith('%') || token.startsWith('\\verb')) continue;
    const environment = token.match(/^\\(begin|end)\s*\{([^}]+)\}$/);
    if (environment?.[1] === 'begin' && /^(?:verbatim\*?|lstlisting|minted|comment)$/.test(environment[2])) {
      const end = '\\end{' + environment[2] + '}', index = source.indexOf(end, to);
      tokens.lastIndex = index < 0 ? source.length : index + end.length;
      continue;
    }
    if (open) {
      if (token === '{') braces++;
      if (token === '}') braces = Math.max(0, braces - 1);
      if (braces) continue;
      let closed = token === open.close;
      if (open.environment && environment?.[2] === open.environment) {
        nesting += environment[1] === 'begin' ? 1 : -1;
        closed = nesting === 0;
      }
      if (closed) {
        const tex = source.slice(open.body, open.keepEnvironment ? to : from);
        if (tex.trim()) ranges.push({from: open.from, to, tex, display: open.display});
        open = null;
      }
      continue;
    }
    if (environment?.[1] === 'begin' && mathEnvironment.test(environment[2])) {
      const name = environment[2], keepEnvironment = !/^(?:math|displaymath)$/.test(name);
      open = {from, body: keepEnvironment ? from : to, environment: name, keepEnvironment, display: name !== 'math'};
      nesting = 1;
    } else {
      const close = {'$': '$', '$$': '$$', '\\(': '\\)', '\\[': '\\]'}[token];
      if (close) open = {from, body: to, close, display: token === '$$' || token === '\\['};
    }
    braces = 0;
  }
  return ranges;
}

export function attachMathHover(cm, katex) {
  const wrapper = cm.getWrapperElement(), tip = document.createElement('div');
  tip.id = 'math-hover'; tip.role = 'tooltip'; tip.hidden = true;
  document.body.append(tip);
  let ranges = null, active = null;
  function hide() {
    active = null; tip.hidden = true;
    cm.getInputField().removeAttribute('aria-describedby');
  }
  function show(range, anchor) {
    if (range !== active) {
      tip.replaceChildren();
      const formula = document.createElement('div');
      tip.append(formula);
      try {
        // ponytail: standalone KaTeX; import document macro definitions if projects need them.
        const tex = range.tex.replace(/\\(begin|end)\s*\{(equation|align|alignat|gather)\}/g, '\\$1{$2*}');
        katex.render(tex, formula, {displayMode: range.display, throwOnError: true,
          trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, macros: {'\\label': {numArgs: 1, tokens: []}}});
      } catch (error) {
        formula.className = 'math-hover-error';
        formula.textContent = '此公式暂无法预览，请查看右侧 PDF。';
        formula.title = String(error.message);
      }
      active = range;
    }
    tip.hidden = false;
    tip.style.left = Math.max(12, Math.min(anchor.left, window.innerWidth - tip.offsetWidth - 12)) + 'px';
    const top = anchor.bottom + 8;
    tip.style.top = Math.max(12, top + tip.offsetHeight <= window.innerHeight - 12
      ? top : anchor.top - tip.offsetHeight - 8) + 'px';
    cm.getInputField().setAttribute('aria-describedby', tip.id);
  }
  function at(pos) {
    if ((cm.getTokenTypeAt({line: pos.line, ch: pos.ch + 1}) || '').split(' ').includes('comment')) return null;
    if (!ranges) ranges = findMathRanges(cm.getValue());
    const index = cm.indexFromPos(pos);
    return ranges.find(range => index >= range.from && index < range.to);
  }
  function update() {
    if (!cm.hasFocus()) { hide(); return; }
    const pos = cm.getCursor(), range = at(pos);
    if (!range) { hide(); return; }
    const anchor = cm.charCoords(pos, 'window'), bounds = cm.getScrollerElement().getBoundingClientRect();
    if (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom) { hide(); return; }
    show(range, anchor);
  }
  for (const event of ['cursorActivity', 'focus', 'scroll']) cm.on(event, update);
  for (const event of ['changes', 'swapDoc']) cm.on(event, () => { ranges = null; update(); });
  cm.on('blur', hide);
  wrapper.addEventListener('keyup', event => { if (event.key === 'Escape') hide(); });
  window.addEventListener('blur', hide);
  window.addEventListener('resize', update);
}
