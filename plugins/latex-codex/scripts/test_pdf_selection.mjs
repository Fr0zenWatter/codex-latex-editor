// Run: node test_pdf_selection.mjs (stdlib only).
import assert from 'node:assert/strict';
import {boxedPdfContent,attachPdfBoxSelection} from './vendor/latex-pdf-selection.mjs';
import {pdfTextRect,pdfWords} from './vendor/latex-pdf-analysis.mjs';

const glyph = (str,x,y,size=10,width=5) => ({str,transform:[size,0,0,size,x,y],width,height:size,fontName:'f'});
const content = {styles:{f:{ascent:1,descent:0}},items:[
  glyph('12',2,70,6,8),glyph('A',20,70),glyph(' ',25,70,10,3),glyph('B',28,70),
  glyph('n',55,80,6),glyph('d',55,60,6),glyph('2',62,84,5),glyph('outside',90,70,10,30),
]};
const selected = boxedPdfContent(content,1,[18,58,69,90]);
assert.equal(selected.text,'A Bnd2','Copy keeps real spaces, and geometry includes both fraction rows and superscripts.');
assert.equal(selected.fragments.length,5);
assert.equal(selected.points.length,4);
assert.equal(boxedPdfContent(content,1,[0,0,1,1]),null);
assert.equal(boxedPdfContent(content,1,[20,70,20.5,80]),null,'A slight edge touch must not select a neighboring glyph.');
assert.equal(boxedPdfContent(content,1,[0,50,85,95],[[0,60,15,85]]).text,'A Bnd2','Exclude margin line numbers without excluding formula digits.');
assert.deepEqual(pdfTextRect({...glyph('r',30,40),transform:[0,10,-10,0,30,40]},content.styles),[20,40,30,45],'Use rotated glyph geometry.');
assert.deepEqual(pdfWords({styles:content.styles,items:[...('旧句。下一句。')].map((text,i)=>glyph(text,20+i*5,70))},1).map(word=>word[2]),
  ['旧句。','下一句。'],'Keep separate CJK sentences even when their glyphs share one row.');
const wrapped = {styles:{...content.styles,extension:{ascent:0,descent:0}},items:[
  glyph('condi-',20,70,10,30),{...glyph('',20,55),width:0,height:0,hasEOL:true},
  glyph('tion ',20,55,10,24),{...glyph('√',44,55,10,8),fontName:'extension'},glyph('k',52,55),
]};
const wrappedBox = boxedPdfContent(wrapped,1,[18,50,60,85]);
assert.equal(wrappedBox.text,'condi-\ntion √k','Zero-size EOL markers and zero-metric math fonts must survive extraction.');
assert.equal(wrappedBox.fragments.map(fragment=>fragment.text).join(''),wrappedBox.text,'Formula/prose runs retain actual line breaks between glyphs.');
assert(wrappedBox.rectangles.every(({rect})=>rect[3]>rect[1]),'Fallback font metrics give radical glyphs a selectable rectangle.');

const tick = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
let reads=0, requests=0, deferred=null, fail=false;
const pdf = {getPage:async () => {requests++;return {getTextContent:async options => {
  reads++;assert(options.disableCombineTextItems && options.disableNormalization);
  if(fail)throw new Error('glyph read failed');
  return deferred ? await deferred : content;
}};}};
const viewport = {width:200,height:200,convertToPdfPoint:(x,y)=>[x/2,100-y/2],convertToViewportPoint:(x,y)=>[x*2,200-y*2]};
const page = {dataset:{pageNumber:'1'},clientLeft:0,clientTop:0,clientWidth:200,clientHeight:200,children:[],
  getBoundingClientRect:()=>({left:10,top:20}),append(mark){mark.parent=this;this.children.push(mark);}};
const document = {defaultView:{getComputedStyle:target=>({cursor:target.cursor}),getSelection:()=>({removeAllRanges(){}})},
  createElement:()=>({style:{},setAttribute(){},remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);},
    getBoundingClientRect(){const left=10+parseFloat(this.style.left),top=20+parseFloat(this.style.top);return {left,top,bottom:top+parseFloat(this.style.height)};}})};
const preview = {ownerDocument:document,classList:{add(){},remove(){}},captured:null,
  setPointerCapture(id){this.captured=id;},hasPointerCapture(id){return this.captured===id;},releasePointerCapture(){this.captured=null;}};
