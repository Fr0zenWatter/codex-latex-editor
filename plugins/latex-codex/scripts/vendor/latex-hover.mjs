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

// Import only literal declarations, never execute the document preamble or packages.
// KaTeX parses arguments/expansions; unsupported declarations are isolated.
export function documentMacros(source, katex) {
  source = source.replace(/\\verb\*?([^\w\s])[^\r\n]*?\1|\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\2\}|\\[\s\S]|%[^\r\n]*/g,
    token => token.startsWith('%') || token.startsWith('\\verb') || token.startsWith('\\begin') ? ' ' : token);
  let macros = {}, depth = 0, conditional = 0, count = 0;
  const tokens = /\\[A-Za-z@]+|\\[^\s]|[{}]/g;
  function group(index, left = '{', right = '}') {
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    if (source[index] !== left) return null;
    const start = index++;
    let nesting = 1;
    for (; index < source.length; index++) {
      if (source[index] === '\\') { index++; continue; }
      if (source[index] === left) nesting++;
      if (source[index] === right && --nesting === 0) return {text: source.slice(start, index + 1), end: index + 1};
    }
    return null;
  }
  for (let match; (match = tokens.exec(source)) && count < 500;) {
    if (/^\\if/.test(match[0])) { conditional++; continue; }
    if (match[0] === '\\fi') { conditional = Math.max(0, conditional - 1); continue; }
    if (conditional) continue; // TeX conditionals need the full compiler's state.
    if (match[0] === '{') { depth++; continue; }
    if (match[0] === '}') { depth = Math.max(0, depth - 1); continue; }
    if (!depth && match[0] === '\\begin' && group(tokens.lastIndex)?.text === '{document}') break;
    if (depth || !/^\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|def|gdef)$/.test(match[0])) continue;
    const command = match[0];
    let index = tokens.lastIndex, statement;
    const starred = source[index] === '*';
    if (starred) index++;
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    const nameGroup = group(index), nameToken = source.slice(index).match(/^\\(?:[A-Za-z@]+|[^\s])/);
    if (!nameGroup && !nameToken) continue;
    const name = nameGroup ? nameGroup.text.slice(1, -1).trim() : nameToken[0];
    if (!/^\\(?:[A-Za-z@]+|[^\s])$/.test(name)) continue;
    index = nameGroup ? nameGroup.end : index + name.length;
    if (command === '\\def' || command === '\\gdef') {
      const parameters = source.slice(index).match(/^\s*(?:#[1-9]\s*)*/)[0];
      index += parameters.length;
      const body = group(index);
      if (!body) continue;
      statement = command + name + parameters + body.text; index = body.end;
    } else {
      const args = group(index, '[', ']');
      if (args) index = args.end;
      const defaults = group(index, '[', ']');
      if (defaults) index = defaults.end;
      const body = group(index);
      if (!body) continue;
      index = body.end;
      tokens.lastIndex = index;
      if (defaults) continue; // KaTeX does not implement optional default arguments.
      statement = command === '\\DeclareMathOperator'
        ? '\\newcommand{' + name + '}{\\operatorname' + (starred ? '*' : '') + body.text + '}'
        : command + '{' + name + '}' + (args?.text || '') + body.text;
    }
    tokens.lastIndex = index; count++;
    const candidate = {...macros};
    const options = {macros: candidate, globalGroup: true,
      throwOnError: true, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20};
    try {
      try { katex.renderToString(statement, options); }
      catch (error) {
        // KaTeX predefines aliases (e.g. \R) that ordinary LaTeX leaves undefined.
        if (!statement.startsWith('\\newcommand') || Object.hasOwn(macros, name)
          || !error.message.includes('attempting to redefine')) throw error;
        katex.renderToString(statement.replace(/^\\newcommand/, '\\renewcommand'), options);
      }
      macros = candidate;
    } catch {} // One malformed or unsupported definition must not hide valid macros.
  }
  return macros;
}

export function attachMathHover(cm, katex) {
  const wrapper = cm.getWrapperElement(), tip = document.createElement('div');
  tip.id = 'math-hover'; tip.role = 'tooltip'; tip.hidden = true;
  document.body.append(tip);
  let ranges = null, active = null, mainSource = '', macroSource = null, macros = {};
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
        const source = mainSource || cm.getValue();
        if (source !== macroSource) { macros = documentMacros(source, katex); macroSource = source; }
        const tex = range.tex.replace(/\\(begin|end)\s*\{(equation|align|alignat|gather)\}/g, '\\$1{$2*}');
        katex.render(tex, formula, {displayMode: range.display, throwOnError: true,
          trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20,
          macros: {...macros, '\\label': {numArgs: 1, tokens: []}}});
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
  for (const event of ['cursorActivity', 'focus', 'scroll', 'refresh']) cm.on(event, update);
  for (const event of ['changes', 'swapDoc']) cm.on(event, () => { ranges = null; update(); });
  cm.on('blur', hide);
  wrapper.addEventListener('keyup', event => { if (event.key === 'Escape') hide(); });
  window.addEventListener('blur', hide);
  window.addEventListener('resize', update);
  return {setMainSource(source = '') {
    if (source === mainSource) return;
    mainSource = source; active = null; update();
  }};
}
