// Run: node test_chat_ui.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachSelectionChat,colorReplacement} from './vendor/latex-chat.mjs';
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',hidden:true,children:[],style:{},dataset:{},attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},matches(){return !!this.open;},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    events:{},offsetWidth:320,offsetHeight:46,getBoundingClientRect(){return {left:950,top:750,bottom:780};},
    focus(){},showPopover(){this.open=true;},hidePopover(){this.open=false;this.events.beforetoggle?.({newState:'closed'});},addEventListener(name,handler){this.events[name]=handler;}});
  return elements.get(id);
}
globalThis.document = {querySelector:el,createElement:()=>el(Symbol())};
const windowEvents = {};
globalThis.window = {innerWidth:1000,innerHeight:800,addEventListener(name,handler){windowEvents[name]=handler;}};
let escapes=0,source='before chosen after',selection={from:{line:0,ch:7},to:{line:0,ch:13}},mark,doc={},selected=true;
globalThis.CodeMirror = {Vim:{handleKey(_,key){assert.equal(key,'<Esc>');escapes++;}}};
const events={},editor={
  on(name,callback){events[name]=callback;},getDoc:()=>doc,getOption:()=>false,
  somethingSelected:()=>selected,listSelections:()=>[selection],
  getCursor:key=>selection[key],getValue:()=>source,getRange:(from,to)=>source.slice(from.ch,to.ch),
  charCoords:pos=>({top:pos.ch===selection.from.ch?700:710,bottom:730}),
  markText(from,to){mark={from:{...from},to:{...to},find(){return this.cleared?null:{from:this.from,to:this.to};},clear(){this.cleared=true;}};return mark;},
  indexFromPos:pos=>pos.ch,posFromIndex:ch=>({line:0,ch}),setCursor(){},focus(){},
  replaceRange(text,from,to,origin){assert.equal(origin,'codex-chat');source=source.slice(0,from.ch)+text+source.slice(to.ch);},
};
let calls=[],answer={status:'done',reply:'Suggestion',replacement:'revised',segments:[['revised','color']]},deferred=null;
const request=async(url,options)=>{
  calls.push({url,body:options?JSON.parse(options.body):null});
  if(url==='/chat')return deferred?await deferred:{id:'job'};
  if(url==='/chat/context')return {available:true,count:12,truncated:false};
  if(url==='/chat/models')return {models:[{id:'test-model',name:'Test Model',efforts:['low','high'],default_effort:'low'}, {id:'other',name:'Other Model',efforts:['low'],default_effort:'low'}]};
  if(url.startsWith('/chat?id='))return answer;
  return {};
};
const chat=attachSelectionChat(editor,request);
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
el('#chat-open').onclick();assert.equal(el('#chat-selection').textContent,'chosen');
await Promise.resolve();
el('#chat-model').value='test-model';el('#chat-model').onchange();
el('#chat-effort').value='high';el('#chat-effort').onchange();
assert.equal(el('#chat-quick-efforts').children.find(button=>button.textContent==='高').attributes['aria-pressed'],'true');
el('#chat-input').value='Remember my terminology.';
await el('#chat-form').onsubmit({preventDefault(){}});
assert.equal(calls.find(call=>call.url==='/chat').body.model,'test-model');
assert.equal(calls.find(call=>call.url==='/chat').body.effort,'high');
assert.equal(el('#chat-proposal').hidden,false);
const palette=el('#chat-colors').children;
palette.find(button=>button.textContent==='蓝色').onclick();
assert.equal(el('#chat-color').dataset.color,'blue');
assert.equal(el('#chat-replacement').textContent,'{\\color{blue}revised}');
palette.find(button=>button.textContent==='无').onclick();
assert.equal(el('#chat-replacement').textContent,'revised');
el('#chat-close').onclick();el('#chat-open').onclick();
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
palette.find(button=>button.textContent==='红色').onclick();
el('#chat-apply').onclick();assert.equal(source,'extra before revised after','An unchanged response must not add color.');
el('#chat-model').value='other';el('#chat-model').onchange();
assert.equal(el('#chat-effort').value,'');assert.equal(el('#chat-effort').children.length,2);
el('#chat-model').value='';el('#chat-model').onchange();assert.equal(el('#chat-effort').disabled,true);
palette.find(button=>button.textContent==='无').onclick();
el('#chat-end').onclick();assert.equal(el('#chat-panel').hidden,true);assert.equal(el('#chat-messages').children.length,0);
selection={from:{line:0,ch:13},to:{line:0,ch:20}};
el('#chat-open').onclick();el('#chat-input').value='New conversation';
await el('#chat-form').onsubmit({preventDefault(){}});
assert.equal(calls.filter(call=>call.url==='/chat').at(-1).body.messages.length,1);
let release;deferred=new Promise(resolve=>release=resolve);
el('#chat-input').value='Slow request';const pending=el('#chat-form').onsubmit({preventDefault(){}});
el('#chat-end').onclick();release({id:'late-job'});await pending;
assert(calls.some(call=>call.url==='/chat/cancel'&&call.body.id==='late-job'));
assert.equal(el('#chat-messages').children.length,0,'A late reply cannot revive an ended conversation.');
deferred=null;source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};
el('#chat-menu').onclick();el('#chat-input').value='Keep my full-panel draft.';
el('#chat-model').value='test-model';el('#chat-model').onchange();el('#chat-effort').value='high';
palette.find(button=>button.textContent==='蓝色').onclick();
el('#chat-close').onclick();el('#chat-quick-menu').onclick();
assert.equal(el('#chat-panel').hidden,true,'Opening the added popover must not open/change the full panel.');
assert.equal(el('#chat-quick').open,true);assert.equal(el('#chat-quick-input').placeholder,'询问 Codex…');
assert.equal(el('#chat-quick').style.left,'672px');assert.equal(el('#chat-quick').style.top,'642px');
el('#chat-quick-input').value='Quick question';
selection={from:{line:0,ch:0},to:{line:0,ch:6}};
answer={status:'done',reply:'Revised',replacement:'revised',segments:[['revised','color']]};
deferred=new Promise(resolve=>release=resolve);
const autoPending=el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(el('#chat-quick-send').attributes['aria-busy'],'true');assert.equal(el('#chat-quick-input').readOnly,true);
assert.equal(el('#chat-quick-brain').disabled,true);
assert.equal(el('#chat-quick').open,true);assert.equal(el('#chat-panel').hidden,true);
assert.equal(source,'before chosen after','Wait for the reply before applying.');
release({id:'auto-job'});await autoPending;deferred=null;
assert.equal(calls.filter(call=>call.url==='/chat').at(-1).body.selection,'chosen','Use the captured selection, not a later selection.');
assert.equal(calls.filter(call=>call.url==='/chat').at(-1).body.model,'test-model');
assert.equal(calls.filter(call=>call.url==='/chat').at(-1).body.effort,'high');
assert.equal(el('#chat-input').value,'Keep my full-panel draft.');assert.equal(el('#chat-quick-input').value,'');
assert.equal(el('#chat-quick').open,false);assert.equal(el('#chat-panel').hidden,true);
assert.equal(source,'before {\\color{blue}revised} after');assert.equal(el('#chat-proposal').hidden,true);
assert.equal(el('#chat-quick-send').attributes['aria-busy'],'false');assert.equal(el('#chat-quick-input').readOnly,false);
assert.equal(el('#chat-quick-brain').disabled,false);
const fullProposal=el('#chat-replacement').textContent, sent=calls.filter(call=>call.url==='/chat').length;
el('#chat-quick-menu').onclick();el('#chat-quick-input').value='Do not send stale source';
source='BEFORE chosen after';
await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(calls.filter(call=>call.url==='/chat').length,sent);assert.match(el('#chat-quick-status').textContent,/选区已变化/);
el('#chat-quick').hidePopover();assert.equal(el('#chat-replacement').textContent,fullProposal);
assert.equal(el('#chat-input').value,'Keep my full-panel draft.');
// Errors and questions stay in the popover; they never open the full panel or alter source.
source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};
el('#chat-quick-menu').onclick();el('#chat-quick-input').value='Retry me';
answer={status:'error',error:'Offline'};
await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(el('#chat-quick-status').textContent,'Offline');assert.equal(el('#chat-quick').open,true);
assert.equal(el('#chat-quick-input').value,'Retry me');assert.equal(el('#chat-quick-send').disabled,false);
assert.equal(source,'before chosen after');assert.equal(el('#chat-panel').hidden,true);
answer={status:'done',reply:'An explanation.',replacement:null};
await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(el('#chat-quick-status').textContent,'An explanation.');assert.equal(el('#chat-panel').hidden,true);
assert.equal(source,'before chosen after');
// A source edit during the request blocks the automatic replacement.
answer={status:'done',reply:'Revised',replacement:'revised',segments:[['revised','color']]};
el('#chat-quick-input').value='Change it';deferred=new Promise(resolve=>release=resolve);
const staleAuto=el('#chat-quick-form').onsubmit({preventDefault(){}});
source='before CHOSEN after';release({id:'stale-auto'});await staleAuto;deferred=null;
assert.equal(source,'before CHOSEN after');assert.match(el('#chat-quick-status').textContent,/未覆盖修改/);
assert.equal(el('#chat-quick-send').attributes['aria-busy'],'false');
// Dismissing an in-flight popover cancels even if the job id arrives late.
el('#chat-quick').hidePopover();source='before chosen after';el('#chat-quick-menu').onclick();
el('#chat-quick-input').value='Cancel me';deferred=new Promise(resolve=>release=resolve);
const cancelledAuto=el('#chat-quick-form').onsubmit({preventDefault(){}});
el('#chat-quick').hidePopover();release({id:'cancelled-auto'});await cancelledAuto;deferred=null;
assert(calls.some(call=>call.url==='/chat/cancel'&&call.body.id==='cancelled-auto'));
assert.equal(source,'before chosen after');assert.equal(el('#chat-panel').hidden,true);
assert.equal(el('#chat-quick-send').attributes['aria-busy'],'false');
selected=false;el('#chat-quick-menu').onclick();assert.equal(el('#chat-quick-send').disabled,true);
el('#chat-end').onclick();assert.equal(el('#chat-quick').open,false);assert.equal(el('#chat-quick-input').value,'');
selected=true;chat.open();assert.equal(el('#chat-selection').textContent,'chosen');
el('#chat-close').onclick();chat.openQuick({left:110,top:220});
assert.equal(el('#chat-quick').style.left,'110px');assert.equal(el('#chat-quick').style.top,'742px');
assert.equal(el('#chat-panel').hidden,true);assert.equal(el('#chat-quick-send').disabled,false);
assert.equal(chat.busy,false);
// Source and PDF share placement, with room below the selection or a fallback above it.
chat.openQuick({left:110,top:220,selectionTop:180,selectionBottom:250});
assert.equal(el('#chat-quick').style.top,'262px');
const handle=el('#chat-quick-handle'), quick=el('#chat-quick');
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
console.log('PASS: selection-aware placement, captured pointer drag, bounds, keyboard, resize, cancellation and preserved draft/selection');
console.log('PASS: full chat, automatic quick apply, shared model/effort/color, spinner lifecycle, inline errors, stale-source protection and dismissal cancellation');
