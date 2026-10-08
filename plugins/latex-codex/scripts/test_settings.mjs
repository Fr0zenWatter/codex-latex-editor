// Run: node test_settings.mjs (stdlib only).
import assert from 'node:assert/strict';
import {english, initSettings, resolveLanguage, setText, t} from './vendor/latex-settings.mjs';
import {translations} from './vendor/latex-locales.mjs';
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
const themeGroup=element('theme-group');themeGroup.attributes['data-i18n-label']='浅色';
globalThis.document={querySelector:selector=>element(selector.slice(1)),documentElement:{style:{setProperty:(key,value)=>properties[key]=value}},
  querySelectorAll:selector=>selector==='[data-i18n]'?[label]:selector==='[data-i18n-title]'?[tooltip]:selector==='[data-i18n-label]'?[themeGroup]:[]};
globalThis.window={innerWidth:1000,dispatchEvent:event=>events.push(event.type)};
Object.defineProperty(globalThis,'navigator',{value:{language:'zh-CN'},configurable:true});
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
initSettings();
assert.equal(label.textContent,'历史');assert.equal(properties['--revision-color'],'#b85c1c');
assert.equal(element('pdf-box-auto-comment').checked,true,'Automatic PDF comments default to on.');
assert.equal(element('proofread-editor').checked,true);assert.equal(element('proofread-pdf').checked,true);
assert.equal(element('proofread-project').checked,false);
element('proofread-project').checked=true;element('proofread-project').onchange();
initSettings();assert.equal(element('proofread-project').checked,true);
assert(events.includes('latex-project-review-change'));
element('proofread-editor').checked=false;element('proofread-editor').onchange();
initSettings();assert.equal(element('proofread-editor').checked,false);assert.equal(element('proofread-pdf').checked,true);
assert(events.includes('latex-proofread-change'));
element('pdf-box-auto-comment').checked=true;element('pdf-box-auto-comment').onchange();
assert.equal(stored.get('latex-codex-pdf-box-auto-comment'),'on');
initSettings();assert.equal(element('pdf-box-auto-comment').checked,true);
element('pdf-box-auto-comment').checked=false;element('pdf-box-auto-comment').onchange();
initSettings();assert.equal(element('pdf-box-auto-comment').checked,false);
element('language').value='en';element('language').onchange();
assert.equal(label.textContent,'History');assert.equal(tooltip.attributes.title,'Settings');
assert.equal(themeGroup.attributes.label,'Light');assert.equal(t('Neo · 简洁白'),'Neo · Clean white');
assert.equal(status.textContent,'Located on PDF page 12');
assert.equal(source.textContent,'历史 is literal source text');
assert.equal(t('下方还有 {count} 处改动',{count:4}),'4 more updates below');
element('revision-color').value='blue';element('revision-color').onchange();
assert.equal(properties['--revision-color'],'#2563b0');
assert.equal(stored.get('latex-codex-language'),'en');assert.equal(stored.get('latex-codex-revision-color'),'blue');
initSettings();assert.equal(element('language').value,'en');assert.equal(element('revision-color').value,'blue');
assert.equal(element('outline-style').value,'wheel');
element('outline-style').value='cards';element('outline-style').onchange();
assert.equal(stored.get('latex-codex-outline-style'),'cards');
assert(events.includes('latex-outline-change'));
initSettings();assert.equal(element('outline-style').value,'cards');
stored.set('latex-codex-outline-style','invalid');initSettings();
assert.equal(element('outline-style').value,'wheel');
assert.equal(t('章节卡片 + 小节轮盘'),'Section cards + subsection dial');
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

// Regional system preferences, English fallback, and manual overrides survive reloads.
for (const [preferences, expected] of [
  [['ja-JP'], 'ja'], [['fr-CA'], 'fr'], [['de-AT'], 'de'], [['es-MX'], 'es'],
  [['zh-TW'], 'zh-TW'], [['zh_HK'], 'zh-TW'], [['zh-MO'], 'zh-TW'],
  [['zh-Hant'], 'zh-TW'], [['zh-Hant-CN'], 'zh-TW'], [['zh-Hans-TW'], 'zh-CN'],
  [['zh-CN'], 'zh-CN'], [['zh-SG'], 'zh-CN'], [['zh'], 'zh-CN'],
  [['EN_us'], 'en'], [['it-IT', 'fr-FR'], 'fr'],
  [['ko-KR', 'ru-RU'], 'en'], [[], 'en'], [[null, '', 'invalid'], 'en']
]) assert.equal(resolveLanguage(preferences), expected);
const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
for (const message of Object.values(english)) for (const code of ['zh-TW', 'ja', 'fr', 'de', 'es']) {
  assert(translations[message]?.[code]?.trim(), `Missing ${code}: ${message}`);
  assert.deepEqual(placeholders(translations[message][code]), placeholders(message), `${code}: ${message}`);
}
for (const [code, history, settings, located] of [
  ['zh-TW', '歷史', '設定', '已定位到 PDF 第 12 頁'],
  ['ja', '履歴', '設定', 'PDF 12 ページに移動しました'],
  ['fr', 'Historique', 'Paramètres', 'Localisé à la page PDF 12'],
  ['de', 'Verlauf', 'Einstellungen', 'Auf PDF-Seite 12 gefunden'],
  ['es', 'Historial', 'Ajustes', 'Localizado en la página PDF 12']
]) {
  element('language').value=code;element('language').onchange();
  assert.equal(label.textContent,history);assert.equal(tooltip.attributes.title,settings);
  assert.equal(status.textContent,located);assert.equal(document.documentElement.lang,code);
  assert.equal(source.textContent,'历史 is literal source text');
  assert.equal(t('A new English UI message'),'A new English UI message');
  assert.equal(stored.get('latex-codex-language'),code);
  navigator.language='zh-CN';navigator.languages=['zh-CN'];initSettings();
  assert.equal(element('language').value,code);assert.equal(label.textContent,history);
}
element('language').value='system';navigator.language='ja-JP';navigator.languages=['it-IT','fr-CA'];
element('language').onchange();assert.equal(document.documentElement.lang,'fr');
assert.equal(stored.get('latex-codex-language'),'system');
navigator.language='ko-KR';navigator.languages=['ko-KR'];initSettings();
assert.equal(document.documentElement.lang,'en');assert.equal(label.textContent,'History');
stored.set('latex-codex-language','invalid');initSettings();
assert.equal(element('language').value,'system');assert.equal(document.documentElement.lang,'en');
stored.clear();delete navigator.languages;delete navigator.language;initSettings();
assert.equal(document.documentElement.lang,'en');
globalThis.localStorage={getItem(){throw new Error('Storage unavailable');},setItem(){throw new Error('Storage unavailable');}};
element('language').value='';initSettings();assert.equal(document.documentElement.lang,'en');
element('language').value='de';element('language').onchange();assert.equal(label.textContent,'Verlauf');
console.log('PASS: seven languages, system preferences, English fallback, complete translations, placeholders, persistence, source isolation and menu positioning');

