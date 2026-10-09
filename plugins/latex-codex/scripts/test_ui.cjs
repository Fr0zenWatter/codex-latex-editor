// Run: node test_ui.cjs (stdlib only); UI interaction is also checked in-browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const zoomScript = fs.readFileSync(path.join(__dirname, 'vendor/latex-zoom.mjs'), 'utf8').replace('export function', 'function');
const script = zoomScript + '\n' + fs.readFileSync(path.join(__dirname, 'editor.py'), 'utf8').replace(/\r\n/g, '\n').match(/<script type="module">\n([\s\S]*?)<\/script>/)[1].replace(/^import .*;\n/gm, '');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    children: [], append(child) { child.parent=this; this.children.push(child); },
    replaceChildren(...children) { this.children=[]; children.forEach(child=>this.append(child)); },
    querySelector() { return this.children[0] ?? (this.children[0] = element(Symbol())); }, contains(node) { return node === this || this.children.includes(node); }, querySelectorAll() { return []; },
    get lastElementChild() { return this.children.at(-1); },
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
    dataset: {}, srcWrites: 0, set src(value) { this.imageSource=value; this.srcWrites++; },
    style: {setProperty(key, value) { this[key] = value; }},
    attributes:{},classList: {add() {}, remove() {}, toggle() {}}, setAttribute(key,value) {this.attributes[key]=value;},
    showPopover(){this.open=true;},hidePopover(){this.open=false;},focus(){this.focused=true;},
    events:{},addEventListener(name,handler){this.events[name]=handler;},getBoundingClientRect(){return {left:120,top:180,width:280,height:28,bottom:208};},
    offsetWidth:240,offsetHeight:42,
    setPointerCapture(id) { this.captured = id; },
    hasPointerCapture(id) { return this.captured === id; },
    releasePointerCapture() { this.captured = null; },
    scrollTop: 200, scrollLeft: 0, clientHeight: 600, clientWidth: 400, scrollWidth: 500, offsetTop: 0,
  });
  return elements.get(id);
}
const actions = {}, mappings = [], options = {}, editorEvents = {};
const stored = new Map([['latex-codex-editor-mode','default']]);
let vimEscapes=0,emacsQuits=0;
let selected=false,commentCalls=0,cursorChanges=0;
const chatOpened=[];
const editor = {
  getWrapperElement:()=>element('.CodeMirror'),
  refreshes:0,
  state:{},closeHint(){this.closedHint=true;},showHint(config){this.hint=config;},swapDoc(doc){this.doc=doc;},
  setExtending(value){this.extending=value;},openDialog(template,callback,config){this.dialog=config;},
  lastLine:()=>99,lineCount:()=>100,addLineClass(line,where,name){this.marks??=new Set();this.marks.add(where+':'+name);return {line};},
  removeLineClass(line,where,name){this.marks.delete(where+':'+name);},
  scrollIntoView(cursor,margin){this.jump={...cursor,margin};},
  on(name,fn) {editorEvents[name]=fn;}, setOption(key, value) { options[key] = value; },
  toggleComment(){commentCalls++;},somethingSelected:()=>selected,
  coordsChar:()=>({line:3,ch:2}),setCursor(cursor){cursorChanges++;this.cursor=cursor;},focus(){},refresh(){this.refreshes=(this.refreshes||0)+1;},
  setSelection(from,to){this.selection={from,to};},
  getOption: key => options[key], getCursor: () => ({line: 88, ch: 8}),
  charCoords: () => ({left:80,top:880,bottom:900}), getScrollInfo: () => ({left:0,top:200,clientHeight: 600}),
  scrollTo(x, y) { this.scroll = [x, y]; },
};
const views = [element('page1'),element('page2')].map(div=>({div,viewport:{width:500,height:700,convertToPdfPoint:(x,y)=>[x,700-y],convertToViewportPoint:(x,y)=>[x,700-y]},setPdfPage(page){this.pdfPage=page;}}));
const viewer = {
  fitChanges:0,
  currentPageNumber:1,pagesCount:2,currentScale:1,pdfDocument:null,
  getPageView(index){return views[index];},update(){},
  scaleUpdates:[],refreshes:0,
  updateScale(config){this.scaleUpdates.push(config);this.currentScale=Math.round(this.currentScale*config.scaleFactor*100)/100;},
  panBy(dx,dy){element('#preview').scrollLeft-=dx;element('#preview').scrollTop-=dy;},
  refresh(){this.refreshes++;},
  set currentScaleValue(value){assert.equal(value,'page-width');this.fitChanges=(this.fitChanges||0)+1;this.currentScale=1;},
  setDocument(pdf){this.pdfDocument=pdf;this.pagesCount=pdf?.numPages||0;this.currentScale=1;this.firstPagePromise=Promise.resolve();},
};
const pdf = {numPages:2,getPage:async()=>({})};
let destroyed=0,downloads=0;
const windowHandlers={},uiTimers=new Map();let uiTimerId=0;
const animationFrames=new Map(),resizeObservers=[];let animationFrameId=0;
let animationTime=0;const reducedMotion={matches:true};
function flushAnimationFrames(){animationTime+=16;const callbacks=[...animationFrames.values()];animationFrames.clear();callbacks.forEach(fn=>fn(animationTime));}
function settleAnimation(){for(let i=0;animationFrames.size&&i<120;i++)flushAnimationFrames();assert.equal(animationFrames.size,0);}
const context = vm.createContext({
  preferences:{getItem(key){return stored.get(key);},setItem(key,value){stored.set(key,value);}},
  t:key=>key, setText:(element,key,values={})=>{element.textContent=key.replace(/\{(\w+)\}/g,(match,name)=>values[name]??match);},initSettings(){}, initScreenshotThemes(){}, applyCustomTheme(){return false;},
  attachMathHover(){return {setMainSource(){}};},attachNativeAnnotations(){},attachSelectionChat(){return {open(){chatOpened.push('full');},openQuick(anchor){chatOpened.push(anchor);},refreshAnnotations(){},busy:false};},attachHistory(){},mountHistoryTabs(){},katex:{},
  attachProjectReview(){return {items:[],busy:false,refresh:async()=>{},clear(){}};},
  attachProofreadPdf(){return {update(){},invalidate(){},active:false};},paintProofreadActions(){},
  attachProofreadNavigation(config){config.button.navigation=config;return {update(){}};},proofreadPdfPositions(){return [];},
  mountSourceWheel({button}){return {update(data){button.textContent=data.files.find(file=>file.path===data.path)?.name;button.files=data.files;button.mainFile=data.mainFile;},setDisabled(value){button.disabled=value;}};},
  pdfPageBoxes:async()=>[[0,0,600,800],[0,0,600,800]],
  attachPdfBoxSelection(config){context.boxConfig=config;return {selection:null,clear(){this.selection=null;config.onSelect(null);},start(){return false;},move(){return false;},end(){return false;},bounds(){return {left:20,top:30,bottom:70};}};},
  attachPdfOutline(){return {clear(){},load:async()=>{}};},
  attachSourceSearch(){return {open(){context.searchOpened=true;},close(){}};},
  attachMarkdownPreview(){return {render(source){context.markdownRendered=source;},clear(){},locate(){context.markdownLocated=true;}};},
  pdfjsLib:{GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(pdf),async destroy(){destroyed++;}})},
  EventBus:class{on(){}},PDFLinkService:class{setViewer(){} setDocument(){}},PDFViewer:function(){return viewer;},
  ResizeObserver:class{constructor(callback){this.callback=callback;}observe(target){resizeObservers.push({target,callback:this.callback});}},MutationObserver:class{observe(){}},Uint8Array,
  requestAnimationFrame(fn){animationFrames.set(++animationFrameId,fn);return animationFrameId;},cancelAnimationFrame(id){animationFrames.delete(id);},
  document: {querySelector: element, createElement: () => element(Symbol()), documentElement: {dataset: {}},body:{dataset:{}}},
  CodeMirror: {Doc:class{constructor(source,mode){this.source=source;this.mode=mode;}},hint:{latex:()=>({list:['\\begin']})},fromTextArea: (_,configuration) => {Object.assign(options,configuration);return editor;},
    keyName:event=>event.key,e_stop:event=>{event.stopped=true;},signal(){},emacs:{repeated:fn=>fn},commands: {clearSearch(){},keyboardQuit(){emacsQuits++;}}, Vim: {
    handleKey(cm,key){assert.equal(key,'<Esc>');vimEscapes++;},
    defineAction: (name, fn) => actions[name] = fn,
    mapCommand: (...args) => mappings.push(args),
  }},
  localStorage: {getItem(key) { return stored.get(key); }, setItem(key,value) { stored.set(key,value); }},
  performance:{now:()=>animationTime},
  window: {innerWidth:1000,innerHeight:800,matchMedia:()=>reducedMotion,addEventListener(name,handler) {(windowHandlers[name]??=[]).push(handler);}}, setInterval() {},setTimeout(fn){uiTimers.set(++uiTimerId,fn);return uiTimerId;},clearTimeout(id){uiTimers.delete(id);},
  fetch: () => new Promise(() => {}),
});
vm.runInContext(script, context);
const themeSelect=element('#theme');
for(const [value,cmTheme] of [['neo','neo'],['solarized-light','solarized light'],['solarized-dark','solarized dark'],['material-palenight','material-palenight'],['cobalt','cobalt']]){
  themeSelect.value=value;themeSelect.onchange();
  assert.equal(options.theme,cmTheme);assert.equal(context.document.documentElement.dataset.theme,value);
  assert.equal(stored.get('latex-codex-theme'),value);
}
assert.equal(options.keyMap,'default','Load the remembered non-Vim mode.');
for(const key of ['Ctrl-F','Cmd-F']) { options.extraKeys[key](); assert(context.searchOpened); context.searchOpened=false; }
element('#log').hidden=true;const logPosition=element('#preview').scrollTop;
element('#log-toggle').onclick();assert(!element('#log').hidden);assert(element('#preview').inert);
assert.equal(element('#log-toggle').attributes['aria-pressed'],'true');assert.equal(element('#preview').style.visibility,'hidden');
element('#log-toggle').onclick();assert(element('#log').hidden);assert(!element('#preview').inert);assert.equal(element('#preview').scrollTop,logPosition,'PDF/log switching must preserve PDF position.');
options.readOnly=false;
vm.runInContext('completeLatex(editor)',context);
assert(editor.hint,'Standard editing must offer LaTeX completion.');
editor.hint.extraKeys.Esc(editor,{close(){}});assert.equal(vimEscapes,0,'Escape must not enter Vim from standard completion.');
vm.runInContext("display({source:'loaded source',version:'v',name:'paper.tex',path:'paper.tex'})",context);
assert.equal(options.keyMap,'default','Opening/reloading/restoring must preserve standard editing.');
const modeSelect=element('#editor-mode');modeSelect.value='vim';modeSelect.onchange();
assert.equal(options.keyMap,'vim');
assert.equal(options.extraKeys['Ctrl-C'],false,'Vim leaves Ctrl+C to native copy without cancelling the mode.');
let vimDialogForwarded=0,vimDialogClosed=0;
editor.openDialog('Vim search',()=>{}, {onKeyDown(){vimDialogForwarded++;}});
const vimCopy={key:'Ctrl-C',stopPropagation(){this.stopped=true;}};
assert.equal(editor.dialog.onKeyDown(vimCopy,'query',()=>vimDialogClosed++),true);
assert(vimCopy.stopped);assert.equal(vimDialogForwarded,0);assert.equal(vimDialogClosed,0);
options.keyMap='vim-insert';vm.runInContext('completeLatex(editor)',context);
editor.hint.extraKeys.Esc(editor,{close(){}});assert.equal(vimEscapes,1);
modeSelect.value='default';modeSelect.onchange();assert.equal(stored.get('latex-codex-editor-mode'),'default');
assert(!Object.hasOwn(options.extraKeys,'Ctrl-C'),'Standard editing retains its native keymap.');
assert.equal(options.showCursorWhenSelecting,true);
modeSelect.value='emacs';modeSelect.onchange();
assert.equal(options.keyMap,'emacs');assert.equal(stored.get('latex-codex-editor-mode'),'emacs');
assert.equal(options.showCursorWhenSelecting,true);assert.equal(editor.extending,false);
for(const key of ['Ctrl-S','Ctrl-Space','Ctrl-/']) assert(!Object.hasOwn(options.extraKeys,key),`${key} must reach the Emacs keymap.`);
assert.equal(typeof options.extraKeys['Cmd-S'],'function');
options.extraKeys['Alt-/'](editor);assert.equal(editor.hint.hint,context.CodeMirror.hint.latex);
options.extraKeys['Alt-;'](editor);assert.equal(commentCalls,1);commentCalls=0;
const beforeEmacsEscape=vimEscapes;editor.hint.extraKeys.Esc(editor,{close(){}});
assert.equal(vimEscapes,beforeEmacsEscape,'Emacs completion must not enter Vim.');
editor.hint.extraKeys['Ctrl-G'](editor,{close(){}});assert.equal(emacsQuits,1);
vm.runInContext("display({source:'loaded source',version:'v',name:'paper.tex',path:'paper.tex'})",context);
assert.equal(options.keyMap,'emacs','Opening/reloading/restoring must preserve Emacs editing.');
let dialogClosed=0,dialogForwarded=0;
editor.openDialog('Search',()=>{}, {onKeyDown(){dialogForwarded++;return 'forwarded';}});
const quit={key:'Ctrl-G'};
assert.equal(editor.dialog.onKeyDown(quit,'query',()=>dialogClosed++),true);
assert(quit.stopped);assert.equal(dialogClosed,1);assert.equal(emacsQuits,2);
assert.equal(editor.dialog.onKeyDown({key:'Ctrl-S'},'query',()=>{}),'forwarded');assert.equal(dialogForwarded,1);
modeSelect.value='vim';modeSelect.onchange();assert.equal(options.keyMap,'vim');
assert.equal(typeof options.extraKeys['Ctrl-S'],'function');assert.equal(typeof options.extraKeys['Ctrl-Space'],'function');
const splitter=element('#splitter');element('main').clientWidth=1006;
const sourceShare=()=>Number(element('main').style.gridTemplateColumns.match(/minmax\(0,([\d.]+)fr\)/)[1]);
const resizePreview=resizeObservers.find(item=>item.target===element('#preview')).callback;
resizePreview();
const dragRefreshes=editor.refreshes||0,dragFits=viewer.fitChanges||0;
const resizePointer={pointerId:2,button:0,buttons:1,clientX:500,preventDefault(){}};
splitter.onpointerdown(resizePointer);splitter.onpointermove({...resizePointer,clientX:700});
splitter.onpointermove({...resizePointer,clientX:720});
assert.equal(animationFrames.size,1,'Coalesce pointer moves into one animation frame.');
flushAnimationFrames();assert.equal(sourceShare(),0.72);
assert.equal(editor.refreshes,dragRefreshes,'Do not remeasure source lines while dragging.');
element('#preview').clientWidth=360;resizePreview();
assert.equal(viewer.fitChanges,dragFits,'Do not rerender the PDF on intermediate pane widths.');
splitter.onpointermove({...resizePointer,clientX:2000});
splitter.onpointerup(resizePointer);splitter.onpointermove({...resizePointer,clientX:0});
assert.equal(sourceShare(),0.85);assert.equal(splitter.captured,null);
assert.equal(animationFrames.size,0,'Flush the final pointer position and cancel queued frames on release.');
assert.equal(editor.refreshes,dragRefreshes+1);
assert.equal(viewer.fitChanges,dragFits+1);
resizePreview();assert.equal(viewer.fitChanges,dragFits+1,'The final ResizeObserver notification must not render twice.');
assert.equal(stored.get('latex-codex-split'),'0.85');
element('#preview').clientWidth=400;resizePreview();
splitter.ondblclick();assert.equal(sourceShare(),0.5);
splitter.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(sourceShare(),0.48);
splitter.onkeydown({key:'Home',preventDefault(){}});assert.equal(sourceShare(),0.5);
splitter.onpointerdown(resizePointer);splitter.onpointercancel(resizePointer);
splitter.onpointermove({...resizePointer,clientX:700});assert.equal(sourceShare(),0.5);
options.readOnly=false;
options.extraKeys['Alt-/'](editor);assert.equal(commentCalls,1);
assert.equal(options.extraKeys['Alt-/'],options.extraKeys['Ctrl-/']);
assert.equal(options.extraKeys['Cmd-/'],options.extraKeys['Ctrl-/']);
const contextClick={clientX:980,clientY:790,button:2,preventDefault(){this.prevented=true;}};
editorEvents.contextmenu(editor,contextClick);
assert(contextClick.prevented);assert.equal(cursorChanges,1);
assert.equal(element('#editor-menu').style.left,'752px');
assert.equal(element('#editor-menu').style.top,'750px');
assert(element('#toggle-comment').focused);
element('#toggle-comment').onclick();assert.equal(commentCalls,2);assert(!element('#editor-menu').open);
selected=true;editorEvents.contextmenu(editor,contextClick);assert.equal(cursorChanges,1);
editorEvents.scroll();assert(!element('#editor-menu').open);
editorEvents.contextmenu(editor,{...contextClick,clientX:0,clientY:0});
assert.equal(cursorChanges,1);assert.equal(element('#editor-menu').style.left,'80px');
element('#editor-menu').hidePopover();
editorEvents.contextmenu(editor,{...contextClick,shiftKey:true});assert(!element('#editor-menu').open);
options.readOnly='nocursor';
options.extraKeys['Alt-/'](editor);editorEvents.contextmenu(editor,contextClick);
assert.equal(commentCalls,2);assert(!element('#editor-menu').open);
options.readOnly=false;
for(const [keys,mode] of [['gcc','normal'],['gc','visual']]){
  const mapping=mappings.find(mapping=>mapping[0]===keys&&mapping[4].context===mode);
  assert(mapping);actions[mapping[2]](editor);
}
assert.equal(commentCalls,4);
element('#zoom-fit').events.wheel({deltaY:-120,preventDefault(){},stopPropagation(){}});
assert.equal(viewer.currentScale, 1.25);
assert.equal(element('#preview').scrollTop, 200);
assert.equal(element('#zoom-fit').textContent, '125%');
for (let i = 0; i < 20; i++) element('#zoom-fit').events.wheel({deltaY:-120,preventDefault(){},stopPropagation(){}});
assert.equal(element('#zoom-fit').textContent, '500%');
assert.equal(element('#pdf-zoom-dial').attributes['aria-valuenow'], '500');
for (let i = 0; i < 20; i++) element('#zoom-fit').events.wheel({deltaY:120,preventDefault(){},stopPropagation(){}});
assert.equal(element('#zoom-fit').textContent, '30%');
assert.equal(viewer.currentScale, .3);
assert.equal(element('#pdf-zoom-dial').attributes['aria-valuenow'], '30');
element('#zoom-fit').onclick();
assert.equal(viewer.currentScale, 1);
assert.equal(element('#pdf-zoom-dial').attributes['aria-valuenow'], '100');
const zoomWheel={ctrlKey:true,deltaY:-120,preventDefault(){this.prevented=true;}};
element('#preview').events.wheel(zoomWheel);
assert(zoomWheel.prevented, 'Ctrl+wheel must suppress browser-wide zoom.');
assert.equal(element('#zoom-fit').textContent,'125%');
assert.equal(viewer.currentScale,1.25);
element('#preview').events.wheel({...zoomWheel,deltaY:120});
assert.equal(element('#zoom-fit').textContent,'100%');
for(let i=0;i<20;i++) element('#preview').events.wheel({...zoomWheel,deltaY:120});
assert.equal(element('#zoom-fit').textContent,'30%');
assert.equal(element('#pdf-zoom-dial').attributes['aria-valuenow'], '30');
element('#zoom-fit').onclick();
for(const ignored of [{ctrlKey:false},{deltaY:0}]){
  const event={...zoomWheel,...ignored,prevented:false};
  element('#preview').events.wheel(event);
  assert.equal(event.prevented,false);
  assert.equal(element('#zoom-fit').textContent,'100%');
}
element('#preview').inert=true;
const logWheel={...zoomWheel,prevented:false};
element('#preview').events.wheel(logWheel);
assert.equal(logWheel.prevented,false,'Do not zoom the hidden PDF while viewing compile logs.');
element('#preview').inert=false;
const zoomDial=element('#pdf-zoom-dial'),zoomButton=element('#zoom-fit');
zoomButton.onpointerenter();assert(zoomDial.open);assert.equal(zoomButton.attributes['aria-expanded'],'true');
zoomButton.onpointerleave();zoomDial.onpointerenter();
for(const fn of [...uiTimers.values()])fn();uiTimers.clear();
assert(zoomDial.open,'Crossing from the percentage to the lower arc must keep the dial open.');
const zoomPointer={pointerId:9,button:0,clientX:260,clientY:266,preventDefault(){}};
const fitBeforeDrag=viewer.fitChanges;
reducedMotion.matches=false;
zoomDial.onpointerdown(zoomPointer);
zoomDial.onpointermove({...zoomPointer,clientX:284});
zoomDial.onpointermove({...zoomPointer,clientX:306});
assert.equal(viewer.fitChanges,fitBeforeDrag,'Drag zoom renders once per animation frame.');
assert.equal(animationFrames.size,1);flushAnimationFrames();
assert(Number.parseInt(zoomButton.textContent)>100);assert.equal(element('#preview').scrollTop,200);
zoomDial.onpointerup({...zoomPointer,clientX:306});assert.equal(zoomDial.captured,null);
settleAnimation();
const settledZoom=zoomButton.textContent;
zoomDial.onpointermove({...zoomPointer,clientX:100});assert.equal(animationFrames.size,0);assert.equal(zoomButton.textContent,settledZoom);
zoomButton.onclick();settleAnimation();
const tickNodes=[...zoomDial.children[0].children];
zoomButton.events.wheel({deltaY:-60,preventDefault(){},stopPropagation(){}});
assert.equal(zoomButton.textContent,'100%','A smooth wheel event starts an animation rather than jumping 25%.');
flushAnimationFrames();
assert(vm.runInContext('pdfZoom',context)>100&&vm.runInContext('pdfZoom',context)<112.5,'Wheel frames must interpolate the actual PDF scale.');
assert.equal(zoomDial.children[0].children[0],tickNodes[0],'Tick DOM nodes persist throughout rotation.');
settleAnimation();assert.equal(zoomButton.textContent,'113%');
zoomButton.onclick();settleAnimation();reducedMotion.matches=true;
const keyEvent=key=>({key,preventDefault(){},stopPropagation(){}});
zoomDial.onkeydown(keyEvent('End'));assert.equal(zoomButton.textContent,'500%');
zoomDial.onkeydown(keyEvent('Home'));assert.equal(zoomButton.textContent,'30%');
zoomDial.onkeydown(keyEvent('Escape'));assert(!zoomDial.open);assert(zoomButton.focused);
zoomButton.onclick();zoomButton.onpointerenter();element('#log-toggle').onclick();
assert(!zoomDial.open,'Opening compile logs also hides the zoom dial.');
const hiddenZoom={deltaY:-120,preventDefault(){throw new Error('Hidden zoom consumed the wheel');},stopPropagation(){}};
zoomButton.events.wheel(hiddenZoom);assert(!zoomDial.open);
element('#log-toggle').onclick();
vm.runInContext("busy=true;synchronize('forward')", context);
assert.equal(vm.runInContext('pendingForward', context), true);
vm.runInContext("pendingForward=false;synchronize('backward')", context);
assert.equal(vm.runInContext('pendingForward', context), false);
let direction;
const realSynchronize=vm.runInContext('synchronize',context);
context.recordSync = value => direction = value;
vm.runInContext('synchronize=recordSync', context);
assert.equal(mappings[0][0], 'zz');
assert.equal(mappings[0][4].context, 'normal');
actions[mappings[0][2]](editor);
assert.deepEqual(editor.scroll, [null, 600]);
assert.equal(direction, 'forward');
const beforeGutterCursor=cursorChanges;
let gutterPrevented=0;
const gutterClick={button:0,detail:1,preventDefault(){gutterPrevented++;}};
editorEvents.gutterClick(editor,12,'CodeMirror-linenumbers',gutterClick);
editorEvents.gutterClick(editor,12,'CodeMirror-linenumbers',{...gutterClick,detail:2,button:2});
editorEvents.gutterClick(editor,12,'other-gutter',{...gutterClick,detail:2});
options.readOnly='nocursor';
editorEvents.gutterClick(editor,12,'CodeMirror-linenumbers',{...gutterClick,detail:2});
assert.equal(cursorChanges,beforeGutterCursor,'Single clicks, other gutters, right clicks and readonly mode do not jump.');
options.readOnly=false;direction=null;
editorEvents.gutterClick(editor,12,'CodeMirror-linenumbers',{...gutterClick,detail:2});
assert.equal(gutterPrevented,1);
assert.deepEqual(JSON.parse(JSON.stringify(editor.cursor)),{line:12,ch:0});
assert.equal(direction,'forward','Double-clicking a logical source line uses the existing SyncTeX forward lookup.');
const preview = element('#preview');
const pdfImage = {dataset: {pageNumber: '2'},clientLeft:0,clientTop:0,clientWidth:500,clientHeight:700,getBoundingClientRect: () => ({left: 0, top: 0, width: 500, height: 700})};
const pointer = {pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 200, clientY: 200,
  target: {closest: selector => selector === '.page' ? pdfImage : null}, preventDefault() {}};
