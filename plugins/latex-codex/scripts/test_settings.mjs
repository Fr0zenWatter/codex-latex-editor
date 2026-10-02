// Run: node test_settings.mjs (stdlib only).
import assert from 'node:assert/strict';
import {initSettings, setText, t} from './vendor/latex-settings.mjs';
const elements=new Map(), stored=new Map(), properties={}, events=[];
function element(id) {
  if(!elements.has(id)) elements.set(id,{value:'',dataset:{},attributes:{},style:{},events:{},textContent:'',
    setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},
    getBoundingClientRect(){return {left:900,bottom:40};},
    addEventListener(key,fn){this.events[key]=fn;},hidePopover(){this.hidden=true;}});
  return elements.get(id);
}
const label=element('static');label.dataset.i18n='历史';
const source=element('source');source.textContent='历史 is literal source text';
const status=element('status');setText(status,'已定位到 PDF 第 {page} 页',{page:12});
const tooltip=element('tooltip');tooltip.attributes['data-i18n-title']='设置';
globalThis.document={querySelector:selector=>element(selector.slice(1)),documentElement:{style:{setProperty:(key,value)=>properties[key]=value}},
  querySelectorAll:selector=>selector==='[data-i18n]'?[label]:selector==='[data-i18n-title]'?[tooltip]:[]};
globalThis.window={innerWidth:1000,dispatchEvent:event=>events.push(event.type)};
Object.defineProperty(globalThis,'navigator',{value:{language:'zh-CN'},configurable:true});
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
initSettings();
assert.equal(label.textContent,'历史');assert.equal(properties['--revision-color'],'#b85c1c');
element('language').value='en';element('language').onchange();
assert.equal(label.textContent,'History');assert.equal(tooltip.attributes.title,'Settings');
assert.equal(status.textContent,'Located on PDF page 12');
assert.equal(source.textContent,'历史 is literal source text');
assert.equal(t('下方还有 {count} 处改动',{count:4}),'4 more updates below');
element('revision-color').value='blue';element('revision-color').onchange();
assert.equal(properties['--revision-color'],'#2563b0');
assert.equal(stored.get('latex-codex-language'),'en');assert.equal(stored.get('latex-codex-revision-color'),'blue');
initSettings();assert.equal(element('language').value,'en');assert.equal(element('revision-color').value,'blue');
element('file-menu').events.beforetoggle({newState:'open'});
assert.equal(element('file-menu-button').attributes['aria-expanded'],'true');
assert.equal(element('file-menu').style.left,'720px');
element('file-menu').events.click({target:{closest:()=>({})}});assert(element('file-menu').hidden);
element('compile').getBoundingClientRect=()=>({left:600,bottom:74});
element('compile-menu').events.beforetoggle({newState:'open'});
assert.equal(element('compile-menu-button').attributes['aria-expanded'],'true');
assert.equal(element('compile-menu').style.left,'600px');assert.equal(element('compile-menu').style.top,'80px');
element('compile-menu').events.beforetoggle({newState:'closed'});
assert.equal(element('compile-menu-button').attributes['aria-expanded'],'false');
assert(events.includes('latex-language-change'));
console.log('PASS: language switching, dynamic labels, source isolation, persistent revision color and file menu positioning');
