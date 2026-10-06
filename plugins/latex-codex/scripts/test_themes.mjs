// Run: node plugins/latex-codex/scripts/test_themes.mjs
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {t} from './vendor/latex-settings.mjs';
import {screenshotPalette,screenshotDistribution,colorHue,makeTheme,themeButtonText,contrast,initScreenshotThemes,applyCustomTheme} from './vendor/latex-themes.mjs';

const originalColors=['#ffffff','#e5e7eb','#f8fafc','#e0f2fe','#f4f4f5','#3b82f6','#333333'];
const pixels=Uint8ClampedArray.from(originalColors.flatMap((color,i)=>Array.from({length:i===0?900:100},()=>[...color.match(/\w\w/g).map(v=>parseInt(v,16)),255]).flat()));
const outlined=Uint8ClampedArray.from(Array.from({length:900},(_,i)=>[...((i<30?'#101010':i>=310&&i<590&&i%30>=10&&i%30<20?'#e5e7eb':'#ffffff').match(/\w\w/g).map(v=>parseInt(v,16))),255]).flat());
assert.deepEqual(screenshotPalette(outlined,30),['#ffffff','#e5e7eb'],'One-pixel borders must not become theme colors');
const colors=screenshotPalette(pixels),light=makeTheme(colors),dark=makeTheme(['#222222','#eeeeee','#ffff00','#0066ff','#ff3333']);
const distribution=screenshotDistribution(pixels);
assert.equal(distribution[0].share,.6);assert.equal(distribution.reduce((sum,item)=>sum+item.count,0),pixels.length/4);
assert(Math.abs(distribution.reduce((sum,item)=>sum+item.share,0)-1)<1e-9);
assert.equal(colorHue('#ff0000'),0);assert.equal(colorHue('#0000ff'),240);
const multi=makeTheme(['#ffffff','#333333','#ff3333','#0066ff','#ffff00']);
assert.equal(multi.sources.command,'#ff3333');assert.equal(multi.sources.math,'#0066ff');assert.equal(multi.sources.reference,'#ffff00');
for(const role of ['command','math','reference','environment','number'])assert(['#ff3333','#0066ff','#ffff00'].includes(multi.sources[role]),'Syntax hues must come from the screenshot');
assert(colors.includes('#3b82f6'));assert.equal(light.bg,'#ffffff');assert.equal(light.scheme,'light');assert.equal(dark.scheme,'dark');
assert.deepEqual(colors,originalColors,'Retain all seven swatches, including similar light grays');
assert.equal(makeTheme(['#0066ff','#ffffff','#222222']).bg,'#0066ff','The largest area wins even when it is saturated');
assert.equal(light['quick-accent'],'#3b82f6','Buttons use a real screenshot color, without a separate contrasting accent');
for(const theme of [light,dark,multi,makeTheme(['#ff0000','#ffff00'],'#ff0000')]){
  for(const role of ['text','muted','command','math','operator','reference','environment','number','environment-command'])assert(contrast(theme[role],theme.bg)>=4.5,role+' must remain readable');
  assert(contrast(themeButtonText(theme),theme['quick-accent'])>=4.5,'Button text must remain readable without altering the original fill');
}
assert.throws(()=>screenshotPalette(new Uint8ClampedArray(16)),/No palette found/);

const nodes=new Map(),stored=new Map(),properties={};
function element(id){
  if(!nodes.has(id))nodes.set(id,{children:[],dataset:{},style:{setProperty(k,v){this[k]=v;}},value:'',disabled:false,events:{},
    append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setAttribute(){},focus(){this.focused=true;},
    addEventListener(key,fn){this.events[key]=fn;},showModal(){this.open=true;},close(){this.open=false;},hidePopover(){},
    getContext(){return {drawImage(){},getImageData(){return {data:pixels};}};},toDataURL(){return 'data:image/png;base64,AA==';}});
  return nodes.get(id);
}
globalThis.document={querySelector:selector=>element(selector.slice(1)),getElementById:element,createElement:()=>element(Symbol()),createTextNode:text=>({textContent:text}),documentElement:{style:{setProperty(k,v){properties[k]=v;},removeProperty(k){delete properties[k];}}}};
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
globalThis.createImageBitmap=async()=>({width:25,height:pixels.length/4/25,close(){}});
const select=element('theme');select.value='cobalt';let applied=0;
initScreenshotThemes(select,()=>{applied++;applyCustomTheme(select.value);});
element('theme-customize').onclick();assert(element('theme-dialog').open);
element('theme-image').files=[{type:'image/png',size:500}];
await element('theme-image').onchange();assert.equal(element('theme-image').value,'','Allow choosing the same file again after pasting');element('theme-generate').onclick();
assert(!element('theme-generated').hidden);assert(!element('theme-save').disabled);
assert.equal(element('theme-palette').children.length,7);assert.equal(element('theme-swatches').children.length,12);
assert.equal(element('theme-wheel').children.length+element('theme-neutrals').children.length,7,'The wheel and neutral strip cover every extracted color');
const panelInput=element('theme-swatches').children[1].children[1];panelInput.value='#e0f2fe';panelInput.onchange();assert.equal(element('theme-sample').style['--panel'],'#e0f2fe','Surfaces must keep the chosen tint');
const commandInput=element('theme-swatches').children[5].children[1];commandInput.value='#cc2222';commandInput.onchange();assert.equal(element('theme-sample').style['--quick-accent'],'#3b82f6','Syntax adjustments must not replace the original UI primary');
element('theme-generate').onclick();
element('theme-palette').children[5].onclick();assert.equal(element('theme-sample').style['--bg'],'#3b82f6');element('theme-generate').onclick();
element('theme-name').value='   ';element('theme-save').onclick();assert.equal(applied,0);
element('theme-name').value='Modern Minimal';element('theme-save').onclick();assert.equal(applied,1);assert.equal(properties['--bg'],'#ffffff');
const id=select.value;assert(id.startsWith('custom-'));assert(!element('theme-dialog').open);
element('theme-generate').onclick();element('theme-name').oninput();assert.equal(element('theme-save').textContent,t('更新并使用'));element('theme-save').onclick();assert.equal(select.value,id);assert.equal(JSON.parse(stored.get('latex-codex-custom-themes')).length,1,'Updating a name keeps a single theme');
const saved=JSON.parse(stored.get('latex-codex-custom-themes'));assert.equal(saved[0].name,'Modern Minimal');assert(!JSON.stringify(saved).includes('data:image'),'Store colors only, never the screenshot');
assert.deepEqual(saved[0].palette,originalColors,'Preserve the original palette alongside derived UI colors');
assert.equal(saved[0].distribution.reduce((sum,item)=>sum+item.count,0),pixels.length/4);
initScreenshotThemes(element('reloaded-theme'),()=>{});assert(applyCustomTheme(id),'Custom themes survive initialization');
applyCustomTheme('cobalt');assert.equal(properties['--bg'],undefined);assert.equal(properties['color-scheme'],undefined);
element('theme-image').files=[{type:'text/html',size:50}];await element('theme-image').onchange();assert(element('theme-generate').disabled);assert(element('theme-save').disabled);
console.log('PASS: color distribution, original syntax hues, readable text, complete wheel, persistence and builtin reset');
