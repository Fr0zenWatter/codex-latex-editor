import {t, setText, preferences} from './latex-settings.mjs';

const key='latex-codex-custom-themes';
const roles=['bg','panel','border','text','muted','math','operator','reference','command','environment','number','environment-command','quick-accent'];
const roleLabels={bg:'背景',panel:'面板',border:'边框',text:'正文',muted:'注释',command:'命令',math:'公式',operator:'运算符',reference:'引用',environment:'环境',number:'数字','environment-command':'环境命令'};
const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
const hex=channels=>'#'+channels.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const mix=(a,b,amount)=>hex(rgb(a).map((v,i)=>v*(1-amount)+rgb(b)[i]*amount));
const saturation=color=>Math.max(...rgb(color))-Math.min(...rgb(color));
export function colorHue(color) {
  const [r,g,b]=rgb(color).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  return delta?((max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360:0;
}
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function readable(color,bg) {
  const target=contrast('#111111',bg)>contrast('#ffffff',bg)?'#111111':'#ffffff';
  for(let step=0;step<=20;step++){const candidate=mix(color,target,step/20);if(contrast(candidate,bg)>=4.5)return candidate;}
  return target;
}

export function screenshotDistribution(pixels,width=0) {
  // ponytail: flat-color frequency works for theme swatch cards; use region selection if full-page screenshots need it.
  const counts=new Map(),areas=new Map();
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<240)continue;
    const color=hex(Array.from(pixels.slice(i,i+3)));areas.set(color,(areas.get(color)||0)+1);
    // Ignore one-pixel outlines and antialiased edges; retain the solid interiors of even very similar swatches.
    if(width && (i<width*4 || i>=pixels.length-width*4 || i/4%width===0 || i/4%width===width-1 || [i-4,i+4,i-width*4,i+width*4].some(j=>pixels[j]!==pixels[i] || pixels[j+1]!==pixels[i+1] || pixels[j+2]!==pixels[i+2])))continue;
    counts.set(color,(counts.get(color)||0)+1);
  }
  const colors=[];
  for(const [color,count] of [...counts].sort((a,b)=>b[1]-a[1])){
    if(count<Math.max(12,pixels.length/4*.0002))break;
    if(!colors.some(other=>Math.hypot(...rgb(color).map((v,i)=>v-rgb(other)[i]))<6))colors.push(color);
  }
  if(!colors.length)throw new Error(t('未识别到配色，请截取带色块的主题卡片。'));
  const channels=colors.map(rgb),distribution=colors.map(color=>({color,count:0,share:0}));let total=0;
  for(const [color,count] of areas){const source=rgb(color);let nearest=0,distance=Infinity;
    channels.forEach((target,index)=>{const delta=source.reduce((sum,v,i)=>sum+(v-target[i])**2,0);if(delta<distance){distance=delta;nearest=index;}});
    distribution[nearest].count+=count;total+=count;
  }
  for(const item of distribution)item.share=item.count/total;
  return distribution.sort((a,b)=>b.count-a.count);
}
export const screenshotPalette=(pixels,width=0)=>screenshotDistribution(pixels,width).map(item=>item.color);

