// Run: node test_completion.mjs (stdlib; no model calls).
import assert from 'node:assert/strict';
import {attachInlineCompletion} from './vendor/latex-completion.mjs';

const pass = Symbol('pass');
globalThis.CodeMirror = {Pass:pass};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {textContent:'',events:{},setAttribute(){},
    addEventListener(name, fn){this.events[name] = fn;}});
  return elements.get(id);
};
const domEvents = {}, windowEvents = {};
globalThis.document = {querySelector:element,createElement:()=>element(Symbol()),
  addEventListener(name, fn){domEvents[name] = fn;}};
globalThis.window = {addEventListener(name, fn){windowEvents[name] = fn;}};
let clock = 10000, timerId = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => {timers.set(++timerId,{fn,at:clock+ms});return timerId;};
globalThis.clearTimeout = id => timers.delete(id);
Date.now = () => clock;
async function tick(ms = 1000) {
  clock += ms;
  for (let step=0; step<10; step++) {
    const due = [...timers].filter(([,timer])=>timer.at<=clock);
    due.forEach(([id,timer])=>{timers.delete(id);timer.fn();});
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    if (![...timers.values()].some(timer=>timer.at<=clock)) break;
  }
}
let text = 'Let $X$ be ', cursor={line:0,ch:text.length}, generation=0, doc={}, focus=true;
let readOnly=false, keyMap='default', selected=false, path='main.tex', available=true, widget=null;
const events = {}, edits = [], undo = [], input=element('input');
const cm = {
  state:{},getDoc:()=>doc,getCursor:()=>({...cursor}),getValue:()=>text,
  isClean:value=>value===generation,changeGeneration:()=>generation,indexFromPos:pos=>pos.ch,
  hasFocus:()=>focus,getOption:name=>({readOnly,keyMap})[name],somethingSelected:()=>selected,
  listSelections:()=>[{}],getInputField:()=>input,
  addKeyMap(map){this.keymap=map;},on(name, fn){(events[name]??=[]).push(fn);},
  setBookmark(pos, options){assert.equal(pos.ch,cursor.ch);widget=options.widget;
    return {clear(){widget=null;}};},operation:fn=>fn(),
  replaceRange(value, from, to, origin){undo.push({text,cursor});edits.push({value,origin});
    text=text.slice(0,from.ch)+value+text.slice(to.ch);generation++;fire('changes',[{origin}]);},
  setCursor(pos){cursor=pos;fire('cursorActivity');},
};
function fire(event,...args){for (const fn of events[event]||[])fn(cm,...args);}
function type(value='x') {text+=value;cursor={line:0,ch:text.length};generation++;fire('changes',[{origin:'+input'}]);fire('cursorActivity');}
const prefs = new Map([['latex-codex-inline-completion','off']]);
const requests=[], cancellations=[];
let result={status:'done',completion:'an abelian category'}, startResolve=null, holdStart=false;
async function request(url, options) {
  if (options) {
    const body=JSON.parse(options.body);
    if (body.action==='cancel') {cancellations.push(body.id);return {};}
    requests.push(body);
    if (holdStart) await new Promise(resolve=>startResolve=resolve);
    return {id:body.id};
  }
  return result;
}
const controller=attachInlineCompletion({editor:cm,request,preferences:{getItem:key=>prefs.get(key)},t:key=>key,
  getPath:()=>path,available:()=>available});
