// Run: node test_search.mjs (stdlib only); real CodeMirror undo is also checked in-browser.
import assert from 'node:assert/strict';
import {attachSourceSearch} from './vendor/latex-search.mjs';

class Element {
  constructor() { this.dataset = {}; this.attributes = {}; this.events = {}; this.value = ''; this.children = new Map(); }
  querySelector(key) { if (!this.children.has(key)) this.children.set(key, new Element()); return this.children.get(key); }
  querySelectorAll() { return this.buttons ??= ['case', 'regex', 'word', 'selection'].map(option => Object.assign(new Element(), {dataset: {option}})); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.events[key] = fn; }
  contains(target) { return target === this || [...this.children.values()].includes(target); }
  closest() { return null; }
  before(panel) { this.panel = panel; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
const windowEvents = {};
globalThis.window = {addEventListener(name, fn) { windowEvents[name] = fn; }};
globalThis.document = {createElement: () => new Element()};
let vimEscapes = 0;
globalThis.CodeMirror = {commands: {clearSearch() {}}, Vim: {handleKey(editor, key) { assert.equal(key, '<Esc>'); vimEscapes++; }}};
const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name]);
function setup(source) {
  const wrapper = new Element(), events = {}, marks = [], history = [];
  let selection = [0, 0], operation = false, readOnly = false, keyMap = 'default';
  const editor = {
    getWrapperElement: () => wrapper, getValue: () => source, getOption: key => key === 'keyMap' ? keyMap : readOnly,
    posFromIndex(index) { const lines = source.slice(0, index).split('\n'); return {line: lines.length - 1, ch: lines.at(-1).length}; },
    indexFromPos(pos) { const lines = source.split('\n'); return lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch; },
    getCursor(which) { return this.posFromIndex(selection[which === 'to' ? 1 : 0]); },
    listSelections: () => [selection], getSelection: () => source.slice(...selection), somethingSelected: () => selection[0] !== selection[1],
    setSelection(from, to) { selection = [this.indexFromPos(from), this.indexFromPos(to)]; events.cursorActivity?.(); },
    setCursor(pos) { this.setSelection(pos, pos); }, scrollIntoView() {}, focus() {}, closeHint() {},
    on(name, fn) { events[name] = fn; },
    markText(from, to, options) {
      const mark = {start: this.indexFromPos(from), end: this.indexFromPos(to), options, clear() {this.cleared = true;},
        find: () => mark.cleared ? undefined : {from: this.posFromIndex(mark.start), to: this.posFromIndex(mark.end)}};
      marks.push(mark); return mark;
    },
    operation(fn) {
      const before = source; operation = true;
      try { fn(); } finally { operation = false; }
      if (source !== before) { history.push(before); events.changes?.(); }
    },
    replaceRange(text, from, to, origin) {
      assert.equal(origin, '+search-replace');
      const start = this.indexFromPos(from), end = this.indexFromPos(to), delta = text.length - (end - start);
      for (const mark of marks.filter(mark => !mark.cleared)) {
        const move = (pos, right) => pos < start ? pos : pos > end ? pos + delta : start + (right ? text.length : 0);
        mark.start = move(mark.start, false); mark.end = move(mark.end, true);
      }
      source = source.slice(0, start) + text + source.slice(end);
      if (!operation) events.changes?.();
    },
    undo() { source = history.pop(); selection = [0, 0]; events.changes?.(); },
  };
  const controller = attachSourceSearch(editor, t), panel = wrapper.panel;
  const input = panel.querySelector('.source-search-query'), replacement = panel.querySelector('.source-search-replacement');
  const status = panel.querySelector('.source-search-status');
  const click = name => panel.querySelector(`.source-search-${name}`).onclick();
  const option = name => panel.buttons.find(button => button.dataset.option === name).onclick();
  const find = value => { input.value = value; input.oninput(); };
  return {editor, controller, panel, input, replacement, status, click, option, find, marks, history,
    readonly(value) { readOnly = value; events.optionChange?.(); }, mode(value) {keyMap = value;}, swap() { events.swapDoc(); }};
}
let test = setup('foo foobar FOO foo');
test.controller.open(); assert.equal(test.editor.getValue(), 'foo foobar FOO foo');
test.find('foo'); assert.equal(test.status.textContent, '1 / 4');
test.click('next'); assert.equal(test.status.textContent, '2 / 4');
test.click('previous'); assert.equal(test.status.textContent, '1 / 4');
test.click('previous'); assert.equal(test.status.textContent, '4 / 4', 'Previous wraps to the last occurrence.');
test.option('word'); assert.equal(test.status.textContent, '3 / 3');
test.option('case'); assert.equal(test.status.textContent, '2 / 2');
test.panel.events.keydown({key: 'Escape', preventDefault() {}, stopPropagation() {}});
assert(test.panel.hidden); assert(test.marks.every(mark => mark.cleared));
test.mode('vim'); test.controller.open(); test.controller.close(); assert.equal(vimEscapes, 1, 'Closing source search returns Vim Visual selections to Normal mode for undo.');