export function makeTheme(colors,background,distribution=[]) {
  const bg=background||colors[0], light=luminance(bg)>.45;
  const neutrals=colors.filter(c=>c!==bg && saturation(c)<40);
  const text=readable([...neutrals].sort((a,b)=>contrast(b,bg)-contrast(a,bg))[0]||(light?'#242424':'#eeeeee'),bg);
  const surfaces=neutrals.filter(c=>contrast(c,bg)<2).sort((a,b)=>contrast(a,bg)-contrast(b,bg));
  const accents=colors.filter(c=>c!==bg && saturation(c)>55), accent=accents[0]||text;
  const sources={bg,panel:surfaces[0]||bg,border:surfaces.at(-1)||bg,text,muted:neutrals.filter(c=>c!==text).sort((a,b)=>contrast(b,bg)-contrast(a,bg))[0]||text,command:accent,'quick-accent':accent};
  const theme={bg,panel:surfaces[0]||mix(bg,text,.035),border:surfaces.at(-1)||mix(bg,text,.18),text,muted:readable(sources.muted,bg)};
  const remaining=colors.filter(c=>c!==bg && c!==accent && saturation(c)>20),used=[accent];
  const hueDistance=(a,b)=>Math.min(Math.abs(colorHue(a)-colorHue(b)),360-Math.abs(colorHue(a)-colorHue(b)));
  // Prefer distinct observed hues for syntax; use their measured area to break similar choices. Never synthesize a new hue.
  for(const role of ['command','math','reference','environment','number']){
    let color=accent;
    if(role!=='command' && remaining.length){
      const score=c=>Math.min(...used.map(other=>hueDistance(c,other)))+30*(distribution.find(item=>item.color===c)?.share||0);
      remaining.sort((a,b)=>score(b)-score(a));color=remaining.shift();used.push(color);
    }
    sources[role]=color;theme[role]=readable(color,bg);
  }
  sources.operator=sources.math;sources['environment-command']=sources.environment;
  theme.operator=theme.math;theme['environment-command']=theme.environment;
  theme['quick-accent']=accent;
  theme.scheme=light?'light':'dark';theme.sources=sources;
  return theme;
}
export function themeButtonText(theme) {
  return readable(contrast(theme.text,theme['quick-accent'])>contrast(theme.bg,theme['quick-accent'])?theme.text:theme.bg,theme['quick-accent']);
}

