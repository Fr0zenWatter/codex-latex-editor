// Run: node test_native_annotations.mjs (no browser or model requests).
import assert from 'node:assert/strict';
import {attachNativeAnnotations} from './vendor/latex-native-annotations.mjs';

const elements = new Map(), domEvents = {};
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {dataset:{name:'paper.tex'},setAttribute(key,value){this[key]=value;},remove(){this.removed=true;}});
    return elements.get(id);
  },
  createElement() { return {style:{}}; },
  createRange() { return {selectNodeContents(element) { this.text = element.textContent; this.element = element; }}; },
  addEventListener(name, callback) { domEvents[name] = callback; },
};
let selection = '', ranges = 1, requests = 0, active = false;
const events = {}, marks = [];
const editor = {
  getWrapperElement:() => document.getElementById('wrapper'),
  somethingSelected:() => !!selection,
  getSelection:() => selection,
  listSelections:() => Array(ranges),
  getCursor:which => which === 'from' ? {line:10,ch:3} : {line:15,ch:0},
  on:(event, callback) => { events[event] = callback; },
  markText(from, to, options) {
    const mark = {from,to,...options,clear(){this.cleared=true;}};
    marks.push(mark);
    return mark;
  },
};
attachNativeAnnotations(editor, (el, text) => { el.textContent = text; }, document);
const button = document.getElementById('native-annotation-open');
const hint = document.getElementById('native-annotation-status'), status = document.getElementById('status');
assert.equal(hint.hidden, true);
assert.equal(status.hidden, false);
assert.equal(button['aria-pressed'], 'false');
assert.equal(button['aria-label'], 'Annotate selection in Codex');
assert(button.disabled);
assert(document.getElementById('native-annotation-preview').removed, 'Remove the drawer even from an older server page.');
assert.equal(document.getElementById('wrapper')['oai-annotation-container-text'], '');
selection = '完整第一段。\n\\begin{align}\nA &= B + C\\\\\n\\end{align}\n\n下一段与 <script> 原样保留。';
events.cursorActivity();
assert(!button.disabled);
button.onclick();
assert.equal(marks.length, 0, 'Unsupported apps leave source rendering unchanged.');
assert(document.getElementById('status').textContent.includes('暂不可用'));

document.oai = {annotation:{
  isActive:() => active,
  toggle(force) { assert.equal(force,false); return {accepted:true}; },
  request(range, options) {
    requests++;
    assert.equal(range.text, selection);
    assert.equal(range.element, marks.at(-1).replacedWith, 'Anchor in the CodeMirror source display.');
    assert.deepEqual(options, {enterAnnotationMode:true}, 'Preserve batch Save/Add, not quick Send.');
    return {accepted:true};
  },
}};
button.onclick();
assert.equal(requests, 1);
assert.equal(marks[0].replacedWith.textContent, selection, 'Keep all macros, newlines and HTML-looking text intact.');
assert.deepEqual(marks[0].from, {line:10,ch:3});
assert.deepEqual(marks[0].to, {line:15,ch:0});
assert(!marks[0].cleared);
assert.equal(hint.hidden, true, 'An accepted request alone must not display exit instructions before native mode opens.');
const captured = selection;
selection = 'x'.repeat(20001); button.onclick();
assert.equal(requests, 1, 'Reject oversize selections without truncation.');
assert(!marks[0].cleared, 'Validation must not discard an earlier accepted target.');
selection = 'two ranges'; ranges = 2; button.onclick(); assert.equal(requests, 1);
selection = ' \n '; ranges = 1; button.onclick(); assert.equal(requests, 1);

active = true; selection = '';
status.textContent = '已保存 · 编译成功';
domEvents.oaiannotationmodechange({detail:{active:true}});
assert.equal(hint.hidden, false);
assert.equal(status.hidden, true);
status.textContent = '正在保存并编译…';
assert.equal(button['aria-label'], 'Return to editing');
assert.equal(button.title, 'Return to editing');
assert.equal(button['aria-pressed'], 'true');
assert.equal(button.textContent, undefined, 'Mode changes must preserve the icon without inserting visible text.');
assert(!button.disabled, 'Exit remains available even when CodeMirror collapses a selection.');
button.onclick(); assert(!marks[0].cleared, 'Wait for confirmed mode exit rather than removing a pending native target.');
active = false;
domEvents.oaiannotationmodechange({detail:{active:false}});
assert(marks[0].cleared, 'Restore syntax display when leaving native mode.');
assert.equal(button['aria-label'], 'Annotate selection in Codex');
assert.equal(button['aria-pressed'], 'false');
assert.equal(hint.hidden, true, 'Escape/toolbar exit must hide the native-mode instructions.');
assert.equal(status.hidden, false);
assert.equal(status.textContent, '正在保存并编译…', 'Reveal the latest editor status without replacing newer compile messages.');

selection = captured;
document.oai.annotation.request = () => ({accepted:false});
button.onclick(); assert(marks.at(-1).cleared, 'Restore source immediately on rejection.');
document.oai.annotation.request = () => { throw new Error('Site capability unavailable'); };
button.onclick(); assert(marks.at(-1).cleared, 'Restore source on an API exception.');
document.oai.annotation.request = () => ({accepted:true});
button.onclick(); events.changes(); assert(marks.at(-1).cleared, 'Do not retain replacement widgets during source editing.');
button.onclick(); events.swapDoc(); assert(marks.at(-1).cleared, 'Clean up when opening another file.');
console.log('PASS: in-place exact native ranges, batch defaults, exit cleanup and boundary validation');
