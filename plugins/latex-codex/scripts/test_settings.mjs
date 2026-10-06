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
  [['zh-TW'], 'zh-CN'], [['EN_us'], 'en'], [['it-IT', 'fr-FR'], 'fr'],
  [['ko-KR', 'ru-RU'], 'en'], [[], 'en'], [[null, '', 'invalid'], 'en']
]) assert.equal(resolveLanguage(preferences), expected);
const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
for (const message of Object.values(english)) for (const code of ['ja', 'fr', 'de', 'es']) {
  assert(translations[message]?.[code]?.trim(), `Missing ${code}: ${message}`);
  assert.deepEqual(placeholders(translations[message][code]), placeholders(message), `${code}: ${message}`);
}
for (const [code, history, settings, located] of [
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
console.log('PASS: six languages, system preferences, English fallback, complete translations, placeholders, persistence, source isolation and menu positioning');
