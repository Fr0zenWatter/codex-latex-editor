import assert from 'node:assert/strict';
import {attachProjectReview} from './vendor/latex-project-review.mjs';

const elements=new Map(), stored=new Map([['latex-codex-proofread-project','on']]), events={};
function element(id) {
  if(!elements.has(id)) elements.set(id,{children:[],style:{},textContent:'',attributes:{},events:{},
    setAttribute(key,value){this.attributes[key]=value;},
    append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
    remove(){},hidePopover(){},getBoundingClientRect(){return {bottom:40};},
    addEventListener(key,fn){this.events[key]=fn;}});
  return elements.get(id);
}
globalThis.document={querySelector:element,createElement:()=>element(Symbol())};
globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
globalThis.window={addEventListener:(key,fn)=>events[key]=fn};
let source='pre😀\nnew\nend\n',readonly=false,cleared=0,bookmark=0,displayRange,adopted=0,calls=[];
const doc={},wrapper={clientWidth:500,querySelector:()=>null};
const editor={on(){},getWrapperElement:()=>wrapper,getOption:()=>readonly,setOption:(_,value)=>readonly=value,
  posFromIndex:ch=>({line:0,ch}),scrollIntoView(){},
  setBookmark(from){bookmark++;return {clear(){cleared++;},changed(){}};},
  markText(from,to,options){if(options.replacedWith)displayRange={from,to};return {find:()=>({from,to}),clear(){cleared++;},changed(){}};}};
const file={path:'main.tex',name:'main.tex',source,version:'v1',signature:'s1',hunks:[{id:1,start:5,end:9,
  before:'old\n',after:'new\n',changes:[{kind:'delete',text:'old'},{kind:'insert',text:'new'},{kind:'equal',text:'\n'}]}]};
let files=[file],clean=true;
const request=async(url,options)=>{
  assert.equal(url,'/project-review');
  if(!options)return {enabled:true,files};
  const action=JSON.parse(options.body);calls.push(action);
  assert.equal(action.signature,file.signature);assert.equal(readonly,true);
  files=[];
  return {enabled:true,files,state:{source:action.action==='undo'?'pre😀\nold\nend\n':source,version:'v2',path:'main.tex'}};
};
const review=attachProjectReview({editor,request,capture:()=>({path:'main.tex',source,doc,clean}),
  adopt:async state=>{source=state.source;adopted++;},open:async()=>true,message(){}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(review.items.length,1);assert.equal(element('#project-review-open').hidden,false);
assert.equal(displayRange.from.ch,6,'Code-point offsets convert to JavaScript UTF-16 offsets.');
assert.equal(displayRange.to.ch,10);
assert.equal(review.items[0].displayOriginal,'old\n');
clean=false;await review.items[0].review.keep();assert.equal(calls.length,0,'Unsaved drafts block both review actions.');
clean=true;await review.items[0].review.keep();assert.equal(calls[0].action,'keep');
assert.equal(source,file.source);assert.equal(review.items.length,0);assert.equal(readonly,false);
files=[file];await review.refresh();
review.items[0].review.undo();await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.at(-1).action,'undo');assert.equal(source,'pre😀\nold\nend\n');assert.equal(adopted,2);
file.source=source;file.signature='s2';file.version='v2';
file.hunks=[{id:1,start:5,end:5,before:'deleted\n',after:'',changes:[{kind:'delete',text:'deleted\n'}]}];
files=[file];await review.refresh();assert.equal(bookmark,1,'Pure deletions have a visible review at the insertion point.');
stored.set('latex-codex-proofread-editor','off');await review.refresh();
assert(element('#project-review-list').children.includes(review.items[0].review.root),'PDF-only mode keeps source actions in the project list.');
stored.set('latex-codex-proofread-project','off');await review.refresh();
assert.equal(review.items.length,0);assert.equal(element('#project-review-open').hidden,true);assert(cleared>0);
events.pagehide();
console.log('PASS: project review widgets, Unicode anchors, unsaved drafts, per-hunk actions, zero-width deletions, separate editor visibility and cleanup');