type();await tick();assert.equal(requests.length,0,'Off must not send any request.');
prefs.set('latex-codex-inline-completion','on');
type();await tick(349);assert.equal(requests.length,0);
await tick(1);
assert.equal(requests.length,1);assert.equal(requests[0].effort,'low');
assert.equal(widget.textContent,'an abelian category');assert.equal(edits.length,0,'Gray text is only a display widget.');
const oldText=text;
cm.keymap.Tab();assert.equal(text,oldText+'an abelian category');
assert.equal(edits[0].origin,'ai-completion');assert.equal(widget,null);
const previous=undo.pop();text=previous.text;cursor=previous.cursor;generation++;fire('changes',[{origin:'undo'}]);
assert.equal(text,oldText,'Acceptance must be one normal, undoable edit.');
assert.equal(cm.keymap.Tab(),pass,'Without a suggestion, Tab keeps its normal binding.');
for (const mode of ['emacs','vim-insert']) {
  keyMap=mode;type();await tick(3000);assert(widget);
  assert.equal(cm.keymap.Esc(),pass,'Esc also reaches the normal mode handler.');assert.equal(widget,null);
}
keyMap='vim';type();await tick(3000);assert.equal(widget,null);
keyMap='default';
for (const invalidate of [
  ()=>{cursor.ch--;fire('cursorActivity');},
  ()=>{doc={};fire('swapDoc');},
  ()=>{focus=false;fire('blur');},
  ()=>{path='other.tex';fire('cursorActivity');},
  ()=>{prefs.set('latex-codex-inline-completion','off');windowEvents['latex-completion-change']();},
  ()=>{prefs.set('latex-codex-completion-model','gpt-6-luna');windowEvents['latex-completion-change']();},
  ()=>{readOnly=true;fire('optionChange','readOnly');},
  ()=>{cm.state.completionActive=true;fire('startCompletion');},
  ()=>{input.events.compositionstart();},
]) {
  focus=true;readOnly=false;composingEnd();cm.state.completionActive=false;prefs.set('latex-codex-inline-completion','on');
  result={status:'running'};type();await tick(3000);
  const id=requests.at(-1).id, count=cancellations.length;
  invalidate();assert(cancellations.slice(count).includes(id),'Obsolete model job must be cancelled.');
  result={status:'done',completion:'stale suggestion'};await tick(3000);
  assert.equal(widget,null,'Obsolete suggestions must not reappear.');
}
function composingEnd(){input.events.compositionend();}
focus=true;readOnly=false;cm.state.completionActive=false;composingEnd();prefs.set('latex-codex-inline-completion','on');
result={status:'done',completion:'new suggestion'};holdStart=true;
type();await tick(3000);const lateId=requests.at(-1).id;
type();startResolve();holdStart=false;await tick(100);
assert(cancellations.includes(lateId));assert.equal(widget,null,'A delayed start response must not show an old suggestion.');
controller.clear();
prefs.set('latex-codex-completion-effort','medium');
type();await tick(3000);assert.equal(requests.at(-1).effort,'medium');assert(widget);
assert.equal(requests.at(-1).model,'gpt-6-luna');
type();assert.equal(widget,null,'Typing immediately clears gray suggestions.');
controller.clear();
for (const value of [null,'','first\nsecond','x'.repeat(241)]) {
  result={status:'done',completion:value};type();await tick(3000);assert.equal(widget,null);
  assert.equal(element('#inline-completion-status').textContent,'AI 暂无建议，继续输入后再试。');
}
result={status:'running'};type();await tick(3000);
assert.equal(element('#inline-completion-status').textContent,'AI 正在补全…');
controller.clear();
result={status:'error',error:'Unavailable'};type();await tick(3000);
assert.equal(element('#inline-completion-status').textContent,'AI 补全暂不可用：{message}');
controller.clear();assert.equal(element('#inline-completion-status').textContent,'');
result={status:'running'};type();await tick(3000);
const blockedId=requests.at(-1).id;available=false;await tick(300);
assert(cancellations.includes(blockedId));assert.equal(element('#inline-completion-status').textContent,'',
  'A blocked pending job must not leave a permanent waiting message.');
available=true;
selected=true;const count=requests.length;type();await tick(3000);assert.equal(requests.length,count);
selected=false;available=false;type();await tick(3000);assert.equal(requests.length,count);
assert(requests.every(item=>item.before.length<=3000&&item.after.length<=500));
console.log('PASS: toggle/effort, gray widgets without source edits, Tab/undo/Esc, modes, stale job cancellation, typing, selection, IME, native hints and delayed starts');
