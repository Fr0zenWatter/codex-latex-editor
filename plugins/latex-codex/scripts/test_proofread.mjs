// Run: node test_proofread.mjs (stdlib only).
import assert from 'node:assert/strict';
import {attachProofread} from './vendor/latex-proofread.mjs';

function element() {
  return {children:[],style:{},attributes:{},events:{},textContent:'',
    setAttribute(name,value){this.attributes[name]=value;},
    append(...children){this.children.push(...children);},
    addEventListener(name,handler){this.events[name]=handler;}};
}
globalThis.document={createElement:element};
let observer,changed=0,cleared=0;
globalThis.ResizeObserver=class {
  constructor(callback){this.callback=callback;observer=this;}
  observe(target){this.target=target;}
  disconnect(){this.disconnected=true;}
};
const wrapper={clientWidth:500,querySelector:()=>({offsetWidth:36})};
let markOptions;
const editor={getWrapperElement:()=>wrapper,markText(from,to,options){
  assert.deepEqual(from,{line:1,ch:3});assert.deepEqual(to,{line:3,ch:9});
  markOptions=options;return {changed(){changed++;},clear(){cleared++;}};
}};
const plain=node=>node.textContent+node.children.map(plain).join('');
const before='中文 😀 $x$\n<script>old</script> & text';
const after='中文 😀 $x$\n<script>new</script> & text';
const runs=[{kind:'equal',text:'中文 😀 $x$\n<script>'},{kind:'delete',text:'old'},
  {kind:'insert',text:'new'},{kind:'equal',text:'</script> & text'}];
let calls=0,undone=0,release;
const review=attachProofread(editor,{line:1,ch:3},{line:3,ch:9},before,after,runs,
  async()=>{calls++;await new Promise(resolve=>release=resolve);throw new Error('Save failed');},()=>undone++);
assert.equal(markOptions.replacedWith,review.root);assert.equal(markOptions.handleMouseEvents,true);
const [oldRow,newRow,actions]=review.root.children;
assert.equal(plain(oldRow.children[1]),before);assert.equal(plain(newRow.children[1]),after);
assert.deepEqual(oldRow.children[1].children.filter(part=>part.className).map(plain),['old']);
assert.deepEqual(newRow.children[1].children.filter(part=>part.className).map(plain),['new']);
assert.equal(review.root.style.width,'432px');
wrapper.clientWidth=220;observer.callback();assert.equal(review.root.style.width,'152px');
const [error,undo,keep]=actions.children;
const pending=keep.onclick();assert(keep.disabled&&undo.disabled);
await keep.onclick();undo.onclick();assert.equal(calls,1);assert.equal(undone,0);
// An external busy flag must survive completion of the widget's own save.
review.setBusy(true);release();await pending;assert(keep.disabled&&undo.disabled);
assert.equal(error.textContent,'Save failed');review.setBusy(false);assert.equal(keep.disabled,false);
const retry=keep.onclick();assert.equal(error.textContent,'');release();await retry;assert.equal(calls,2);
undo.onclick();assert.equal(undone,1);
let stopped=0;review.root.events.mousedown({stopPropagation(){stopped++;}});assert.equal(stopped,1);
review.destroy();review.destroy();assert.equal(cleared,1);assert(observer.disconnected);
const changesBeforeDestroy=changed;observer.callback();assert.equal(changed,changesBeforeDestroy);
await keep.onclick();assert.equal(calls,2);

// Invalid runs fall back to exact source text, including markup and a full deletion.
const deletion=attachProofread(editor,{line:1,ch:3},{line:3,ch:9},before,'',
  [{kind:'equal',text:'untrusted diff'}],async()=>{},()=>{});
assert.equal(plain(deletion.root.children[0].children[1]),before);
assert.equal(plain(deletion.root.children[1].children[1]),'');
assert.equal(deletion.root.children[0].children[1].children[0].className,'proofread-word');
deletion.destroy();
const initialClears=cleared;
markOptions=null;
const hidden=attachProofread(editor,{line:1,ch:3},{line:3,ch:9},before,after,runs,async()=>{},()=>{},()=>{},false);
assert.equal(markOptions,null,'PDF-only reviews do not replace source text with a widget.');
hidden.setVisible(true,{from:{line:1,ch:3},to:{line:3,ch:9}});
assert.equal(markOptions.replacedWith,hidden.root);
hidden.setVisible(false);hidden.setVisible(false);assert.equal(cleared,initialClears+1);
await hidden.keep();hidden.destroy();
console.log('PASS: lossless Unicode/multiline diff, literal markup, deletion, resize, busy exclusion, save failure/retry and cleanup');