preview.scrollLeft = 100; preview.scrollTop = 300;
preview.onpointerdown(pointer);
preview.onpointermove({...pointer, clientX: 202});
assert.equal(preview.scrollLeft, 100); // A shaky click must not start a drag.
assert.equal(preview.captured, undefined);
preview.onpointermove({...pointer, clientX: 160, clientY: 150});
assert.equal(preview.scrollLeft, 140);
assert.equal(preview.scrollTop, 350);
assert.equal(preview.captured, 1);
preview.onpointerup(pointer);
preview.onpointermove({...pointer, clientX: 0});
assert.equal(preview.scrollLeft, 140);
assert.equal(preview.captured, null);
direction = null; preview.ondblclick(pointer);
assert.equal(direction, null); // Dragging must not navigate to source.
preview.onpointerdown(pointer); preview.onpointerup(pointer); preview.ondblclick(pointer);
assert.equal(direction, 'backward');
preview.onpointerdown(pointer); preview.onpointercancel(pointer);
preview.onpointermove({...pointer, clientX: 0});
assert.equal(preview.scrollLeft, 140);
preview.onpointerdown({...pointer, button: 2});
preview.onpointermove({...pointer, clientX: 0});
assert.equal(preview.scrollLeft, 140);
preview.onpointerdown(pointer);
preview.onpointermove({...pointer, buttons: 0, clientX: 0}); // Released outside the pane.
assert.equal(preview.scrollLeft, 140);
element('#pan-mode').onclick();
preview.onpointerdown(pointer);
preview.onpointermove({...pointer,clientX:0});
assert.equal(preview.scrollLeft,140,'Selecting text must not drag the PDF.');
direction=null;preview.ondblclick(pointer);
assert.equal(direction,null,'Double-click in selection mode must retain the PDF word selection.');
const space={code:'Space',target:{closest:()=>null},preventDefault(){this.prevented=true;}};
preview.onkeydown(space);assert(space.prevented);assert.equal(vm.runInContext('spacePan',context),true);
assert.equal(element('#pan-label').textContent,'选字','Temporary panning must preserve the selected mode.');
assert(!element('#pan-hint').hidden,'Selecting text briefly explains Space panning.');
uiTimers.get(uiTimerId)();assert(element('#pan-hint').hidden,'The hint must disappear automatically.');
preview.onkeydown({...space,repeat:true});
preview.onpointerdown(pointer);preview.onpointerup(pointer);direction=null;preview.ondblclick(pointer);
assert.equal(direction,'backward','Space double-click must locate the LaTeX source.');
assert.equal(vm.runInContext('spaceLocked',context),true);
const repeatedSpace={...space,repeat:true,target:{closest:()=>({})},stopImmediatePropagation(){this.stopped=true;}};
windowHandlers.keydown.forEach(handler=>handler(repeatedSpace));
assert(repeatedSpace.prevented&&repeatedSpace.stopped,'Held Space must not reach the source editor after a PDF jump.');
vm.runInContext('endSpacePan()',context);
assert.equal(vm.runInContext('spaceLocked',context),true,'Moving focus away from PDF must preserve the held-key lock.');
windowHandlers.keyup.forEach(handler=>handler({...space}));
assert.equal(vm.runInContext('spaceLocked',context),false);
const freshSpace={...space,prevented:false,stopped:false,stopImmediatePropagation(){this.stopped=true;}};
windowHandlers.keydown.forEach(handler=>handler(freshSpace));
assert(!freshSpace.prevented&&!freshSpace.stopped,'A fresh Space press must work normally after release.');
preview.onkeydown({...space});
preview.onpointerdown(pointer);preview.onpointermove({...pointer,clientY:150});
assert.equal(preview.scrollTop,400);assert.equal(preview.captured,1);
direction=null;preview.ondblclick(pointer);assert.equal(direction,null,'Space dragging must not trigger a source jump.');
windowHandlers.keyup.forEach(handler=>handler({...space}));
assert.equal(vm.runInContext('spacePan',context),false);assert.equal(preview.captured,null);
preview.onpointermove({...pointer,clientY:100});assert.equal(preview.scrollTop,400,'Space release immediately ends dragging.');
preview.onpointerdown(pointer);preview.onpointermove({...pointer,clientY:100});
assert.equal(preview.scrollTop,400,'Selection mode resumes after release.');
direction=null;preview.ondblclick(pointer);assert.equal(direction,null,'After release, double-click selects PDF text.');
preview.onkeydown({...space});windowHandlers.blur.forEach(handler=>handler());
assert.equal(vm.runInContext('spacePan',context),false,'Losing window focus must release temporary panning.');
preview.onkeydown({...space,ctrlKey:true});assert.equal(vm.runInContext('spacePan',context),false);
preview.onkeydown({...space,target:{closest:()=>({})}});assert.equal(vm.runInContext('spacePan',context),false,'Typing inside PDF form fields must retain space.');