const viewer = {pdfDocument:pdf,getPageView:()=>({viewport})};
const messages=[], snapshots=[],capture=()=>({version:'v1',pdf_revision:'p1',source:'original'});
const controller = attachPdfBoxSelection({preview,viewer,capture,onSelect:s=>snapshots.push(s),message:(key)=>messages.push(key)});
const completedBounds=[];
const completed = attachPdfBoxSelection({preview,viewer,capture,onSelect:s=>{
  if(s)completedBounds.push(completed.bounds());
},message(){}});
const event = (x=46,y=40,extra={}) => ({button:0,buttons:1,pointerType:'mouse',pointerId:1,clientX:x,clientY:y,
  target:{cursor:'auto',closest:()=>page},preventDefault(){this.prevented=true;},...extra});
assert(!controller.start(event(46,40,{target:{cursor:'text',closest:()=>page}})),'Keep native I-beam selection.');
assert(!controller.start(event(46,40,{shiftKey:true})),'Keep modified native gestures.');
assert(controller.start(event()));assert.equal(preview.captured,1);
controller.move(event(47,41));controller.end(event(47,41,{type:'pointerup'}));await tick();
assert.equal(reads,0,'A click or sub-threshold movement must not extract text.');
assert.equal(preview.captured,null);

const drag = (reverse=false) => {
  controller.start(reverse?event(148,104):event());
  controller.move(reverse?event():event(148,104));
  assert.equal(page.children.at(-1).className,'pdf-box-frame');
  assert(controller.end(reverse?event(46,40,{type:'pointerup'}):event(148,104,{type:'pointerup'})));
};
controller.start(event());controller.move(event(148,104));
assert.equal(reads,0,'Dragging only paints a rectangle; extraction starts on release.');
controller.end(event(148,104,{type:'pointerup'}));await tick();
assert.equal(reads,1);assert.equal(controller.selection.text,selected.text);
assert.equal(controller.selection.source,'original');assert.equal(controller.selection.version,'v1');
assert(page.children.every(mark=>mark.className==='pdf-box-highlight'));
assert.deepEqual(controller.bounds(),{left:50,top:42,bottom:100});
drag(true);await tick();
assert.equal(reads,1,'Reverse drags reuse the same page glyph cache.');
assert.equal(controller.selection.text,selected.text);
controller.start(event());controller.move(event(148,104));controller.end(event(148,104,{type:'pointercancel'}));await tick();
assert.equal(controller.selection,null);assert.equal(page.children.length,0);assert.equal(reads,1);
controller.start(event());controller.move(event(148,104,{buttons:0}));assert.equal(preview.captured,null);

viewer.pdfDocument={...pdf};
let resolve;deferred=new Promise(r=>{resolve=r;});drag();await tick();
assert.equal(reads,2);controller.clear();resolve(content);await tick();
assert.equal(controller.selection,null,'Clearing a pending selection must discard late glyph results.');
assert.equal(page.children.length,0);deferred=null;
drag();await tick();assert.equal(reads,2,'The completed page cache remains reusable after cancellation.');
assert(controller.selection);
controller.clear();
viewer.pdfDocument={...pdf};fail=true;drag();await tick();assert.equal(controller.selection,null);
assert.equal(messages.at(-1),'框选失败：{message}');
fail=false;drag();await tick();assert(controller.selection,'A failed glyph read can be retried.');
assert.equal(reads,4);
controller.start(event());controller.move(event(600,600));controller.end(event(600,600,{type:'pointerup'}));await tick();
assert(controller.selection.fragments.every(f=>f.page===1),'A captured drag outside the page stays on its starting page.');
controller.clear();assert.equal(preview.captured,null);assert.equal(page.children.length,0);
assert.equal(requests,4);
completed.start(event());completed.move(event(148,104));completed.end(event(148,104,{type:'pointerup'}));await tick();
assert.deepEqual(completedBounds,[{left:50,top:42,bottom:100}],'Completed-selection callbacks can anchor the composer to the final glyph highlights.');
completed.clear();
console.log('PASS: geometric text/fraction/script selection, margin exclusion, rotated glyphs, native text gestures, reverse drag, page cache, cancellation and failed reads');