test = setup('foo FOO'); test.controller.open(); test.find('foo');
const caseButton = test.panel.buttons.find(button => button.dataset.option === 'case');
assert.equal(test.status.textContent, '1 / 2'); assert.equal(caseButton.attributes['aria-pressed'], 'false');
assert.equal(caseButton.title, '不区分大小写');
test.option('case'); assert.equal(test.status.textContent, '1 / 1');
assert.equal(caseButton.attributes['aria-pressed'], 'true'); assert.equal(caseButton.title, '区分大小写');
test.option('case'); assert.equal(test.status.textContent, '1 / 2', 'Turning case matching off restores insensitive search.');
assert.equal(caseButton.attributes['aria-pressed'], 'false'); assert.equal(caseButton.title, '不区分大小写');

test = setup('foo12 foo34 foo\\d+'); test.controller.open(); test.find('foo\\d+');
const regexButton = test.panel.buttons.find(button => button.dataset.option === 'regex');
assert.equal(test.status.textContent, '1 / 1'); assert.equal(regexButton.title, '普通文本');
test.option('regex'); assert.equal(test.status.textContent, '1 / 2');
assert.equal(regexButton.attributes['aria-pressed'], 'true'); assert.equal(regexButton.title, '正则表达式');
test.option('regex'); assert.equal(test.status.textContent, '1 / 1', 'Turning regex off restores literal metacharacter matching.');
assert.equal(regexButton.attributes['aria-pressed'], 'false'); assert.equal(regexButton.title, '普通文本');

test = setup('before \\alpha after \\alpha'); test.controller.open(); test.find('\\alpha');
assert.equal(test.status.textContent, '1 / 2', 'LaTeX backslashes are literal by default.');
test.replacement.value = '$1\\beta'; test.click('replace');
assert.equal(test.editor.getValue(), 'before $1\\beta after \\alpha', 'Literal replacements do not expand dollar signs.');
test.editor.undo(); assert.equal(test.editor.getValue(), 'before \\alpha after \\alpha');

test = setup('before foo12 and foo34 after'); test.controller.open(); test.option('regex'); test.find('(?<stem>foo)(\\d+)');
test.replacement.value = '$<stem>-$2-$$-$&'; test.click('all');
assert.equal(test.editor.getValue(), 'before foo-12-$-foo12 and foo-34-$-foo34 after');
assert.equal(test.history.length, 1, 'Replace All must use one undo operation.');
test.editor.undo(); assert.equal(test.editor.getValue(), 'before foo12 and foo34 after');
test.find('['); assert(test.status.textContent.startsWith('正则表达式无效：'));
assert(test.panel.querySelector('.source-search-all').disabled); test.click('all');
assert.equal(test.editor.getValue(), 'before foo12 and foo34 after', 'Invalid regex never changes source.');
test.find(''); assert.equal(test.status.textContent, '');

test = setup('first\nsecond'); test.controller.open(); test.option('regex'); test.find('^');
test.replacement.value = '> '; test.click('all');
assert.equal(test.editor.getValue(), '> first\n> second', 'Zero-width regex matches advance and replace once per line.');
test.editor.undo(); test.find('(?<=first)\\nsecond'); test.replacement.value = ' END'; test.click('all');
assert.equal(test.editor.getValue(), 'first END', 'Multiline matches retain lookbehind context and exact ranges.');

test = setup('foo outside\nfoo inside foo inside\nfoo outside');
test.editor.setSelection({line: 1, ch: 0}, {line: 1, ch: 21}); test.controller.open(); test.find('foo'); test.option('selection');
assert.equal(test.status.textContent, '1 / 2'); test.replacement.value = 'longer'; test.click('all');
assert.equal(test.editor.getValue(), 'foo outside\nlonger inside longer inside\nfoo outside', 'Selection-only replacements preserve both outside ranges.');
test.find('longer'); assert.equal(test.status.textContent, '1 / 2', 'The selected scope follows edits that change its length.');
test.swap(); assert(test.panel.hidden); assert(test.marks.every(mark => mark.cleared));

test = setup('foo foo'); test.controller.open(); test.find('foo'); test.readonly(true);
assert(test.panel.querySelector('.source-search-replace').disabled); test.replacement.value = 'bar'; test.click('all');
assert.equal(test.editor.getValue(), 'foo foo', 'Read-only editing blocks replacement, including programmatic clicks.');
test.controller.close();
for (const modifiers of [{ctrlKey: true}, {metaKey: true}]) {
  let prevented = false;
  windowEvents.keydown({key: 'f', target: test.editor.getWrapperElement(), ...modifiers, preventDefault() {prevented = true;}, stopPropagation() {}});
  assert(prevented); assert(!test.panel.hidden); assert(test.input.focused); test.controller.close();
}
console.log('PASS: literal LaTeX search, case/whole-word filters, wrap navigation, capture replacement, multiline/zero-width regex, scoped edits, undo grouping, invalid patterns, readonly, stale-document cleanup and Ctrl/Cmd+F');
