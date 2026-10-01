// Run: node test_hover.mjs (stdlib and the bundled KaTeX only).
import assert from 'node:assert/strict';
import {findMathRanges, attachMathHover} from './vendor/latex-hover.mjs';
import katex from './vendor/katex/katex.mjs';

for (const [left, right, display] of [
  ['$', '$', false], ['$$', '$$', true], ['\\(', '\\)', false], ['\\[', '\\]', true],
  ['\\begin{math}', '\\end{math}', false], ['\\begin{displaymath}', '\\end{displaymath}', true],
]) {
  const source = 'text ' + left + 'x^2+\\frac{1}{2}' + right + ' tail';
  const ranges = findMathRanges(source);
  assert.deepEqual(ranges, [{from: 5, to: source.length - 5, tex: 'x^2+\\frac{1}{2}', display}]);
  for (let index = 5; index < source.length - 5; index++) {
    assert(ranges.some(range => index >= range.from && index < range.to)); // Delimiters and body.
  }
  assert(katex.renderToString(ranges[0].tex, {displayMode: display}).includes('<math'));
}
const nested = '\\begin{equation}\\label{eq:x}\\begin{aligned}x&=\\frac{a}{b}\\\\y&=2\\end{aligned}\\end{equation}';
assert.equal(findMathRanges(nested)[0].tex, nested);
assert.equal(findMathRanges('$$x+\\text{cost $5$}$$')[0].tex, 'x+\\text{cost $5$}');
const ignored = '\\$50 % $comment$ $$bad$$\n'
  + '\\verb|$verbatim$| \\begin{verbatim}$hidden$\\end{verbatim}\n'
  + '\\begin{lstlisting}$$hidden$$\\end{lstlisting}\n'
  + '$x$ \\\\[not math] \\% $y$';
assert.deepEqual(findMathRanges(ignored).map(range => range.tex), ['x', 'y']);
assert.equal(findMathRanges('$unfinished').length, 0);
assert.equal(findMathRanges('$$ $$').length, 0);
for (const tex of [nested, '\\begin{align}x&=1\\\\y&=2\\end{align}', '\\bm{x}+\\mathscr{A}']) {
  assert(katex.renderToString(tex, {displayMode: true, macros: {'\\label': {numArgs: 1, tokens: []}}}).includes('<math'));
}
assert.throws(() => katex.renderToString('\\missingCustomMacro'), /Undefined control sequence/);
assert(!katex.renderToString('\\href{javascript:alert(1)}{x}', {trust: false, strict: 'ignore'}).includes('href='));

// Caret movement and editing update previews without compilation or source mutation.
const elements = [];
function element() {
  const el = {style: {}, events: {}, attributes: {}, offsetWidth: 160, offsetHeight: 80,
    addEventListener(name, fn) { this.events[name] = fn; },
    append(...children) { this.children = children; }, replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }};
  elements.push(el); return el;
}
globalThis.document = {body: element(), createElement: element};
globalThis.window = {innerWidth: 500, innerHeight: 400, addEventListener() {}};
const wrapper = element(), input = element(), handlers = {};
let text = '$x^2$', rendered = '', renders = 0, cursor = 2, focused = true, anchorTop = 20;
const cm = {getWrapperElement: () => wrapper, getInputField: () => input,
  getTokenTypeAt: () => '', getValue: () => text, indexFromPos: pos => pos.ch,
  hasFocus: () => focused, charCoords: () => ({left: 20 + cursor, top: anchorTop, bottom: anchorTop + 20}),
  getScrollerElement: () => ({getBoundingClientRect: () => ({top: 0, bottom: 350})}),
  getCursor: () => ({line: 0, ch: cursor}), on: (name, fn) => { handlers[name] = fn; }};
attachMathHover(cm, {render(tex) { rendered = tex; renders++; }});
const tip = elements.find(el => el.id === 'math-hover');
assert.equal(wrapper.events.mousemove, undefined);
handlers.cursorActivity();
assert.equal(rendered, 'x^2'); assert.equal(tip.hidden, false);
assert.equal(tip.children.length, 1); // Formula only, no heading.
cursor = 3; handlers.cursorActivity(); assert.equal(renders, 1);
assert.equal(tip.style.left, '23px');
text = '$y^3$'; handlers.changes();
assert.equal(rendered, 'y^3');
cursor = text.length; handlers.cursorActivity(); assert(tip.hidden);
cursor = 2; handlers.cursorActivity(); assert.equal(tip.hidden, false);
focused = false; handlers.blur(); assert(tip.hidden);
handlers.changes(); assert(tip.hidden);
focused = true; handlers.focus(); assert.equal(tip.hidden, false);
anchorTop = -30; handlers.scroll(); assert(tip.hidden);
anchorTop = 20; handlers.scroll(); assert.equal(tip.hidden, false);
wrapper.events.keyup({key: 'Escape'}); assert(tip.hidden);
assert.equal(input.attributes['aria-describedby'], undefined);
handlers.cursorActivity(); assert.equal(tip.hidden, false);
text = 'plain text'; handlers.swapDoc(); assert(tip.hidden);
text = nested; handlers.changes();
assert(rendered.startsWith('\\begin{equation*}') && rendered.endsWith('\\end{equation*}'));
assert(!katex.renderToString(rendered, {displayMode: true, macros: {'\\label': {numArgs: 1, tokens: []}}}).includes('eqn-num'));
console.log('PASS: math ranges, KaTeX, caret entry/exit, live edits, focus, scroll, dismissal and formula-only content');
