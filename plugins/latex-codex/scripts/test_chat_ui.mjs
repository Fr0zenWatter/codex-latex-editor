// Run: node test_chat_ui.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachSelectionChat,colorReplacement} from './vendor/latex-chat.mjs';
import {initSettings} from './vendor/latex-settings.mjs';
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',hidden:true,children:[],style:{},dataset:{},attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},matches(){return !!this.open;},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    events:{},offsetWidth:320,offsetHeight:46,getBoundingClientRect(){return {left:950,top:750,bottom:780};},
    scrollHeight:68,contains(node){return !!node && node===this;},
    focus(){this.events.focus?.();},showPopover(){this.open=true;},hidePopover(){this.open=false;this.events.beforetoggle?.({newState:'closed'});},addEventListener(name,handler){this.events[name]=handler;}});
  return elements.get(id);
}
globalThis.document = {querySelector:el,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},createElement:()=>el(Symbol())};
const windowEvents = {};
globalThis.window = {innerWidth:1000,innerHeight:800,addEventListener(name,handler){windowEvents[name]=handler;}};
window.dispatchEvent=()=>{};
globalThis.localStorage={getItem:key=>key==='latex-codex-language'?'zh-CN':null,setItem(){}};
initSettings();
let quickResize;
globalThis.ResizeObserver = class {constructor(callback){quickResize=callback;}observe(){}};
let operations=0; const marks=[];
let keyMap='vim',escapes=0,source='before chosen after',selection={from:{line:0,ch:7},to:{line:0,ch:13}},mark,doc={},selected=true;
globalThis.CodeMirror = {Vim:{handleKey(_,key){assert.equal(key,'<Esc>');escapes++;}}};
const events={},editor={
  on(name,callback){events[name]=callback;},getDoc:()=>doc,getOption:name=>name==='keyMap'?keyMap:false,
  somethingSelected:()=>selected,listSelections:()=>[selection],
  getCursor:key=>selection[key],getValue:()=>source,getRange:(from,to)=>source.slice(from.ch,to.ch),
  charCoords:pos=>({top:pos.ch===selection.from.ch?700:710,bottom:730}),
  markText(from,to){mark={from:{...from},to:{...to},find(){return this.cleared?null:{from:this.from,to:this.to};},clear(){this.cleared=true;}};marks.push(mark);return mark;},
  indexFromPos:pos=>pos.ch,posFromIndex:ch=>({line:0,ch}),setCursor(){},focus(){},
  operation(fn){operations++;fn();},
  replaceRange(text,from,to,origin){assert.equal(origin,'codex-chat');source=source.slice(0,from.ch)+text+source.slice(to.ch);},
};
let calls=[],answer={status:'done',reply:'Suggestion',replacement:'revised',segments:[['revised','color']]},deferred=null;
const request=async(url,options)=>{
  calls.push({url,body:options?JSON.parse(options.body):null});
  if(url==='/chat/history')return {messages:[],revision:0};
  if(url==='/chat')return deferred?await deferred:{id:'job'};
  if(url==='/chat/context')return {available:true,count:12,truncated:false};
  if(url==='/chat/models')return {models:[{id:'test-model',name:'Test Model',efforts:['low','high'],default_effort:'low'}, {id:'other',name:'Other Model',efforts:['low'],default_effort:'low'}]};
  if(url.startsWith('/chat?id='))return answer;
  return {};
};
let painted=[];
const chat=attachSelectionChat(editor,request,items=>painted=[...items]);
assert.equal(el('#annotations-send').hidden,true);
// A closed popover has zero width; pin its right edge without measuring it.
el('#annotations-review').offsetWidth=0;
el('#annotations-review').events.beforetoggle({newState:'open'});
assert.equal(el('#annotations-review').style.left,'auto');
assert.equal(el('#annotations-review').style.right,'8px');
assert.equal(el('#annotations-review').style.top,'786px');
assert.equal(el('#annotations-toggle').attributes['aria-expanded'],'true');
el('#annotations-review').events.beforetoggle({newState:'closed'});
assert.equal(el('#annotations-toggle').attributes['aria-expanded'],'false');
assert.equal(colorReplacement('raw',''),'raw');
assert.equal(colorReplacement('','blue'),'');
assert.equal(colorReplacement('text% comment','blue',[['text','color'],['% comment','']]),'{\\color{blue}text}% comment');
assert.equal(colorReplacement('$x+y=z$ accurate and stable.','blue',[['$x+y=z$ ',''],['accurate','color'],[' and stable.','']]),'$x+y=z$ {\\color{blue}accurate} and stable.');
assert.equal(colorReplacement('$x-y$','red',[['$x',''],['-','mathbin'],['y$','']]),'$x\\mathbin{\\color{red}-}y$');
assert.equal(colorReplacement('raw','red',[['different','color']]),'raw');
// The quick menu can discover and choose models before the full panel is ever opened.
el('#chat-quick-menu').onclick();
el('#chat-quick-settings').events.beforetoggle({newState:'open'});
await Promise.resolve();
assert.equal(calls.filter(call=>call.url==='/chat/models').length,1);
assert.equal(el('#chat-panel').hidden,true);assert.equal(el('#chat-quick').open,true);
el('#chat-quick-models').children.find(button=>button.textContent==='Test Model ›').onclick();
assert.equal(el('#chat-model').value,'test-model');
assert.deepEqual(el('#chat-quick-efforts').children.map(button=>button.textContent),['默认 · 低','低','高']);
el('#chat-quick-efforts').children.find(button=>button.textContent==='高').onclick();
assert.equal(el('#chat-effort').value,'high');assert.equal(el('#chat-quick').open,true);
el('#chat-quick-models').children.find(button=>button.textContent==='Test Model ›').onclick();
assert.equal(el('#chat-effort').value,'high','Reopening the same model retains the chosen effort.');
el('#chat-quick-models').children.find(button=>button.textContent==='Other Model ›').onclick();
assert.equal(el('#chat-effort').value,'');assert.equal(el('#chat-quick-efforts').children.length,2);
el('#chat-quick-models').children.find(button=>button.textContent==='跟随 Codex 默认').onclick();
assert.equal(el('#chat-model').value,'');assert.equal(el('#chat-effort').disabled,true);
el('#chat-quick').hidePopover();
chat.open();assert.equal(el('#chat-selection').textContent,'chosen');
await Promise.resolve();
el('#chat-model').value='test-model';el('#chat-model').onchange();
el('#chat-effort').value='high';el('#chat-effort').onchange();
assert.equal(el('#chat-quick-efforts').children.find(button=>button.textContent==='高').attributes['aria-pressed'],'true');
el('#chat-input').value='Remember my terminology.';
await el('#chat-form').onsubmit({preventDefault(){}});
assert.equal(calls.find(call=>call.url==='/chat').body.model,'test-model');
assert.equal(calls.find(call=>call.url==='/chat').body.effort,'high');
assert.equal(el('#chat-proposal').hidden,false);
const chooseColor=value=>{el('#chat-color').value=value;el('#chat-color').onchange();};
chooseColor('blue');
assert.equal(el('#chat-color').value,'blue');
assert.equal(el('#chat-replacement').textContent,'{\\color{blue}revised}');
chooseColor('');
assert.equal(el('#chat-replacement').textContent,'revised');
el('#chat-close').onclick();el('#chat-view').onclick();assert(el('#settings-menu').hidden);
assert.equal(el('#chat-proposal').hidden,false,'Reopening the same selection keeps the proposal.');
source='before CHOSEN after';el('#chat-apply').onclick();
assert.equal(source,'before CHOSEN after');assert.match(el('#chat-status').textContent,/选区内容已变化/);
source='before chosen after';
// A user edit outside the range moves its marker; it must be preserved when applying.
source='extra '+source;mark.from.ch+=6;mark.to.ch+=6;
el('#chat-apply').onclick();assert.equal(source,'extra before revised after');assert.equal(escapes,1);
assert.equal(el('#chat-proposal').hidden,true);
el('#chat-input').value='Use that terminology.';
answer.segments=[['revised','']];
await el('#chat-form').onsubmit({preventDefault(){}});
const followup=calls.filter(call=>call.url==='/chat').at(-1).body;
assert(followup.messages.some(message=>message.content==='Remember my terminology.'));
assert(followup.messages.some(message=>message.role==='assistant'));
assert.equal(followup.selection,'revised');assert.equal(followup.source,source);
chooseColor('red');
keyMap='default';const beforeStandardApply=escapes;
el('#chat-apply').onclick();assert.equal(source,'extra before revised after','An unchanged response must not add color.');
assert.equal(escapes,beforeStandardApply,'Applying a proposal in standard mode must not invoke Vim.');
assert.match(el('#chat-status').textContent,/Ctrl\+Z/);keyMap='vim';
el('#chat-model').value='other';el('#chat-model').onchange();
assert.equal(el('#chat-effort').value,'');assert.equal(el('#chat-effort').children.length,2);
el('#chat-model').value='';el('#chat-model').onchange();assert.equal(el('#chat-effort').disabled,true);
chooseColor('');
await el('#chat-end').onclick();assert.equal(el('#chat-panel').hidden,true);assert.equal(el('#chat-messages').children.length,0);
selection={from:{line:0,ch:13},to:{line:0,ch:20}};
chat.open();el('#chat-input').value='New conversation';
await el('#chat-form').onsubmit({preventDefault(){}});
assert.equal(calls.filter(call=>call.url==='/chat').at(-1).body.messages.length,1);
let release;deferred=new Promise(resolve=>release=resolve);
el('#chat-input').value='Slow request';const pending=el('#chat-form').onsubmit({preventDefault(){}});
await el('#chat-end').onclick();release({id:'late-job'});await pending;
assert(calls.some(call=>call.url==='/chat/cancel'&&call.body.id==='late-job'));
assert.equal(el('#chat-messages').children.length,0,'A late reply cannot revive an ended conversation.');
deferred=null;source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};
chat.open();el('#chat-input').value='Keep my full-panel draft.';
el('#chat-model').value='test-model';el('#chat-model').onchange();el('#chat-effort').value='high';
chooseColor('blue');
el('#chat-close').onclick();el('#chat-quick-menu').onclick();
assert.equal(el('#chat-panel').hidden,true);
assert.equal(el('#chat-quick-input').placeholder,'写下这处的修改要求…');
assert.equal(el('#chat-quick-send').attributes['aria-label'],'添加批注');assert.equal(el('#chat-quick-send').textContent,'','Opening must preserve the circular action SVG');
assert.equal(el('#chat-quick-input').value,'');
assert(!elements.has('#chat-quick-selection'),'The composer never copies the selected text into the dialog.');
const sent=calls.filter(call=>call.url==='/chat').length;
el('#chat-quick-input').value='Polish this passage';
selection={from:{line:0,ch:0},to:{line:0,ch:6}};
await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(painted[0].original,'chosen','Capture the selection before focus moves.');
assert.equal(calls.filter(call=>call.url==='/chat').length,sent,'Adding a comment never calls the model.');
assert.equal(source,'before chosen after');assert.equal(chat.hasAnnotations,true);
assert.equal(el('#annotations-toggle').textContent,'批注 · 1');
assert.equal(el('#annotations-send').hidden,false);
selection={from:{line:0,ch:14},to:{line:0,ch:19}};
chat.openQuick({left:100,top:100,pdf:{pdf_revision:'build',rectangles:[{page:2,rect:[1,2,3,4]}]}});
el('#chat-quick-input').value='Rewrite the ending';await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(painted.length,2);assert.equal(painted[1].pdf.rectangles[0].page,2);
el('#annotations-list').children[0].onclick();
assert.equal(el('#chat-quick-input').value,'Polish this passage');assert.equal(el('#chat-quick-delete').hidden,false);
assert.equal(el('#chat-quick-send').attributes['aria-label'],'保存批注');assert.equal(el('#chat-quick-send').textContent,'');
el('#chat-quick-input').value='Use precise language';await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(painted.length,2);assert.equal(painted[0].request,'Use precise language');
// Changes outside both comments move the markers and must survive the batch.
source='extra '+source;for(const item of marks.filter(item=>!item.cleared)){item.from.ch+=6;item.to.ch+=6;}
answer={status:'done',reply:'Both updated.',replacement:null,replacements:[
  {id:2,replacement:'ending',segments:[['ending','color']]},
  {id:1,replacement:'revised',segments:[['revised','color']]}]};