// User preferences override per-port browser storage, and failed saves retain retryable changes.
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
const remoteSettings={'latex-codex-language':'ja','latex-codex-source-font-size':'19'};
element('user-preferences').textContent=JSON.stringify(remoteSettings);
stored.set('latex-codex-source-font-size','12');
const persistent=await import('./vendor/latex-settings.mjs?persistent');
assert.equal(persistent.preferences.getItem('latex-codex-source-font-size'),'19');
globalThis.fetch=async(route,options)=>{
  assert.equal(route,'/preferences');
  Object.assign(remoteSettings,JSON.parse(options.body));
  return {ok:true,json:async()=>remoteSettings};
};
persistent.preferences.setItem('latex-codex-source-font-size','20');
persistent.preferences.setItem('latex-codex-revision-color','blue');
persistent.preferences.setItem('latex-codex-writing-style',JSON.stringify({name:'Personal',prompt:'Preserve notation.'}));
persistent.initSettings();
element('pdf-box-auto-comment').checked=true;element('pdf-box-auto-comment').onchange();
await persistent.savePreferences();
element('proofread-editor').checked=false;element('proofread-editor').onchange();
element('proofread-pdf').checked=true;element('proofread-pdf').onchange();
await persistent.savePreferences();
assert.equal(remoteSettings['latex-codex-source-font-size'],'20');
assert.equal(remoteSettings['latex-codex-revision-color'],'blue');
assert.equal(remoteSettings['latex-codex-pdf-box-auto-comment'],'on');
stored.clear();element('user-preferences').textContent=JSON.stringify(remoteSettings);
const reopened=await import('./vendor/latex-settings.mjs?reopened');
assert.equal(reopened.preferences.getItem('latex-codex-source-font-size'),'20');
assert.equal(reopened.preferences.getItem('latex-codex-language'),'ja');
assert.deepEqual(JSON.parse(reopened.preferences.getItem('latex-codex-writing-style')),{name:'Personal',prompt:'Preserve notation.'});
reopened.initSettings();assert.equal(element('pdf-box-auto-comment').checked,true);
assert.equal(element('proofread-editor').checked,false);assert.equal(element('proofread-pdf').checked,true);
element('proofread-pdf').checked=false;
element('pdf-box-auto-comment').checked=false;
await element('settings-save').onclick();
assert.equal(remoteSettings['latex-codex-pdf-box-auto-comment'],'off','Save settings also writes the current checkbox value.');
assert.equal(remoteSettings['latex-codex-proofread-editor'],'off');assert.equal(remoteSettings['latex-codex-proofread-pdf'],'off');
globalThis.fetch=async()=>{throw new Error('Offline');};
reopened.preferences.setItem('latex-codex-source-font-size','21');
await assert.rejects(reopened.savePreferences(),/Offline/);
assert.equal(element('settings-save-status').dataset.error,'true');
globalThis.fetch=async(route,options)=>{Object.assign(remoteSettings,JSON.parse(options.body));return {ok:true,json:async()=>remoteSettings};};
reopened.preferences.setItem('latex-codex-source-font-size','22');
await reopened.savePreferences();
assert.equal(remoteSettings['latex-codex-source-font-size'],'22');
assert.equal(element('settings-save-status').dataset.error,'false');
let rejectSave;
globalThis.fetch=()=>new Promise((resolve,reject)=>{rejectSave=reject;});
reopened.preferences.setItem('latex-codex-source-font-size','23');
const earlierSave=reopened.savePreferences();
await new Promise(resolve=>setImmediate(resolve));
reopened.preferences.setItem('latex-codex-source-font-size','24');
const latestSave=reopened.savePreferences();
globalThis.fetch=async(route,options)=>{Object.assign(remoteSettings,JSON.parse(options.body));return {ok:true,json:async()=>remoteSettings};};
rejectSave(new Error('Offline'));
await assert.rejects(earlierSave,/Offline/);
await latestSave;
reopened.preferences.setItem('latex-codex-theme','neo');
await reopened.savePreferences();
assert.equal(remoteSettings['latex-codex-source-font-size'],'24','A late failure must not requeue an older value after a newer save.');
console.log('PASS: user preferences survive a new browser origin; save failures preserve the latest changes for retry');