function validTheme(theme) {
  return theme && ['light','dark'].includes(theme.scheme) && roles.every(role=>/^#[\da-f]{6}$/i.test(theme[role]));
}
export function applyCustomTheme(value) {
  const theme=customThemes.find(item=>item.id===value)?.colors;
  for(const role of roles)document.documentElement.style.removeProperty('--'+role);
  document.documentElement.style.removeProperty('color-scheme');
  document.documentElement.style.removeProperty('--quick-foreground');
  if(!theme)return false;
  for(const role of roles)document.documentElement.style.setProperty('--'+role,theme[role]);
  document.documentElement.style.setProperty('color-scheme',theme.scheme);
  document.documentElement.style.setProperty('--quick-foreground',themeButtonText(theme));
  return true;
}
let customThemes=[];

export function initScreenshotThemes(select,apply) {
  const $=id=>document.getElementById(id),dialog=$('theme-dialog'),file=$('theme-image'),preview=$('theme-screenshot'),status=$('theme-status');
  const generated=$('theme-generated'),sample=$('theme-sample'),name=$('theme-name'),save=$('theme-save');
  let pixels=null,imageWidth=0,draft=null,palette=[],distribution=[],load=0;
  try{const saved=JSON.parse(preferences.getItem(key)||'[]');customThemes=Array.isArray(saved)?saved.filter(item=>typeof item.id==='string' && /^custom-[\w-]+$/.test(item.id) && typeof item.name==='string' && item.name.length<=60 && validTheme(item.colors)):[];}catch{customThemes=[];}
  const group=document.createElement('optgroup');group.dataset.i18nLabel='自定义';group.label=t('自定义');select.append(group);
  function addOption(item){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;group.append(option);}
  customThemes.forEach(addOption);
  function render(){
    for(const role of roles)sample.style.setProperty('--'+role,draft[role]);
    sample.style.colorScheme=draft.scheme;
    sample.style.setProperty('--quick-foreground',themeButtonText(draft));
    const extracted=$('theme-palette');extracted.replaceChildren();
    const wheel=$('theme-wheel');wheel.replaceChildren();
    const neutralStrip=$('theme-neutrals');neutralStrip.replaceChildren();
    for(const color of palette){
      const button=document.createElement('button'),swatch=document.createElement('span');button.type='button';swatch.className='theme-palette-color';swatch.style.background=color;
      const usage=Object.entries(roleLabels).filter(([role])=>draft.sources[role]===color).map(([,label])=>t(label)).join(' · '),share=distribution.find(item=>item.color===color)?.share||0;
      const caption=document.createElement('span'),description=document.createElement('small');caption.textContent=color+' · '+(share*100).toFixed(1)+'%';description.textContent=usage||t('备用色');caption.append(description);
      button.append(swatch,caption);button.setAttribute('aria-label',t('将 {color} 设为背景',{color}));button.title=caption.textContent;button.setAttribute('aria-pressed',String(color===draft.bg));
      button.onclick=()=>{draft=makeTheme(palette,color,distribution);render();};extracted.append(button);
      if(saturation(color)>20){
        const point=document.createElement('button'),angle=(colorHue(color)-90)*Math.PI/180,radius=24+saturation(color)/255*42;point.type='button';point.style.background=color;point.style.left=80+Math.cos(angle)*radius+'px';point.style.top=80+Math.sin(angle)*radius+'px';point.title=caption.textContent;point.setAttribute('aria-label',t('色盘颜色 {color}',{color}));point.onclick=button.onclick;wheel.append(point);
      }
    }
    for(const color of palette.filter(c=>saturation(c)<=20).sort((a,b)=>luminance(a)-luminance(b))){const point=document.createElement('button');point.type='button';point.style.background=color;point.title=color;point.setAttribute('aria-label',t('色盘颜色 {color}',{color}));point.onclick=()=>{draft=makeTheme(palette,color,distribution);render();};neutralStrip.append(point);}
    const swatches=$('theme-swatches');swatches.replaceChildren();
    for(const [role,label] of Object.entries(roleLabels)){
      const wrapper=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');caption.dataset.i18n=label;caption.textContent=t(label);input.type='color';input.value=draft[role];input.setAttribute('aria-label',t(label));input.setAttribute('data-i18n-aria-label',label);
      input.onchange=()=>{if(role==='bg')draft=makeTheme(palette,input.value,distribution);else{draft[role]=['panel','border'].includes(role)?input.value:readable(input.value,draft.bg);draft.sources[role]=input.value;}render();};
      wrapper.append(caption,input);swatches.append(wrapper);
    }
    generated.hidden=false;save.disabled=false;name.oninput();
  }
  $('theme-customize').onclick=()=>{$('settings-menu').hidePopover();dialog.showModal();};
  $('theme-close').onclick=()=>dialog.close();
  async function readImage(image){
    const current=++load;pixels=null;draft=null;palette=[];distribution=[];generated.hidden=true;save.disabled=true;preview.hidden=true;$('theme-generate').disabled=true;
    if(!image || !/^image\/(png|jpeg|webp)$/.test(image.type) || image.size>10*1024*1024){setText(status,'请选择 PNG、JPG 或 WebP 图片（不超过 10 MB）。');return;}
    let bitmap;
    try{
      bitmap=await createImageBitmap(image);if(current!==load)return;
      const canvas=document.createElement('canvas'),scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,canvas.width,canvas.height);pixels=context.getImageData(0,0,canvas.width,canvas.height).data;imageWidth=canvas.width;
      preview.src=canvas.toDataURL('image/png');preview.hidden=false;$('theme-generate').disabled=false;setText(status,'截图已就绪，点击生成配色。');
    }catch{if(current===load)setText(status,'图片读取失败，请换一张截图。');}finally{bitmap?.close();}
  }
  file.onchange=()=>{const image=file.files[0];file.value='';return readImage(image);};
  dialog.addEventListener('paste',event=>{const image=Array.from(event.clipboardData?.files||[]).find(file=>file.type.startsWith('image/'));if(image){event.preventDefault();file.value='';readImage(image);}});
  $('theme-generate').onclick=()=>{try{distribution=screenshotDistribution(pixels,imageWidth);palette=distribution.map(item=>item.color);draft=makeTheme(palette,undefined,distribution);render();setText(status,'识别到 {count} 种配色，面积最大颜色已设为背景。',{count:palette.length});}catch(error){status.textContent=error.message;}};
  name.oninput=()=>setText(save,customThemes.some(item=>item.name===name.value.trim())?'更新并使用':'保存并使用');
  save.onclick=()=>{
    const label=name.value.trim();if(!label){setText(status,'请输入主题名称。');name.focus();return;}
    const existing=customThemes.find(item=>item.name===label),item={id:existing?.id||'custom-'+crypto.randomUUID(),name:label,colors:draft,palette,distribution};
    const next=customThemes.filter(theme=>theme.id!==item.id).concat(item);
    try{preferences.setItem(key,JSON.stringify(next));}catch{setText(status,'无法保存主题，请检查浏览器存储空间。');return;}
    customThemes=next;if(!existing)addOption(item);select.value=item.id;apply();dialog.close();
  };
}