deferred=new Promise(resolve=>release=resolve);
const batchPending=el('#annotations-send').onclick();
assert.equal(el('#annotations-send').attributes['aria-busy'],'true');assert.equal(el('#annotations-stop').hidden,false);
assert.equal(el('#chat-quick-brain').disabled,true);assert.equal(el('#chat-quick-input').readOnly,true);
release({id:'batch-job'});await batchPending;deferred=null;
const batchBody=calls.filter(call=>call.url==='/chat').at(-1).body;
assert.equal(batchBody.annotations.length,2);assert.equal(batchBody.annotations[0].start,13);
assert.equal(batchBody.model,'test-model');assert.equal(batchBody.effort,'high');
assert.match(batchBody.request_id,/^[0-9a-f]{32}$/);
assert.equal(batchBody.messages.at(-1).content,'#1\nUse precise language\n\n#2\nRewrite the ending');
assert.equal(batchBody.annotations[0].selection,'chosen','The selection remains request context, separate from the conversation.');
assert.equal(source,'extra before {\\color{blue}revised} {\\color{blue}ending}');
assert.equal(operations,1,'Apply the complete batch in one undoable editor operation.');
assert.equal(el('#chat-input').value,'Keep my full-panel draft.');assert.equal(el('#chat-panel').hidden,true);
assert.equal(painted.length,0);assert.equal(el('#annotations-send').disabled,true);
assert.equal(el('#annotations-send').hidden,true);
assert.equal(el('#annotations-send').attributes['aria-busy'],'false');assert.equal(el('#annotations-status').textContent,'Both updated.');
// Identical words have separate source anchors; non-BMP text must use Python offsets on the wire.
chooseColor('');
source='😀 chosen gap chosen after';selection={from:{line:0,ch:3},to:{line:0,ch:9}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='First occurrence';
await el('#chat-quick-form').onsubmit({preventDefault(){}});
selection={from:{line:0,ch:14},to:{line:0,ch:20}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Second occurrence';
await el('#chat-quick-form').onsubmit({preventDefault(){}});
answer={status:'error',error:'Offline'};await el('#annotations-send').onclick();
assert.equal(painted.length,2);assert.equal(el('#annotations-status').textContent,'Offline');
const unicodeBody=calls.filter(call=>call.url==='/chat').at(-1).body;
assert.deepEqual(unicodeBody.annotations.map(item=>item.start),[2,13]);
// Reject an incomplete response before touching either range.
answer={status:'done',reply:'Partial',replacement:null,replacements:[{id:3,replacement:'first'}]};
await el('#annotations-send').onclick();assert.equal(source,'😀 chosen gap chosen after');assert.equal(painted.length,2);
assert.match(el('#annotations-status').textContent,/不完整/);
answer={status:'done',reply:'Changed',replacement:null,replacements:[{id:3,replacement:'first'},{id:4,replacement:'second'}]};
deferred=new Promise(resolve=>release=resolve);const staleBatch=el('#annotations-send').onclick();
source='😀 chosen gap CHOSEN after';release({id:'stale-batch'});await staleBatch;deferred=null;
assert.equal(source,'😀 chosen gap CHOSEN after','One stale selection must prevent every edit.');
assert.equal(painted.length,2);assert.match(el('#annotations-status').textContent,/未应用任何/);
const beforeStaleSend=calls.filter(call=>call.url==='/chat').length;
await el('#annotations-send').onclick();assert.equal(calls.filter(call=>call.url==='/chat').length,beforeStaleSend);
source='😀 chosen gap chosen after';
// Cancelling a late-starting batch keeps all notes, including after its job id arrives.
deferred=new Promise(resolve=>release=resolve);const cancelledBatch=el('#annotations-send').onclick();
el('#annotations-stop').onclick();release({id:'cancelled-batch'});await cancelledBatch;deferred=null;
assert(calls.some(call=>call.url==='/chat/cancel'&&call.body.id==='cancelled-batch'));assert.equal(painted.length,2);
// Overlapping new notes are rejected; cancelling does not discard a saved note.
selection={from:{line:0,ch:4},to:{line:0,ch:8}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Overlapping';
await el('#chat-quick-form').onsubmit({preventDefault(){}});assert.equal(painted.length,2);
assert.match(el('#chat-quick-status').textContent,/重叠/);el('#chat-quick-cancel').onclick();
el('#annotations-list').children[0].onclick();el('#chat-quick-delete').onclick();assert.equal(painted.length,1);
answer={status:'done',reply:'An explanation.',replacement:null,replacements:[{id:4,replacement:null}]};
await el('#annotations-send').onclick();assert.equal(source,'😀 chosen gap chosen after');assert.equal(painted.length,0);
// Dismissing a populated composer saves it locally; draft protection warns before leaving.
source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Save on dismiss';el('#chat-quick').hidePopover();
assert.equal(painted.length,1);assert.equal(painted[0].request,'Save on dismiss');
let warned=false;windowEvents.beforeunload({preventDefault(){warned=true;}});assert(warned);
await el('#chat-end').onclick();assert.equal(chat.hasAnnotations,true,'New chat preserves pending comments.');
events.swapDoc();assert.equal(chat.hasAnnotations,false);
selected=false;el('#chat-quick-menu').onclick();assert.equal(el('#chat-quick-send').disabled,true);
await el('#chat-end').onclick();assert.equal(el('#chat-quick').open,false);
selected=true;chat.open();assert.equal(el('#chat-selection').textContent,'chosen');
el('#chat-close').onclick();chat.openQuick({left:110,top:220});
assert.equal(el('#chat-quick').style.left,'110px');assert.equal(el('#chat-quick').style.top,'742px');
assert.equal(el('#chat-panel').hidden,true);assert.equal(el('#chat-quick-send').disabled,false);
assert.equal(chat.busy,false);
// Source and PDF share placement, with room below the selection or a fallback above it.
chat.openQuick({left:110,top:220,selectionTop:180,selectionBottom:250});
assert.equal(el('#chat-quick').style.top,'262px');
const handle=el('#chat-quick-handle'), quick=el('#chat-quick');
// Empty input collapses, typing grows only to 160 px, and drafts/internal controls keep it expanded.
el('#chat-quick-input').value='';quick.events.focusout({relatedTarget:null});
assert.equal(quick.dataset.expanded,'false');assert.equal(el('#chat-quick-form').style.height,'48px');
el('#chat-quick-input').events.focus();assert.equal(quick.dataset.expanded,'true');assert.equal(el('#chat-quick-form').style.height,'116px');
el('#chat-quick-input').scrollHeight=240;el('#chat-quick-input').value='A long\nquestion';el('#chat-quick-input').events.input();
assert.equal(el('#chat-quick-input').style.height,'160px');assert.equal(el('#chat-quick-form').style.height,'208px');
quick.events.focusout({relatedTarget:null});assert.equal(quick.dataset.expanded,'true');
el('#chat-quick-input').value='';el('#chat-quick-input').scrollHeight=68;
el('#chat-quick-settings').open=true;quick.events.focusout({relatedTarget:null});assert.equal(quick.dataset.expanded,'true');
el('#chat-quick-settings').hidePopover();
el('#chat-quick-input').events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
assert.equal(quick.dataset.expanded,'false');assert.equal(quick.open,true);
el('#chat-quick-input').events.click();assert.equal(quick.dataset.expanded,'true');
el('#chat-model').value='test-model';el('#chat-model').onchange();
el('#chat-quick-effort').onclick();assert.equal(el('#chat-effort').value,'low');
el('#chat-quick-effort').onclick();assert.equal(el('#chat-effort').value,'high');
el('#chat-quick-effort').onclick();assert.equal(el('#chat-effort').value,'');
assert.equal(el('#chat-quick-model-name').textContent,'Test Model');
el('#chat-quick-input').value='Keep this draft';const captured=mark;
handle.onpointerdown({button:2});assert.equal(quick.dataset.dragging,undefined);
handle.onpointerdown({button:0,pointerId:1,clientX:140,clientY:267,preventDefault(){}});
handle.onpointermove({pointerId:2,clientX:300,clientY:400});assert.equal(quick.style.left,'110px');
handle.onpointermove({pointerId:1,clientX:240,clientY:317});
assert.equal(quick.style.left,'210px');assert.equal(quick.style.top,'312px');
assert.equal(quick.open,true);assert.equal(mark,captured);assert.equal(captured.cleared,undefined);
assert.equal(el('#chat-quick-input').value,'Keep this draft');
handle.onpointermove({pointerId:1,clientX:2000,clientY:-100});
assert.equal(quick.style.left,'672px');assert.equal(quick.style.top,'8px');
handle.onpointerup({pointerId:1});assert.equal(quick.dataset.dragging,undefined);assert.equal(handle.capture,null);
handle.onpointermove({pointerId:1,clientX:240,clientY:317});assert.equal(quick.style.top,'8px');
handle.onkeydown({key:'ArrowDown',preventDefault(){}});assert.equal(quick.style.top,'18px');
window.innerWidth=400;windowEvents.resize();assert.equal(quick.style.left,'72px');window.innerWidth=1000;
handle.onpointerdown({button:0,pointerId:3,clientX:80,clientY:20,preventDefault(){}});
handle.onpointercancel({pointerId:3});assert.equal(handle.capture,null);
handle.onpointerdown({button:0,pointerId:4,clientX:80,clientY:20,preventDefault(){}});
quick.hidePopover();assert.equal(handle.capture,null);assert.equal(quick.dataset.dragging,undefined);
// Expansion near the bottom stays above the captured selection; manually moved cards stay put.
quick.offsetWidth=480;quick.offsetHeight=208;
chat.openQuick({left:900,top:700,selectionTop:620,selectionBottom:720});quickResize();
assert.equal(quick.style.left,'512px');assert.equal(quick.style.top,'400px');
handle.onkeydown({key:'ArrowUp',preventDefault(){}});quick.offsetHeight=116;quickResize();
assert.equal(quick.style.top,'390px');
quick.hidePopover();quick.offsetWidth=320;quick.offsetHeight=46;
console.log('PASS: selection-aware placement, captured pointer drag, bounds, keyboard, resize, cancellation and preserved draft/selection');
console.log('PASS: adaptive composer height, collapse/draft state, supported effort cycling and expansion around selection');
console.log('PASS: full chat, queued comments, editing/deletion, batch send/apply, Unicode anchors, atomic stale protection, retry and cancellation');

// A reloaded editor restores project questions and uses them after changing selections.
source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};doc={};selected=true;
let resumedBody;
const resumedRequest=async(url,options)=>{
  if(url==='/chat/history')return {revision:4,messages:[{role:'user',content:'Keep energy norm.',selection:'Old passage.'},
    {role:'assistant',content:JSON.stringify({reply:'Terminology remembered.',replacement:null})}]};
  if(url==='/chat'){resumedBody=JSON.parse(options.body);return {id:'resumed-job'};}
  if(url==='/chat?id=resumed-job')return {status:'done',reply:'Continued.',replacement:null,memory_revision:6};
  return request(url,options);
};
const resumed=attachSelectionChat(editor,resumedRequest);resumed.open();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(el('#chat-messages').children.length,2);
assert.equal(el('#chat-messages').children[1].children[1].textContent,'Terminology remembered.');
el('#chat-input').value='Explain this new selection.';await el('#chat-form').onsubmit({preventDefault(){}});
assert.equal(resumedBody.remember,true);assert.equal(resumedBody.memory_revision,4);
assert(resumedBody.messages.some(message=>message.content==='Keep energy norm.'));
assert.equal(resumedBody.selection,'chosen');
console.log('PASS: project chat rehydration and remembered context across selections');
