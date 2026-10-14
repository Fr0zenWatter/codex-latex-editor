// Run: node test_references.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachSourceQuotes,referenceToken} from './vendor/latex-references.mjs';
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
const token=encode({project:'a'.repeat(64),path:'chapters/child.tex',digest:'b'.repeat(64),start:20,end:24,line:3,preview:'中文原句 😀'});
const href='/source-quote?ref='+token;
assert.equal(referenceToken(href),token);
for(const value of [null,'https://example.com'+href,'//evil'+href,href+'&x=1','/source-quote?ref=!',href+'='.repeat(1)])assert.equal(referenceToken(value),null);
function element(){return {events:{},dataset:{},attributes:{},children:[],hidden:false,style:{},
  classList:{add(name){this[name]=true;}},addEventListener(name,fn){this.events[name]=fn;},
  setAttribute(name,value){this.attributes[name]=value;},matches(){return !!this.open;},
  getAttribute(name){return this.attributes[name]??null;},removeAttribute(name){delete this.attributes[name];},
  append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
  showPopover(){this.open=true;this.events.beforetoggle?.({newState:'open'});},
  hidePopover(){this.closed=true;this.open=false;this.events.beforetoggle?.({newState:'closed'});}};}
const button=element(),panel=element(),list=element(),empty=element(),documentEvents={},windowEvents={};
let composerBox={left:950,top:700,bottom:780};
button.closest=selector=>{assert.equal(selector,'#chat-bar');return {getBoundingClientRect:()=>composerBox};};
const link=element();link.attributes={href,target:'_blank'};
const malformed=element();malformed.attributes={href:'/source-quote?ref=e30'};
let links=[link,link,malformed];
globalThis.document={querySelectorAll:()=>links,createElement:element,addEventListener(name,fn){documentEvents[name]=fn;}};
globalThis.window={innerWidth:1000,innerHeight:800,addEventListener(name,fn){windowEvents[name]=fn;}};
const doc={},state={project:'trial',doc,path:'main.tex',version:'v1',source:'Source draft',available:true};
let calls=[],moves=[],messages=[],pending;
const refs=attachSourceQuotes({button,panel,list,empty,capture:()=>({...state}),
  request:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return pending?await pending:{path:'child.tex',quote:'text'};},
  navigate:async data=>moves.push(data),message:text=>messages.push(text),
  translate:(text,args)=>text.replace('{message}',args?.message??'')});
refs.refresh();assert.equal(refs.enabled,false,'Rendering old citations must not enable AI tools.');
button.events.click();assert.equal(refs.enabled,true);
assert.equal(button.attributes['aria-pressed'],'true');assert.equal(panel.open,true);
assert.equal(button.attributes['aria-expanded'],'true');
assert.equal(panel.style.left,'592px');assert.equal(panel.style.bottom,'106px');assert.equal(panel.style.top,'auto');
panel.open=true;composerBox={left:4,top:60,bottom:190};windowEvents.resize();
assert.equal(panel.style.left,'8px');assert.equal(panel.style.top,'196px');assert.equal(panel.style.bottom,'auto');
panel.hidePopover();assert.equal(button.attributes['aria-expanded'],'false');
assert.equal(refs.enabled,true,'Dismissing the list keeps the tool enabled.');
assert.equal(button.attributes['aria-pressed'],'true','Highlight follows the tool, not the popover.');
button.events.click();assert.equal(refs.enabled,false);assert.equal(button.attributes['aria-pressed'],'false');
assert.equal(panel.open,false);
panel.showPopover();assert.equal(refs.enabled,false,'Opening the list must not enable tools.');
button.events.click();assert.equal(refs.enabled,true);
button.events.click();assert.equal(refs.enabled,false);assert.equal(panel.open,false);
button.events.click();assert.equal(refs.enabled,true);
assert.equal(list.children.length,1);assert.equal(empty.hidden,true);
assert.equal(list.children[0].children[0].textContent,'中文原句 😀');
assert.equal(list.children[0].children[1].textContent,'chapters/child.tex:3');
assert.equal(link.attributes.target,undefined);
link.textContent='Lemma 2.3';refs.refresh();
assert.equal(list.children[0].children[0].textContent,'Lemma 2.3','The list keeps the readable title from the conversation.');
await list.children[0].onclick();
assert.equal(calls[0].url,'/source-quote');
assert.deepEqual(calls[0].body,{reference:token,path:state.path,version:state.version,source:state.source});
assert.equal(moves.length,1);assert.equal(panel.closed,true);
assert.equal(refs.enabled,true);assert.equal(button.attributes['aria-pressed'],'true','Navigating a quote keeps the tool enabled.');
state.available=false;await list.children[0].onclick();assert.equal(calls.length,1);assert(messages.at(-1).includes('请先保存'));
state.available=true;
let finish;pending=new Promise(resolve=>finish=resolve);
const stale=list.children[0].onclick();state.source+=' edit';
await list.children[0].onclick();assert.equal(calls.length,2,'Parallel navigation must not issue duplicate requests.');
finish({path:'child.tex'});await stale;
assert.equal(moves.length,1);assert(messages.at(-1).includes('源码已变化'));
pending=null;state.source='Source draft';
let prevented=false;
documentEvents.click({button:0,target:{closest:()=>link},preventDefault(){prevented=true;}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(prevented,true);assert.equal(moves.length,2);
prevented=false;documentEvents.click({button:0,target:{closest:()=>({getAttribute:()=>'/normal'})},preventDefault(){prevented=true;}});
assert.equal(prevented,false);
links=[];windowEvents['latex-source-quotes-change']();
assert.equal(list.children.length,1,'Switching project source files retains previously rendered quotation links.');
state.project='other project';windowEvents['latex-source-quotes-change']();
assert.equal(list.children.length,0);assert.equal(empty.hidden,false);
console.log('PASS: quote button, Unicode list, exact links, safe click routing, draft guard, concurrent/stale navigation and empty state');
