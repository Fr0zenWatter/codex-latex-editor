// Run: node test_proofread_pdf.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachProofreadPdf,paintProofreadActions,proofreadPdfPositions,proofreadHighlights} from './vendor/latex-proofread-pdf.mjs';
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
const plain=attachProofreadPdf({capture:()=>({...current,range:()=> 'old'}),request:async()=>({pdf_revision:'plain',plain_preview:true,regions:[]}),
  display:async()=>true,restore:async()=>{},message:key=>messages.push(key)});
plain.update([annotation]);await flush();
assert.equal(plain.active,true);
assert(messages.includes('PDF 校对预览：当前选区仅显示修改后内容，请在源码中对比原文。'),'Plain fallback must be visible to the reader.');

const element=()=>({children:[],style:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(key,value){this.attributes[key]=value;}});
globalThis.document={createElement:element};
let kept=0,undone=0;annotation.review={busy:false,keep:()=>kept++,undo:()=>undone++};
const page=element(),viewer={getPageView:()=>({div:page,viewport:{convertToViewportPoint:(x,y)=>[x,800-y]}})};
paintProofreadActions(viewer,{pdf_revision:'shown',regions:[{id:1,page:1,rect:[70,600,300,620]}]},[annotation],'shown',key=>key);
assert.equal(page.children.length,1);const [,undo,keep]=page.children[0].children;undo.onclick();keep.onclick();
assert.equal(kept,1);assert.equal(undone,1);assert.equal(keep.attributes['aria-label'],'Keep #1');
annotation.review.busy=true;paintProofreadActions(viewer,{pdf_revision:'shown',regions:[{id:1,page:1,rect:[70,600,300,620]}]},[annotation],'shown',key=>key);
assert(page.children[1].children[2].disabled);
page.offsetTop=200;
const regions={pdf_revision:'shown',regions:[{id:1,page:1,rect:[70,600,300,620]},
  {id:1,page:2,rect:[70,400,300,420]},{id:2,page:1,rect:[70,200,300,220]}]};
assert.deepEqual(proofreadPdfPositions(viewer,regions,[annotation],'shown'),[380], 'Cross-page regions count as one suggestion at its first occurrence.');
assert.deepEqual(proofreadPdfPositions(viewer,regions,[],'shown'),[], 'Keep/Undo removes resolved targets.');
assert.deepEqual(proofreadPdfPositions(viewer,regions,[annotation],'other'),[], 'Stale PDF geometry cannot navigate.');
const croppedViewer={getPageView:()=>({div:page,pdfPage:{mediaBox:[10,20,610,820]},viewport:{convertToViewportPoint:(x,y)=>[x,820-y]}})};
assert.deepEqual(proofreadPdfPositions(croppedViewer,{pdf_revision:'shown',top_origin:true,regions:[{id:1,page:1,rect:[70,-220,300,-200]}]},[annotation],'shown'),[400]);
const glyph=(str,x,y=100)=>({str,transform:[10,0,0,10,x,y],width:10,height:10,fontName:'font'});
const begin=tag=>({type:'beginMarkedContent',tag}),end={type:'endMarkedContent'};
const content={styles:{font:{ascent:.8,descent:-.2}},items:[
  glyph('outside',0),begin('LCBefore1'),glyph('same',20),end,
  begin('LCBeforeChanged1'),glyph('old',35),end,
  begin('LCAfterChanged1'),glyph('new',20,80),end,
  begin('Artifact'),glyph('ignored',300),end,
  begin('LCBeforeChanged2'),glyph('resolved',300),end]};
const backgrounds=proofreadHighlights(content,new Set([1]));
assert.equal(backgrounds.length,4,'Two pale rows and two deeper word backgrounds.');
assert.deepEqual(backgrounds.filter(mark=>mark.strong).map(mark=>mark.side),['before','after']);
assert.deepEqual(backgrounds[0].rect,[20,98,45,108],'Join unchanged and changed words into one pale row.');
assert.deepEqual(proofreadHighlights(content,new Set()),[],'Resolved annotations leave no backgrounds.');
const changedWord=(word,x,y=100,tag='LCBeforeChanged1')=>[begin(tag),glyph(word,x,y),end];
const joined={styles:content.styles,items:[...changedWord('first',0),glyph(' ',10),...changedWord('second',15),...changedWord('third',30)]};
assert.deepEqual(proofreadHighlights(joined,new Set([1])).filter(mark=>mark.strong).map(mark=>mark.rect),[[0,98,40,108]],'Adjacent changed words share one continuous background across spaces.');
for(const separator of [[begin('LCBefore1'),glyph('same',15),end],[glyph('untagged',15)]]){
  const separated={styles:content.styles,items:[...changedWord('first',0),...separator,...changedWord('last',30)]};
  assert.equal(proofreadHighlights(separated,new Set([1])).filter(mark=>mark.strong).length,2,'Unchanged or untagged visible text breaks a deep background.');
}
for(const next of [changedWord('nextline',0,80),changedWord('nextside',15,100,'LCAfterChanged1'),changedWord('nextitem',15,100,'LCBeforeChanged2'),changedWord('nextcolumn',100)]){
  assert.equal(proofreadHighlights({styles:content.styles,items:[...changedWord('first',0),...next]},new Set([1,2])).filter(mark=>mark.strong).length,2,'Do not bridge lines, sides, suggestions or distant columns.');
}
const asyncPage=element();let releaseContent;
const pdfPage={getTextContent:()=>new Promise(resolve=>releaseContent=resolve)};
const asyncView={div:asyncPage,pdfPage,viewport:{convertToViewportPoint:(x,y)=>[x,800-y]}};
paintProofreadActions({getPageView:()=>asyncView},{pdf_revision:'shown',regions:[{id:1,page:1,rect:[20,80,45,108]}]},[annotation],'shown',key=>key);
const detached=asyncPage.children[0];detached.isConnected=false;
releaseContent(content);await Promise.resolve();await Promise.resolve();
assert.equal(detached.children.length,0,'Late text extraction must not paint a detached preview.');
console.log('PASS: disposable-only requests, Unicode ranges, deduplication, stale response exclusion, restore, errors and independent PDF controls');
