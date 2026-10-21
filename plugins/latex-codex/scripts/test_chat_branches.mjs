// Run: node test_chat_branches.mjs (stdlib; no browser or model required).
import assert from 'node:assert/strict';
import {attachChatBranches, renderChatQuestion} from './vendor/latex-chat-branches.mjs';
import {t} from './vendor/latex-settings.mjs';

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id,{nodeType:1,children:[],dataset:{},attributes:{},style:{setProperty(key,value){this[key]=value;}},events:{},hidden:true,value:'',scrollTop:0,scrollHeight:200,clientHeight:100,offsetWidth:8,offsetHeight:8,
    append(...items){for (const item of items) { item.parentElement = this; this.children.push(item); }},
    insertBefore(item,before){item.parentElement=this;this.children.splice(this.children.indexOf(before),0,item);},
    getBoundingClientRect(){return this.rect || {left:40,top:20,bottom:46,width:100,height:26};},
    replaceChildren(...items){this.children=[];this.append(...items);},
    setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},querySelector(){return null;},querySelectorAll(){return [];},
    setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},
    addEventListener(key,fn){this.events[key]=fn;},showPopover(){this.open=true;},hidePopover(){this.open=false;},focus(){this.focused=true;document.activeElement=this;},
    showModal(){this.open=true;},close(){this.open=false;},
    select(){this.selected=true;},remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(item=>item!==this);},
    contains(item){return item===this || this.children.some(child=>child.contains?.(item));},
    closest(selector){return this.className?.split(' ').includes(selector.slice(1))?this:this.parentElement?.closest(selector);}});
  return elements.get(id);
}
globalThis.document = {querySelector:selector=>element(selector.slice(1)),createElement:()=>{const node=element(Symbol());node.hidden=false;return node;},documentElement:{dataset:{}}};
const events = {};
let frameId=0;const frames=new Map();const flushFrames=()=>{const work=[...frames.values()];frames.clear();work.forEach(fn=>fn());};
globalThis.window = {innerWidth:1000,innerHeight:800,addEventListener(key,fn){events[key]=fn;},
  requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}};
const panel=element('chat-panel'), messages=element('chat-messages'), log=element('chat-branch-messages');
element('chat-text-menu').rect={width:290,height:40};
panel.hidden=false;
let sharedBusy=false,selected=null,calls=[],delayed=null,failed=false,renameFailed=false,deleteFailed=false;
const initial={thread:'main:0',root:'main:0',revision:2,project:'project',messages:[{id:1,role:'user',content:'Question'},
  {id:2,role:'assistant',content:JSON.stringify({reply:'A quoted phrase.'})}],quote:''};
const threads=[{id:'main:0',root:'main:0',parent:null,title:'First main'},{id:'main:9',root:'main:9',parent:null,title:'Second main'},
  {id:'old-empty',root:'main:0',parent:'main:0',title:'Unasked legacy branch',has_messages:false}];
let main={...initial}, counter=0, replyRevision=18, pendingBody;
const storage=new Map([['main:0',initial],['main:9',{...initial,thread:'main:9',root:'main:9',revision:9,messages:[]}]]);
const data=thread=>structuredClone({...storage.get(thread),threads});
const request=async(url,options)=>{
  const body=options?JSON.parse(options.body):null;calls.push({url,body});
  if (url==='/chat/branch') {
    const thread='branch-'+(++counter),parent=threads.find(node=>node.id===body.parent);
    threads.push({id:thread,root:parent.root,parent:parent.id,title:body.quote,quote:body.quote,has_messages:false});
    storage.set(thread,{thread,root:parent.root,revision:0,project:'project',messages:[],quote:body.quote});return data(thread);
  }
  if (url.startsWith('/chat/history?thread=')) return data(decodeURIComponent(url.split('=')[1]));
  if (url==='/chat/rename') {
    if (renameFailed) throw new Error('Rename offline');
    threads.find(node=>node.id===body.thread).title=body.title;
    return {thread:body.thread,title:body.title};
  }
  if (url==='/chat/delete') {
    if (deleteFailed) throw new Error('Delete offline');
    for (const id of body.descendants) {storage.delete(id);const index=threads.findIndex(node=>node.id===id);if(index>=0)threads.splice(index,1);}
    return {deleted:body.descendants,threads:structuredClone(threads)};
  }
  if (url==='/chat') { if (delayed) return delayed; if (failed) throw new Error('Offline'); pendingBody=body; return {id:'job'}; }
  if (url==='/chat?id=job') {
    const revision=replyRevision+=2, state=storage.get(pendingBody.thread);
    state.revision=revision;state.messages=[...pendingBody.messages.slice(0,-1),{...pendingBody.messages.at(-1),id:revision-1},
      {id:revision,role:'assistant',content:JSON.stringify({reply:'Independent reply.',replacement:null})}];
    threads.find(node=>node.id===pendingBody.thread).has_messages=true;
    return {status:'done',reply:'Independent reply.',replacement:'Must never be applied.',memory_revision:revision};
  }
  return {};
};
let added=0,sizes=[];
const branches=attachChatBranches({panel,messages,request,
  renderReply:(body,text)=>{body.textContent=text;},mainState:()=>main,
  selectMain:value=>{main=value;branches.memory(value);},addQuote:()=>added++,
  isBusy:()=>sharedBusy,setBusy:value=>{sharedBusy=value;},
  model:()=>({source:'Unchanged source',model:'test-model',effort:'low',name:'Test model'}),referencesEnabled:()=>true,resize:value=>sizes.push(value)});
