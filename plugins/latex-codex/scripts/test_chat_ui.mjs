// Run: node test_chat_ui.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachSelectionChat,colorReplacement} from './vendor/latex-chat.mjs';
import {initSettings} from './vendor/latex-settings.mjs';
import {writingStyles,readWritingStyle,restoreWritingStyle,annotationRequest} from './vendor/latex-writing-styles.mjs';
const promptFile=(name,text)=>({name,size:new TextEncoder().encode(text).length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
assert.equal(writingStyles.length,4);
assert(writingStyles.every(style=>style.prompt.length>0 && style.prompt.length<=12000));
assert.deepEqual(await readWritingStyle(promptFile('my-style.txt','Keep notation stable.')),{name:'my-style',prompt:'Keep notation stable.'});
for(const file of [promptFile('style.exe','text'),promptFile('style.md',' '),promptFile('style.md','a'.repeat(12001)),
  {...promptFile('style.txt','text'),size:65537}, {name:'bad.txt',size:2,arrayBuffer:async()=>new Uint8Array([255,254]).buffer}]) {
  await assert.rejects(()=>readWritingStyle(file));
}
assert.equal(annotationRequest({request:'Keep this unchanged.'}),'Keep this unchanged.');
assert.equal(restoreWritingStyle(JSON.stringify({id:'tao-en'})),writingStyles.find(style=>style.id==='tao-en'));
assert.deepEqual(restoreWritingStyle(JSON.stringify({name:'Imported',prompt:'Preserve notation.'})),
  {id:'custom-saved',name:'Imported',prompt:'Preserve notation.'});
for(const value of [null,'broken','null','{}',JSON.stringify({id:'missing'}),
  JSON.stringify({name:' ',prompt:'text'}),JSON.stringify({name:'x',prompt:' '}),
  JSON.stringify({name:'x',prompt:'a'.repeat(12001)})]) assert.equal(restoreWritingStyle(value),null);
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',hidden:true,children:[],style:{},dataset:{},attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},matches(){return !!this.open;},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    events:{},offsetWidth:320,offsetHeight:46,getBoundingClientRect(){return {left:950,top:750,bottom:780};},
    scrollHeight:68,contains(node){return !!node && node===this;},
    clientWidth:500,querySelector(){return null;},
    focus(){this.events.focus?.();},showPopover(){this.open=true;},hidePopover(){this.open=false;this.events.beforetoggle?.({newState:'closed'});},addEventListener(name,handler){this.events[name]=handler;}});
  return elements.get(id);
}
globalThis.document = {querySelector:el,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}},createElement:()=>el(Symbol())};
const windowEvents = {};
globalThis.window = {innerWidth:1000,innerHeight:800,addEventListener(name,handler){windowEvents[name]=handler;}};
window.dispatchEvent=()=>{};
const storedPreferences=new Map([['latex-codex-language','zh-CN']]);
globalThis.localStorage={getItem:key=>storedPreferences.get(key)??null,setItem:(key,value)=>storedPreferences.set(key,value)};
initSettings();
let quickResize;
globalThis.ResizeObserver = class {constructor(callback){this.callback=callback;}observe(target){if(target===el('#chat-quick'))quickResize=this.callback;}disconnect(){}};
let operations=0; const marks=[];
let keyMap='vim',escapes=0,source='before chosen after',selection={from:{line:0,ch:7},to:{line:0,ch:13}},mark,doc={},selected=true;
globalThis.CodeMirror = {Vim:{handleKey(_,key){assert.equal(key,'<Esc>');escapes++;}}};
const events={},editor={
  on(name,callback){events[name]=callback;},getDoc:()=>doc,getOption:name=>name==='keyMap'?keyMap:false,
  getWrapperElement:()=>el('#wrapper'),scrollIntoView(){},
  somethingSelected:()=>selected,listSelections:()=>[selection],
  getCursor:key=>selection[key],getValue:()=>source,getRange:(from,to)=>source.slice(from.ch,to.ch),
  charCoords:pos=>({top:pos.ch===selection.from.ch?700:710,bottom:730}),
  markText(from,to,options={}){mark={options,from:{...from},to:{...to},find(){return this.cleared?null:{from:this.from,to:this.to};},clear(){this.cleared=true;},changed(){}};marks.push(mark);return mark;},
  indexFromPos:pos=>pos.ch,posFromIndex:ch=>({line:0,ch}),setCursor(){},focus(){},
  operation(fn){operations++;fn();},
  replaceRange(text,from,to,origin){
    assert.equal(origin,'codex-chat');source=source.slice(0,from.ch)+text+source.slice(to.ch);
    const shift=text.length-(to.ch-from.ch);
    for(const tracked of marks.filter(item=>!item.cleared)){
      if(tracked.from.ch>=to.ch){tracked.from.ch+=shift;tracked.to.ch+=shift;}
      else if(tracked.to.ch>from.ch)tracked.clear();
    }
  },
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
let painted=[],paintedBusy=[];
let annotationSaves=[],saveFailure=false,saveWait=null;
const chat=attachSelectionChat(editor,request,items=>{painted=[...items];paintedBusy=items.map(item=>!!item.review?.busy);},async(after,change)=>{
  assert.equal(source,change.before,'Persist before changing the editor or clearing markers.');
  assert(painted.length);
  if(saveWait)await saveWait;
  if(saveFailure)throw new Error('History unavailable');
  annotationSaves.push({after,change});
});
const reviewActions=item=>item.review.root.children.at(-1).children;
const keepReview=item=>reviewActions(item).at(-1).onclick();
const undoReview=item=>reviewActions(item).at(-2).onclick();
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
const styleSelect=el('#chat-quick-style');
assert.equal(styleSelect.value,'');assert.equal(styleSelect.children.length,6);
assert.equal(el('#chat-style-control').dataset.active,'false');
let filePickerOpened=0;el('#chat-style-file').click=()=>filePickerOpened++;
styleSelect.value='__import__';styleSelect.onchange();
assert.equal(filePickerOpened,1);assert.equal(styleSelect.value,'','Canceling the file picker leaves no style selected.');
el('#chat-style-file').files=[promptFile('My prompt.md','Prefer one concise paragraph.')];
await el('#chat-style-file').onchange();
assert.match(styleSelect.value,/^custom-/);assert.equal(el('#chat-style-control').dataset.active,'true');
const importedStyle=styleSelect.value;
styleSelect.value='__import__';styleSelect.onchange();
assert.equal(styleSelect.value,importedStyle,'Opening import retains the selected style until another file is loaded.');
el('#chat-style-file').files=[promptFile('empty.txt','')];await el('#chat-style-file').onchange();
assert.match(el('#chat-quick-status').textContent,/1–12000/);assert.match(styleSelect.value,/^custom-/,'Failed imports preserve the current style.');
styleSelect.value='tao-en';styleSelect.onchange();
assert.equal(el('#chat-style-control').dataset.active,'true');
assert.equal(calls.filter(call=>call.url==='/chat').length,sent,'Selecting/importing a style never sends a model request.');
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
assert.equal(styleSelect.value,'tao-en','New source/PDF annotations reuse the selected global style.');
styleSelect.value='';styleSelect.onchange();
el('#chat-quick-input').value='Rewrite the ending';await el('#chat-quick-form').onsubmit({preventDefault(){}});
assert.equal(painted.length,2);assert.equal(painted[1].pdf.rectangles[0].page,2);
assert.equal(painted[0].style.id,'tao-en');assert.equal(painted[1].style,null,'Clearing the default does not change an earlier comment.');
el('#annotations-list').children[0].onclick();
assert.equal(styleSelect.value,'tao-en','Editing a queued comment restores its own style.');
assert.equal(storedPreferences.get('latex-codex-writing-style'),'null','Reopening an older comment does not change the default.');
styleSelect.value='shelah-en';styleSelect.onchange();
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
assert.match(batchBody.annotations[0].request,/SHELAH COMPACT/);
assert.match(batchBody.annotations[0].request,/Current annotation request \(takes priority\):\nUse precise language$/);
assert(!batchBody.annotations[0].request.includes('TAO COMPACT'),'The edited style replaces the old one.');
assert.equal(batchBody.annotations[1].request,'Rewrite the ending','One comment’s style never leaks into another.');
assert.equal(source,'extra before chosen after','Send must only display reviews, without changing source or saving suggestions.');
assert.equal(annotationSaves.length,0);assert.equal(painted.length,2);
assert(painted.every(item=>item.review));assert.equal(el('#annotations-send').hidden,true);
const firstReview=painted[0],secondReview=painted[1];
source='latest '+source;for(const item of marks.filter(item=>!item.cleared)){item.from.ch+=7;item.to.ch+=7;}
await keepReview(secondReview);
assert.equal(source,'latest extra before chosen {\\color{blue}ending}');
assert.equal(painted.length,1);assert.equal(painted[0],firstReview,'Keep must not dismiss another review.');
undoReview(firstReview);
assert.equal(source,'latest extra before chosen {\\color{blue}ending}','Undo preserves original text and other accepted edits.');
assert.equal(annotationSaves[0].change.before,'latest extra before chosen after');
assert.equal(annotationSaves[0].after,source);
assert.equal(annotationSaves[0].change.reply,'Both updated.');
assert.deepEqual(annotationSaves[0].change.items.map(item=>[item.selection,item.request,item.replacement]),[
  ['after','Rewrite the ending','{\\color{blue}ending}']]);
assert.match(annotationSaves[0].change.id,/^[0-9a-f]{32}$/);
assert.equal(operations,1,'Keep applies only its own range in one undoable editor operation.');
assert.equal(el('#chat-input').value,'Keep my full-panel draft.');assert.equal(el('#chat-panel').hidden,true);
assert.equal(painted.length,0);assert.equal(el('#annotations-send').disabled,true);
assert.equal(el('#annotations-send').hidden,true);
assert.equal(el('#annotations-send').attributes['aria-busy'],'false');
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
// A history failure during Keep preserves both reviews and the complete source.
saveFailure=true;await el('#annotations-send').onclick();
const failedReview=painted[0],remainingReview=painted[1];
await keepReview(failedReview);
assert.equal(source,'😀 chosen gap chosen after');assert.equal(painted.length,2);
assert.equal(operations,1);assert.equal(annotationSaves.length,1);
assert.match(reviewActions(failedReview)[0].textContent,/History unavailable/);
assert.equal(reviewActions(failedReview).at(-1).disabled,false);saveFailure=false;
assert(paintedBusy.every(value=>!value),'PDF controls must be repainted as enabled after a failed Keep.');
undoReview(failedReview);undoReview(remainingReview);assert.equal(painted.length,0);
selection={from:{line:0,ch:14},to:{line:0,ch:20}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Explain this';await el('#chat-quick-form').onsubmit({preventDefault(){}});
answer={status:'done',reply:'An explanation.',replacement:null,replacements:[{id:5,replacement:null}]};
await el('#annotations-send').onclick();assert.equal(source,'😀 chosen gap chosen after');assert.equal(painted.length,0);
assert.equal(annotationSaves.length,2);
assert.equal(annotationSaves[1].change.items[0].start,13);
assert.equal(annotationSaves[1].change.items[0].replacement,null,'Keep explanation-only batches in history too.');
assert.equal(annotationSaves[1].after,annotationSaves[1].change.before);
// Accept left-to-right: the later review follows the first replacement's new length.
source='before chosen after';selection={from:{line:0,ch:0},to:{line:0,ch:6}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='First change';await el('#chat-quick-form').onsubmit({preventDefault(){}});
selection={from:{line:0,ch:14},to:{line:0,ch:19}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Later change';await el('#chat-quick-form').onsubmit({preventDefault(){}});
const [left,right]=painted;
answer={status:'done',reply:'Review both.',replacement:null,replacements:[
  {id:left.id,replacement:'A much longer beginning'},{id:right.id,replacement:'end'}]};
await el('#annotations-send').onclick();assert.equal(chat.hasAnnotations,true);
saveWait=new Promise(resolve=>release=resolve);const accepting=keepReview(left);
assert.equal(chat.busy,true);assert.equal(reviewActions(right).at(-1).disabled,true);
const callsDuringSave=calls.length;el('#chat-input').value='Do not send during Keep';
await el('#chat-form').onsubmit({preventDefault(){}});await el('#chat-end').onclick();
assert.equal(calls.length,callsDuringSave);assert.equal(painted.length,2);
release();await accepting;saveWait=null;
assert.equal(source,'A much longer beginning chosen after');assert.equal(painted[0],right);
assert.equal(reviewActions(right).at(-1).disabled,false);
await keepReview(right);assert.equal(source,'A much longer beginning chosen end');
assert.equal(annotationSaves.at(-1).change.items[0].start,31);
assert.equal(annotationSaves.at(-1).change.items.length,1);assert.equal(chat.hasAnnotations,false);
// A stale suggestion never overwrites an edited range; the other suggestion can still be kept.
source='before chosen after';selection={from:{line:0,ch:0},to:{line:0,ch:6}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='First change';await el('#chat-quick-form').onsubmit({preventDefault(){}});
selection={from:{line:0,ch:14},to:{line:0,ch:19}};
chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Later change';await el('#chat-quick-form').onsubmit({preventDefault(){}});
const [staleReview,validReview]=painted;
answer.replacements=[{id:staleReview.id,replacement:'start'},{id:validReview.id,replacement:'end'}];
await el('#annotations-send').onclick();source='BEFORE chosen after';
const savedBeforeStale=annotationSaves.length;await keepReview(staleReview);
assert.equal(source,'BEFORE chosen after');assert.equal(annotationSaves.length,savedBeforeStale);
assert.match(reviewActions(staleReview)[0].textContent,/选区已变化/);
await keepReview(validReview);assert.equal(source,'BEFORE chosen end');
undoReview(staleReview);assert.equal(painted.length,0);assert.equal(source,'BEFORE chosen end');
// Independent review surfaces; changing settings never accepts an existing proposal.
const proofreadPreferences=new Map(),originalPreference=localStorage.getItem;
localStorage.getItem=key=>proofreadPreferences.has(key)?proofreadPreferences.get(key):originalPreference(key);
const reviewSettings=(sourceOn,pdfOn)=>{
  proofreadPreferences.set('latex-codex-proofread-editor',sourceOn?'on':'off');
  proofreadPreferences.set('latex-codex-proofread-pdf',pdfOn?'on':'off');
  windowEvents['latex-proofread-change']();
};
const queueReview=async()=>{
  source='before chosen after';selection={from:{line:0,ch:7},to:{line:0,ch:13}};
  chat.openQuick({left:100,top:100});el('#chat-quick-input').value='Replace this';await el('#chat-quick-form').onsubmit({preventDefault(){}});
  answer={status:'done',reply:'Changed.',replacement:null,replacements:[{id:painted.at(-1).id,replacement:'new'}]};
  await el('#annotations-send').onclick();
};
chooseColor('');reviewSettings(false,true);await queueReview();
const pdfOnly=painted[0];assert(pdfOnly.review);assert.equal(source,'before chosen after');
assert.equal(el('#annotations-toggle').hidden,false,'Hidden inline previews must still have an accessible review list.');
assert(!marks.some(mark=>!mark.cleared&&mark.options.replacedWith===pdfOnly.review.root));
assert(el('#annotations-list').children.includes(pdfOnly.review.root),'PDF-only reviews remain reviewable if preview compilation fails.');
editor.replaceRange('prefix ',{line:0,ch:0},{line:0,ch:0},'codex-chat');
reviewSettings(true,false);
const visibleMark=marks.find(mark=>!mark.cleared&&mark.options.replacedWith===pdfOnly.review.root);
assert.equal(visibleMark.from.ch,14,'Enabling source review uses the current, shifted annotation range.');
const savedBeforeSwitch=annotationSaves.length;reviewSettings(false,false);
assert.equal(source,'prefix before chosen after');assert.equal(annotationSaves.length,savedBeforeSwitch);
assert(el('#annotations-list').children.includes(pdfOnly.review.root));
await keepReview(pdfOnly);assert.equal(source,'prefix before new after');
await queueReview();assert.equal(source,'before new after');assert.equal(painted.length,0,'Both disabled applies new Send results directly.');
saveFailure=true;await queueReview();assert.equal(source,'before chosen after');assert.equal(painted.length,1);assert(!painted[0].review);
saveFailure=false;await el('#annotations-send').onclick();assert.equal(source,'before new after');assert.equal(painted.length,0);
reviewSettings(true,false);await queueReview();assert(painted[0].review);assert.equal(source,'before chosen after');undoReview(painted[0]);
reviewSettings(false,true);el('#filename').title='note.md';await queueReview();
assert.equal(source,'before new after','Markdown with editor review off has no available PDF review surface.');assert.equal(painted.length,0);
el('#filename').title='main.tex';reviewSettings(true,true);localStorage.getItem=originalPreference;
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
console.log('PASS: queued comments, per-range Keep/Undo, shifted Unicode anchors, stale protection, save exclusion, retry and cancellation');

// Discard an import that completes after leaving its original annotation.
styleSelect.value='';styleSelect.onchange();
el('#chat-quick-cancel').onclick();events.swapDoc();
chat.openQuick({left:100,top:100});
let finishImport;
el('#chat-style-file').files=[{name:'late.txt',size:5,arrayBuffer:()=>new Promise(resolve=>finishImport=resolve)}];
const importPending=el('#chat-style-file').onchange();
el('#chat-quick-cancel').onclick();chat.openQuick({left:100,top:100});
finishImport(new TextEncoder().encode('Later').buffer);await importPending;
assert.equal(styleSelect.value,'');assert(!styleSelect.children.some(option=>option.textContent==='late'));
styleSelect.value='tao-zh';styleSelect.onchange();styleSelect.value='';styleSelect.onchange();
assert.equal(el('#chat-style-control').dataset.active,'false','No style returns the Style control to its inactive appearance.');
el('#chat-quick-cancel').onclick();events.swapDoc();
assert.equal(styleSelect.children.length,6,'Document changes discard temporary imports.');
chat.openQuick({left:100,top:100});
styleSelect.value='tao-zh';styleSelect.onchange();
el('#chat-quick-cancel').onclick();events.swapDoc();chat.openQuick({left:100,top:100});
assert.equal(styleSelect.value,'tao-zh','Preset defaults survive cancellation and document switches.');
el('#chat-style-file').files=[promptFile('Persistent.txt','Use compact paragraphs.')];
await el('#chat-style-file').onchange();
const savedImport=JSON.parse(storedPreferences.get('latex-codex-writing-style'));
assert.equal(savedImport.name,'Persistent');assert.equal(savedImport.prompt,'Use compact paragraphs.');
el('#chat-quick-cancel').onclick();events.swapDoc();chat.openQuick({left:100,top:100});
assert.equal(styleSelect.value,'custom-saved','Imported defaults survive document switches.');
el('#chat-quick-cancel').onclick();
const reloadedStyleChat=attachSelectionChat(editor,request);reloadedStyleChat.openQuick({left:100,top:100});
assert.equal(styleSelect.value,'custom-saved','A new editor instance restores the saved imported prompt.');
assert.equal(el('#chat-style-control').dataset.active,'true');
styleSelect.value='';styleSelect.onchange();el('#chat-quick-cancel').onclick();
reloadedStyleChat.openQuick({left:100,top:100});assert.equal(styleSelect.value,'');
assert.equal(storedPreferences.get('latex-codex-writing-style'),'null');
el('#chat-quick-cancel').onclick();
console.log('PASS: per-comment snapshots, persistent style defaults, imported prompts, explicit clearing and stale import rejection');

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
