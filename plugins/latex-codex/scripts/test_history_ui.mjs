// Run: node test_history_ui.mjs. Exercise browsing/restore without a browser or TeX.
import assert from 'node:assert/strict';
import {attachHistory, sourceRows, pdfChangeCard, markPdfText, historyTime} from './vendor/latex-history.mjs';

const numbered = sourceRows([{kind:'equal',text:'first\n'}, {kind:'delete',text:'removed\n'}, {kind:'insert',text:'new\n'}, {kind:'equal',text:'last'}]);
assert.deepEqual(numbered.map(row=>row.number), [1,null,2,3]);
assert.deepEqual(numbered.map(row=>row.changed), [false,true,true,false]);
assert.equal(numbered[1].parts[0].kind, 'delete');
assert.equal(sourceRows([{kind:'equal',text:'a\r\nb\n'}]).length, 3);
assert.deepEqual(sourceRows([{kind:'equal',text:'a'}, {kind:'delete',text:'\nb'}, {kind:'equal',text:'c\nlast'}]).map(row=>row.number),[1,'',2]);

class Element {
  constructor(text = '', value = '') { this.textContent = text; this.value = value; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.style={}; }
  append(...children) { for(const child of children.flatMap(child => child.fragment ? child.children : [child])) {child.parent=this;this.children.push(child);} }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelectorAll(selector) { return selector === '.history-change-start' ? this.children.filter(child=>child.className?.includes('history-change-start')) : this.children; }
  getBoundingClientRect() { const top = this.parent?.id === 'code' ? this.parent.children.indexOf(this)*20-(this.parent.scrollTop||0) : 0; return {top, bottom:this.id==='code'?100:top+20}; }
  scrollTo({top}) { this.scrollTop=top; this.events.scroll?.(); }
  get options() { return this.children; }
  addEventListener(name, fn) { this.events[name] = fn; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
}
const elements = new Map();
const $ = id => { if (!elements.has(id)) elements.set(id, Object.assign(new Element(),{id})); return elements.get(id); };
globalThis.Option = Element;
globalThis.document = {querySelector:selector => $(selector.slice(9)), createElement:() => new Element(), createDocumentFragment:() => Object.assign(new Element(), {fragment:true})};
globalThis.ResizeObserver = class {observe(){}};
globalThis.window = {innerWidth:1000,innerHeight:800,addEventListener(){}};
globalThis.matchMedia = ()=>({matches:true});
assert.equal(historyTime(new Date(2026,9,1,16,59,22).toISOString()),'16:59 2026/10/01');
const card = pdfChangeCard(0), toggle = card.block.children[0].children[1];
assert.equal(card.block.dataset.side,'after');
assert(card.columns.before.hidden && !card.columns.after.hidden);
assert.equal(toggle.attributes['aria-label'],'查看修改前');
assert.equal(card.block.children[0].children[0].children.at(-1).className,'history-after-label');
toggle.onclick(); assert.equal(card.block.dataset.side,'before');
assert(!card.columns.before.hidden && card.columns.after.hidden);
assert.equal(toggle.attributes['aria-label'],'查看修改后');
assert.equal(card.block.children[0].children[0].children.at(-1).className,'');
toggle.onclick(); assert.equal(card.block.dataset.side,'after');
const pixels = {data:new Uint8ClampedArray([0,0,0,255,255,255,255,255,128,128,128,255])};
let written;
markPdfText({width:3,height:1,getContext:()=>({getImageData:()=>pixels,putImageData:data=>written=data})},
  {convertToViewportPoint:(x,y)=>[x,y]},0,0,[[0,0,3,1]]);
assert.deepEqual([...written.data.slice(0,8)],[220,38,38,255,255,255,255,255]);
assert(written.data[8]>written.data[9] && written.data[11]===255,'Keep antialiasing and alpha while tinting changed glyphs red.');
const events = {};
const context = {path:'paper.tex', source:'unsaved draft', version:'current-version'};
const rows = [{id:2, created:'2026-10-01T00:01:00Z', kind:'save', label:'',sections:['2.1 Stability'],baseline:1,summary:'',description:'调整公式与论述'}, {id:1, created:'2026-10-01T00:00:00Z', kind:'open', label:'初稿'}];
const calls = [];
let restorePayload, deferred, pdfError=false;
const flush = () => new Promise(resolve => setImmediate(resolve));
async function request(route, options) {
  const data = options ? JSON.parse(options.body) : null; calls.push({route, data});
  if (route.startsWith('/history?')) return {revisions:rows.map(row=>({...row})), next:null};
  if (route === '/history/label') {rows.find(row=>row.id===data.id).label=data.label.trim();return {ok:true};}
  if (route === '/history/summaries') return {status:'done',summaries:[{id:2,summary:'更新稳定性估计。'}]};
  if (deferred) return new Promise(resolve => { deferred.resolve = resolve; });
  if (route === '/history/pdf') { if(pdfError)throw new Error('compile failed'); return {changes:[]}; }
  return {...rows.find(row=>row.id===data.id), source:'old source', changes:[{kind:'equal',text:'same\n'.repeat(10)},{kind:'delete',text:'old'},{kind:'insert',text:'new'},{kind:'equal',text:'\nend'}], same:false};
}
attachHistory({on:(name, fn)=>events[name]=fn}, request, ()=>({...context}), async data=>{restorePayload=data;});
$('open').onclick(); await flush();
assert($('dialog').open && !$('restore').disabled);
assert.equal(calls.at(-1).data.compare, 'previous');
assert($('status').hidden,'Successful browsing must not show the removed status strip.');
assert.equal($('list').children[0].children[1].children[0].textContent,'2.1 Stability');
$('sidebar').onpointerenter(); await flush();
assert.equal($('sidebar-toggle').attributes['aria-expanded'],'true');
assert.equal(calls.at(-1).route,'/history/summaries');
assert.equal($('list').children[0].children[1].children.at(-1).textContent,'更新稳定性估计。');
$('sidebar').onpointerleave(); assert.equal($('sidebar-toggle').attributes['aria-expanded'],'false');
$('sidebar-pin').onclick(); assert.equal($('dialog').dataset.sidebarOpen,'true');
assert.equal($('sidebar-pin').attributes['aria-pressed'],'true');
$('sidebar').onpointerleave();assert.equal($('sidebar-toggle').attributes['aria-expanded'],'true');
$('sidebar-pin').onclick(); assert.equal($('dialog').dataset.sidebarOpen,'false');
assert(!$('next').hidden); assert.equal($('next-label').textContent,'下方还有 1 处改动');
$('next').onclick(); assert($('code').scrollTop>0); assert($('next').hidden);
$('pdf').onclick(); await flush();
assert.equal(calls.at(-1).route,'/history/pdf');assert.equal(calls.at(-1).data.compare,'previous');
assert($('code').hidden && !$('pdf-view').hidden && $('next').hidden);
assert.equal($('pdf').attributes['aria-pressed'],'true');
assert.match($('pdf-view').textContent,/没有需要预览/);
$('target').value='current'; $('target').onchange(); await flush();
assert.equal(calls.at(-1).data.source, 'unsaved draft');
await $('list').children[1].onclick();
$('source').onclick();
assert.equal($('code').children[0].children[1].children[0].textContent, 'old source');
assert.equal(context.source, 'unsaved draft', 'Browsing must not replace the editor.');
$('target').value = '2'; $('target').onchange(); await flush();
assert.equal(calls.at(-1).data.target_id, 2);
assert(!('source' in calls.at(-1).data));
$('list').children[0].oncontextmenu({preventDefault(){},clientX:900,clientY:700});
assert($('actions').open); $('rename').onclick(); assert($('name-dialog').open);
$('label').value = '定稿'; await $('label-form').onsubmit({preventDefault(){}});
assert.deepEqual(calls.findLast(call=>call.route==='/history/label').data,{path:context.path,id:2,label:'定稿'});
assert(!$('name-dialog').open && calls.at(-1).data.id===1,'Renaming another entry must preserve the preview selection.');
await $('restore').onclick();
assert.equal(restorePayload, undefined, 'First click must only ask for confirmation.');
assert($('confirmation').open);
$('cancel').onclick(); assert(!$('confirmation').open);
await $('restore').onclick(); await $('confirm').onclick();
assert.deepEqual(restorePayload, {...context, id:1}, 'Restore must carry the captured draft, file and version.');

pdfError=true; $('pdf').onclick(); await flush();
assert.match($('pdf-view').textContent,/PDF 对比失败：compile failed/);pdfError=false;
$('source').onclick();
deferred={}; $('pdf').onclick(); const oldPdf=deferred; deferred=null;
$('source').onclick(); oldPdf.resolve({changes:[]}); await flush();
assert(!$('code').hidden && $('pdf-view').hidden,'A late PDF response must not replace the source tab.');

// A late response from a previously closed dialog must not overwrite a fresh selection.
deferred = {}; const pending = $('list').children[0].onclick();
$('dialog').close(); const old = deferred; deferred = null;
$('open').onclick(); await flush();
old.resolve({...rows[1], source:'STALE', diff:[], same:true}); await pending;
$('source').onclick(); assert.equal($('code').children[0].children[1].children[0].textContent, 'old source');
events.swapDoc(); assert(!$('dialog').open);
console.log('PASS: word markup/line numbers, next-change navigation, previous/current comparison, naming, draft-safe restore, stale responses and file switch');