// Space + Alt scrubs around the initial pointer, without panning or source navigation.
const alt={key:'Alt',code:'AltLeft',altKey:true,target:space.target,preventDefault(){this.prevented=true;}};
const zoomDrag={...pointer,altKey:true};
for(const altFirst of [true,false]){
  vm.runInContext('setPdfZoom(100)',context);
  preview.onkeydown(altFirst?alt:space);preview.onkeydown(altFirst?{...space,altKey:true}:alt);
  assert.equal(vm.runInContext('altZoom',context),true,'Either modifier order arms drag zoom.');
  const before=viewer.scaleUpdates.length,left=preview.scrollLeft,top=preview.scrollTop;
  preview.onpointerdown(zoomDrag);
  preview.onpointermove({...zoomDrag,clientX:202});
  assert.equal(animationFrames.size,0,'Ignore a shaky click.');
  preview.onpointermove({...zoomDrag,clientX:230,clientY:220});
  preview.onpointermove({...zoomDrag,clientX:260,clientY:240});
  assert.equal(animationFrames.size,1);assert.equal(viewer.scaleUpdates.length,before);
  preview.onkeydown({...alt,repeat:true});
  flushAnimationFrames();
  assert.equal(viewer.scaleUpdates.length,before+1,'Coalesce pointer movements into one scale update per frame.');
  assert.equal(zoomButton.textContent,'140%');
  assert.equal(viewer.scaleUpdates.at(-1).origin,undefined,'Do not pass window coordinates to PDF.js offset-parent origin.');
  assert.equal(viewer.scaleUpdates.at(-1).drawingDelay,150);
  assert.equal(preview.scrollLeft,left);assert.equal(preview.scrollTop,top,'Drag must not also pan the PDF.');
  preview.onpointermove({...zoomDrag,clientX:180,clientY:170});flushAnimationFrames();
  assert.equal(zoomButton.textContent,'85%','Dragging up-left shrinks continuously.');
  direction=null;preview.ondblclick(zoomDrag);assert.equal(direction,null);
  preview.onpointermove({...zoomDrag,clientX:220,clientY:220});
  const rendered=viewer.refreshes;preview.onpointerup(zoomDrag);
  assert.equal(animationFrames.size,0);assert.equal(zoomButton.textContent,'114%','Release applies the last pending pointer position.');
  assert.equal(viewer.refreshes,rendered+1,'Release restores sharp rendering immediately.');
  assert.equal(preview.captured,null);
  windowHandlers.keyup.forEach(handler=>handler(alt));
  assert.equal(vm.runInContext('spacePan',context),true,'Releasing Alt leaves ordinary Space panning available.');
  windowHandlers.keyup.forEach(handler=>handler(space));
}
// Realistic page layout: nested pane, browser scaling, later pages and PDF.js scroll restoration.
const previousGeometry={page:pdfImage.getBoundingClientRect,pane:preview.getBoundingClientRect,
  width:preview.offsetWidth,height:preview.offsetHeight,left:preview.scrollLeft,top:preview.scrollTop,updateScale:viewer.updateScale};
for(const {cssScale,pageOffset} of [{cssScale:1,pageOffset:0},{cssScale:.8,pageOffset:900}]){
  vm.runInContext('setPdfZoom(100)',context);viewer.currentScale=2;
  preview.offsetWidth=675;preview.offsetHeight=796;preview.scrollLeft=120;preview.scrollTop=pageOffset*2+150;
  preview.getBoundingClientRect=()=>({left:411,top:70,width:675*cssScale,height:796*cssScale});
  pdfImage.getBoundingClientRect=()=>({left:411-preview.scrollLeft*cssScale,
    top:70+(pageOffset*viewer.currentScale-preview.scrollTop)*cssScale,
    width:700*viewer.currentScale*cssScale,height:900*viewer.currentScale*cssScale});
  viewer.updateScale=function(config){previousGeometry.updateScale.call(this,config);preview.scrollLeft=20;preview.scrollTop=10;};
  const press={...zoomDrag,clientX:411+300*cssScale,clientY:70+280*cssScale};
  const before=pdfImage.getBoundingClientRect(),u=(press.clientX-before.left)/before.width,v=(press.clientY-before.top)/before.height;
  preview.onkeydown({...space,altKey:true});preview.onpointerdown(press);
  for(const delta of [30,65,45,90,55]){
    preview.onpointermove({...press,clientX:press.clientX+delta,clientY:press.clientY+delta});flushAnimationFrames();
    const after=pdfImage.getBoundingClientRect();
    assert(Math.abs(after.left+u*after.width-press.clientX)<1e-6,'The clicked PDF point stays at its initial screen x, regardless of pane offset.');
    assert(Math.abs(after.top+v*after.height-press.clientY)<1e-6,'Later-page offsets and browser scaling must not move the zoom anchor.');
  }
  preview.onpointerup(press);windowHandlers.keyup.forEach(handler=>handler(space));
}
pdfImage.getBoundingClientRect=previousGeometry.page;preview.getBoundingClientRect=previousGeometry.pane;
preview.offsetWidth=previousGeometry.width;preview.offsetHeight=previousGeometry.height;viewer.updateScale=previousGeometry.updateScale;
vm.runInContext('setPdfZoom(100)',context);
preview.scrollLeft=previousGeometry.left;preview.scrollTop=previousGeometry.top;
preview.onkeydown({...space,altKey:true});preview.onpointerdown(zoomDrag);
preview.onpointermove({...zoomDrag,clientX:5000});flushAnimationFrames();assert.equal(zoomButton.textContent,'500%');
preview.onpointermove({...zoomDrag,clientX:4990});flushAnimationFrames();assert(Number.parseInt(zoomButton.textContent)<500,'Reverse immediately at the upper bound.');
preview.onpointermove({...zoomDrag,clientX:-5000});flushAnimationFrames();assert.equal(zoomButton.textContent,'30%');
windowHandlers.keyup.forEach(handler=>handler(space));
for(const finish of [
  ()=>windowHandlers.keyup.forEach(handler=>handler(space)),
  ()=>windowHandlers.keyup.forEach(handler=>handler(alt)),
  ()=>preview.onpointercancel(zoomDrag),()=>preview.onlostpointercapture(zoomDrag),
  ()=>preview.onpointermove({...zoomDrag,buttons:0}),()=>preview.events.blur(),
  ()=>windowHandlers.blur.forEach(handler=>handler()),()=>preview.onkeydown({key:'Escape'}),
  ()=>{element('#pan-mode').onclick();element('#pan-mode').onclick();},
  ()=>{element('#log-toggle').onclick();element('#log-toggle').onclick();},
]){
  preview.onkeydown({...space,altKey:true});preview.onpointerdown(zoomDrag);
  preview.onpointermove({...zoomDrag,clientX:240});finish();
  assert.equal(vm.runInContext('pdfPan',context),null);assert.equal(preview.captured,null);
  assert.equal(animationFrames.size,0,'Ending the gesture cancels queued frames.');
  const zoom=zoomButton.textContent;preview.onpointermove({...zoomDrag,clientX:900});assert.equal(zoomButton.textContent,zoom);
  vm.runInContext('endSpacePan()',context);
}
preview.onkeydown({...space,altKey:true,target:{closest:()=>({})}});
assert.equal(vm.runInContext('spacePan',context),false,'Space + Alt must not intercept form controls.');
vm.runInContext('setPdfZoom(100)',context);
preview.scrollTop=350;

