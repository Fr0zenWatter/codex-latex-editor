// Run: node test_proofread_pdf.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachProofreadPdf,paintProofreadActions} from './vendor/latex-proofread-pdf.mjs';
let timers=new Map(),timerId=0;
globalThis.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
const flush=async()=>{const work=[...timers.values()];timers.clear();await Promise.all(work.map(fn=>fn()));};
const doc={},source='😀 old text';
let current={latex:true,path:'main.tex',version:'v1',source,doc,range:()=> 'old',index:pos=>pos.ch};
const annotation={id:1,doc,original:'old',proposed:'new',review:{},marker:{find:()=>({from:{ch:3},to:{ch:6}})}};
let release,calls=[],displayed=[],restores=0,messages=[];
const preview=attachProofreadPdf({capture:()=>current,request:async(route,options)=>{
  calls.push({route,data:JSON.parse(options.body)});return new Promise(resolve=>release=resolve);
},display:async data=>displayed.push(data),restore:async()=>{restores++;},message:key=>messages.push(key)});
preview.update([annotation]);preview.update([annotation]);assert.equal(timers.size,1);
const pending=flush();assert.equal(calls.length,1);assert.equal(calls[0].route,'/proofread');
assert.equal(calls[0].data.items[0].start,2,'Wire ranges must use Unicode code points.');
preview.update([]);release({pdf_revision:'stale',regions:[]});await pending;
assert.equal(displayed.length,0);assert.equal(preview.active,false);
preview.update([annotation]);const next=flush();release({pdf_revision:'shown',regions:[]});await next;
assert.equal(displayed.length,1);assert.equal(preview.active,true);assert.equal(preview.data.pdf_revision,'shown');
preview.update([]);await Promise.resolve();assert.equal(restores,1);assert.equal(preview.active,false);
current={...current,enabled:false};preview.update([annotation]);await flush();assert.equal(calls.length,2,'Disabled PDF proofreading never compiles.');
current={...current,enabled:true};preview.update([annotation]);const toggledPending=flush();
current={...current,enabled:false};preview.update([annotation]);release({pdf_revision:'disabled-stale',regions:[]});await toggledPending;
assert.equal(displayed.length,1,'Turning off while compiling suppresses the old preview.');
current={...current,enabled:true};preview.update([annotation]);const visibleAgain=flush();release({pdf_revision:'enabled',regions:[]});await visibleAgain;
current={...current,enabled:false};preview.update([annotation]);await Promise.resolve();assert.equal(restores,2);assert.equal(preview.active,false);
current={...current,enabled:true};
current={...current,latex:false};preview.update([annotation]);assert.equal(timers.size,0);
current={...current,latex:true,range:()=> 'edited'};preview.update([annotation]);assert.equal(timers.size,0);
let failedRestore=0;
const failure=attachProofreadPdf({capture:()=>({...current,range:()=> 'old'}),request:async()=>{throw new Error('Bad TeX');},
  display:async()=>assert.fail(),restore:async()=>failedRestore++,message:key=>messages.push(key)});
failure.update([annotation]);await flush();assert.equal(failedRestore,1);assert.equal(failure.active,false);
assert(messages.includes('PDF 校对预览失败：{message}'));

const element=()=>({children:[],style:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(key,value){this.attributes[key]=value;}});
globalThis.document={createElement:element};
let kept=0,undone=0;annotation.review={busy:false,keep:()=>kept++,undo:()=>undone++};
const page=element(),viewer={getPageView:()=>({div:page,viewport:{convertToViewportPoint:(x,y)=>[x,800-y]}})};
paintProofreadActions(viewer,{pdf_revision:'shown',regions:[{id:1,page:1,rect:[70,600,300,620]}]},[annotation],'shown',key=>key);
assert.equal(page.children.length,1);const [,undo,keep]=page.children[0].children;undo.onclick();keep.onclick();
assert.equal(kept,1);assert.equal(undone,1);assert.equal(keep.attributes['aria-label'],'Keep #1');
annotation.review.busy=true;paintProofreadActions(viewer,{pdf_revision:'shown',regions:[{id:1,page:1,rect:[70,600,300,620]}]},[annotation],'shown',key=>key);
assert(page.children[1].children[2].disabled);
console.log('PASS: disposable-only requests, Unicode ranges, deduplication, stale response exclusion, restore, errors and independent PDF controls');
