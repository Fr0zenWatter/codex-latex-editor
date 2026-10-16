import {t, preferences} from './latex-settings.mjs';
import {attachProofread} from './latex-proofread.mjs';
import {writingStyles, readWritingStyle, restoreWritingStyle, annotationRequest} from './latex-writing-styles.mjs';
import {renderChatMarkdown} from './latex-markdown.mjs';
import {documentMacros} from './latex-hover.mjs';
import katex from './katex/katex.mjs';

export function colorReplacement(text, color, segments) {
  if (!color || !text || !segments || segments.map(part => part[0]).join('') !== text) return text;
  return segments.map(([part, kind]) => {
    if (!kind) return part;
    const marked = '{\\color{' + color + '}' + part + '}';
    return ['mathbin','mathrel','mathopen','mathclose'].includes(kind) ? '\\' + kind + marked : marked;
  }).join('');
}

export function attachSelectionChat(editor, request, paintAnnotations = () => {}, recordAnnotations = async () => {}, getMacroSource = () => editor.getValue(), referencesEnabled = () => false) {
  const $ = id => document.querySelector('#' + id);
  const panel = $('chat-panel'), input = $('chat-input'), messages = $('chat-messages'), status = $('chat-status');
  let macroSource = null, macros = {};
  function renderReply(container, text) {
    const source = getMacroSource();
    if (source !== macroSource) { macros = documentMacros(source, katex); macroSource = source; }
    renderChatMarkdown(container, text, macros);
  }
  const bar = $('chat-bar'), compactHandle = $('chat-compact-handle'), expandButton = $('chat-expand'), pinButton = $('chat-pin');
  let contentSize = 13;
  panel.addEventListener('wheel', event => {
    if (!event.ctrlKey || panel.dataset.collapsed !== 'false' || !event.deltaY) return;
    event.preventDefault();
    contentSize = Math.max(10, Math.min(24, contentSize + (event.deltaY < 0 ? 1 : -1)));
    panel.style.setProperty('--chat-content-size', contentSize + 'px');
  }, {passive:false});
  const miniButton = $('chat-mini'), permanentControl = $('chat-bar-permanent');
  const permanentBar = permanentControl || {checked:true};
  const resizer = document.createElement('div');resizer.className = 'chat-resizer';resizer.tabIndex = 0;
  resizer.setAttribute('role','separator');resizer.setAttribute('aria-orientation','vertical');
  resizer.setAttribute('aria-controls','chat-panel');
  const labelResizer = () => { resizer.title = t('调整浮动对话宽度');resizer.setAttribute('aria-label',resizer.title); };
  labelResizer();panel.prepend(resizer);
  const corner = document.createElement('div');corner.className = 'chat-corner-resizer';corner.tabIndex = 0;
  corner.hidden = !miniButton;
  corner.setAttribute('role','separator');corner.setAttribute('aria-controls','chat-panel');
  corner.setAttribute('aria-label',t('调整浮动对话大小'));panel.append(corner);
  let panelDrag = null, panelFrame = null;
  function setPanelWidth(value) {
    const max = Math.max(0,Math.min(panel.parentElement.clientWidth * .9,
      window.innerWidth - (Number.parseFloat(panel.style.left) || 0) - 8)), min = Math.min(280,max);
    const width = Math.max(min,Math.min(max,value));panel.style.width = width + 'px';
    resizer.setAttribute('aria-valuemin',String(Math.round(min)));resizer.setAttribute('aria-valuemax',String(Math.round(max)));
    resizer.setAttribute('aria-valuenow',String(Math.round(width)));
  }
  function endPanelResize(event) {
    if (!panelDrag || (event?.pointerId !== undefined && event.pointerId !== panelDrag.id)) return;
    if (panelFrame !== null) window.cancelAnimationFrame(panelFrame);panelFrame = null;
    if (event?.type === 'pointerup') panelDrag.next = panelDrag.width + event.clientX - panelDrag.x;
    setPanelWidth(panelDrag.next);
    const id = panelDrag.id;panelDrag = null;panel.parentElement.classList.remove('chat-resizing');
    if (resizer.hasPointerCapture(id)) resizer.releasePointerCapture(id);
  }
  resizer.onpointerdown = event => {
    if (event.button !== 0 || panel.hidden || panel.dataset.collapsed === 'true') return;
    event.preventDefault();endPanelResize();
    const width = panel.getBoundingClientRect().width;
    panelDrag = {id:event.pointerId,x:event.clientX,width,next:width};
    resizer.setPointerCapture(event.pointerId);panel.parentElement.classList.add('chat-resizing');
  };
  resizer.onpointermove = event => {
    if (!panelDrag || event.pointerId !== panelDrag.id) return;
    if (!(event.buttons & 1)) { endPanelResize(event);return; }
    event.preventDefault();panelDrag.next = panelDrag.width + event.clientX - panelDrag.x;
    if (panelFrame === null) panelFrame = window.requestAnimationFrame(() => {
      panelFrame = null;if (panelDrag) setPanelWidth(panelDrag.next);
    });
  };
  resizer.onpointerup = resizer.onpointercancel = resizer.onlostpointercapture = endPanelResize;
  resizer.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || panel.hidden || panel.dataset.collapsed === 'true') return;
    event.preventDefault();endPanelResize();setPanelWidth(panel.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 20 : -20));
  };
  let cornerDrag = null, cornerFrame = null;
  function setPanelSize(width, height) {
    setPanelWidth(width);
    const top = Number.parseFloat(panel.style.top) || 0;
    const max = Math.max(0,window.innerHeight - top - 8), min = Math.min(240,max);
    const next = Math.max(min,Math.min(max,height));
    panel.style.height = next + 'px';
    expandedPosition = {...(expandedPosition || {left:Number.parseFloat(panel.style.left) || 10,top}),height:next};
  }
  function endCornerResize(event, released = false) {
    if (!cornerDrag || (event?.pointerId !== undefined && event.pointerId !== cornerDrag.id)) return;
    if (cornerFrame !== null) window.cancelAnimationFrame(cornerFrame);cornerFrame = null;
    const drag = cornerDrag;cornerDrag = null;
    if (released) drag.next = {width:drag.width + event.clientX - drag.x,height:drag.height + event.clientY - drag.y};
    setPanelSize(drag.next.width,drag.next.height);
    delete panel.dataset.resizing;
    if (corner.hasPointerCapture(drag.id)) corner.releasePointerCapture(drag.id);
  }
  corner.onpointerdown = event => {
    if (event.button !== 0 || panel.hidden || panel.dataset.collapsed === 'true') return;
    event.preventDefault();endCornerResize();endPanelResize();
    const rect = panel.getBoundingClientRect();
    cornerDrag = {id:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,
      next:{width:rect.width,height:rect.height}};
    corner.setPointerCapture(event.pointerId);panel.dataset.resizing = 'corner';
  };
  corner.onpointermove = event => {
    if (!cornerDrag || event.pointerId !== cornerDrag.id) return;
    if (!(event.buttons & 1)) { endCornerResize(event);return; }
    event.preventDefault();
    cornerDrag.next = {width:cornerDrag.width + event.clientX - cornerDrag.x,
      height:cornerDrag.height + event.clientY - cornerDrag.y};
    if (cornerFrame === null) cornerFrame = window.requestAnimationFrame(() => {
      cornerFrame = null;if (cornerDrag) setPanelSize(cornerDrag.next.width,cornerDrag.next.height);
    });
  };
  corner.onpointerup = event => endCornerResize(event,true);
  corner.onpointercancel = corner.onlostpointercapture = endCornerResize;
  corner.onkeydown = event => {
    const offsets = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
    if (panel.dataset.collapsed === 'true' || !offsets[event.key]) return;
    event.preventDefault();endCornerResize();
    const rect = panel.getBoundingClientRect(), [dw,dh] = offsets[event.key];
    setPanelSize(rect.width + dw,rect.height + dh);
  };
  window.addEventListener('blur', () => endPanelResize());
  window.addEventListener('blur', () => endCornerResize());
  window.addEventListener('resize', () => {
    endPanelResize();endCornerResize();
    if (panel.dataset.collapsed === 'true') positionCompact();
    else { placeExpanded();if (panel.style.width) setPanelWidth(Number.parseFloat(panel.style.width)); }
  });
  let compactPosition = null, expandedPosition = null, miniClickTimer = null, returnToMini = false, visibilityTimer = null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function stopVisibilityAnimation() {
    clearTimeout(visibilityTimer);visibilityTimer = null;
    panel.classList.remove('chat-pop-in');panel.classList.remove('chat-pop-out');
    delete panel.dataset.closing;
  }
  const clampPosition = (left, top, width, height) => ({
    left:Math.max(8,Math.min(left,window.innerWidth - width - 8)),
    top:Math.max(8,Math.min(top,window.innerHeight - height - 8)),
  });
  function positionCompact() {
    const pdf = $('preview').getBoundingClientRect();
    const mini = panel.dataset.mini === 'true', width = Math.min(mini ? 54 : 440,window.innerWidth - 16);
    const position = clampPosition(compactPosition?.left ?? (pdf.width ? pdf.left + 12 : 12),
      compactPosition?.top ?? (pdf.height ? pdf.bottom - (mini ? 66 : 70) : window.innerHeight - 70),width,mini ? 54 : 58);
    panel.style.left = position.left + 'px';panel.style.top = position.top + 'px';
    if (compactPosition) compactPosition = position;
  }
  function placeExpanded() {
    if (expandedPosition) {
      const height = Math.min(expandedPosition.height,window.innerHeight - 16);
      const position = clampPosition(expandedPosition.left,expandedPosition.top,panel.getBoundingClientRect().width,height);
      panel.style.left = position.left + 'px';panel.style.top = position.top + 'px';
      panel.style.height = height + 'px';panel.style.bottom = 'auto';
      expandedPosition = {...position,height:expandedPosition.height};
    } else {
      panel.style.left = '10px';panel.style.top = '50px';
      panel.style.height = Math.max(0,Math.min(620,window.innerHeight - 66)) + 'px';panel.style.bottom = 'auto';
    }
  }
  function syncPlaceholder() { input.placeholder = t(panel.dataset.collapsed === 'true' ? '双击放大悬浮框' : '修改要求或问题'); }
  function finishCollapse(mini) {
    panel.hidden = !!miniButton && !permanentBar.checked;
    if (panel.dataset.collapsed === 'true' && panel.dataset.mini === String(mini)) return;
    endPanelResize();endCornerResize();panelSettings.hidePopover();panel.dataset.collapsed = 'true';panel.dataset.mini = String(mini);
    syncPlaceholder();
    panel.style.height = '';panel.style.bottom = 'auto';positionCompact();
  }
  function collapsePanel(mini = returnToMini) {
    $('source-quotes')?.hidePopover();
    clearTimeout(miniClickTimer);miniClickTimer = null;
    returnToMini = mini;
    const hide = !!miniButton && !permanentBar.checked;
    if (hide && panel.dataset.closing === 'true') return;
    stopVisibilityAnimation();
    if (hide && !panel.hidden && panel.dataset.collapsed === 'false' && !reducedMotion()) {
      endPanelResize();endCornerResize();panelSettings.hidePopover();
      panel.dataset.closing = 'true';panel.classList.add('chat-pop-out');
      visibilityTimer = setTimeout(() => { stopVisibilityAnimation();finishCollapse(mini); }, 220);
      return;
    }
    finishCollapse(mini);
  }
  function expandPanel() {
    clearTimeout(miniClickTimer);miniClickTimer = null;
    const fromHidden = panel.hidden || panel.dataset.closing === 'true';
    stopVisibilityAnimation();
    if (panel.dataset.collapsed === 'true') returnToMini = panel.dataset.mini === 'true';
    panel.hidden = false;panel.dataset.collapsed = 'false';panel.dataset.mini = 'false';syncPlaceholder();placeExpanded();
    setPanelWidth(Number.parseFloat(panel.style.width) || 440);
    if (fromHidden && !reducedMotion()) {
      panel.classList.add('chat-pop-in');
      visibilityTimer = setTimeout(stopVisibilityAnimation, 260);
    }
  }
  function movePanel(left, top, compact, rect = panel.getBoundingClientRect()) {
    const position = clampPosition(left,top,rect.width,rect.height);
    panel.style.left = position.left + 'px';panel.style.top = position.top + 'px';panel.style.bottom = 'auto';
    if (compact) compactPosition = position;
    else { panel.style.height = rect.height + 'px';expandedPosition = {...position,height:rect.height}; }
  }
  function draggable(handle, compact) {
    let active = null, frame = null, suppressClick = false;
    const positionAt = (drag, event) => clampPosition(drag.rect.left + event.clientX - drag.x,
      drag.rect.top + event.clientY - drag.y,drag.rect.width,drag.rect.height);
    function endDrag(event, released = false) {
      if (!active || (event?.pointerId !== undefined && event.pointerId !== active.id)) return;
      if (frame !== null) window.cancelAnimationFrame(frame);frame = null;
      const drag = active;active = null;
      if (drag.moved) {
        const position = released ? positionAt(drag,event) : drag.next;
        movePanel(position.left,position.top,compact,drag.rect);
        panel.style.transform = '';
        if (released) suppressClick = true;
      }
      // Finish the last position change while the movement transition is disabled.
      void panel.offsetWidth;
      delete panel.dataset.dragging;panel.style.willChange = '';
      if (handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
    }
    handle.onpointerdown = event => {
      if (event.button !== 0 || panel.dataset.collapsed !== String(compact) || (!compact && event.target?.closest?.('button'))) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      active = {id:event.pointerId,x:event.clientX,y:event.clientY,rect,next:{left:rect.left,top:rect.top},moved:false};
      handle.setPointerCapture(event.pointerId);panel.dataset.dragging = 'true';panel.style.willChange = 'transform';
    };
    handle.onpointermove = event => {
      if (!active || event.pointerId !== active.id) return;
      if (!(event.buttons & 1)) { endDrag(event);return; }
      if (Math.hypot(event.clientX - active.x,event.clientY - active.y) < 4 && !active.moved) return;
      active.moved = true;active.next = positionAt(active,event);
      if (frame === null) frame = window.requestAnimationFrame(() => {
        frame = null;
        if (active) panel.style.transform = `translate3d(${active.next.left - active.rect.left}px, ${active.next.top - active.rect.top}px, 0)`;
      });
    };
    handle.onpointerup = event => endDrag(event,true);
    handle.onpointercancel = handle.onlostpointercapture = endDrag;
    handle.onkeydown = event => {
      const offsets = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
      if (panel.dataset.collapsed !== String(compact) || !offsets[event.key]) return;
      event.preventDefault();const rect = panel.getBoundingClientRect(), [dx,dy] = offsets[event.key];
      movePanel(rect.left + dx,rect.top + dy,compact);
    };
    window.addEventListener('blur', () => endDrag());
    return () => { const moved = suppressClick;suppressClick = false;return moved; };
  }
  const draggedCompact = draggable(expandButton,true);
  draggable(compactHandle,true);
  const draggedMini = miniButton ? draggable(miniButton,true) : () => false;
  compactHandle.addEventListener('keydown', event => {
    if (panel.dataset.collapsed !== 'true' || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();showPanel();
  });
  draggable(bar,false);
  expandButton.onclick = () => { if (!draggedCompact()) { if (miniButton) collapsePanel(true); else showPanel(); } };
  if (miniButton) {
    miniButton.addEventListener('pointerdown', () => clearTimeout(miniClickTimer));
    miniButton.onclick = event => {
      if (draggedMini()) return;
      if (event?.detail >= 2) { showPanel();return; }
      miniClickTimer = setTimeout(() => {
        miniClickTimer = null;
        if (panel.dataset.mini === 'true') collapsePanel(false);
      },300);
    };
  }
  panel.addEventListener('dblclick', event => {
    if (panel.dataset.collapsed !== 'true' || panel.dataset.mini === 'true' || event.target?.closest?.('button')) return;
    event.preventDefault();showPanel();
  });
  const updatePin = () => {
    const label = t(pinButton.getAttribute('aria-pressed') === 'true' ? '取消固定浮动对话' : '固定浮动对话');
    pinButton.setAttribute('aria-label',label);pinButton.title = label;
  };
  pinButton.onclick = () => { pinButton.setAttribute('aria-pressed',String(pinButton.getAttribute('aria-pressed') !== 'true'));updatePin(); };
  window.addEventListener('latex-language-change',updatePin);
  window.addEventListener('pointerdown',event => {
    if (panel.contains(event.target) || panelSettings.contains(event.target)) return;
    clearTimeout(miniClickTimer);
    if (panel.dataset.collapsed === 'false' && pinButton.getAttribute('aria-pressed') !== 'true') collapsePanel();
    else if (miniButton && panel.dataset.collapsed === 'true' && panel.dataset.mini !== 'true' && permanentBar.checked) collapsePanel(true);
  });
  if (permanentControl) {
    permanentBar.checked = preferences.getItem('latex-codex-chat-bar-permanent') !== 'off';
    permanentBar.onchange = () => {
      preferences.setItem('latex-codex-chat-bar-permanent',permanentBar.checked ? 'on' : 'off');
      returnToMini = !!miniButton && permanentBar.checked;
      if (panel.dataset.collapsed === 'true') collapsePanel(permanentBar.checked);
    };
  }
  window.addEventListener('latex-language-change', () => {
    corner.setAttribute('aria-label',t('调整浮动对话大小'));syncPlaceholder();
  });
  panel.hidden = !!miniButton && !permanentBar.checked;panel.dataset.collapsed = 'true';panel.dataset.mini = String(!!miniButton && permanentBar.checked);
  returnToMini = panel.dataset.mini === 'true';
  positionCompact();syncPlaceholder();panel.classList.add('chat-motion-ready');
  new ResizeObserver(() => { if (panel.dataset.collapsed === 'true' && !compactPosition) positionCompact(); }).observe($('preview'));
  let memoryRevision=null,memoryProject='',memoryLoading=null,memoryEpoch=0;
  let history = [], marker = null, job = null, generation = 0, sending = false, proposal = null;
  const quick = $('chat-quick'), quickInput = $('chat-quick-input');
  let quickMarker = null, quickDoc = null, quickOriginal = '', quickPdf = null, editingAnnotation = null;
  let annotations = [], annotationId = 0, annotationSending = false, annotationCommitting = false;
  let mainSend = null, mainLinked = false, mainAvailable = false, mainRequest = null;
  if (document.documentElement?.dataset?.aiBackend === 'deepseek') {
    mainSend = document.createElement('button');
    mainSend.id = 'annotations-main-send'; mainSend.type = 'button'; mainSend.hidden = true;
    mainSend.textContent = t('发送到 DeepSeek 主对话');
    $('annotations-send').after(mainSend);
    request('/main-chat').then(result => {
      mainLinked = result.linked; mainAvailable = result.available; refreshAnnotations();
    }).catch(() => {});
    mainSend.onclick = sendToMainChat;
    window.addEventListener('latex-language-change', () => { mainSend.textContent = t('发送到 DeepSeek 主对话'); refreshAnnotations(); });
  }
  let color = '';
  const editorProofread = () => preferences.getItem('latex-codex-proofread-editor') !== 'off';
  const pdfProofread = () => preferences.getItem('latex-codex-proofread-pdf') !== 'off' && !/\.(md|markdown)$/i.test($('filename').title || '');
  let models = [], modelsLoaded = false, modelsLoading = false;
  const modelSelect = $('chat-model'), effortSelect = $('chat-effort');
  const quickBrain = $('chat-quick-brain'), quickSettings = $('chat-quick-settings');
  const panelSettings = $('chat-panel-settings'), configButton = $('chat-config');
  const quickEffort = $('chat-quick-effort');
  const quickHandle = $('chat-quick-handle');
  const styleSelect = $('chat-quick-style'), styleFile = $('chat-style-file');
  let styles = [...writingStyles], importingStyle = 0, styleValue = '';
  const selectedStyle = () => styles.find(item => item.id === styleValue);
  function renderStyle(value = styleValue) {
    styleValue = styles.some(item => item.id === value) ? value : '';
    styleSelect.replaceChildren(option('', t('无')), ...styles.map(item => option(item.id, item.name)), option('__import__', t('导入提示词') + '…'));
    styleSelect.value = styleValue;
    $('chat-style-control').dataset.active = String(!!selectedStyle());
  }
  function restoreDefaultStyle() {
    const saved = restoreWritingStyle(preferences.getItem('latex-codex-writing-style'));
    const existing = saved && styles.find(item => item.name === saved.name && item.prompt === saved.prompt);
    if (saved && !existing) styles.push(saved);
    renderStyle(existing?.id || saved?.id || '');
  }
  function saveDefaultStyle() {
    preferences.setItem('latex-codex-writing-style', JSON.stringify(selectedStyle() || null));
  }
  styleSelect.onchange = () => {
    importingStyle++;
    if (styleSelect.value === '__import__') { renderStyle(); styleFile.value = ''; styleFile.click(); return; }
    renderStyle(styleSelect.value); saveDefaultStyle(); quickNotice('');
  };
  styleFile.onchange = async () => {
    const file = styleFile.files?.[0];
    if (!file || sending || annotationCommitting) return;
    const token = ++importingStyle, target = quickMarker;
    try {
      const style = await readWritingStyle(file);
      if (token !== importingStyle || target !== quickMarker || !quick.matches(':popover-open') || sending || annotationCommitting) return;
      const existing = styles.find(item => item.name === style.name && item.prompt === style.prompt);
      if (!existing) styles.push({...style,id:'custom-' + token});
      renderStyle(existing?.id || 'custom-' + token); saveDefaultStyle(); quickNotice('');
    } catch (error) {
      if (token === importingStyle && target === quickMarker && quick.matches(':popover-open')) quickNotice(t(error.message), true);
    }
  };
  let quickDrag = null, quickAnchor = null, quickMoved = false;
  function positionQuick(left, top) {
    quick.style.left = Math.max(8, Math.min(left, window.innerWidth - quick.offsetWidth - 8)) + 'px';
    quick.style.top = Math.max(8, Math.min(top, window.innerHeight - quick.offsetHeight - 8)) + 'px';
  }
  function fitQuick() {
    if (!quick.matches(':popover-open')) return;
    if (quickMoved || !quickAnchor) return positionQuick(parseFloat(quick.style.left), parseFloat(quick.style.top));
    const {left, below, selectionTop} = quickAnchor;
    positionQuick(left, below + quick.offsetHeight + 8 <= window.innerHeight ? below : selectionTop - quick.offsetHeight - 12);
  }
  function sizeQuick(expanded = quick.dataset.expanded === 'true') {
    expanded ||= !!quickInput.value || !!$('chat-quick-status').textContent;
    quick.dataset.expanded = String(expanded);
    quickInput.style.height = 'auto';
    const height = expanded ? Math.max(68, Math.min(160, quickInput.scrollHeight)) : 48;
    quickInput.style.height = height + 'px';
    $('chat-quick-form').style.height = (height + (expanded ? 48 : 0)) + 'px';
    fitQuick();
  }
  quickInput.addEventListener('focus', () => sizeQuick(true));
  quickInput.addEventListener('click', () => sizeQuick(true));
  quickInput.addEventListener('input', () => { sizeQuick(true); syncQuickDirectSend(); });
  quick.addEventListener('focusout', event => {
    if (!quick.contains(event.relatedTarget) && !quickSettings.matches(':popover-open')) sizeQuick(false);
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    if (!quickDrag) sizeQuick();
  }).observe(quick);
  quickHandle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); quickSettings.hidePopover(); quickMoved = true;
    quickDrag = {id:event.pointerId, x:event.clientX, y:event.clientY, left:parseFloat(quick.style.left), top:parseFloat(quick.style.top)};
    quickHandle.setPointerCapture(event.pointerId); quick.dataset.dragging = 'true';
  };
  quickHandle.onpointermove = event => {
    if (!quickDrag || event.pointerId !== quickDrag.id) return;
    positionQuick(quickDrag.left + event.clientX - quickDrag.x, quickDrag.top + event.clientY - quickDrag.y);
  };
  quickHandle.onpointerup = quickHandle.onpointercancel = quickHandle.onlostpointercapture = event => {
    if (!quickDrag || event.pointerId !== quickDrag.id) return;
    quickDrag = null; delete quick.dataset.dragging;
    if (quickHandle.hasPointerCapture(event.pointerId)) quickHandle.releasePointerCapture(event.pointerId);
  };
  quickHandle.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); quickSettings.hidePopover(); quickMoved = true;
    positionQuick(parseFloat(quick.style.left) + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0),
      parseFloat(quick.style.top) + (event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0));
  };
  window.addEventListener('resize', () => {
    sizeQuick(); fitQuick();
  });
  const effortNames = {off:'无',none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'极高'};
  function option(value, label) {
    const node = document.createElement('option'); node.value = value; node.textContent = label; return node;
  }
  function updateEfforts() {
    const selected = models.find(model => model.id === modelSelect.value);
    effortSelect.replaceChildren(option('', selected ? t('模型默认 · ') + (t(effortNames[selected.default_effort] || selected.default_effort)) : t('跟随默认')));
    selected?.efforts.forEach(effort => effortSelect.append(option(effort, (t(effortNames[effort] || effort)) + ' · ' + effort)));
    effortSelect.value = ''; effortSelect.disabled = sending || !selected;
    renderQuickSettings();
  }
  modelSelect.onchange = updateEfforts;
  effortSelect.onchange = renderQuickSettings;
  quickEffort.onclick = () => {
    const selected = models.find(model => model.id === modelSelect.value);
    if (!selected || sending) return;
    const efforts = ['', ...selected.efforts];
    effortSelect.value = efforts[(efforts.indexOf(effortSelect.value) + 1) % efforts.length];
    renderQuickSettings();
  };
  function renderModelChoices(modelList, effortList, settings, focusTarget) {
    modelList.replaceChildren(); effortList.replaceChildren();
    for (const model of [{id:'', name:t('跟随 Codex 默认')}, ...models]) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = model.name + (model.id ? ' ›' : ''); button.disabled = sending;
      button.setAttribute('aria-pressed', String(model.id === modelSelect.value));
      button.onclick = () => {
        if (modelSelect.value !== model.id) { modelSelect.value = model.id; updateEfforts(); }
        if (!model.id) { settings.hidePopover(); focusTarget.focus(); }
        else effortList.firstElementChild?.focus();
      };
      modelList.append(button);
    }
    const selected = models.find(model => model.id === modelSelect.value);
    effortList.hidden = !selected;
    if (selected) for (const effort of ['', ...selected.efforts]) {
      const button = document.createElement('button'); button.type = 'button'; button.disabled = sending;
      button.textContent = effort ? t(effortNames[effort] || effort) : t('默认 · ') + (t(effortNames[selected.default_effort] || selected.default_effort));
      button.setAttribute('aria-pressed', String(effort === effortSelect.value));
      button.onclick = () => { effortSelect.value = effort; renderQuickSettings(); settings.hidePopover(); focusTarget.focus(); };
      effortList.append(button);
    }
  }
  function renderQuickSettings() {
    const selected = models.find(model => model.id === modelSelect.value);
    const modelName = selected?.name || t('跟随 Codex 默认');
    const effortName = effortSelect.value ? t(effortNames[effortSelect.value] || effortSelect.value) : t('跟随默认');
    quickBrain.title = modelName + ' · ' + (effortSelect.value ? effortName : t('默认思考等级'));
    $('chat-quick-model-name').textContent = modelName;
    $('chat-quick-effort-name').textContent = effortName;
    quickEffort.disabled = sending || !selected;
    quickEffort.title = t('思考等级') + ' · ' + (effortSelect.value || selected?.default_effort || t('跟随默认'));
    quickEffort.setAttribute('aria-label', quickEffort.title);
    quickEffort.dataset.level = String(selected ? Math.ceil(3 * (selected.efforts.indexOf(effortSelect.value || selected.default_effort) + 1) / selected.efforts.length) : 0);
    $('chat-config-name').textContent = modelName;
    configButton.title = modelName + ' · ' + effortName;
    configButton.setAttribute('aria-label', t('选择模型和思考等级') + ' · ' + configButton.title);
    renderModelChoices($('chat-quick-models'), $('chat-quick-efforts'), quickSettings, quickInput);
    renderModelChoices($('chat-panel-models'), $('chat-panel-efforts'), panelSettings, input);
    $('chat-quick-model-status').textContent = $('chat-model-status').textContent;
  }
  panelSettings.addEventListener('beforetoggle', event => {
    configButton.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    renderQuickSettings(); loadModels();
    const box = configButton.getBoundingClientRect();
    panelSettings.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 360)) + 'px';
    panelSettings.style.top = 'auto';
    panelSettings.style.bottom = window.innerHeight - box.top + 8 + 'px';
    panelSettings.style.maxHeight = Math.max(60, box.top - 16) + 'px';
  });
  quickSettings.addEventListener('beforetoggle', event => {
    quickBrain.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    sizeQuick(true); renderQuickSettings(); loadModels();
    const box = quick.getBoundingClientRect(), above = box.top > 100;
    quickSettings.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 360)) + 'px';
    quickSettings.style.top = above ? 'auto' : box.bottom + 6 + 'px';
    quickSettings.style.bottom = above ? window.innerHeight - box.top + 6 + 'px' : 'auto';
    quickSettings.style.maxHeight = Math.max(60, (above ? box.top : window.innerHeight - box.bottom) - 14) + 'px';
  });
  async function loadModels() {
    if (modelsLoaded || modelsLoading) return;
    modelsLoading = true; $('chat-model-status').textContent = t('正在读取可用模型…'); renderQuickSettings();
    try {
      ({models} = await request('/chat/models'));
      modelSelect.replaceChildren(option('', t('跟随 Codex 默认')), ...models.map(model => option(model.id, model.name)));
      // Harness account routes read the stored credentials; the API route needs DEEPSEEK_API_KEY.
      const preferred = models.find(model => model.id.startsWith('deepseek-account/') && model.default)
        || models.find(model => model.id.startsWith('deepseek-account/'));
      modelSelect.value = preferred ? preferred.id : '';
      updateEfforts(); modelsLoaded = true; $('chat-model-status').textContent = '';
    } catch(e) { $('chat-model-status').textContent = e.message; }
    finally { modelsLoading = false; renderQuickSettings(); }
  }
  const colorSelect = $('chat-color');
  colorSelect.value = preferences.getItem('latex-codex-chat-color') || '';
  if (!['','blue','red','teal','magenta','orange','violet'].includes(colorSelect.value)) colorSelect.value = '';
  color = colorSelect.value;
  function renderProposal() {
    if (proposal) $('chat-replacement').textContent = colorReplacement(proposal.replacement, color, proposal.segments) || t('（删除选区）');
  }
  colorSelect.onchange = () => {
    color = colorSelect.value;
    preferences.setItem('latex-codex-chat-color', color);
    renderProposal();
  };
  async function refreshContext() {
    try {
      const context = await request('/chat/context');
      $('chat-context').textContent = context.available
        ? t('携带论文全文 + 主对话 ') + context.count + t(' 条消息') + (context.truncated ? t('（较早内容已省略）') : '')
        : t('携带论文全文；未关联主对话，请从 Codex 主对话启动编辑器。');
    } catch(e) { $('chat-context').textContent = t('主对话读取失败：') + e.message; }
  }
  const notice = text => status.textContent = text;
  function quickNotice(text, error = false) {
    $('chat-quick-status').textContent = text; $('chat-quick-status').dataset.error = String(error);
    sizeQuick();
  }
  function annotationNotice(text, error = false, markdown = false) {
    const body = $('annotations-status');
    body.classList.toggle('chat-markdown', markdown);
    if (markdown) renderReply(body, text);else body.textContent = text;
    body.dataset.error = String(error);
    $('annotations-review').showPopover();
  }
  function refreshAnnotations() {
    $('annotations-toggle').textContent = t('批注 · {count}', {count:annotations.length});
    $('annotations-toggle').hidden = !annotations.some(item => item.review);
    const waiting = annotations.some(item => !item.review);
    $('annotations-send').hidden = !waiting;
    $('annotations-send').disabled = sending || annotationCommitting || !waiting;
    if (mainSend) {
      mainSend.hidden = !waiting;
      mainSend.disabled = sending || annotationCommitting || !waiting || !mainLinked || !mainAvailable;
      mainSend.title = t(!mainLinked ? '请从 DeepSeek 主对话启动此编辑器。'
        : !mainAvailable ? '请先安装 DeepSeek 主对话桥接并刷新页面。' : '发送到 DeepSeek 主对话');
    }
    $('annotations-list').replaceChildren();
    for (const item of annotations) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'annotation-item'; button.disabled = sending || annotationCommitting;
      const quote = document.createElement('b'), requirement = document.createElement('span');
      quote.textContent = '#' + item.id + ' · ' + item.original;
      requirement.textContent = item.request;
      button.append(quote, requirement);
      button.onclick = () => editAnnotation(item, button.getBoundingClientRect());
      $('annotations-list').append(button);
      if (item.review) {
        item.review.setVisible(editorProofread(), item.marker.find());
        if (!editorProofread()) $('annotations-list').append(item.review.root);
      }
    }
    $('annotations-empty').hidden = !!annotations.length;
    annotations.forEach(item => item.review?.setBusy(sending || annotationCommitting));
    paintAnnotations(annotations, editAnnotation);
  }
  function validAnnotation(item) {
    const pos = item.marker?.find();
    return pos && editor.getDoc() === item.doc && editor.getRange(pos.from, pos.to) === item.original ? pos : null;
  }
  function saveAnnotation(close = true) {
    if (sending || annotationCommitting || !quickInput.value.trim()) return false;
    const pos = validAnnotation({marker:quickMarker,doc:quickDoc,original:quickOriginal});
    if (!pos) { quickNotice(t('选区已变化，请重新选择后添加批注。'), true); return false; }
    const start = editor.indexFromPos(pos.from), end = editor.indexFromPos(pos.to);
    if (annotations.some(item => {
      if (item === editingAnnotation) return false;
      const range = item.marker.find();
      return range && start < editor.indexFromPos(range.to) && end > editor.indexFromPos(range.from);
    })) { quickNotice(t('批注选区重叠，请编辑原批注或另选位置。'), true); return false; }
    if (!editingAnnotation && annotations.length >= 100) { quickNotice(t('每次最多发送 100 条批注。'), true); return false; }
    const chosen = selectedStyle(), style = chosen ? {id:chosen.id,name:chosen.name,prompt:chosen.prompt} : null;
    if (editingAnnotation) Object.assign(editingAnnotation, {request:quickInput.value.trim(),style});
    else annotations.push({id:++annotationId, marker:quickMarker, doc:quickDoc, original:quickOriginal,
      request:quickInput.value.trim(), pdf:quickPdf, style});
    quickInput.value = ''; editingAnnotation = null; quickMarker = null;
    refreshAnnotations();
    if (close) quick.hidePopover();
    return true;
  }
  function editAnnotation(item, anchor) {
    if (sending || annotationCommitting) return;
    if (item.review) {
      const pos = item.marker.find();
      if (pos) { editor.scrollIntoView(pos.from, 80); editor.focus(); }
      if (!editorProofread()) $('annotations-review').showPopover();
      return;
    }
    if (quickInput.value.trim() && !saveAnnotation(false)) return;
    if (!editingAnnotation) quickMarker?.clear();
    $('annotations-review').hidePopover();
    quickMarker = item.marker; quickDoc = item.doc; quickOriginal = item.original;
    quickPdf = item.pdf; editingAnnotation = item; quickInput.value = item.request;
    importingStyle++; renderStyle(item.style?.id || '');
    showQuick({...anchor,selectionTop:anchor.selectionTop ?? anchor.top,selectionBottom:anchor.selectionBottom ?? anchor.bottom ?? anchor.top});
    if (!validAnnotation(item)) quickNotice(t('选区已变化，请删除这条批注并重新选择。'), true);
  }
  $('chat-quick-delete').onclick = () => {
    if (sending || annotationCommitting || !editingAnnotation) return;
    annotations = annotations.filter(item => item !== editingAnnotation);
    editingAnnotation.marker.clear(); quickMarker = null; editingAnnotation = null; quickInput.value = '';
    quick.hidePopover(); refreshAnnotations();
  };
  $('chat-quick-direct-send').onclick = () => {
    const current = editingAnnotation;
    if (!saveAnnotation()) return;
    return sendAnnotations([current || annotations.at(-1)]);
  };
  $('annotations-review').addEventListener('beforetoggle', event => {
    $('annotations-toggle').setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    const anchor = !$('annotations-toggle').hidden ? $('annotations-toggle')
      : !$('annotations-send').hidden ? $('annotations-send') : $('app-toolbar');
    const box = anchor.getBoundingClientRect(), review = $('annotations-review');
    review.style.left = 'auto';
    review.style.right = '8px';
    review.style.top = box.bottom + 6 + 'px';
  });
  function sendAnnotations(batch) {
    if (!batch.length || sending || annotationCommitting) return;
    if (batch.some(item => !validAnnotation(item))) {
      annotationNotice(t('批注选区已变化，未发送。请点批注检查并重新选择。'), true); return;
    }
    batch.sort((a,b) => editor.indexFromPos(a.marker.find().from) - editor.indexFromPos(b.marker.find().from));
    const question = batch.map(item => '#' + item.id + '\n' + item.request).join('\n\n');
    return send(question, null, batch);
  }
  $('annotations-send').onclick = () => {
    if (quickInput.value.trim() && !saveAnnotation()) return;
    return sendAnnotations(annotations.filter(item => !item.review));
  };
  async function sendToMainChat() {
    if (sending || annotationCommitting || !mainLinked || !mainAvailable) return;
    if (quickInput.value.trim() && !saveAnnotation()) return;
    const batch = annotations.filter(item => !item.review);
    if (!batch.length) return;
    annotationCommitting = true; refreshAnnotations();
    annotationNotice(t('正在转交主对话…'));
    try {
      const doc = editor.getDoc(), source = editor.getValue(), path = $('filename').title;
      const state = await request('/state');
      if (editor.getDoc() !== doc || editor.getValue() !== source || state.path !== path
          || state.source.replaceAll('\r\n', '\n') !== source) {
        throw new Error(t('请等待自动保存完成后再发送；批注保留。'));
      }
      const items = batch.map(item => {
        const pos = validAnnotation(item);
        if (!pos) throw new Error(t('批注选区已变化，未发送。请点批注检查并重新选择。'));
        return {id: item.id, start: Array.from(source.slice(0, editor.indexFromPos(pos.from))).length,
          end: Array.from(source.slice(0, editor.indexFromPos(pos.to))).length,
          selection: item.original, request: annotationRequest(item)};
      }).sort((a, b) => a.start - b.start);
      const payload = {path, source, version: state.version, selection: items[0].selection, annotations: items};
      const fingerprint = JSON.stringify(payload);
      if (mainRequest?.fingerprint !== fingerprint) mainRequest = {fingerprint, id: crypto.randomUUID().replaceAll('-', '')};
      const result = await request('/main-chat', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...payload, request_id: mainRequest.id})});
      if (!result.accepted) throw new Error(t('请求失败'));
      for (const item of batch) item.marker.clear();
      annotations = annotations.filter(item => !batch.includes(item)); mainRequest = null;
      annotationNotice(t('批注已转交 DeepSeek 主对话。'));
    } catch (error) { annotationNotice(error.message, true); }
    finally { annotationCommitting = false; refreshAnnotations(); }
  }
  $('annotations-stop').onclick = () => { if (annotationCommitting) return; stop(); annotationNotice(t('已停止，批注保留，可重新发送。')); };
  const range = () => marker?.find();
  const selectedText = () => { const pos = range(); return pos ? editor.getRange(pos.from, pos.to) : ''; };
  function message(role, text, id = null) {
    const item = document.createElement('div'); item.className = 'chat-message';
    item.dataset.role = role;
    const label = document.createElement('b'); label.textContent = role === 'user' ? t('你') : 'Codex';
    const body = document.createElement('div');body.className = 'chat-markdown';renderReply(body, text);
    item.append(label, body);
    if (role === 'assistant' && Number.isInteger(id) && id > 0) {
      const exportButton = document.createElement('button');
      exportButton.type = 'button'; exportButton.className = 'chat-export'; exportButton.textContent = '↗';
      exportButton.title = t('记录此回复到 Markdown'); exportButton.setAttribute('aria-label', exportButton.title);
      exportButton.onclick = async () => {
        exportButton.disabled = true;
        try {
          const result = await request('/chat/export', {method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id,project:memoryProject,language:document.documentElement.lang})});
          exportButton.textContent = '✓';
          exportButton.dataset.saved = 'true';
          exportButton.dataset.file = result.file;
          exportButton.title = t('已记录到 {file}', {file:result.file});
          exportButton.setAttribute('aria-label', exportButton.title);
          notice(exportButton.title);
        } catch (error) { exportButton.disabled = false; notice(error.message); }
      };
      item.append(exportButton);
    }
    messages.append(item); messages.scrollTop = messages.scrollHeight;
  }
  async function loadMemory() {
    if(memoryRevision!==null)return;
    if(memoryLoading)return memoryLoading;
    const doc=editor.getDoc(),epoch=memoryEpoch;
    const task=(async()=>{
      const data=await request('/chat/history');
      if(doc!==editor.getDoc()||epoch!==memoryEpoch)return;
      if(!Array.isArray(data.messages)||!Number.isInteger(data.revision))throw new Error(t('项目记忆读取失败，请重新打开对话。'));
      history=data.messages;memoryRevision=data.revision;memoryProject=data.project;messages.replaceChildren();
      for(const item of history){
        let text=item.content;
        if(item.role==='assistant'){try{text=JSON.parse(text).reply||text;}catch{}}
        message(item.role==='user'?'user':'assistant',text,item.id);
      }
    })();
    memoryLoading=task;
    try{await task;}finally{if(memoryLoading===task)memoryLoading=null;}
  }
  function setSending(value) {
    sending = value; panel.dataset.sending = String(value); $('chat-send').disabled = value; $('chat-stop').hidden = !value;
    const compactStatus = $('chat-compact-status');if (compactStatus) compactStatus.textContent = value ? t('Codex 正在思考…') : '';
    $('chat-typing').hidden = !value;
    $('chat-use-selection').disabled = value;
    modelSelect.disabled = value; effortSelect.disabled = value || !modelSelect.value; configButton.disabled = value;
    quickBrain.disabled = value;
    quickEffort.disabled = value || !modelSelect.value;
    styleSelect.disabled = value;
    if (value) { quickSettings.hidePopover(); panelSettings.hidePopover(); }
    $('chat-quick-send').disabled = value || !quickMarker;
    syncQuickDirectSend();
    $('chat-quick-delete').disabled = value;
    quickInput.readOnly = value;
    $('annotations-send').setAttribute('aria-busy', String(value && annotationSending));
    $('annotations-stop').hidden = !value || !annotationSending;
    refreshAnnotations();
    sizeQuick();
  }
  function clearProposal() { proposal = null; $('chat-proposal').hidden = true; }
  function useSelection() {
    if (sending || annotationCommitting) return;
    if (!editor.somethingSelected() || editor.listSelections().length !== 1) { notice(t('请先选中一段连续的 LaTeX 源码。')); return; }
    marker?.clear();
    marker = editor.markText(editor.getCursor('from'), editor.getCursor('to'), {className:'chat-selection', clearWhenEmpty:false});
    clearProposal(); $('chat-selection').textContent = selectedText(); notice(t('已带入选区和当前文档，可以连续追问。'));
  }
  function showPanel() {
    expandPanel();
    refreshContext();
    loadMemory().catch(e=>notice(e.message));
    loadModels();
    input.focus();
  }
  $('chat-view').onclick = () => {
    $('settings-menu').hidePopover();
    pinButton.setAttribute('aria-pressed', 'true'); updatePin();
    showPanel();
    returnToMini = !!miniButton && permanentBar.checked;
  };
  window.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.key?.toLowerCase() !== 'q') return;
    if (editor.getOption('keyMap') === 'emacs' && editor.getWrapperElement().contains(event.target)) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (panel.dataset.collapsed === 'false' && panel.dataset.closing !== 'true') { collapsePanel();editor.focus(); }
    else showPanel();
  }, true);
  function open() {
    showPanel();
    const previous = range(), from = editor.getCursor('from'), to = editor.getCursor('to');
    if (editor.somethingSelected() && !sending && (!previous || previous.from.line !== from.line || previous.from.ch !== from.ch || previous.to.line !== to.line || previous.to.ch !== to.ch)) useSelection();
    else if (!marker) notice('');
    input.focus();
  }
  async function stop() {
    if (annotationCommitting) return;
    generation++; const id = job; job = null; annotationSending = false; setSending(false);
    if (id) { try { await request('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); } catch(e) { notice(e.message); } }
  }
  function reset(preserveAnnotations = false) {
    endPanelResize();
    stop();
    if (!preserveAnnotations) quickInput.value = '';
    quick.hidePopover();
    if (!preserveAnnotations) {
      importingStyle++; styles = [...writingStyles]; restoreDefaultStyle();
      quickMarker?.clear(); quickMarker = null; editingAnnotation = null;
      annotations.forEach(item => { item.review?.destroy(); item.marker.clear(); }); annotations = []; annotationId = 0;
    }
    $('annotations-status').textContent = ''; refreshAnnotations();
    memoryEpoch++;memoryRevision=null;memoryProject='';memoryLoading=null;history = []; marker?.clear(); marker = null; clearProposal();
    messages.replaceChildren(); input.value = ''; $('chat-selection').textContent = ''; collapsePanel(); notice('');
  }
  quick.addEventListener('beforetoggle', event => {
    if (event.newState === 'closed') {
      importingStyle++;
      if (quickDrag) quickHandle.onpointercancel({pointerId:quickDrag.id});
      if (quickInput.value.trim() && !sending && !saveAnnotation(false)) {
        annotationNotice(t('批注草稿尚未保存，请重新打开并检查选区。'), true); return;
      }
      if (!editingAnnotation) quickMarker?.clear();
      quickMarker = null; editingAnnotation = null;
    }
  });
  function openQuick(anchor) {
    if (sending || annotationCommitting) return;
    if (quickInput.value.trim() && !saveAnnotation(false)) { quick.showPopover(); return; }
    quickAnchor = null; quickMoved = false;
    if (!editingAnnotation) quickMarker?.clear();
    quickMarker = null; editingAnnotation = null; quickInput.value = '';
    importingStyle++; restoreDefaultStyle();
    quickDoc = editor.getDoc(); quickOriginal = '';
    quickPdf = anchor.pdf || null;
    if (editor.somethingSelected() && editor.listSelections().length === 1) {
      const from = editor.getCursor('from'), to = editor.getCursor('to');
      const existing = annotations.find(item => {
        const pos = item.marker.find();
        return pos && editor.indexFromPos(pos.from) === editor.indexFromPos(from) && editor.indexFromPos(pos.to) === editor.indexFromPos(to);
      });
      if (existing) return editAnnotation(existing, anchor);
      quickOriginal = editor.getRange(from, to);
      quickMarker = editor.markText(from, to, {className:'chat-annotation',clearWhenEmpty:false});
    }
    showQuick(anchor);
  }
  function labelQuickAction() {
    const button = $('chat-quick-send'), label = t(editingAnnotation ? '保存批注' : '添加批注');
    button.setAttribute('aria-label', label); button.title = label + ' · Ctrl+Enter';
  }
  function syncQuickDirectSend() {
    $('chat-quick-direct-send').disabled = sending || !quickMarker || !quickInput.value.trim();
  }
  function showQuick(anchor) {
    quickAnchor = null; quickMoved = false;
    quickInput.placeholder = quickOriginal ? t('写下这处的修改要求…') : t('请先选中一段 LaTeX 源码');
    $('chat-quick-delete').hidden = !editingAnnotation;
    labelQuickAction();
    quickNotice('');
    $('chat-quick-send').disabled = sending || !quickOriginal;
    syncQuickDirectSend();
    quick.showPopover();
    const selectionTop = anchor.selectionTop ?? (quickOriginal ? editor.charCoords(editor.getCursor('from'), 'window').top : anchor.top);
    const selectionBottom = anchor.selectionBottom ?? (quickOriginal ? editor.charCoords(editor.getCursor('to'), 'window').bottom : anchor.top);
    const below = Math.max(anchor.top + 18, selectionBottom + 12);
    quickAnchor = {left:anchor.left, below, selectionTop};
    sizeQuick(true); renderQuickSettings(); loadModels();
    quickInput.focus();
  }
  $('chat-quick-menu').onclick = () => {
    const anchor = $('editor-menu').getBoundingClientRect();
    $('editor-menu').hidePopover(); openQuick(anchor);
  };
  quickInput.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !quickInput.value && !$('chat-quick-status').textContent && !quickSettings.matches(':popover-open') && quick.dataset.expanded === 'true') {
      event.preventDefault(); event.stopPropagation(); sizeQuick(false); quickHandle.focus(); return;
    }
    if (event.key === 'Enter' && !event.isComposing && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); $('chat-quick-form').requestSubmit();
    }
  });
  $('chat-quick-form').onsubmit = async event => {
    event.preventDefault();
    return saveAnnotation();
  };
  $('chat-close').onclick = () => { collapsePanel();editor.focus(); };
  $('chat-end').onclick = async()=>{
    if (annotationCommitting) return;
    await stop();
    try{await request('/chat/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('filename').title})});reset(true);}
    catch(e){notice(e.message);}
  };
  $('chat-context-settings').addEventListener('toggle', event => { if (event.target.open) refreshContext(); });
  $('chat-use-selection').onclick = useSelection;
  $('chat-stop').onclick = () => { stop(); notice(t('已停止，可继续提问。')); };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('source-quotes')?.matches(':popover-open')) return;
    if (event.key === 'Escape' && panel.dataset.collapsed === 'false') { event.preventDefault();collapsePanel();editor.focus(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing && (!event.shiftKey || event.ctrlKey || event.metaKey)) { event.preventDefault(); $('chat-form').requestSubmit(); }
  });
  $('chat-form').onsubmit = async event => {
    event.preventDefault();
    return send(input.value, input);
  };
  async function send(text, draftInput, batch = null) {
    if (sending || annotationCommitting || !text.trim()) return;
    const selection = batch ? batch[0].original : selectedText(), question = text.trim();
    if (!selection && batch) { notice(t('选区已失效，请重新选择文本。')); return; }
    if (!selection && marker) { marker.clear(); marker = null; $('chat-selection').textContent = ''; }
    const token = ++generation, doc = editor.getDoc();
    let conversation;
    annotationSending = !!batch;
    if (batch) annotationNotice(t('Codex 正在处理批注…'));
    clearProposal(); setSending(true); notice(t('Codex 正在思考…'));
    try {
      if(memoryRevision===null)await loadMemory();
      if(token!==generation||doc!==editor.getDoc())return;
      conversation=[...history.slice(-38),{role:'user',content:question}];
      message('user',question);if(draftInput)draftInput.value='';
      const source = editor.getValue();
      const items = batch?.map(item => {
        const pos = validAnnotation(item);
        if (!pos) throw new Error(t('批注选区已变化，未发送。请点批注检查并重新选择。'));
        // Python uses Unicode code points; CodeMirror positions use UTF-16 offsets.
        return {id:item.id, start:Array.from(source.slice(0,editor.indexFromPos(pos.from))).length,
          end:Array.from(source.slice(0,editor.indexFromPos(pos.to))).length, selection:item.original, request:annotationRequest(item)};
      });
      const started = await request('/chat', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({source,selection,messages:conversation,remember:true,memory_revision:memoryRevision,model:modelSelect.value,effort:effortSelect.value,request_id:crypto.randomUUID().replaceAll('-',''),references:referencesEnabled(),...(items ? {annotations:items} : {})})});
      if (token !== generation) {
        await request('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:started.id})}); return;
      }
      job = started.id;
      while (token === generation) {
        const result = await request('/chat?id=' + encodeURIComponent(job));
        if (token !== generation) return;
        if (result.status === 'running') { await new Promise(resolve => setTimeout(resolve, 700)); continue; }
        if (result.status !== 'done') throw new Error(result.error || t('本次回复已停止。'));
        memoryRevision=result.memory_revision??memoryRevision;
        history = [...conversation, {id:result.memory_revision,role:'assistant',content:JSON.stringify({reply:result.reply,replacement:result.replacement,...(batch ? {replacements:result.replacements} : {})})}];
        message('assistant', result.reply,result.memory_revision);
        if (batch) {
          await reviewAnnotations(batch, result.replacements, result.reply);
          const reviewing = annotations.some(item => item.review);
          annotationNotice(reviewing ? t('请逐处选择 Keep 或 Undo；也可在批注列表处理。') : result.reply, false, !reviewing);
        } else if (selection && result.replacement !== null) {
          proposal = {doc, original:selection, replacement:result.replacement, segments:result.segments};
          renderProposal(); $('chat-proposal').hidden = false;
          notice(t('修改建议已就绪。可继续讨论，或应用到选区。'));
        } else {
          notice('');
        }
        messages.scrollTop = messages.scrollHeight;
        return;
      }
    } catch(e) {
      if (token === generation) { if(e.conflict)memoryRevision=null;notice(e.message); if (batch) annotationNotice(e.message, true); if(draftInput)draftInput.value = question; }
    } finally { if (token === generation) { annotationSending = false; job = null; setSending(false); } }
  }
  function annotationEdits(batch, replacements) {
    if (!Array.isArray(replacements) || replacements.length !== batch.length
        || new Set(replacements.map(item => item?.id)).size !== batch.length)
      throw new Error(t('批注修改返回不完整，未应用。请重试。'));
    return batch.map(item => {
      const pos = validAnnotation(item), result = replacements.find(result => result?.id === item.id);
      if (!pos || editor.getOption('readOnly')) throw new Error(t('批注选区已变化，未应用任何修改。批注已保留。'));
      if (!result || !(result.replacement === null || typeof result.replacement === 'string'))
        throw new Error(t('批注修改返回不完整，未应用。请重试。'));
      return {item, pos:{from:{...pos.from},to:{...pos.to}}, result, start:editor.indexFromPos(pos.from), end:editor.indexFromPos(pos.to), replacement:result.replacement === null ? null : colorReplacement(result.replacement, color, result.segments)};
    }).sort((a,b) => b.start - a.start || (b.item.reviewOrder ?? 0) - (a.item.reviewOrder ?? 0));
  }
  async function reviewAnnotations(batch, replacements, reply) {
    if (!editorProofread() && !pdfProofread()) return applyAnnotations(batch, replacements, reply);
    const edits = annotationEdits(batch, replacements);
    const plans = edits.filter(edit => edit.replacement !== null && edit.replacement !== edit.item.original).map(edit => {
      if (!Array.isArray(edit.result.reviews)) return {edit, parts:null};
      const points = Array.from(edit.item.original), parts = edit.result.reviews;
      let cursor = 0, rebuilt = '';
      if (!parts.length) throw new Error(t('批注修改返回不完整，未应用。请重试。'));
      for (const part of parts) {
        if (!Number.isInteger(part.old_start) || !Number.isInteger(part.old_end)
            || part.old_start < cursor || part.old_end < part.old_start || part.old_end > points.length
            || typeof part.after !== 'string' || part.before !== points.slice(part.old_start, part.old_end).join(''))
          throw new Error(t('批注修改返回不完整，未应用。请重试。'));
        rebuilt += points.slice(cursor, part.old_start).join('') + part.after;
        cursor = part.old_end;
      }
      if (rebuilt + points.slice(cursor).join('') !== edit.result.replacement)
        throw new Error(t('批注修改返回不完整，未应用。请重试。'));
      return {edit, parts:parts.map(part => ({...part,
        from:editor.posFromIndex(edit.start + points.slice(0, part.old_start).join('').length),
        to:editor.posFromIndex(edit.start + points.slice(0, part.old_end).join('').length)}))};
    });
    const unchanged = edits.filter(edit => edit.replacement === null || edit.replacement === edit.item.original);
    if (unchanged.length) await applyAnnotations(unchanged.map(edit => edit.item), unchanged.map(edit => edit.result), reply);
    let first;
    for (const {edit, parts} of plans) {
      const rows = parts ? parts.map((part,index) => ({item:{...edit.item,
        id:index ? ++annotationId : edit.item.id, original:part.before, pdf:null, reviewGroup:edit.item, reviewOrder:index,
        marker:editor.markText(part.from,part.to,{clearWhenEmpty:false})},
        pos:{from:part.from,to:part.to}, result:part,
        replacement:colorReplacement(part.after,color,part.segments)})) : [edit];
      if (parts) {
        edit.item.marker.clear();
        annotations.splice(annotations.indexOf(edit.item),1,...rows.map(row=>row.item));
      }
      first = rows[0].item;
      for (const {item, pos, result, replacement} of rows) {
        const prepared = {id:item.id, replacement};
        item.proposed = replacement;item.reviewReply = reply;
        item.review = attachProofread(editor, pos.from, pos.to, item.original, replacement, result.changes,
          async () => {
            if (sending || annotationCommitting) throw new Error(t('正在保存，请稍后重试。'));
            await applyAnnotations([item], [prepared], reply);
          },
          () => {
            if (sending || annotationCommitting) return;
            item.review.destroy(); item.marker.clear();
            annotations = annotations.filter(other => other !== item); refreshAnnotations();
            notice(t('已撤销这处建议，原文保留。'));
          }, refreshAnnotations, editorProofread());
      }
    }
    refreshAnnotations();
    if (first) editor.scrollIntoView(first.marker.find().from, 80);
  }
  async function applyAnnotations(batch, replacements, reply) {
    const edits = annotationEdits(batch, replacements);
    const before = editor.getValue();
    let after = before;
    for (const edit of edits) if (edit.replacement !== null) after = after.slice(0,edit.start) + edit.replacement + after.slice(edit.end);
    const change = {id:crypto.randomUUID().replaceAll('-',''), before, reply,
      items:[...edits].reverse().map(({item,start,end,replacement}) => ({id:item.id,
        start:Array.from(before.slice(0,start)).length, end:Array.from(before.slice(0,end)).length,
        selection:item.original, request:annotationRequest(item), replacement}))};
    annotationCommitting = true; $('annotations-stop').disabled = true; $('chat-stop').disabled = true; $('chat-end').disabled = true;
    refreshAnnotations();
    try { await recordAnnotations(after, change); }
    finally { annotationCommitting = false; $('annotations-stop').disabled = false; $('chat-stop').disabled = false; $('chat-end').disabled = false; refreshAnnotations(); }
    if (editor.getOption('keyMap').startsWith('vim')) CodeMirror.Vim.handleKey(editor, '<Esc>');
    editor.operation(() => {
      edits.forEach(({item,pos,replacement}) => {
        const at = editor.indexFromPos(pos.from);
        const preceding = item.original === '' && item.reviewGroup ? annotations.filter(other => {
          const range = validAnnotation(other);
          return other.reviewGroup === item.reviewGroup && other.reviewOrder < item.reviewOrder
            && other.original === '' && range && editor.indexFromPos(range.from) === at;
        }) : [];
        item.review?.destroy();
        item.marker.clear();
        if (replacement !== null && replacement !== item.original) editor.replaceRange(replacement,pos.from,pos.to,'codex-chat');
        for (const other of preceding) {
          other.review.setVisible(false);other.marker.clear();
          const point = editor.posFromIndex(at);
          other.marker = editor.markText(point,point,{clearWhenEmpty:false});
          other.review.setVisible(editorProofread(),{from:point,to:point});
        }
      });
    });
    annotations = annotations.filter(item => !batch.includes(item));
    refreshAnnotations();
    notice(t('批注与修改已保存到历史。'));
  }
  function applyProposal() {
    const pos = range();
    if (!proposal || !pos || proposal.doc !== editor.getDoc() || selectedText() !== proposal.original || editor.getOption('readOnly')) {
      notice(t('选区内容已变化，未覆盖修改。请使用当前选区重新提问。')); return false;
    }
    const replacement = colorReplacement(proposal.replacement, color, proposal.segments), start = editor.indexFromPos(pos.from);
    const vim = editor.getOption('keyMap').startsWith('vim');
    if (vim) CodeMirror.Vim.handleKey(editor, '<Esc>');
    marker.clear(); marker = null;
    editor.replaceRange(replacement, pos.from, pos.to, 'codex-chat');
    const end = editor.posFromIndex(start + replacement.length);
    marker = editor.markText(pos.from, end, {className:'chat-selection',clearWhenEmpty:false});
    $('chat-selection').textContent = replacement;
    history.push({role:'user',content:'已将上一条修改应用到选区' + (color ? '，并只用 {\\color{' + color + '}...} 标记实际变化的内容' : '') + '。后续请以当前文档为准。'});
    clearProposal(); message(t('编辑器'), t('已应用到选区，将自动保存。')); notice(t(vim ? '已应用。回到源码按 u 可撤销。' : '已应用。回到源码按 Ctrl+Z / Cmd+Z 可撤销。'));
    editor.setCursor(end);
    return true;
  }
  $('chat-apply').onclick = applyProposal;
  editor.on('swapDoc', () => reset());
  window.addEventListener('latex-proofread-change', refreshAnnotations);
  window.addEventListener('latex-language-change', () => {
    labelResizer();
    for (const button of messages.querySelectorAll('.chat-export')) {
      button.title = button.dataset.file ? t('已记录到 {file}', {file:button.dataset.file}) : t('记录此回复到 Markdown');
      button.setAttribute('aria-label', button.title);
    }
    const effort = effortSelect.value;
    updateEfforts(); effortSelect.value = effort; renderQuickSettings(); renderProposal();
    renderStyle();
    modelSelect.options[0].textContent = t('跟随 Codex 默认');
    quickInput.placeholder = quickOriginal ? t('写下这处的修改要求…') : t('请先选中一段 LaTeX 源码');
    labelQuickAction();
    refreshAnnotations();
    refreshContext();
  });
  window.addEventListener('pagehide', () => {
    if (job) fetch('/chat/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job}),keepalive:true});
  });
  window.addEventListener('beforeunload', event => {
    if (annotations.length || quickInput.value.trim()) { event.preventDefault(); event.returnValue = ''; }
  });
  restoreDefaultStyle(); refreshAnnotations();
  return {open, openQuick, refreshAnnotations, async keepAll() {
    if (sending || annotationCommitting) throw new Error(t('正在保存，请稍后重试。'));
    const batch = annotations.filter(item => item.review);
    annotationEdits(batch,batch.map(item=>({id:item.id,replacement:item.proposed})));
    for (let end=batch.length;end>0;end-=100) {
      const group=batch.slice(Math.max(0,end-100),end);
      await applyAnnotations(group,group.map(item=>({id:item.id,replacement:item.proposed})),
        [...new Set(group.map(item=>item.reviewReply))].filter(Boolean).join('\n\n'));
    }
  }, get busy() { return sending || annotationCommitting; },
    get hasAnnotations() { return !!annotations.length || !!quickInput.value.trim(); }};
}