element('#pan-mode').onclick();
context.fetch=async()=>{downloads++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};};
(async()=>{
  context.findMathRanges=(await import('./vendor/latex-hover.mjs')).findMathRanges;
  context.documentMacros=(await import('./vendor/latex-hover.mjs')).documentMacros;
  const actualKatex=(await import('./vendor/katex/katex.mjs')).default;
  context.katex.renderToString=actualKatex.renderToString;
  context.katex.render=(tex,node,configuration)=>{
    let markup=actualKatex.renderToString(tex,configuration).replace(/<annotation\b[\s\S]*?<\/annotation>/g,'');
    const text=()=>markup.replace(/<[^>]+>/g,'').replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16)))
      .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    node.textContent=text();
    node.querySelectorAll=selector=>selector==='msqrt'?[...markup.matchAll(/<msqrt\b[^>]*>/g)].map(()=>({prepend(value){
      markup=markup.replace(/(<msqrt\b[^>]*>)(?!√)/,'$1'+value);node.textContent=text();
    }})):[];
  };
  vm.runInContext("showCompileError({line:23,message:'Undefined control sequence.'})",context);
  assert.equal(editor.marks.size,2);assert.equal(editor.jump.line,22);assert.equal(editor.jump.margin,300);
  assert(element('#status').textContent.includes('第 23 行'));
  vm.runInContext('showCompileError(null)',context);assert.equal(editor.marks.size,0);
  vm.runInContext("showCompileError({line:101,message:'Out of range'})",context);assert.equal(editor.marks.size,0);
  await vm.runInContext("refreshPreview({pdf_revision:'first'})",context);
  assert.equal(downloads,1);
  assert.equal(viewer.pdfDocument,pdf);
  assert.equal(preview.scrollTop,350);
  assert.equal(preview.scrollLeft,140);
  await vm.runInContext("refreshPreview({pdf_revision:'first'})",context);
  assert.equal(downloads,1,'Identical PDFs should reuse the loaded document.');
  viewer.currentScale=1.75;
  await vm.runInContext("refreshPreview({pdf_revision:'second'})",context);
  assert.equal(downloads,2);
  assert.equal(viewer.currentScale,1.75,'Recompilation must retain the actual scale on rotated/mixed-size pages.');
  assert.equal(destroyed,1,'Old PDF worker resources must be released.');
  context.fetch=async()=>({ok:false});
  await assert.rejects(vm.runInContext("refreshPreview({pdf_revision:'stale'})",context));
  assert.equal(viewer.pdfDocument,pdf,'Failed refresh must retain the current preview.');
  assert.equal(vm.runInContext('pdfBuild',context),'second');
  let source='compiled source',release;
  editor.getValue=()=>source;
  const automatic=element('#auto-compile');
  assert.equal(automatic.checked,true);
  vm.runInContext("busy=false;conflict=false;version=pdfVersion='v';saved='compiled source'",context);
  automatic.checked=false;automatic.onchange();
  assert.equal(stored.get('latex-codex-auto-compile'),'off');
  source='saved without compilation';let autoRoute;
  context.fetch=async(url)=>{autoRoute=url;return {ok:true,json:async()=>({version:'saved-v'})};};
  editorEvents.change();await uiTimers.get(vm.runInContext('timer',context))();
  assert.equal(autoRoute,'/save','Disabling compilation must still autosave.');
  assert.equal(vm.runInContext('saved',context),source);assert.equal(vm.runInContext('pdfVersion',context),'');
  assert.equal(viewer.pdfDocument,pdf,'Save-only keeps the previous PDF mounted.');
  context.fetch=async(url)=>{autoRoute=url;return {ok:true,json:async()=>({version:'saved-v',ok:true,log:'ok',sync:true,pdf_revision:'second'})};};
  automatic.checked=true;automatic.onchange();
  await uiTimers.get(vm.runInContext('timer',context))();assert.equal(autoRoute,'/compile','Re-enabling compiles saved edits.');
  automatic.checked=false;automatic.onchange();
  await vm.runInContext('compile()',context);assert.equal(autoRoute,'/compile','Manual compilation always works.');
  source='next edit';let finishSave;
  context.fetch=()=>new Promise(resolve=>finishSave=resolve);
  const saving=vm.runInContext('compile(false)',context);
  source='edited while saving';editorEvents.change();
  finishSave({ok:true,json:async()=>({version:'next-v'})});await saving;
  context.fetch=async(url)=>{autoRoute=url;return {ok:true,json:async()=>({version:'latest-v'})};};
  await uiTimers.get(vm.runInContext('timer',context))();assert.equal(autoRoute,'/save');assert.equal(vm.runInContext('saved',context),source,'Edits during saving must also be saved.');
  context.fetch=()=>new Promise(resolve=>finishSave=resolve);
  const slowSave=vm.runInContext('compile(false)',context);
  automatic.checked=true;automatic.onchange();await uiTimers.get(vm.runInContext('timer',context))();
  finishSave({ok:true,json:async()=>({version:'latest-v'})});await slowSave;
  context.fetch=async(url)=>{autoRoute=url;return {ok:true,json:async()=>({version:'latest-v',ok:true,log:'ok',sync:true,pdf_revision:'second'})};};
  await uiTimers.get(vm.runInContext('timer',context))();assert.equal(autoRoute,'/compile','Enabling during an in-flight save must eventually compile.');
  source='compiled source';vm.runInContext("saved='compiled source';version='v'",context);


  editor.getValue=()=>source;
  context.clearTimeout=()=>{};context.setTimeout=()=>{};
  vm.runInContext("busy=false;conflict=false;pdfVersion='';pendingForward=false;saved='compiled source';compiledLabels={old:'1'};compiledCitations={old:'9'}",context);
  context.fetch=()=>new Promise(resolve=>release=resolve);
  const compiling=vm.runInContext('compile()',context),beforeJumps=cursorChanges;
  source='edited during compilation';
  release({ok:true,json:async()=>({ok:false,version:'v',log:'error',engine:'pdflatex',diagnostic:{line:23,message:'Undefined control sequence.'}})});
  await compiling;assert.equal(cursorChanges,beforeJumps,'Stale compilation must not move the cursor.');
  assert.equal(vm.runInContext('Object.keys(compiledLabels).length+Object.keys(compiledCitations).length',context),0,'Failed builds cannot reuse compiled labels or citations.');
  assert.equal(editor.marks.size,0);
  context.fetch=async()=>({ok:true,json:async()=>({ok:false,version:'v',log:'error',engine:'pdflatex',diagnostic:{line:23,message:'Undefined control sequence.'}})});
  await vm.runInContext('compile()',context);assert(!element('#log').hidden,'Compilation failures display the right-side log.');assert.equal(element('#log').textContent,'error');assert.equal(editor.marks.size,2);assert.equal(cursorChanges,beforeJumps+1);
  context.fetch=async()=>({ok:true,json:async()=>({ok:true,version:'v',log:'success',engine:'pdflatex',pdf_revision:'second',labels:{eq:'2.1'},citations:{paper:'9'}})});
  await vm.runInContext('compile()',context);assert.equal(editor.marks.size,0,'Successful compilation clears the error.');assert(!element('#log').hidden,'Recompiling must not close a log the user is reading.');element('#log-toggle').onclick();assert(element('#log').hidden);
  assert.equal(vm.runInContext("compiledCitations.paper",context),'9','Successful preview installs its citation values.');
  vm.runInContext("display({source:'Other file.',version:'other',name:'other.tex',path:'other.tex'})",context);
  assert.equal(vm.runInContext('Object.keys(compiledLabels).length+Object.keys(compiledCitations).length',context),0,'File switches discard the previous build metadata.');
  context.synchronize=realSynchronize;
  const paragraphs='\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nFirst paragraph\ncontinues here.\n\nSecond paragraph.\n\\par\nThird paragraph.\\par\nFourth paragraph.\n\\end{document}';
  context.paragraphs=paragraphs;
  const paragraph=locations=>JSON.parse(JSON.stringify(vm.runInContext('sourceParagraphRange(paragraphs,'+JSON.stringify(locations)+')',context)));
  assert.deepEqual(paragraph([5,4]),{from:{line:3,ch:0},to:{line:4,ch:15}});
  assert.deepEqual(paragraph([7,9]),{from:{line:6,ch:0},to:{line:8,ch:20}});
  assert.equal(paragraph([10,10]).to.line,9,'Do not include end{document} or the next paragraph.');
  assert.equal(paragraph([3,3]).from.line,2,'A heading does not include the preamble.');
  assert.throws(()=>paragraph([0,2]));assert.throws(()=>paragraph([6,6]));assert.throws(()=>paragraph([11,11]));
  assert.equal(vm.runInContext(String.raw`sourceParagraphRange('\\begin{document}\n\\newpage\nText.\n\\end{document}',[3,3]).from.line`,context),2);
  assert.equal(vm.runInContext(String.raw`sourceParagraphRange('\\begin{abstract}\nAbstract text.\n\n\\end{abstract}',[2,2]).from.line`,context),1,'Do not pull a neighboring environment opener into the paragraph.');
  assert.equal(vm.runInContext(String.raw`sourceParagraphRange('\\begin{align}\nx&=y\n\\end{align}',[2,2]).to.line`,context),1,'Keep equation environment delimiters outside a selected body.');
  const exact=(text,locations,pdfText,labels={},citations={},macroSource=text)=>JSON.parse(JSON.stringify(vm.runInContext('sourcePdfTextRange('+JSON.stringify(text)+','+JSON.stringify(locations)+','+JSON.stringify(pdfText)+','+JSON.stringify(labels)+','+JSON.stringify(citations)+','+JSON.stringify(macroSource)+')',context)));
  assert.deepEqual(exact('Before. On the matrix level, we solve it. After.',[1,1],'On the matrix level'),{from:{line:0,ch:8},to:{line:0,ch:27}});
  assert.deepEqual(exact('Before. On the\nmatrix~level, after.',[1,2],'On the matrix level'),{from:{line:0,ch:8},to:{line:1,ch:12}});
  assert.deepEqual(exact('efficient method',[1,1],'ef\ufb01cient method'),{from:{line:0,ch:0},to:{line:0,ch:16}});
  assert.deepEqual(exact('preconditioned method',[1,1],'precon-\nditioned method'),{from:{line:0,ch:0},to:{line:0,ch:21}});
  assert.deepEqual(exact('matrix-vector',[1,1],'matrix-\nvector'),{from:{line:0,ch:0},to:{line:0,ch:13}});
  assert.deepEqual(exact('% On the matrix level\nOn the matrix level',[2,2],'On the matrix level'),{from:{line:1,ch:0},to:{line:1,ch:19}});
  assert.throws(()=>exact('On the matrix level; On the matrix level.',[1,1],'On the matrix level'),/唯一匹配/);
  assert.throws(()=>exact('Other text.',[1,1],'On the matrix level'),/唯一匹配/);
  assert.deepEqual(exact('\\textit{On the} matrix level',[1,1],'On the matrix level'),{from:{line:0,ch:0},to:{line:0,ch:28},approximate:true});
  const matched=(source,pdfText)=>{
    const range=exact(source,[1,1],pdfText);return source.slice(range.from.ch,range.to.ch);
  };
  assert.equal(matched('Before. The vector $R_mu_h$ is the output. After.','The vector R m u h is the output.'),'The vector $R_mu_h$ is the output.');
  assert.equal(matched('Before. We use $\\alpha x^2$ in the estimate. After.','We use αx2 in the estimate.'),'We use $\\alpha x^2$ in the estimate.');
  assert.equal(matched('Before. We use $\\alpha x$ in the estimate. After.','We use αx ◆ in the estimate.'),'We use $\\alpha x$ in the estimate.');
  assert.equal(matched('Before $\\alpha x^2$ after.','α'),'$\\alpha x^2$');
  assert.equal(matched('A $\\mathbf{x}=\\mathbf{y}$ relation.','x=y'),'$\\mathbf{x}=\\mathbf{y}$');
  assert.throws(()=>matched('We use $x$ in this estimate. We use $x$ in this estimate.','We use x ◆ in this estimate.'),/唯一匹配/);
  assert.throws(()=>matched('We use $x$ in this estimate.','We completely changed the argument.'),/唯一匹配/);
  assert.equal(matched('{On the matrix} level','On the matrix level'),'{On the matrix} level','Invisible grouping braces must not defeat a prose match.');
  const repeated='First context: repeated phrase. Second context: repeated phrase.';
  const contextual=context.sourcePdfTextRange(repeated,[1],'repeated phrase',{}, {},repeated,false,false,
    {context:{before:'Second context: ',after:'.'}});
  assert.equal(contextual.from.ch,repeated.lastIndexOf('repeated phrase'),'PDF context disambiguates repeated text on the same source line.');
  assert.throws(()=>context.sourcePdfTextRange(repeated,[1],'repeated phrase',{}, {},repeated,false,false,
    {context:{before:' context: ',after:'.'}}),/唯一匹配/,'Shared surrounding words must not resolve a genuine tie.');
  assert.equal(matched('Before $x+x$ after.','x'),'$x+x$','Two rendered symbols mapped to the same intact formula are one source candidate.');
  const linked=String.raw`See \href{https://example.com}{the \textbf{documentation}} for details.`;
  assert.equal(matched('Before. '+linked+' After.','See the documentation for details.'),linked,'Visible hyperlink labels preserve nested formatting and the paired command.');
  assert.equal(matched(String.raw`Read \url{https://example.com/a} now.`,'Read https://example.com/a now.'),String.raw`Read \url{https://example.com/a} now.`);
  const numbered=String.raw`\item Alpha.`;
  assert.equal(matched(numbered,'1. Alpha.'),'Alpha.','Native drag selections share the source-aware automatic list label rule.');
  const repeatedList=context.sourcePdfTextRange('Alpha.\n'+numbered,[1,2],'1. Alpha.');
  assert.equal(repeatedList.from.line,1,'A generated list label resolves only an item, even when identical prose appears first.');
  assert.equal(matched(String.raw`Before. {\color{red}Finite} element methods. After.`, 'Finite element methods.'),String.raw`{\color{red}Finite} element methods.`);
  assert.equal(matched(String.raw`Before. \textbf{A \emph{nested} phrase} follows. After.`, 'A nested phrase follows.'),String.raw`\textbf{A \emph{nested} phrase} follows.`);
  assert.equal(matched(String.raw`Before. \textcolor{blue}{A nested $x$ phrase} follows. After.`, 'A nested x phrase follows.'),String.raw`\textcolor{blue}{A nested $x$ phrase} follows.`);
  assert.throws(()=>exact('Text.',[1,1],''),/唯一匹配/);
  assert.throws(()=>exact('See \\ref{sec1}.',[1,1],'1'),/唯一匹配/);
  const cipSource="For this problem, $A$ is represented by the CIP-$\\mathcal{P}_{k+1}$ stiffness matrix $\\mathbf{A}=\\mathbf{A}_{\\rm IP}=\\mathbf{D}_{\\rm IP}-\\mathbf{L}_{\\rm IP}-\\mathbf{L}_{\\rm IP}^\\top$. By $\\mathbf{S}_{\\rm IP,a}=\\mathbf{D}_{\\rm IP}^{-1}$ and $\\bar{\\mathbf{S}}_{\\rm IP,m}=(\\mathbf{D}_{\\rm IP}-\\mathbf{L}_{\\rm IP}^\\top)^{-1}\\mathbf{D}_{\\rm IP}(\\mathbf{D}_{\\rm IP}-\\mathbf{L}_{\\rm IP})^{-1}$ we denote the Jacobi and symmetrized GS iterators for $\\mathbf{A}_{\\rm IP}$, respectively. Define the CIP energy norm \n\\begin{equation*}\n\\|v\\|_{2,h}=\\Big(\\sum_{T\\in\\mathcal{T}_h}\\|\\nabla^2 v\\|_{L^2(T)}^2+\\sum_{E\\in\\mathcal{E}_h}\\gamma h_E^{-1}\\|\\llbracket \\partial_nv\\rrbracket\\|_{L^2(E)}^2\\Big)^\\frac{1}{2}.  \n\\end{equation*}";
  const cipPdf='For this problem, A is represented by the CIP-Pk+1 stiffness matrix A = AIP = DIP − LIP − L⊤IP. By SIP,a = D−1IP and ¯SIP,m = (DIP − L⊤IP)−1DIP(DIP − LIP)−1 we denote the Jacobi and symmetrized GS iterators for AIP, respectively. Define the CIP energy norm ∥v∥2,h = \u0010 X T ∈Th ∥∇2v∥2L2(T) + X E∈Eh γh−1E ∥J∂nvK∥2L2(E) \u0011 1 2 .';
  assert.deepEqual(exact(cipSource,[1,3],cipPdf),{from:{line:0,ch:0},to:{line:3,ch:15},approximate:true},'Mixed prose, reordered scripts and complete display environment');
  assert.deepEqual(exact('Before. A $x_a^2$ relation. After.',[1,1],'A x2a relation.'),{from:{line:0,ch:8},to:{line:0,ch:27},approximate:true});
  assert.throws(()=>matched('A $x_a^2$ relation. A $x_a^2$ relation.','A x2a relation.'),/唯一匹配/);
  const regularitySource="Our superconvergence analysis requires full elliptic regularity \\begin{equation}\\label{eq:elliptic_regularity}\n\\|\\Delta^{-2}g\\|_{H^4(\\Omega)}\\lesssim\\|g\\|_{L^2(\\Omega)}\\quad \\text{for any }g\\in L^2(\\Omega),\n\\end{equation}";
  const iteratorsSource="where $\\Delta^{-2}g$ solves \\eqref{eq:biharmonic} with $f$ replaced with $g$.\nAssume $\\gamma$ is sufficiently large such that $a(v,v)\\gtrsim\\|v\\|_{2,h}^2$ for all $v\\in\\widetilde{V}$. Let $R_mu_h$ be the output of either: (1) Algorithm \\ref{alg:smoothing} with $S\\sim \\omega\\mathbf{S}_{\\rm IP,a}$ or $\\bar{\\mathbf{S}}_{\\rm IP,m}$; (2) Algorithm \\ref{alg:PCG} with $S\\sim\\mathbf{S}_{\\rm IP,a}$ or $\\bar{\\mathbf{S}}_{\\rm IP,m}$. Following the same proof as in Theorem \\ref{thm:Poisson_C0FEM}, we have\n\\begin{equation*}\n\\|u-R_mu_h\\|_{2,h}\\lesssim h^k|u|_{H^{k+2}(\\Omega)}+\\varepsilon_m h^{k-1}|u|_{H^{k+1}(\\Omega)}.\n\\end{equation*}";
  const compiledRefs={'eq:elliptic_regularity':'3.13','eq:biharmonic':'3.11','alg:smoothing':'2.1','alg:PCG':'2.2','thm:Poisson_C0FEM':'3.1'};
  const regularityPdf='Our superconvergence analysis requires full elliptic regularity (3.13) ∥∆−2g∥H4(Ω) ≲ ∥g∥L2(Ω) for any g ∈ L2(Ω)';
  const iteratorsPdf='where ∆−2g solves (3.11) with f replaced with g. Assume γ is sufficiently large such that a(v, v) ≳ ∥v∥22,h for all v ∈ eV . Let Rmuh be the output of either: (1) Algorithm 2.1 with S ∼ ωSIP,a or ¯SIP,m; (2) Algorithm 2.2 with S ∼ SIP,a or ¯SIP,m. Following the same proof as in Theorem 3.1, we have ∥u − Rmuh∥2,h ≲ hk|u|Hk+2(Ω) + εmhk−1|u|Hk+1(Ω).';
  assert.deepEqual(exact(regularitySource,[1,2],regularityPdf,compiledRefs),{from:{line:0,ch:0},to:{line:2,ch:14},approximate:true});
  assert.deepEqual(exact(iteratorsSource,[1,4],iteratorsPdf,compiledRefs),{from:{line:0,ch:0},to:{line:4,ch:15},approximate:true});
  assert.deepEqual(exact('Before. See \\eqref{eq:biharmonic}. After.',[1,1],'See (3.11).',compiledRefs),{from:{line:0,ch:8},to:{line:0,ch:34},approximate:true});
  const citationSentence=String.raw`Superconvergence in FE methods by smoothing was initiated in the seminal work \cite{BankXu2003b} and generalized to high-order and $h$-$p$ FEs in \cite{BankXuZheng2007,BankNguyen2011}.`;
  const citationPdf='Superconvergence in FE methods by smoothing was initiated in the seminal work\n[9] and generalized to high-order and h-p FEs in [10, 6].';
  const compiledCites={BankXu2003b:'9',BankXuZheng2007:'10',BankNguyen2011:'6'};
  assert.deepEqual(exact('Before. '+citationSentence+' After.',[1,1],citationPdf,{},compiledCites),{from:{line:0,ch:8},to:{line:0,ch:8+citationSentence.length},approximate:true},'Citations and inline math preserve the exact sentence, excluding adjacent prose.');
  assert.deepEqual(exact(String.raw`See \cite{BankXuZheng2007,BankNguyen2011}.`,[1,1],'[10, 6]',{},compiledCites),{from:{line:0,ch:4},to:{line:0,ch:41},approximate:true},'Selecting citation text keeps the entire source macro.');
  assert.deepEqual(exact(String.raw`See \citep{ BankXu2003b }.`,[1,1],'[9]',{},compiledCites),{from:{line:0,ch:4},to:{line:0,ch:25},approximate:true});
  const notedCite=String.raw`\cite[Lemma~7.2(iii) and Theorem~7.5, pp.~74--75]{Jech2003}`;
  const notedPdf='[6, Lemma 7.2(iii) and Theorem 7.5, pp. 74–75]';
  assert.equal(matchedNoted('See '+notedCite+'.',notedPdf),notedCite,'A citation with a postnote maps to the entire command.');
  const twoNotes=String.raw`\citep*[see][pp.~74--75]{Jech2003}`;
  assert.equal(matchedNoted('Before. '+twoNotes+' After.','[see 6, pp. 74–75]'),twoNotes,'Numeric natbib supports a prenote and postnote.');
  const mixedNotes=String.raw`The ultrafilter lemma \cite[Lemma~7.2]{Jech2003} is used alongside this related construction \cite{other}.`;
  assert.equal(matchedNoted(mixedNotes,'The ultrafilter lemma [6, Lemma 7.2] is used alongside this related construction [9].'),mixedNotes,'The prose fallback for an unknown plain citation must preserve known citation notes.');
  assert.throws(()=>exact(mixedNotes,[1],'The ultrafilter lemma [6, Lemma 7.2] is used alongside this related construction [9].'),/唯一匹配/,'Notes cannot be discarded when their compiled number is unavailable.');
  function matchedNoted(source,text){
    const range=exact(source,[1,source.split('\n').length],text,{}, {Jech2003:'6'});
    const offset=pos=>source.split('\n').slice(0,pos.line).reduce((sum,line)=>sum+line.length+1,0)+pos.ch;
    return source.slice(offset(range.from),offset(range.to));
  }
  const ultrafilter=String.raw`For example, for any $x\in X$, the family
$\{A\subseteq X:x\in A\}$ is an ultrafilter on $X$.
The ultrafilter lemma (see, e.g.,
\cite[Lemma~7.2(iii) and Theorem~7.5, pp.~74--75]{Jech2003}),
a consequence of Zorn's lemma, states that any family of subsets of
$X$ whose finite intersections are nonempty is contained in an
ultrafilter on $X$.`;
  const ultrafilterPdf="For example, for any x ∈ X, the family {A ⊆ X : x ∈ A} is an ultrafilter on X. The ultrafilter lemma (see, e.g., "+notedPdf+"), a consequence of Zorn’s lemma, states that any family of subsets of X whose finite intersections are nonempty is contained in an ultrafilter on X.";
  for(const box of [false,true]){
    const range=context.sourcePdfTextRange(ultrafilter,[1,7],ultrafilterPdf,{}, {Jech2003:'6'},ultrafilter,box,true);
    assert.equal(range.from.line,0);assert.equal(range.from.ch,0);
    assert.equal(range.to.line,6);assert.equal(range.to.ch,ultrafilter.split('\n').at(-1).length,'Dragging and complete boxes preserve the exact paragraph edges.');
  }
  assert.throws(()=>context.sourcePdfTextRange(ultrafilter,[1,7],ultrafilterPdf.replace('finite intersections ',''),{}, {Jech2003:'6'},ultrafilter,true,false),/唯一匹配/,'Gapped boxes still cannot skip prose.');
  assert.throws(()=>matchedNoted(String.raw`See \cite[\unknown{Lemma}]{Jech2003}.`,'[6, Lemma]'),/唯一匹配/,'Unknown commands in citation notes remain a matching barrier.');
  assert.throws(()=>exact(String.raw`See \cite{BankXu2003b,missing}.`,[1,1],'[9, 8]',{},compiledCites),/唯一匹配/,'Partially known citations cannot guess missing labels.');
  assert.deepEqual(exact('Before. '+citationSentence+' After.',[1,1],citationPdf),{from:{line:0,ch:8},to:{line:0,ch:8+citationSentence.length},approximate:true},'Unique prose anchors locate a sentence without compiled citation numbers.');
  assert.deepEqual(exact(citationSentence,[1,1],citationPdf,{}, {BankXu2003b:'9'}),{from:{line:0,ch:0},to:{line:0,ch:citationSentence.length},approximate:true},'Known and unknown citations share the same prose fallback.');
  assert.throws(()=>exact(citationSentence+' '+citationSentence.replace('BankXu2003b','other'),[1,1],citationPdf),/唯一匹配/,'Matching prose with different unknown citation keys is still ambiguous.');
  assert.throws(()=>exact(citationSentence,[1,1],citationPdf.replace('smoothing','completely unrelated theory')),/唯一匹配/,'Prose anchors reject substantial differences rather than skipping arbitrary text.');
  assert.deepEqual(exact(citationSentence,[1,1],citationPdf+'◆'),{from:{line:0,ch:0},to:{line:0,ch:citationSentence.length},approximate:true},'A tiny PDF extraction artifact must not defeat the complete sentence anchors.');
  const edgeSource='Prior lastword.\n'+citationSentence+'\nNext sentence.';
  assert.deepEqual(exact(edgeSource,[1,3],'lastword.\n'+citationPdf+'\nN'),{from:{line:0,ch:6},to:{line:2,ch:1},approximate:true},'Keep an accidentally selected previous word and next initial within the precise mapped range.');
  assert.throws(()=>exact(String.raw`\cite{unknown}`,[1,1],'[9]'),/唯一匹配/,'Citation-only selections need compiled numbers.');
  assert.throws(()=>exact(citationSentence+' '+citationSentence,[1,1],citationPdf,{},compiledCites),/唯一匹配/,'Repeated citation sentences must remain ambiguous.');
  const estimatorSource=String.raw`Earlier prose.
Therefore, the estimator is given below
\begin{align*}
\eta^2&=\sum_{F\not\subset\Gamma_{\rm PEC}\cup\Gamma_{\rm ABC}}k_0^2h_F\big\|\llbracket\varepsilon_r\bm{E}_h\cdot\bm{n}\rrbracket\big\|_{L^2(F)}^2\\
&+\sum_{T\in\mathcal{T}_h}h_T^2\big\|\nabla\times(\mu_r^{-1}\nabla\times\bm{E}_h)-k_0^2\varepsilon_r\bm{E}_h\big\|^2_{L^2(T)}.
\end{align*}
Adding the IBC part, we finally obtain
\begin{align*}
\eta^2&=\sum_{F\subset\Gamma_{\rm IBC}}\custom{\bm{E}_h}.
\end{align*}
Following prose.`;
  const fragment=(text,page,y)=>({text,page,rect:[10,y,100,y+10]});
  const estimatorSelection={fragments:[fragment('Therefore, the estimator is given below',1,200),fragment('η2 = X F̸ ⊂ΓPEC∪ΓABC k20 hF Jεr Eh · nK',1,170),fragment('+ X T ∈Th h2T ∇ × (μ−1r ∇ × Eh) − k20 εr Eh 2L2(T).',2,170)]};
  const mappedRegions=async(first,last)=>{
    assert(first<=last);
    return {regions:first===4?[{page:1,rect:[0,150,120,185]},{page:2,rect:[0,150,120,185]}]:[{page:2,rect:[0,60,120,100]}]};
  };
  const mathMatch=(locations,selection,regions=mappedRegions)=>context.sourcePdfMathRange(estimatorSource,locations,selection,{}, {},regions);
  assert.deepEqual(JSON.parse(JSON.stringify(await mathMatch([3,6],estimatorSelection))),{from:{line:1,ch:0},to:{line:5,ch:12},approximate:true,mathBlock:true},'Use compiled rows for reordered custom-macro math across pages, retaining its prose anchor.');
  assert.deepEqual(JSON.parse(JSON.stringify(await mathMatch([3,6],{fragments:[estimatorSelection.fragments[0],{text:'X',page:1,rect:[10,180,100,200]},...estimatorSelection.fragments.slice(1)]}))),{from:{line:1,ch:0},to:{line:5,ch:12},approximate:true,mathBlock:true},'A tall sum glyph overlapping the formula row must not be rejected just because its text-layer centre lies above it.');
  assert.deepEqual(JSON.parse(JSON.stringify(await mathMatch([6,6],{fragments:estimatorSelection.fragments.slice(1)}))),{from:{line:2,ch:0},to:{line:5,ch:12},approximate:true,mathBlock:true},'Formula-only PDF selections expand to their complete source environment.');
  assert.equal(await mathMatch([3,6],{fragments:[fragment('Unrelated prose',1,200),...estimatorSelection.fragments.slice(1)]}),null,'Geometry must not bypass mismatched prose.');
  assert.equal(await mathMatch([3,6],{fragments:[fragment('η2',3,170)]}),null,'A source line alone cannot justify a formula on a different PDF page.');
  assert.equal(await mathMatch([3,10],estimatorSelection,async()=>({regions:[{page:1,rect:[0,150,120,185]},{page:2,rect:[0,150,120,185]}]})),null,'Overlapping formula candidates remain ambiguous.');
  assert.equal(await mathMatch([3,10],{fragments:[...estimatorSelection.fragments,fragment('η2',2,80)]}),null,'Never silently skip unselected prose between two formula blocks.');
  assert.equal(await context.sourcePdfMathRange(String.raw`Prose \[\custom{x}\] after.`,[1],{fragments:[fragment('Prose',1,170)]},{},{},mappedRegions),null,'Shared-line geometry cannot turn a prose-only selection into a formula selection.');
  const calloutMath=String.raw`> [!thm] First isomorphism theorem
> $$G/\ker\varphi\cong\operatorname{im}\varphi.$$`;
  const calloutSelection={fragments:[fragment('G ker φ',1,170)]};
  const calloutRegions=async(first,last)=>{
    assert.equal(first,2);assert.equal(last,2);
    return {regions:[{page:1,rect:[0,150,120,185]}]};
  };
  assert.deepEqual(JSON.parse(JSON.stringify(await context.sourcePdfMathRange(calloutMath,[2],calloutSelection,{},{},calloutRegions,calloutMath,true))),{from:{line:1,ch:2},to:{line:1,ch:49},approximate:true,mathBlock:true},'Markdown callout markers do not prevent compiled geometry from selecting a complete display formula.');
  assert.equal(await context.sourcePdfMathRange(calloutMath,[2],calloutSelection,{},{},calloutRegions),null,'LaTeX prose before a formula still prevents geometry-only matching.');
  const repeatedRows='The bound holds.\nThe bound holds.';
  const rowSelection={kind:'box',contiguous:true,text:'The bound holds.',fragments:[fragment('The bound holds.',1,100)]};
  let rowQueries=0;
  const indexedRows=async()=>{rowQueries++;return {lines:{1:[{page:1,rect:[0,190,120,220]}],2:[{page:1,rect:[0,95,120,115]}]}};};
  const geometric=await context.sourcePdfSelectionRange(repeatedRows,[2],rowSelection,{}, {},indexedRows);
  assert.equal(geometric.from.line,1,'Compiled row geometry resolves repeated prose without expanding the selection.');
  assert.equal(rowQueries,1,'One cached line-index query supplies all nearby candidates.');
  await assert.rejects(()=>context.sourcePdfSelectionRange(repeatedRows,[2],rowSelection,{}, {},async()=>({lines:{
    1:[{page:1,rect:[0,95,120,115]}],2:[{page:1,rect:[0,95,120,115]}]}})),/唯一匹配/,'Shared row boxes need more evidence than an approximate SyncTeX line.');
  const adjacent='Earlier unrelated prose.\n\nThe target phrase is here.\n\nLater unrelated prose.';
  const nearbySelection={...rowSelection,text:'target phrase',fragments:[fragment('target phrase',1,100)]};
  const nearbyIndex=async()=>({lines:{3:[{page:1,rect:[0,95,120,115]}]}});
  const nearby=await context.sourcePdfSelectionRange(adjacent,[1],nearbySelection,{}, {},nearbyIndex);
  assert.deepEqual(JSON.parse(JSON.stringify(nearby)),{from:{line:2,ch:4},to:{line:2,ch:17}},'An adjacent paragraph is retried and verified against the selected PDF row.');
  await context.sourcePdfSelectionRange(adjacent+'\n',[1],nearbySelection,{}, {},async(first,last)=>{
    assert.equal(last,5,'A final newline must not request a phantom source line rejected by the server.');return nearbyIndex();
  });
  await assert.rejects(()=>context.sourcePdfSelectionRange(adjacent,[1],nearbySelection,{}, {},async()=>({lines:{3:[{page:2,rect:[0,95,120,115]}]}})),/唯一匹配/,'Nearby text on another PDF page cannot pass the retry.');
  await assert.rejects(()=>context.sourcePdfSelectionRange(adjacent,[1],nearbySelection,{}, {},async()=>{throw Object.assign(new Error('stale build'),{status:409});}),/stale build/,'A stale retry retains its version error.');
  let exactQueries=0;
  await context.sourcePdfSelectionRange('A unique target phrase.',[1],nearbySelection,{}, {},async()=>{exactQueries++;return {};});
  assert.equal(exactQueries,0,'Ordinary unique prose does not add a line-index request.');
  const adjacentMath=String.raw`Earlier unrelated prose.

\begin{align*}
\custom{x}&=y.
\end{align*}`;
  const mathRetry=await context.sourcePdfSelectionRange(adjacentMath,[1],{...rowSelection,text:'unreadable math',fragments:[fragment('unreadable math',1,100)]},
    {}, {},async()=>({lines:{4:[{page:1,rect:[0,95,120,115]}]}}));
  assert.equal(mathRetry.from.line,2);assert.equal(mathRetry.to.line,4);
  assert.equal(mathRetry.mathBlock,true,'Nearby formula geometry handles a custom macro despite a displaced SyncTeX anchor.');
  const macroPreamble=String.raw`\newcommand{\R}{\mathbb R}
\newcommand{\calB}{\mathcal B}
\newcommand{\T}{^\top}`;
  const macroProse=String.raw`Matrices $Q\in\R^{n_Q\times d}$ and $K\in\R^{n_K\times d}$ preserve $\calB=(B_1,\ldots,B_m)$.`;
  const macroPdf='Matrices Q ∈ RnQ×d and K ∈ RnK×d preserve B = (B1, . . . , Bm).';
  const macroChild=String.raw`Before.
${macroProse}
\begin{align}
 Z_{ij}&=q_i k_j\T/\sqrt d,\label{eq:score}\\
 f_T(Q,K)&=\sum_i\left[\log\sum_j e^{Z_{ij}}-\sum_j T_{ij}Z_{ij}\right].
\end{align}
After.`;
  assert.deepEqual(exact(macroChild,[2],macroPdf,{}, {},macroPreamble),{from:{line:1,ch:0},to:{line:1,ch:macroProse.length},approximate:true},'Child-file PDF prose must expand macros declared in the main preamble.');
  assert.throws(()=>exact(macroChild,[2],macroPdf),/唯一匹配/,'Unknown macros remain barriers without the main preamble.');
  const macroSelection={fragments:[fragment(macroPdf,1,200),fragment('Zij = qi k⊤j /√d, (1)',1,170),fragment('fT(Q,K) = ∑i [log ∑j eZij − ∑j TijZij]. (2)',1,155)]};
  const macroRegions=async()=>({regions:[{page:1,rect:[0,150,120,185]}]});
  assert.deepEqual(JSON.parse(JSON.stringify(await context.sourcePdfMathRange(macroChild,[2,5],macroSelection,{}, {},macroRegions,macroPreamble))),{from:{line:1,ch:0},to:{line:5,ch:11},approximate:true,mathBlock:true},'Custom-macro prose plus reordered multiline math must preserve the exact prose start and complete display environment.');
  assert.equal(await context.sourcePdfMathRange(macroChild,[2,5],{fragments:[fragment(macroPdf+' Unselected extra sentence.',1,200),...macroSelection.fragments.slice(1)]},{},{},macroRegions,macroPreamble),null,'Document macros must not weaken prose verification.');
  source=paragraphs;
  vm.runInContext("panMode=false;busy=false;syncBusy=false;conflict=false;version=pdfVersion='v';saved=paragraphs;pdfBuild='second'",context);
  const gutterPage={};
  const pdfSpan=(text,x,y,height)=>({textContent:text,closest:()=>gutterPage,getBoundingClientRect:()=>({left:x,right:x+text.length*4,top:y,bottom:y+height,height})});
  const marginSpans=[pdfSpan('524',10,0,8),pdfSpan('525',10,20,8),pdfSpan('526',10,40,8)];
  const bodySpans=[pdfSpan('For this problem',35,0,10),pdfSpan('we denote the Jacobi',35,20,10),pdfSpan('CIP energy norm',35,40,10)];
  const formulaDigit=pdfSpan('2',90,0,8),tableDigits=[pdfSpan('1',140,60,10),pdfSpan('2',140,80,10),pdfSpan('3',140,100,10)];
  context.marginSpans=marginSpans;context.allPdfSpans=[...marginSpans,...bodySpans,formulaDigit,...tableDigits];
  assert.equal(vm.runInContext('pdfMarginNumbers(allPdfSpans).size',context),3);
  assert(vm.runInContext('marginSpans.every(span=>pdfMarginNumbers(allPdfSpans).has(span))',context));
  // Real selection endpoint geometry uses each page's viewport, not the context-menu click point.
  const pages=[{...pdfImage,dataset:{pageNumber:'1'}},{...pdfImage,dataset:{pageNumber:'2'},getBoundingClientRect:()=>({left:0,top:720})}];
  const nodes=[{nodeType:3,nodeValue:'First paragraph',text:'First paragraph',rect:{left:20,right:100,top:30,bottom:50,width:80,height:20}},
    {nodeType:3,nodeValue:'continues here.',text:'continues here.',rect:{left:50,right:130,top:770,bottom:790,width:80,height:20}}];
  const range={startContainer:nodes[0],endContainer:nodes[1],startOffset:6,endOffset:15,
    getBoundingClientRect:()=>({top:30,bottom:790}),
    intersectsNode:node=>nodes.includes(node),cloneRange(){return {selectNodeContents(node){this.node=node;},
      setStart(node,offset){assert.equal(offset,6);},setEnd(node,offset){assert.equal(offset,15);},
      toString(){return this.node.text;},getClientRects(){return [this.node.rect];}};}};
  let pdfSelected=true;
  let pdfText='paragraph\ncontinues here.';
  context.window.getSelection=()=>({isCollapsed:!pdfSelected,rangeCount:1,toString:()=>pdfSelected?pdfText:'',getRangeAt:()=>range});
  preview.contains=node=>nodes.includes(node);
  preview.querySelectorAll=selector=>selector==='.textLayer span'?nodes.map((node,i)=>({firstChild:node,closest:()=>pages[i]})):
    [...elements.values()].filter(node=>['pdf-comment-highlight','pdf-comment-pin'].includes(node.className)&&node.parent?.children.includes(node));
  const pdfClick={...contextClick,prevented:false};
  preview.oncontextmenu(pdfClick);
  assert(pdfClick.prevented,JSON.stringify(vm.runInContext('({panMode,readOnly:editor.getOption("readOnly"),points:selectedPdfPoints()})',context)));assert(element('#pdf-menu').open);assert(element('#pdf-chat-quick-menu').focused);
  const points=JSON.parse(JSON.stringify(vm.runInContext('pdfSelection.points',context)));
  assert.deepEqual(points,[{page:1,x:60,y:660},{page:2,x:90,y:640}]);
  assert.equal(vm.runInContext('pdfSelection.context.before',context),'First ','Native text endpoints capture the unselected leading context.');
  element('#pdf-menu').hidePopover();pdfSelected=false;preview.oncontextmenu(pdfClick);
  assert(!element('#pdf-menu').open,'No selection keeps the native menu.');
  pdfSelected=true;preview.oncontextmenu({...pdfClick,shiftKey:true});assert(!element('#pdf-menu').open);
  let lookups=0;
  context.fetch=async(url,options)=>{
    assert.equal(url,'/synctex');const body=JSON.parse(options.body);
    if(body.direction==='range')return {ok:true,json:async()=>({regions:[],lines:{}})};
    assert.equal(body.direction,'backward');assert.equal(body.version,'v');assert.equal(body.pdf_revision,'second');lookups++;
    return {ok:true,json:async()=>({line:body.page===1?4:5,column:1})};
  };
  preview.oncontextmenu(pdfClick);await element('#pdf-chat-quick-menu').onclick();
  assert.equal(chatOpened.at(-1).left,120);assert.deepEqual(JSON.parse(JSON.stringify(editor.selection)),{from:{line:3,ch:6},to:{line:4,ch:15}});
  assert.equal(lookups,2);
  const goodLookup=context.fetch;
  context.fetch=async(url,options)=>JSON.parse(options.body).page===2?{ok:false,status:400,json:async()=>({error:'该处没有对应源码'})}:goodLookup(url,options);
  preview.oncontextmenu(pdfClick);await element('#pdf-chat-quick-menu').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(editor.selection)),{from:{line:3,ch:6},to:{line:4,ch:15}},'One failed endpoint must not discard a unique text match at the other anchor.');
  const openedBeforeStale=chatOpened.length;
  context.fetch=async(url,options)=>JSON.parse(options.body).page===2?{ok:false,status:409,json:async()=>({error:'源码与 PDF 版本不同'})}:goodLookup(url,options);
  preview.oncontextmenu(pdfClick);await element('#pdf-chat-quick-menu').onclick();
  assert.equal(chatOpened.length,openedBeforeStale,'Partial coordinate success must not bypass stale-version rejection.');
  context.fetch=goodLookup;
  options.keyMap='default';const normalEscapes=vimEscapes;
  await realSynchronize('backward',points[0]);assert.equal(vimEscapes,normalEscapes,'PDF jumps must not enter Vim in standard mode.');
  preview.oncontextmenu(pdfClick);await element('#pdf-chat-quick-menu').onclick();
  assert.equal(vimEscapes,normalEscapes,'PDF selection mapping must not enter Vim in standard mode.');options.keyMap='vim';
  assert.deepEqual(JSON.parse(JSON.stringify(chatOpened.at(-1))),{left:120,top:180,selectionTop:30,selectionBottom:790,
    pdf:{pdf_revision:'second',rectangles:[{page:1,rect:[20,670,100,650]},{page:2,rect:[50,650,130,630]}]}});
  const automaticOpened=chatOpened.length,automaticLookups=lookups;
  element('#pdf-box-auto-comment').checked=true;
  preview.onpointerup({pointerId:1,button:0});
  preview.onkeydown({code:'ArrowRight',key:'ArrowRight',shiftKey:true});
  assert.equal(chatOpened.length,automaticOpened,'Selecting text alone never opens the comment composer.');
  assert.equal(lookups,automaticLookups,'Selection alone makes no synchronization request.');
  element('#pdf-box-auto-comment').checked=false;
  assert.equal(preview.events.pointerup,undefined);assert.equal(preview.events.keyup,undefined);
  assert.equal(chatOpened.at(-1).pdf.rectangles.length,2,'Keep rectangles across pages for highlights and pins.');
  context.annotationItems=[{id:7,request:'Revise this passage',pdf:chatOpened.at(-1).pdf}];
  let editedComment;context.editComment=item=>editedComment=item;
  vm.runInContext('paintPdfAnnotations(annotationItems,editComment)',context);
  assert.equal(preview.querySelectorAll('.pdf-comment-pin').length,4,'Two highlights and a pin on each selected page.');
  const pin=views[0].div.children.find(child=>child.className==='pdf-comment-pin');
  pin.onclick();assert.equal(editedComment.id,7);assert.equal(pin.style.left,'8px');
  context.annotationItems.push({...context.annotationItems[0],id:8});
  vm.runInContext('paintPdfAnnotations(annotationItems,editComment)',context);
  const nearbyPins=views[0].div.children.filter(child=>child.className==='pdf-comment-pin');
  assert.deepEqual(nearbyPins.map(pin=>pin.style.left),['8px','36px'],'Nearby comment numbers are inset from the left edge without overlapping.');
  nearbyPins[1].onclick();assert.equal(editedComment.id,8);
  context.annotationItems.pop();
  views[0].viewport.convertToViewportPoint=(x,y)=>[x*2,(700-y)*2];views[0].viewport.width=1000;
  vm.runInContext('paintPdfAnnotations(annotationItems,editComment)',context);
  assert.equal(views[0].div.children.find(child=>child.className==='pdf-comment-highlight').style.width,'160px','Zoom reprojects PDF points.');
  context.annotationItems[0].pdf={...context.annotationItems[0].pdf,pdf_revision:'old-build'};
  vm.runInContext('paintPdfAnnotations(annotationItems,editComment)',context);
  assert.equal(preview.querySelectorAll('.pdf-comment-pin').length,0,'Never show old PDF geometry on another build.');
  views[0].viewport.convertToViewportPoint=(x,y)=>[x,700-y];views[0].viewport.width=500;
  const beforeAnchorFetch=context.fetch,anchorDoc={};editor.getDoc=()=>anchorDoc;editor.getRange=()=> 'annotated';
  context.sourceComment={doc:anchorDoc,original:'annotated',marker:{find:()=>({from:{line:3,ch:6},to:{line:3,ch:15}})}};
  let anchorLookups=0;
  context.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.direction,'forward');assert.equal(body.line,4);assert.equal(body.column,7);anchorLookups++;
    return {ok:true,json:async()=>({page:1,rect:[10,600,30,620]})};
  };
  await vm.runInContext('locatePdfAnnotation(sourceComment)',context);
  assert.equal(context.sourceComment.pdf.pdf_revision,'second');
  assert.deepEqual(context.sourceComment.pdf.rectangles[0].rect,[10,600,30,620]);
  await vm.runInContext('locatePdfAnnotation(sourceComment)',context);assert.equal(anchorLookups,1,'One source lookup per build/range.');
  context.fetch=beforeAnchorFetch;
  const opened=chatOpened.length,selectedRange=editor.selection;
  pdfText='no matching source';preview.oncontextmenu(pdfClick);
  await element('#pdf-chat-quick-menu').onclick();assert.equal(chatOpened.length,opened);assert.equal(editor.selection,selectedRange);
  assert.match(element('#status').textContent,/唯一匹配/);pdfText='paragraph\ncontinues here.';
  const mapped=lookups;
  preview.oncontextmenu(pdfClick);source+=' changed';
  await element('#pdf-chat-quick-menu').onclick();assert.equal(chatOpened.length,opened);assert.equal(lookups,mapped);
  source=paragraphs;preview.oncontextmenu(pdfClick);vm.runInContext("pdfBuild='third'",context);
  await element('#pdf-chat-quick-menu').onclick();assert.equal(chatOpened.length,opened);assert.equal(lookups,mapped);
  vm.runInContext("pdfBuild='second'",context);preview.oncontextmenu(pdfClick);
  const pendingLookups=[];
  context.fetch=()=>new Promise(resolve=>pendingLookups.push(resolve));
  const locating=element('#pdf-chat-quick-menu').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  source+=' changed during lookup';
  pendingLookups.forEach(resolve=>resolve({ok:true,json:async()=>({line:4,column:1})}));
  await locating;assert.equal(chatOpened.length,opened);assert.equal(editor.selection,selectedRange);
  source=paragraphs;preview.oncontextmenu(pdfClick);
  context.fetch=async()=>({ok:false,status:400,json:async()=>({error:'该处来自其他文件：included.tex'})});
  await element('#pdf-chat-quick-menu').onclick();assert.equal(chatOpened.length,opened);
  assert.match(element('#status').textContent,/included.tex/);
  assert.equal(editor.selection,selectedRange,'Mapping failures preserve the source selection.');
  context.setTimeout=fn=>{fn();return 0;};
  let networkCalls=0;
  context.fetch=async()=>{if(++networkCalls===1)throw new TypeError('Failed to fetch');return {ok:true,json:async()=>({status:'done'})};};
  assert.equal((await vm.runInContext('request("/chat?id=test")',context)).status,'done');
  assert.equal(networkCalls,2,'A transient poll failure resumes the same request.');
  networkCalls=0;
  context.fetch=async(url,options)=>{
    assert.equal(JSON.parse(options.body).request_id,'1'.repeat(32));
    return {ok:true,json:async()=>{if(++networkCalls===1)throw new TypeError('Failed to fetch');return {id:'same-job'};}};
  };
  assert.equal((await vm.runInContext('request("/chat",{method:"POST",body:JSON.stringify({request_id:"1".repeat(32)})})',context)).id,'same-job');
  assert.equal(networkCalls,2,'A lost Send response retries with the same task ID.');
  networkCalls=0;
  context.fetch=async(url,options)=>{
    assert.equal(url,'/save');assert.equal(JSON.parse(options.body).annotation_change.id,'2'.repeat(32));
    if(++networkCalls===1)throw new TypeError('Lost save response');
    return {ok:true,json:async()=>({version:'annotation-v'})};
  };
  await vm.runInContext('request("/save",{method:"POST",body:JSON.stringify({annotation_change:{id:"2".repeat(32)}})})',context);
  assert.equal(networkCalls,2,'An annotation save retries with its idempotent history key.');
  networkCalls=0;context.fetch=async()=>{networkCalls++;throw new TypeError('Failed to fetch');};
  await assert.rejects(vm.runInContext('request("/compile",{method:"POST"})',context),/连接中断/);
  assert.equal(networkCalls,1,'Never automatically repeat a save or compile.');
  networkCalls=0;
  await assert.rejects(vm.runInContext('request("/save",{method:"POST",body:"{}"})',context),/连接中断/);
  assert.equal(networkCalls,1,'Ordinary saves are still never replayed automatically.');
  networkCalls=0;
  await assert.rejects(vm.runInContext('request("/state")',context),/连接中断/);
  assert.equal(networkCalls,3,'Repeated failures stop with a readable message.');
  vm.runInContext("loading=false;busy=false;syncBusy=false;historyDialog.open=false;version='poll-version'",context);
  let finishPoll, polls=0;
  context.fetch=()=>{polls++;return new Promise(resolve=>finishPoll=resolve);};
  const activePoll=vm.runInContext('load()',context);
  await vm.runInContext('load()',context);
  await vm.runInContext('load()',context);
  assert.equal(polls,1,'A slow state poll must not accumulate overlapping requests.');
  finishPoll({ok:true,json:async()=>({version:'poll-version'})});
  await activePoll;
  assert.equal(vm.runInContext('loading',context),false);
  context.fetch=async()=>{polls++;return {ok:true,json:async()=>({version:'poll-version'})};};
  await vm.runInContext('load()',context);
  assert.equal(polls,2,'Polling resumes after the previous request completes.');
  vm.runInContext("display({source:'Line one\\r\\nLine two',version:'crlf-v',name:'main.tex',path:'/project/main.tex'})",context);
  assert.equal(editor.doc.source,'Line one\nLine two');assert.equal(vm.runInContext('saved',context),editor.doc.source,'Loaded CRLF files must not appear dirty in the LF editor.');
  source='Main source';editor.swapDoc=doc=>{editor.doc=doc;source=doc.source;};
  vm.runInContext("busy=false;syncBusy=false;conflict=false;loading=false;display({source:'Main source',version:'main-v',name:'main.tex',path:'/project/main.tex',project_root:'/project',main_file:'/project/main.tex',project_version:'project-v'});pdfVersion=version;pdfBuild='second'",context);
  const childState={source:'Appendix paragraph.',main_source:macroPreamble,version:'appendix-v',name:'body.tex',path:'/project/appendices/body.tex',project_root:'/project',main_file:'/project/main.tex',project_version:'project-v',sync:true,pdf_revision:'second',labels:{eq:'7'},citations:{paper:'9'},files:[{path:'/project/main.tex',name:'main.tex'},{path:'/project/appendices/body.tex',name:'appendices/body.tex'}]};
  const oldPreview=viewer.pdfDocument;let sourceSwitches=0;
  context.fetch=async(url,options)=>{
    if(url==='/synctex')return {ok:true,json:async()=>({path:childState.path,line:1,column:1})};
    assert.equal(url,'/source');assert.equal(JSON.parse(options.body).version,'main-v');sourceSwitches++;
    return {ok:true,json:async()=>childState};
  };
  await vm.runInContext("synchronize('backward',{page:1,x:10,y:10})",context);
  assert.equal(sourceSwitches,1);assert.equal(element('#filename').title,childState.path);
  assert.equal(vm.runInContext('mainFile',context),'/project/main.tex');
  assert.equal(vm.runInContext('mainSource',context),macroPreamble,'PDF inverse navigation must retain the main preamble for child formulas.');
  assert.equal(vm.runInContext('pdfVersion',context),'appendix-v');assert.equal(viewer.pdfDocument,oldPreview,'Inverse source switches preserve the compiled main PDF.');
  assert.equal(vm.runInContext('compiledLabels.eq',context),'7');assert.equal(element('a[download]').download,'main.pdf');
  assert.equal(editor.cursor.line,0);
  vm.runInContext('selectionChat.hasAnnotations=true',context);
  assert.equal(await vm.runInContext("switchSource('/project/main.tex')",context),false);
  assert.equal(sourceSwitches,1,'Pending comments must never be silently discarded by navigation.');
  vm.runInContext('selectionChat.hasAnnotations=false',context);
  context.setTimeout=fn=>{uiTimers.set(++uiTimerId,fn);return uiTimerId;};
  source='Unsaved appendix edit';const routes=[];
  context.fetch=async(url,options)=>{
    routes.push(url);
    if(url==='/save'){assert.equal(JSON.parse(options.body).source,source);return {ok:true,json:async()=>({version:'edited-v'})};}
    assert.equal(url,'/source');assert.equal(JSON.parse(options.body).version,'edited-v');
    return {ok:true,json:async()=>({...childState,source:'Main source',main_source:'',version:'main-v2',name:'main.tex',path:'/project/main.tex',sync:false})};
  };
  assert.equal(await vm.runInContext("switchSource('/project/main.tex',false)",context),true);
  assert.deepEqual(routes,['/save','/source'],'Navigation saves the active child before switching.');
  assert.equal(vm.runInContext('pdfVersion',context),'','Unsynced child edits disable old PDF synchronization.');
  assert.equal(vm.runInContext('mainSource',context),'','Opening the main source must discard the previous child preamble snapshot.');
  assert.throws(()=>context.sourcePdfTextRange('alpha missing beta',[1],'alpha beta',{}, {},'alpha missing beta',true),/唯一匹配/,'Rectangular prose selections cannot guess across omitted words.');
  const similarBox=(source,text,continuous=true)=>JSON.parse(JSON.stringify(context.sourcePdfTextRange(source,[1],text,{}, {},source,true,continuous)));
  const similarSource='Before. A precise bound follows. After.';
  assert.deepEqual(similarBox(similarSource,'A precise boμnd follows.'),{from:{line:0,ch:8},to:{line:0,ch:32},approximate:true,similar:true},'A continuous box tolerates a PDF glyph substitution while preserving its source edges.');
  assert.throws(()=>similarBox(similarSource,'A precise boμnd follows.',false),/唯一匹配/,'Unverified or disconnected rectangles remain strict.');
  assert.throws(()=>similarBox('A precise bound follows. A precise bound follows.','A precise boμnd follows.'),/唯一匹配/,'Similar box matching still rejects equally good source ranges.');
  assert.throws(()=>similarBox(similarSource,'A completely different statement.'),/唯一匹配/,'Continuous geometry does not justify an unrelated source match.');
  const scriptSource=String.raw`The bound is $x_1^2$ for every value.`;
  assert.deepEqual(similarBox(scriptSource,'The bound is x21 for every value.'),{from:{line:0,ch:0},to:{line:0,ch:scriptSource.length},approximate:true,similar:true,mathBlock:true},'Similar boxes tolerate reordered formula scripts and retain the complete inline expression.');
  const boxedItem=String.raw`\item The matrix factors have rank $r$, the transformed condition numbers are below $7\sqrt k$, and the raw condition numbers are at most $1024\sqrt k\,r^2$.`;
  const boxedItemPdf='1. The matrix factors have rank r,\nthe transformed condi-\ntion numbers are below 7√k, and the raw condition\nnumbers are at most 1024√k r2.';
  const boxedMatch=(source,text)=>JSON.parse(JSON.stringify(context.sourcePdfTextRange(source,[1],text,{}, {},source,true)));
  assert.deepEqual(boxedMatch(boxedItem,boxedItemPdf),{from:{line:0,ch:6},to:{line:0,ch:boxedItem.length},approximate:true,mathBlock:true},'Boxed list prose keeps intact inline formulas while removing only the generated list label.');
  assert.throws(()=>boxedMatch(boxedItem,boxedItemPdf.replace('transformed ','')),/唯一匹配/,'Inline formula support must not guess across omitted prose.');
  assert.throws(()=>boxedMatch(boxedItem.slice(6),boxedItemPdf),/唯一匹配/,'A numeric prefix can only be generated by a source item command.');
  assert.throws(()=>boxedMatch(boxedItem+' '+boxedItem,boxedItemPdf),/唯一匹配/,'Identical list item bodies remain ambiguous.');
  const boxedHyphen=String.raw`\item A matrix-vector factor has rank $r$.`;
  assert.deepEqual(boxedMatch(boxedHyphen,'2. A matrix-\nvector factor has rank r.'),{from:{line:0,ch:6},to:{line:0,ch:boxedHyphen.length},approximate:true,mathBlock:true},'Formula projection must retain genuine compound-word hyphens.');
  assert.deepEqual(JSON.parse(JSON.stringify(context.sourcePdfTextRange('Before $x_1$ after.',[1],'x',{}, {},'Before $x_1$ after.',true))),{from:{line:0,ch:7},to:{line:0,ch:12},approximate:true,mathBlock:true},'Even a literal boxed inline symbol expands to its intact formula.');
  const runInBody=String.raw`All $2^8$ corners agreed with \eqref{eq:intervals} to error $2.23\times10^{-16}$. These checks do not replace proofs.`;
  const runInSource='\\paragraph{Exactness checks.}\n'+runInBody;
  const runInPdf='Exactness checks. All 28 corners agreed with (15) to error 2.23 × 10−16. These checks do not replace proofs.';
  const runInMatch=(source,text,locations=[2])=>{
    const range=context.sourcePdfTextRange(source,locations,text,{'eq:intervals':'15'}, {},source,true);
    const offset=pos=>source.split('\n').slice(0,pos.line).reduce((n,line)=>n+line.length+1,0)+pos.ch;
    return source.slice(offset(range.from),offset(range.to));
  };
  assert.equal(runInMatch(runInSource,runInPdf),runInSource,'A boxed run-in heading and its body preserve the paragraph command even when SyncTeX tags only the body.');
  assert.equal(runInMatch(runInSource,runInPdf.slice('Exactness checks. '.length)),runInBody,'Body-only selections exclude an unselected run-in heading.');
  assert.equal(runInMatch('\\paragraph*[Short title]{Exactness checks.}\n'+runInBody,runInPdf),'\\paragraph*[Short title]{Exactness checks.}\n'+runInBody,'Starred and optional-short-title run-in headings use the displayed title.');
  assert.equal(runInMatch('\\subparagraph{Exactness checks.} '+runInBody,runInPdf,[1]),'\\subparagraph{Exactness checks.} '+runInBody,'Same-line subparagraph headings retain balanced source boundaries.');
  assert.throws(()=>runInMatch(runInSource,runInPdf.replace('corners ','')),/唯一匹配/,'Run-in headings never excuse missing boxed prose.');
  assert.throws(()=>runInMatch(runInSource,runInPdf.replace('Exactness checks.','Other checks.')),/唯一匹配/,'Only the actual source heading can match.');
  assert.throws(()=>runInMatch(runInSource,runInPdf.slice('Exactness '.length)),/唯一匹配/,'A partial heading followed by body text must not silently include omitted title words.');
  const theoremPreamble=String.raw`\newtheorem{theorem}{Theorem}
\newtheorem{lem}[theorem]{Lemma}
\newtheorem*{observation}{Observation}`;
  const theoremBody=String.raw`For every real number $x$, we have $x^2 \geq 0$.`;
  const theoremSource='\\begin{theorem}\n'+theoremBody+'\n\\end{theorem}';
  const proofBody='The square of a real number is nonnegative.';
  const proofSource='\\begin{proof}\n'+proofBody+'\n\\end{proof}';
  const theoremPdf='Theorem 1. For every real number x, we have x2 ≥ 0.';
  const theoremMatch=(source,text,locations=[1,source.split('\n').length],preamble=theoremPreamble)=>{
    const range=context.sourcePdfTextRange(source,locations,text,{}, {},preamble,true);
    const offset=pos=>source.split('\n').slice(0,pos.line).reduce((n,line)=>n+line.length+1,0)+pos.ch;
    return source.slice(offset(range.from),offset(range.to));
  };
  assert.equal(theoremMatch(theoremSource,theoremPdf,[2]),theoremSource,'Generated theorem headings map to the complete, balanced environment even when SyncTeX returns its body.');
  assert.equal(theoremMatch(theoremSource,theoremPdf,[3]),theoremSource,'SyncTeX may tag theorem text to the end line.');
  const plainTheorem='\\begin{theorem}\nEvery square is nonnegative.\n\\end{theorem}';
  assert.equal(theoremMatch('\\begin{proof}\nEvery square is nonnegative.\n\\end{proof}\n'+plainTheorem,
    'Theorem 1. Every square is nonnegative.'),plainTheorem,'Each repeated generated heading candidate must match its own environment boundary.');
  assert.equal(theoremMatch(proofSource,'Proof. '+proofBody+' □',[3]),proofSource,'Proof heading and optional QED glyph are source-aware decorations.');
  assert.equal(theoremMatch(proofSource,'Proof. '+proofBody),proofSource,'A vector-drawn QED need not appear in the PDF text.');
  assert.equal(theoremMatch(theoremSource+'\n'+proofSource,theoremPdf+' Proof. '+proofBody+' ∎',[2,6]),theoremSource+'\n'+proofSource,'Theorem and proof can be selected together without unpaired delimiters.');
  assert.equal(theoremMatch(theoremSource,'For every real number x, we have x2 ≥ 0.',[2]),theoremBody,'Selecting only the body retains its exact source edges and intact inline math.');
  assert.equal(theoremMatch(theoremSource,'Theorem 1. For every real number x,',[2]),String.raw`For every real number $x$,`,'A header plus partial body must not select the unselected rest of the theorem.');
  assert.equal(theoremMatch(proofSource,'real number is nonnegative. □',[2]),'real number is nonnegative.','Partial proof plus QED retains the partial prose range.');
  assert.equal(theoremMatch(theoremSource,'real number',[2]),'real number','A plain partial selection stays precise.');
  assert.equal(theoremMatch(String.raw`\begin{lem}[Positivity]
\label{lem:positive}
Every square is nonnegative.
\end{lem}`,'Lemma A.2 (Positivity). Every square is nonnegative.',[3]),String.raw`\begin{lem}[Positivity]
\label{lem:positive}
Every square is nonnegative.
\end{lem}`,'Literal shared-counter declarations, optional titles and labels are supported.');
  const observation=String.raw`\begin{observation}Every square is nonnegative.\end{observation}`;
  assert.equal(theoremMatch(observation,'Observation. Every square is nonnegative.'),observation);
  const titledProof=String.raw`\begin{proof}[Proof of positivity]Every square is nonnegative.\end{proof}`;
  assert.equal(theoremMatch(titledProof,'Proof of positivity. Every square is nonnegative.'),titledProof);
  assert.throws(()=>theoremMatch(theoremSource,theoremPdf.replace('real ','')),/唯一匹配/,'Generated headings never excuse missing boxed prose.');
  assert.throws(()=>theoremMatch(theoremSource,theoremPdf.replace('Theorem','Lemma')),/唯一匹配/,'A different environment heading cannot be stripped.');
  assert.throws(()=>theoremMatch(theoremSource,theoremPdf,[2],'% '+theoremPreamble),/唯一匹配/,'Commented-out theorem declarations are not evidence for a generated title.');
  assert.throws(()=>theoremMatch(theoremSource+'\n'+theoremSource,theoremPdf),/唯一匹配/,'Identical theorem bodies in the SyncTeX search region remain ambiguous.');
  assert.throws(()=>theoremMatch(theoremSource+'\n'+proofSource,'we have x2 ≥ 0. Proof. '+proofBody),/唯一匹配/,'Crossing only part of an environment must not create an unbalanced replacement.');
  assert.throws(()=>theoremMatch(proofSource,'The square □ of a real number is nonnegative.'),/唯一匹配/,'A QED glyph is ignored only at the actual proof end.');
  assert.throws(()=>theoremMatch(proofSource,'The square Proof. of a real number is nonnegative.'),/唯一匹配/,'Heading-looking text inside the body is not a generated boundary.');
  const boxSource='A short selectable sentence.';
  source=boxSource;context.boxSource=boxSource;
  vm.runInContext("panMode=false;busy=false;syncBusy=false;conflict=false;version=pdfVersion='box-v';saved=boxSource;pdfBuild='box-pdf'",context);
  const boxData={kind:'box',text:'short selectable',points:[{page:1,x:30,y:50}],fragments:[{page:1,rect:[20,40,100,60],text:'short selectable'}],rectangles:[{page:1,rect:[20,40,100,60]}],source:boxSource,version:'box-v',pdf_revision:'box-pdf'};
  context.boxData=boxData;context.boxConfig.onSelect(boxData);vm.runInContext('pdfBoxSelection.selection=boxData',context);
  pdfSelected=false;preview.oncontextmenu(pdfClick);assert(element('#pdf-menu').open,'Box selection has a comment menu without any native DOM Range.');
  context.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.direction==='range')return {ok:true,json:async()=>({regions:[],lines:{}})};
    assert.equal(body.direction,'backward');return {ok:true,json:async()=>({line:1,column:1})};};
  await element('#pdf-chat-quick-menu').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(editor.selection)),{from:{line:0,ch:2},to:{line:0,ch:18}},'Boxed prose uses the existing source/comment flow.');
  let copied;preview.events.copy({clipboardData:{setData(type,text){assert.equal(type,'text/plain');copied=text;}},preventDefault(){}});
  assert.equal(copied,'short selectable');
  assert.equal(await context.synchronize('selection',{...boxData,text:'short selectab1e',contiguous:true}),true,'The box geometry flag reaches the source matcher.');
  assert.match(element('#status').textContent,/相似 LaTeX/);
  assert.deepEqual(JSON.parse(JSON.stringify(editor.selection)),{from:{line:0,ch:2},to:{line:0,ch:18}});
  const similarSelection=editor.selection;
  await context.synchronize('selection',{...boxData,text:'short selectab1e',contiguous:false});
  assert.equal(editor.selection,similarSelection,'A gapped box cannot change the source selection through a similar match.');
  const previousBoxFetch=context.fetch;
  source=repeatedRows;vm.runInContext('saved='+JSON.stringify(repeatedRows),context);
  const repeatedBox={...boxData,...rowSelection,source:repeatedRows};
  context.fetch=async(url,options)=>({ok:true,json:async()=>JSON.parse(options.body).direction==='range'?
    await indexedRows():{line:2,column:1}});
  assert.equal(await context.synchronize('selection',repeatedBox),true,'The annotation entry uses compiled row disambiguation, not only the isolated matcher.');
  assert.equal(editor.selection.from.line,1);
  const beforeRetryChange=editor.selection;let finishRetry;
  context.fetch=async(url,options)=>JSON.parse(options.body).direction==='range'?new Promise(resolve=>finishRetry=resolve):
    {ok:true,json:async()=>({line:2,column:1})};
  const delayedRetry=context.synchronize('selection',repeatedBox);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof finishRetry,'function');
  source+=' edited during row lookup';finishRetry({ok:true,json:indexedRows});await delayedRetry;
  assert.equal(editor.selection,beforeRetryChange,'A late neighborhood result cannot replace the selection after source edits.');
  source=boxSource;vm.runInContext('saved=boxSource',context);context.fetch=previousBoxFetch;
  vm.runInContext("version='changed'",context);preview.oncontextmenu(pdfClick);
  assert.equal(vm.runInContext('pdfSelection.version',context),'box-v','Opening the box menu never restamps a stale selection as current.');
  const boxesOpened=chatOpened.length;await element('#pdf-chat-quick-menu').onclick();assert.equal(chatOpened.length,boxesOpened);
  preview.onkeydown({key:'Escape'});assert.equal(vm.runInContext('pdfBoxSelection.selection',context),null);
  assert.equal(vm.runInContext('pdfSelection',context),null);assert(!element('#pdf-menu').open);
  const rejectedRoutes=[];
  vm.runInContext("version=pdfVersion='box-v';busy=syncBusy=false",context);
  const autoComment=element('#pdf-box-auto-comment');
  const selectBox=async(data=boxData)=>{
    context.nextBox=data;vm.runInContext('pdfBoxSelection.selection=nextBox',context);
    context.boxConfig.onSelect(data);await new Promise(resolve=>setImmediate(resolve));
  };
  let automaticBoxLookups=0;
  context.fetch=async(url,options)=>{
    assert.equal(url,'/synctex','Automatically opening a comment must never submit an AI request.');
    if(JSON.parse(options.body).direction==='range')return {ok:true,json:async()=>({regions:[],lines:{}})};
    assert.equal(JSON.parse(options.body).direction,'backward');automaticBoxLookups++;
    return {ok:true,json:async()=>({line:1,column:1})};
  };
  const beforeBoxAuto=chatOpened.length;
  autoComment.checked=false;await selectBox();
  assert.equal(chatOpened.length,beforeBoxAuto);assert.equal(automaticBoxLookups,0);
  autoComment.checked=true;await selectBox();
  assert.equal(chatOpened.length,beforeBoxAuto+1);assert.equal(automaticBoxLookups,1);
  assert.deepEqual(JSON.parse(JSON.stringify(chatOpened.at(-1))),{left:20,top:70,selectionTop:30,selectionBottom:70,
    pdf:{pdf_revision:'box-pdf',rectangles:boxData.rectangles}});
  assert(!element('#pdf-menu').open,'Enabled boxes go directly to the comment composer.');
  const afterBoxAuto=chatOpened.length;
  options.readOnly=true;await selectBox();options.readOnly=false;
  assert.equal(chatOpened.length,afterBoxAuto);assert.equal(automaticBoxLookups,1);
  assert.equal(context.boxConfig.onSelect({...boxData,version:'stale'}),false);
  assert.equal(chatOpened.length,afterBoxAuto);
  await selectBox({...boxData,text:'Missing from the source'});
  assert.equal(chatOpened.length,afterBoxAuto,'Failed source matching must not open a composer.');
  for(const cancel of [
    ()=>vm.runInContext('pdfBoxSelection.clear()',context),
    ()=>{autoComment.checked=false;},
    ()=>vm.runInContext('pdfBoxSelection.selection={...boxData}',context),
    ()=>{source+=' edit';}
  ]){
    autoComment.checked=true;
    let resolveLookup;
    context.fetch=()=>new Promise(resolve=>resolveLookup=resolve);
    const previousRange=editor.selection;
    await selectBox();
    await element('#pdf-chat-quick-menu').onclick();
    cancel();resolveLookup({ok:true,json:async()=>({line:1,column:1})});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(chatOpened.length,afterBoxAuto,'Canceled, replaced, disabled or stale pending boxes cannot open late.');
    assert.equal(editor.selection,previousRange,'Invalidated automatic mapping must preserve the source selection.');
    source=boxSource;
  }
  autoComment.checked=false;vm.runInContext('pdfBoxSelection.clear()',context);
  context.fetch=async url=>{rejectedRoutes.push(url);return {ok:false,status:409,json:async()=>({error:'Source and PDF versions differ.'})};};
  await context.synchronize('selection',boxData);
  assert(rejectedRoutes.length>0);assert(rejectedRoutes.every(url=>url==='/synctex'),'Rejected PDF lookups must never open an undefined source path.');
  assert(element('#status').textContent.includes('Source and PDF versions differ.'),'Keep the actual stale-build error.');
  context.setTimeout=fn=>{uiTimers.set(++uiTimerId,fn);return uiTimerId;};
  source='Original with unrelated edit.';
  context.annotationChange={id:'3'.repeat(32),before:source,reply:'Updated.',items:[]};
  vm.runInContext("busy=false;syncBusy=false;conflict=false;version='annotation-before';pdfVersion=version;saved='Original.';editor.setOption('readOnly',false)",context);
  let finishAnnotation,annotationBody;
  context.fetch=(url,options)=>{
    assert.equal(url,'/save');annotationBody=JSON.parse(options.body);
    return new Promise(resolve=>finishAnnotation=resolve);
  };
  const storing=vm.runInContext("saveAnnotationChange('Revised with unrelated edit.',annotationChange)",context);
  assert.equal(options.readOnly,true);assert.equal(vm.runInContext('busy',context),true);
  assert.equal(annotationBody.path,element('#filename').title);assert.equal(annotationBody.version,'annotation-before');
  assert.equal(annotationBody.annotation_change.before,source);
  assert.equal(source,'Original with unrelated edit.','The callback does not edit before durable storage.');
  finishAnnotation({ok:true,json:async()=>({version:'annotation-after'})});await storing;
  assert.equal(vm.runInContext('saved',context),'Revised with unrelated edit.');
  assert.equal(vm.runInContext('version',context),'annotation-after');assert.equal(vm.runInContext('pdfVersion',context),'');
  assert.equal(options.readOnly,false);assert.equal(vm.runInContext('busy',context),false);
  context.fetch=async()=>({ok:false,status:409,json:async()=>({error:'External change.'})});
  await assert.rejects(vm.runInContext("saveAnnotationChange('Revised with unrelated edit.',annotationChange)",context),/External change/);
  assert.equal(vm.runInContext('conflict',context),true);assert.equal(options.readOnly,false);
  assert.equal(source,annotationBody.annotation_change.before,'Conflicts keep the draft untouched.');
  source='# Markdown\n\nA paragraph with $x^2$.\n';context.markdownSource=source;
  vm.runInContext("busy=syncBusy=conflict=false;display({source:markdownSource,version:'md-v',name:'note.md',path:'/project/note.md',document_type:'markdown'})",context);
  assert.equal(options.mode,'obsidian-md');assert.equal(options.keyMap,'vim');
  assert.equal(context.markdownRendered,source);assert.equal(element('#markdown-preview').hidden,false);
  assert.equal(element('a[download]').href,'/download');assert.equal(element('a[download]').download,'note.md');
  assert.equal(context.document.body.dataset.documentType,'markdown');
  const markdownRequests=[];
  context.fetch=async(url,options)=>{markdownRequests.push(url);assert.equal(JSON.parse(options.body).source,source);return {ok:true,json:async()=>({version:'md-saved'})};};
  await context.compile();assert.deepEqual(markdownRequests,['/save']);
  assert.equal(element('#status').textContent,'已保存 · 预览已更新');
  await context.synchronize('forward');assert(context.markdownLocated);
  assert.equal(markdownRequests.length,1,'Markdown navigation never calls SyncTeX.');
  context.fetch=async(url,options)=>{
    markdownRequests.push(url);
    if(url.startsWith('/pdf?'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
    assert.equal(url,'/compile');assert.equal(JSON.parse(options.body).preview,'pdf');
    return {ok:true,json:async()=>({ok:true,version:'md-pdf',pdf_revision:'md-pdf-build',sync:true,log:''})};
  };
  await element('#markdown-pdf-toggle').onclick();
  assert.equal(context.document.body.dataset.previewType,'pdf');assert.equal(element('#markdown-preview').hidden,true);
  assert.equal(element('a[download]').href,'/pdf');assert.equal(element('a[download]').download,'note.pdf');
  assert.equal(vm.runInContext('pdfVersion',context),'md-pdf');
  const count=markdownRequests.length;
  await element('#markdown-pdf-toggle').onclick();
  assert.equal(context.document.body.dataset.previewType,'html');assert.equal(element('#markdown-preview').hidden,false);
  assert.equal(markdownRequests.length,count,'Returning to live preview never invokes TeX or saves.');
  vm.runInContext("display({source:markdownSource,version:'tex-v',name:'paper.tex',path:'/project/paper.tex'})",context);
  assert.equal(options.mode,'text/x-stex');assert.equal(element('#markdown-preview').hidden,true);
  assert.equal(element('a[download]').href,'/pdf');
  const reviewDoc={};context.reviewDoc=reviewDoc;editor.getDoc=()=>reviewDoc;
  editor.charCoords=pos=>({top:pos.line*100});
  vm.runInContext("localReviewItems=[{doc:reviewDoc,review:{},marker:{find:()=>({from:{line:9,ch:0}})}},{doc:{},review:{},marker:{find:()=>({from:{line:20,ch:0}})}},{doc:reviewDoc,marker:{find:()=>({from:{line:30,ch:0}})}}];projectReview.items.push({doc:reviewDoc,review:{},marker:{find:()=>({from:{line:15,ch:0}})}})",context);
  const sourceNavigation=element('#proofread-next').navigation;
  assert.equal(sourceNavigation.previous,element('#proofread-previous'));
  stored.set('latex-codex-proofread-editor','on');
  assert.deepEqual(Array.from(sourceNavigation.positions()),[900,1500], 'Source navigation includes project review and skips stale/non-review annotations.');
  assert.equal(sourceNavigation.top(),200);assert.equal(sourceNavigation.bottom(),800);
  sourceNavigation.scroll(876);assert.deepEqual(editor.scroll,[null,876]);
  stored.set('latex-codex-proofread-editor','off');assert.equal(sourceNavigation.positions().length,0);
  assert.equal(element('#pdf-proofread-next').navigation.positions().length,0, 'Regular PDFs never expose proofread targets.');
  const pdfNavigation=element('#pdf-proofread-next').navigation;
  assert.equal(pdfNavigation.previous,element('#pdf-proofread-previous'));
  assert.equal(pdfNavigation.top(),element('#preview').scrollTop);
  assert.equal(pdfNavigation.bottom(),element('#preview').scrollTop+element('#preview').clientHeight);
  console.log('PASS: source and PDF previous/next-change wiring, viewport boundaries, offscreen positions, project reviews, stale document exclusion and disabled proofreading');
  console.log('PASS: Markdown math mode, live/PDF preview switching, save-only behavior, both downloads, navigation and return to LaTeX');
  console.log('PASS: optional automatic box comments, mapped anchors, no AI submission, cancellation, replacement, stale source and persistence');
  console.log('PASS: durable annotation saves, path/version guards, transient retry, conflict and draft protection');
  console.log('PASS: rectangular selection context menu/copy, exact prose mapping, intact inline formulas, omitted-text rejection and stale-box protection');
  console.log('PASS: inverse source switching, fixed main download, shared metadata, pending-comment protection and save-before-switch');
  console.log('PASS: slow state polling stays single-flight and resumes after completion');
  console.log('PASS: transient connection recovery, safe Send retry and no duplicate saves');
  console.log('PASS: exact PDF text ranges, whitespace, ligatures, line hyphenation, ambiguity rejection, both Codex entries and stale mapping protection');
  console.log('PASS: repeated PDF text context, compiled row disambiguation, adjacent prose/math retries, intact links, shared list labels and unchanged fast-path requests');
  console.log('PASS: context comment menu/shortcut/selection/readonly, zz, PDF zoom, drag/select, versions, scroll retention and load failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
