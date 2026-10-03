// Native browser annotations are independent of the editor's local comments.
import {t} from './latex-settings.mjs';
export function attachNativeAnnotations(editor, setText, document = globalThis.document) {
  const $ = id => document.getElementById(id);
  const button = $('native-annotation-open'), status = $('status'), hint = $('native-annotation-status');
  // Also remove the old drawer in pages served by an already-running editor.
  $('native-annotation-preview')?.remove();
  let marker = null;
  const clear = () => { const old = marker; marker = null; old?.clear(); };
  const annotationActive = () => document.oai?.annotation?.isActive?.() === true;
  editor.getWrapperElement().setAttribute('oai-annotation-container-text', '');
  const update = () => {
    const active = annotationActive();
    const label = active ? '返回编辑' : '原生批注选区';
    for (const attribute of ['title', 'aria-label']) {
      button.setAttribute('data-i18n-' + attribute, label);
      button.setAttribute(attribute, t(label));
    }
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !active && !editor.somethingSelected();
    hint.hidden = !active;
    status.hidden = active;
  };
  document.defaultView?.addEventListener('latex-language-change', update);
  editor.on('cursorActivity', update);
  editor.on('changes', clear);
  editor.on('swapDoc', clear);
  document.addEventListener('oaiannotationmodechange', event => {
    if (!event.detail.active) clear();
    update();
  });
  update();
  button.onclick = () => {
    const annotation = document.oai?.annotation;
    if (annotationActive()) {
      // Native mode captures clicks; hold Space to operate this page button.
      annotation.toggle?.(false);
      return;
    }
    const selection = editor.getSelection();
    if (!selection.trim()) { setText(status, '请先选择需要批注的 LaTeX 文字。'); return; }
    if (editor.listSelections().length !== 1) { setText(status, '请选一个连续的文字范围。'); return; }
    if (selection.length > 20000) { setText(status, '原生文字批注最多 20000 个字符，请缩小选区。'); return; }
    const from = editor.getCursor('from'), to = editor.getCursor('to');
    if (typeof annotation?.request === 'function') {
      try {
        clear();
        // CodeMirror syntax tokens and virtualized lines aren't a faithful DOM
        // Range. Display the exact passage in-place as one text node instead.
        // This is a display mark: source, undo history and autosave are untouched.
        const passage = document.createElement('span');
        passage.textContent = selection;
        passage.className = 'native-annotation-source';
        Object.assign(passage.style, {font:'inherit', whiteSpace:'pre-wrap', overflowWrap:'anywhere'});
        marker = editor.markText(from, to, {replacedWith:passage, handleMouseEvents:false});
        const range = document.createRange();
        range.selectNodeContents(passage);
        // Persistent annotation mode uses Save/Add; a quick request defaults to Send.
        // Keep this synchronous inside the user's click to preserve the activation.
        if (annotation.request(range, {enterAnnotationMode:true}).accepted) {
          update();
          return;
        }
      } catch { /* Rejected requests must leave normal source editing usable. */ }
    }
    clear();
    setText(status, '原生批注暂不可用，请通过浏览器批注选择源码。');
  };
}