branches.memory({...initial,threads});
function addMessage(container,id) {
  const item=element(Symbol());item.className='chat-message';item.dataset.id=String(id);
  const body=element(Symbol());body.className='chat-markdown';item.append(body);container.append(item);return body;
}
async function select(container,body,text='quoted phrase',end=body) {
  selected={isCollapsed:false,rangeCount:1,toString:()=>text,removeAllRanges(){selected=null;},
    getRangeAt:()=>({startContainer:body,endContainer:end,getBoundingClientRect:()=>({left:900,top:770,bottom:790})})};
  window.getSelection=()=>selected;container.events.pointerup({button:0});
  await new Promise(resolve=>setTimeout(resolve,0));
}
const mainBody=addMessage(messages,2);
await select(messages,mainBody);
assert(element('chat-text-menu').open);
assert.equal(element('chat-text-menu').style.left,'702px');
element('chat-text-add').onclick();
assert.equal(added,1);
assert.equal(element('chat-input').value,'','Quoted text stays in a card, outside the question draft.');
const descendants=root=>{const result=[],todo=[root];while(todo.length){const item=todo.pop();result.push(item);todo.push(...item.children);}return result;};
const buttons=()=>descendants(element('chat-tree-nodes')).filter(item=>item.dataset?.thread);
const find=(root,name)=>descendants(root).find(item=>item.className===name);
const cards=()=>element('chat-quotes').children[0].children;
assert.equal(cards().length,1);
assert.equal(find(cards()[0],'chat-quote-text').textContent,'quoted phrase');
find(cards()[0],'chat-quote-edit-button').onclick();
let editInput=find(cards()[0],'chat-quote-edit');editInput.value='Explain the geometry.';editInput.oninput();editInput.onblur();
assert(branches.question('Continue.').includes('Explain the geometry.'));
find(cards()[0],'chat-quote-edit-button').onclick();editInput.value='Discard this edit';editInput.oninput();
editInput.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});editInput.onblur();
assert(branches.question('Continue.').includes('Explain the geometry.'));
assert(!branches.question('Continue.').includes('Discard this edit'));
await select(messages,mainBody);element('chat-text-add').onclick();assert.equal(cards().length,1,'Repeated selection reuses its existing card.');
await select(messages,mainBody,'second quote');element('chat-text-add').onclick();assert.equal(cards().length,2);
find(cards()[1],'chat-quote-remove').onclick();assert.equal(cards().length,1);
const tray=element('chat-quotes'), quoteList=()=>tray.children[0];
assert.equal(quoteList().hidden,true,'Only the capsule is visible before hovering.');
tray.onpointerenter({pointerType:'mouse'});assert.equal(quoteList().hidden,false,'Hover automatically previews comment content.');
tray.onpointerleave();assert.equal(quoteList().hidden,true,'Leaving the capsule and preview collapses it.');
tray.onfocusin({target:{matches:()=>true}});assert.equal(quoteList().hidden,false,'Keyboard focus also reveals the preview.');
tray.onfocusin({target:{className:'chat-quote-edit'}});tray.onpointerleave();
assert.equal(quoteList().hidden,false,'Editing keeps the content visible when the pointer leaves.');
tray.onfocusin({target:{}});
tray.onpointerenter({pointerType:'touch'});assert.equal(quoteList().hidden,true,'Touch uses the existing click control.');
find(tray,'chat-quote-count').onclick();assert.equal(quoteList().hidden,false);
tray.onpointerleave();assert.equal(quoteList().hidden,false,'A clicked preview stays pinned.');
find(tray,'chat-quote-count').onclick();assert.equal(quoteList().hidden,true);
assert.equal(calls.length,0,'Adding a quote only stages a draft.');
assert.equal(element('chat-tree').hidden,true,'The diagram is hidden by default.');
assert.equal(element('chat-tree-toggle').attributes['aria-expanded'],'false');
element('chat-tree-toggle').onclick();assert.equal(element('chat-tree').hidden,false);
assert.equal(buttons().length,1,'Unasked legacy branches are omitted from the tree.');
const keyEvent=key=>({key,preventDefault(){},stopPropagation(){}});
const rootButton=buttons()[0];
rootButton.onclick({detail:1});rootButton.ondblclick(keyEvent(''));
let nameInput=find(element('chat-tree-nodes'),'chat-tree-name');
assert.equal(nameInput.value,'First main');assert(nameInput.selected);
assert.equal(nameInput.parentElement.children[0],nameInput,'The editor occupies the node slot before its descendants.');
assert.equal(nameInput.style.width,'100px');assert.equal(nameInput.style.height,'26px');
nameInput.value='Renamed main';await nameInput.onkeydown(keyEvent('Enter'));
assert.equal(buttons()[0].textContent,'Renamed main');
assert.deepEqual(calls.at(-1).body,{project:'project',thread:'main:0',title:'Renamed main'});
await new Promise(resolve=>setTimeout(resolve,370));
assert.equal(element('chat-branch').hidden,true,'A double-click cancels the pending navigation.');
buttons()[0].oncontextmenu(keyEvent(''));
const nodeMenu=descendants(element('chat-tree')).find(item=>item.id==='chat-tree-menu');
assert(nodeMenu.open);assert.equal(find(element('chat-tree-nodes'),'chat-tree-name'),undefined,'Right-click only opens the menu.');
assert.equal(nodeMenu.children[0].textContent,t('重命名'));assert.equal(nodeMenu.children[0].attributes.role,'menuitem');
assert.equal(nodeMenu.children[1].hidden,true,'The root chat cannot be deleted from the branch menu.');
nodeMenu.onkeydown(keyEvent('Escape'));assert.equal(nodeMenu.open,false);
buttons()[0].onkeydown(keyEvent('ContextMenu'));assert(nodeMenu.open,'Keyboard context-menu key opens the same menu.');
nodeMenu.children[0].onclick(keyEvent(''));assert.equal(nodeMenu.open,false);
nameInput=find(element('chat-tree-nodes'),'chat-tree-name');nameInput.value='';await nameInput.onkeydown(keyEvent('Enter'));
assert.equal(nameInput.removed,undefined,'Empty names remain editable.');
await nameInput.onkeydown(keyEvent('Escape'));
assert.equal(buttons()[0].textContent,'Renamed main','Esc cancels without saving.');
buttons()[0].onkeydown(keyEvent('F2'));nameInput=find(element('chat-tree-nodes'),'chat-tree-name');
renameFailed=true;nameInput.value='Failed rename';await nameInput.onblur();renameFailed=false;
assert.equal(buttons()[0].textContent,'Renamed main');assert.equal(element('chat-status').textContent,'Rename offline');
element('chat-tree-toggle').onclick();assert.equal(element('chat-tree').hidden,true);
await select(messages,mainBody);
await element('chat-text-branch').onclick();
assert.equal(element('chat-branch').hidden,false);
assert.equal(element('chat-branch-input').readOnly,false);assert.equal(element('chat-branch-close').disabled,false);
const workspace=element('chat-workspace'), split=workspace.children.find(item=>item.id==='chat-branch-splitter');
workspace.rect={left:0,top:0,width:900,height:600};
assert.equal(split.attributes.role,'separator');assert.equal(split.hidden,false);
assert.equal(split.attributes['aria-orientation'],'vertical');
const pointer={pointerId:7,button:0,buttons:1,clientX:450,clientY:300,preventDefault(){}};
const share=()=>Number(workspace.style['--chat-main-share']);
split.onpointerdown(pointer);split.onpointermove({...pointer,clientX:480});split.onpointermove({...pointer,clientX:500});
assert.equal(frames.size,1,'Dragging updates once per screen frame.');flushFrames();
assert(Math.abs(share()-(.5+50/892))<1e-8);
split.onpointerup({...pointer,type:'pointerup',clientX:530});
assert(Math.abs(share()-(.5+80/892))<1e-8,'Release applies the final pointer position.');
assert.equal(split.capture,null);assert.equal(panel.dataset.splitting,undefined);assert.equal(frames.size,0);
split.onkeydown(keyEvent('Home'));assert(Math.abs(share()-180/892)<1e-8,'Both panes retain a usable minimum size.');
split.onkeydown(keyEvent('End'));assert(Math.abs(share()-(1-180/892))<1e-8);
split.ondblclick();assert.equal(share(),.5);
split.onkeydown(keyEvent('ArrowLeft'));assert.equal(share(),.47);
for (const cancel of [()=>split.onpointercancel(pointer),()=>events.blur(),()=>split.onpointermove({...pointer,buttons:0})]) {
  split.onpointerdown(pointer);split.onpointermove({...pointer,pointerId:8,clientX:0});assert.equal(frames.size,0);
  split.onpointermove({...pointer,clientX:470});cancel();flushFrames();
  const saved=share();split.onpointermove({...pointer,clientX:900});assert.equal(share(),saved);
  assert.equal(split.capture,null);assert.equal(frames.size,0);assert.equal(panel.dataset.splitting,undefined);
}
const savedMainDraft=element('chat-input').value, savedSideDraft=element('chat-branch-input').value;
window.innerWidth=500;events.resize();assert.equal(split.attributes['aria-orientation'],'horizontal');
split.ondblclick();split.onpointerdown(pointer);split.onpointermove({...pointer,clientY:340});flushFrames();
split.onpointerup({...pointer,type:'pointerup',clientY:360});assert(Math.abs(share()-(.5+60/592))<1e-8);
split.onkeydown(keyEvent('ArrowUp'));assert(Math.abs(share()-(.47+60/592))<1e-8);
assert.equal(element('chat-input').value,savedMainDraft);assert.equal(element('chat-branch-input').value,savedSideDraft);
window.innerWidth=1000;events.resize();split.ondblclick();
const readingBlock=element(Symbol());messages.append(readingBlock);messages.scrollTop=80;messages.scrollHeight=1000;
messages.querySelectorAll=()=>[readingBlock];
readingBlock.getBoundingClientRect=()=>{const top=40-messages.scrollTop,height=share()<.5?240:120;return {top,bottom:top+height,height};};
log.scrollHeight=300;log.scrollTop=200;
split.onkeydown(keyEvent('ArrowLeft'));
assert.equal(messages.scrollTop,140,'Reflow preserves the visible position within the paragraph rather than its old scroll pixels.');
assert.equal(log.scrollTop,300,'A pane reading the newest reply stays at the bottom.');
split.ondblclick();assert.equal(messages.scrollTop,80);
readingBlock.remove();messages.querySelectorAll=()=>[];messages.scrollTop=0;messages.scrollHeight=200;log.scrollTop=0;log.scrollHeight=200;
assert.deepEqual(calls.at(-1).body,{project:'project',parent:'main:0',message_id:2,quote:'quoted phrase'});
assert(element('chat-branch-quote').removed,'The permanent sidebar quote block is removed.');
assert.equal(buttons().length,1,'Opening a sidebar without asking does not add a diagram node.');
element('chat-branch-input').value='Keep this sidebar draft';
await select(messages,mainBody,'another main quote');await element('chat-text-branch').onclick();
assert.equal(counter,1,'Selections in the main chat reuse the visible sidebar.');
assert.equal(element('chat-branch-input').value,'Keep this sidebar draft');
assert.equal(find(element('chat-branch-quotes'),'chat-quote-text').textContent,'another main quote');
element('chat-branch-close').onclick();
assert.equal(split.hidden,true,'The divider disappears with its sidebar.');
assert.equal(element('chat-branch-quotes').hidden,true,'Explicit sidebar close clears its unsent quotes.');
await select(messages,mainBody,'Reopen without losing this draft');await element('chat-text-branch').onclick();
assert.equal(counter,1,'A closed, unasked sidebar reopens with its unsent draft intact.');
assert.equal(element('chat-branch-input').value,'Keep this sidebar draft');
element('chat-branch-input').value='Explain the quote.';
await element('chat-branch-form').onsubmit({preventDefault(){}});
const sent=calls.find(call=>call.url==='/chat').body;
assert.equal(sent.thread,'branch-1');assert.equal(sent.selection,'');assert.equal(sent.model,'test-model');assert.equal(sent.references,true);
assert.equal(sent.messages.length,1);assert(sent.messages[0].content.includes('> Reopen without losing this draft'));
assert(!sent.messages[0].content.includes('another main quote'),'Closed quotes cannot leak into a later question.');
assert(sent.messages[0].content.endsWith('Explain the quote.'));
assert.equal(buttons().length,2,'The first question adds the sidebar to its diagram.');
assert.equal(main.messages.length,2,'The branch must not append to main history.');
assert.equal(log.children.at(-1).children[1].textContent,'Independent reply.');
assert.equal(log.children[0].dataset.id,'19','Successful user messages can also be forked.');
assert.equal(log.children[0].children[1].textContent,'Explain the quote.','User bubbles show the question without the quoted prompt.');
assert.equal(find(log.children[0],'chat-sent-quotes').children[0].textContent,t('引用 {count} 条',{count:2}),'First branch question also carries its implicit branch quote.');
const replyBody=log.children.at(-1).children[1];
await select(messages,mainBody,'Yet another quote');await element('chat-text-branch').onclick();
assert.equal(counter,1,'An existing asked sidebar receives main-chat quotes as comments, without a new branch.');
await select(log,replyBody,'Independent');
element('chat-text-add').onclick();assert.equal(element('chat-branch-input').value,'');
assert(descendants(element('chat-branch-quotes')).some(item=>item.className==='chat-quote-text'&&item.textContent==='Independent'));
element('chat-branch-input').value='Unsent parent draft';log.scrollTop=45;
await select(log,replyBody,'nested topic');await element('chat-text-branch').onclick();
assert.equal(calls.at(-1).body.parent,'branch-1');assert.equal(counter,2);
assert.equal(buttons().length,2,'An unasked nested sidebar also stays out of the tree.');
element('chat-branch-input').value='First nested question';
await buttons().find(button=>button.dataset.thread==='branch-1').onclick();
assert.equal(element('chat-branch-input').value,'First nested question','A hidden draft cannot be lost by switching away before its first send.');
failed=true;await element('chat-branch-form').onsubmit({preventDefault(){}});failed=false;
assert.equal(buttons().length,2,'A failed first question does not leave an empty node.');
await element('chat-branch-form').onsubmit({preventDefault(){}});
assert.equal(buttons().length,3);
const nestedParent=buttons().find(button=>button.dataset.thread==='branch-1');
const childList=nestedParent.parentElement.children.find(item=>item.className==='chat-tree-children');
nestedParent.ondblclick(keyEvent(''));
const nestedName=find(nestedParent.parentElement,'chat-tree-name');
assert.deepEqual(nestedParent.parentElement.children,[nestedName,nestedParent,childList],'Editing a parent cannot move it behind the child subtree.');
await nestedName.onkeydown(keyEvent('Escape'));
element('chat-branch-input').value='Nested draft';
assert.equal(branches.hasDrafts,true,'Unsent branch drafts participate in document-switch protection.');
await buttons().find(button=>button.dataset.thread==='branch-1').onclick();
assert.equal(element('chat-branch-input').value,'Unsent parent draft');assert.equal(log.scrollTop,45);
assert(descendants(element('chat-branch-quotes')).some(item=>item.className==='chat-quote-text'&&item.textContent==='Independent'),'Quoted cards follow their own conversation branch.');
failed=true;await element('chat-branch-form').onsubmit({preventDefault(){}});failed=false;
assert.equal(element('chat-branch-input').value,'Unsent parent draft','Failures restore only the typed question, without duplicating quoted text.');
assert(descendants(element('chat-branch-quotes')).some(item=>item.className==='chat-quote-text'&&item.textContent==='Independent'));
assert(calls.filter(call=>call.url==='/chat').at(-1).body.messages.at(-1).content.includes('> Independent'));
await element('chat-branch-form').onsubmit({preventDefault(){}});
assert.equal(element('chat-branch-quotes').hidden,true,'A successful response clears its sent comment cards.');
assert.equal(cards().length,1,'A child send cannot clear the main conversation cards.');
await buttons().find(button=>button.dataset.thread==='branch-2').onclick();
assert.equal(element('chat-branch-input').value,'Nested draft');
element('chat-branch-close').onclick();assert(element('chat-branch').hidden);
await buttons().find(button=>button.dataset.thread==='branch-2').onclick();
assert.equal(element('chat-branch-input').value,'Nested draft');
failed=true;await element('chat-branch-form').onsubmit({preventDefault(){}});failed=false;
assert.equal(element('chat-branch-input').value,'Nested draft');assert.equal(element('chat-branch-status').textContent,'Offline');
assert.equal(log.children.length,2,'An unsuccessful send must not leave an unsaved message eligible for a fork.');
let release;delayed=new Promise(resolve=>{release=resolve;});
const pending=element('chat-branch-form').onsubmit({preventDefault(){}});
await element('chat-branch-stop').onclick();assert.equal(element('chat-branch-input').value,'Nested draft');
release({id:'late-job'});await pending;delayed=null;
assert(calls.some(call=>call.url==='/chat/cancel'&&call.body.id==='late-job'));
assert.equal(log.children.length,2,'A stopped send cannot revive its reply.');
element('chat-branch-close').onclick();
await select(messages,mainBody,'A fresh sidebar from single-column view');await element('chat-text-branch').onclick();
assert.equal(counter,3,'A single-column main chat opens a new sidebar when the previous sidebar already has messages.');
assert.equal(buttons().length,3);
element('chat-branch-input').value='Cancel this first question';
delayed=new Promise(resolve=>{release=resolve;});
const firstPending=element('chat-branch-form').onsubmit({preventDefault(){}});
assert.equal(buttons().length,4,'A first question appears in the diagram while it is being sent.');
await element('chat-branch-stop').onclick();assert.equal(buttons().length,3,'Canceling an unrecorded first question removes its temporary node.');
release({id:'late-first-job'});await firstPending;delayed=null;
element('chat-branch-input').value='';
element('chat-input').value='Main draft';element('chat-roots').value='main:9';await element('chat-roots').onchange();
assert.equal(main.thread,'main:9');assert(element('chat-branch').hidden);
element('chat-input').value='Other draft';element('chat-roots').value='main:0';await element('chat-roots').onchange();
assert.equal(element('chat-input').value,'Main draft');
assert.equal(cards().length,1,'Root switching preserves its quoted comments.');
find(element('chat-quotes'),'chat-quote-clear').onclick();assert.equal(element('chat-quotes').hidden,true);
element('chat-text-menu').open=false;
await select(messages,mainBody,'cross message',addMessage(messages,1));
assert.equal(element('chat-text-menu').open,false,'Selections must stay within one message body.');
await select(messages,mainBody,'a'.repeat(12001));assert.equal(element('chat-text-menu').open,false);
await buttons().find(button=>button.dataset.thread==='branch-2').onclick();
element('chat-input').value='Keep main input';element('chat-branch-input').value='Keep nested input';
await select(messages,mainBody,'Keep main quote');element('chat-text-add').onclick();
await select(log,log.children.at(-1).children[1],'Keep nested quote');element('chat-text-add').onclick();
const deleteControl=nodeMenu.children[1];
const deleteDialog=workspace.children.find(item=>item.id==='chat-delete-dialog');
const deleteDescription=deleteDialog.children[1], cancelDelete=deleteDialog.children[2].children[0], confirmDelete=deleteDialog.children[2].children[1];
const openDeleteMenu=()=>buttons().find(button=>button.dataset.thread==='branch-1').oncontextmenu(keyEvent(''));
openDeleteMenu();assert.equal(deleteControl.hidden,false);nodeMenu.onkeydown(keyEvent('End'));
assert.equal(document.activeElement,deleteControl,'Keyboard navigation reaches the deletion command.');
nodeMenu.onkeydown(keyEvent('ArrowDown'));assert.equal(document.activeElement,nodeMenu.children[0]);
let beforeDeleteCalls=calls.length;
await deleteControl.onclick();
assert(deleteDialog.open);assert.equal(document.activeElement,cancelDelete,'The confirmation defaults to the safe action.');
assert.equal(calls.length,beforeDeleteCalls,'Canceling confirmation never sends a delete request.');
assert(deleteDescription.textContent.includes('2'),'The confirmation counts the selected branch and its nested discussion.');
cancelDelete.onclick();assert.equal(deleteDialog.open,false);
await confirmDelete.onclick();assert.equal(calls.length,beforeDeleteCalls,'A canceled confirmation cannot later commit its old target.');
openDeleteMenu();await deleteControl.onclick();deleteDialog.oncancel();deleteDialog.close();await confirmDelete.onclick();
assert.equal(calls.length,beforeDeleteCalls,'Esc also clears the pending deletion.');
assert.equal(element('chat-branch-input').value,'Keep nested input');assert(!element('chat-branch').hidden);
openDeleteMenu();sharedBusy=true;beforeDeleteCalls=calls.length;await deleteControl.onclick();sharedBusy=false;
assert.equal(calls.length,beforeDeleteCalls,'An open menu cannot delete while a reply is running.');
deleteFailed=true;openDeleteMenu();await deleteControl.onclick();await confirmDelete.onclick();deleteFailed=false;
assert.equal(element('chat-status').textContent,'Delete offline');assert.equal(element('chat-branch-input').value,'Keep nested input');
assert.equal(element('chat-branch-input').readOnly,false);assert.equal(element('chat-branch-close').disabled,false);
assert.equal(element('chat-branch-quotes').hidden,false,'Failed deletion preserves pending quoted comments.');
openDeleteMenu();await deleteControl.onclick();await confirmDelete.onclick();
assert.deepEqual(calls.at(-1).body,{project:'project',thread:'branch-1',descendants:['branch-1','branch-2']});
assert(element('chat-branch').hidden);assert.equal(element('chat-branch-input').value,'');
assert.equal(element('chat-branch-quotes').hidden,true);
assert(!buttons().some(button=>['branch-1','branch-2'].includes(button.dataset.thread)));
assert(storage.has('branch-3'),'An unrelated sidebar draft is not deleted.');
assert.equal(element('chat-input').value,'Keep main input');assert.equal(cards().length,1,'Main chat quotes survive branch deletion.');
branches.reset();assert(element('chat-branch').hidden);assert.equal(branches.busy,false);assert.equal(branches.loading,false);
assert.equal(branches.hasDrafts,false);
assert.equal(element('chat-tree').hidden,true,'A reset restores the default collapsed diagram.');
assert(sizes.includes(true)&&sizes.includes(false));
const compact=element(Symbol()), render=(body,text)=>{body.textContent=text;};
renderChatQuestion(compact,'1. Selected text:\n> line one\n> line two\n\nFirst note.\n\n\n2. 所选文本：\n> 第二条\n\nQuestion?',render);
assert.equal(compact.textContent,'First note.\n\n\n\nQuestion?');
const sentQuotes=find(compact,'chat-sent-quotes');
assert.equal(sentQuotes.children[0].textContent,t('引用 {count} 条',{count:2}));assert.equal(sentQuotes.open,undefined,'Sent quotes start collapsed.');
assert.equal(sentQuotes.children[1].children[0].textContent,'line one\nline two');
assert.equal(sentQuotes.children[1].children[1].textContent,'第二条');
const plain=element(Symbol());renderChatQuestion(plain,'An ordinary question\n> quoted prose',render);
assert.equal(plain.textContent,'An ordinary question\n> quoted prose');assert.equal(plain.children.length,0);
console.log('PASS: selection quote actions, two-pane nested switching, main isolation, drafts/scroll, failed sends, late cancellation and root navigation');
