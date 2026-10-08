import {t} from './latex-settings.mjs';

// This is a display widget. The source stays unchanged until Keep succeeds.
export function attachProofread(editor, from, to, before, after, changes, keep, undo, settled=()=>{}, visible=true) {
  const root = document.createElement('span'); root.className = 'proofread';
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', t('校对修改'));
  root.setAttribute('data-i18n-aria-label', '校对修改');
  const validRuns = Array.isArray(changes) && changes.every(run =>
    ['equal','delete','insert'].includes(run?.kind) && typeof run.text === 'string') &&
    changes.filter(run => run.kind !== 'insert').map(run => run.text).join('') === before &&
    changes.filter(run => run.kind !== 'delete').map(run => run.text).join('') === after;
  const runs = validRuns ? changes : [{kind:'delete',text:before},{kind:'insert',text:after}];
  for (const [side, symbol, excluded] of [['before','−','insert'],['after','+','delete']]) {
    const row = document.createElement('span'); row.className = 'proofread-row proofread-' + side;
    const sign = document.createElement('span'); sign.className = 'proofread-sign'; sign.textContent = symbol;
    const text = document.createElement('span'); text.className = 'proofread-text';
    for (const run of runs) if (run.kind !== excluded && run.text) {
      const part = document.createElement('span'); part.textContent = run.text;
      if (run.kind !== 'equal') part.className = 'proofread-word';
      text.append(part);
    }
    row.append(sign, text); root.append(row);
  }
  const actions = document.createElement('span'); actions.className = 'proofread-actions';
  const error = document.createElement('span'); error.className = 'proofread-error'; error.setAttribute('role','status');
  const undoButton = document.createElement('button'), keepButton = document.createElement('button');
  undoButton.type = keepButton.type = 'button'; undoButton.className = 'proofread-undo'; keepButton.className = 'proofread-keep';
  undoButton.textContent = 'Undo'; keepButton.textContent = 'Keep';
  undoButton.title = t('撤销这处建议'); keepButton.title = t('保留这处修改');
  undoButton.setAttribute('data-i18n-title', '撤销这处建议'); keepButton.setAttribute('data-i18n-title', '保留这处修改');
  actions.append(error, undoButton, keepButton); root.append(actions);
  root.addEventListener('mousedown', event => event.stopPropagation());
  root.addEventListener('contextmenu', event => event.stopPropagation());
  const displayMark = (from,to) => from.line===to.line && from.ch===to.ch
    ? editor.setBookmark(from,{widget:root,insertLeft:true,handleMouseEvents:true})
    : editor.markText(from,to,{replacedWith:root,handleMouseEvents:true,clearWhenEmpty:false});
  let mark = visible ? displayMark(from,to) : null;
  let disposed = false, working = false, blocked = false;
  function resize() {
    if (disposed) return;
    const wrapper = editor.getWrapperElement();
    const width = Math.max(120, wrapper.clientWidth - (wrapper.querySelector('.CodeMirror-gutters')?.offsetWidth || 0) - 32);
    if (Number.isFinite(width) && root.style.width !== width + 'px') {
      root.style.width = width + 'px'; mark?.changed?.();
    }
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(editor.getWrapperElement()); resize();
  function destroy() { if (disposed) return; disposed = true; observer?.disconnect(); mark?.clear(); root.remove?.(); }
  function setVisible(value, pos) {
    if (disposed || value === !!mark) return;
    if (value && pos) {
      root.remove?.();
      mark = displayMark(pos.from,pos.to);
    } else if (!value) { mark?.clear(); mark = null; }
  }
  function renderBusy() { undoButton.disabled = keepButton.disabled = blocked || working; }
  function setBusy(value) { blocked = value; renderBusy(); }
  keepButton.onclick = async () => {
    if (disposed || working || keepButton.disabled) return;
    working = true; renderBusy(); error.textContent = '';
    try { await keep(); }
    catch (failure) { if (!disposed) { error.textContent = failure.message; mark?.changed?.(); } }
    finally { working = false; if (!disposed) { renderBusy(); settled(); } }
  };
  undoButton.onclick = () => { if (!disposed && !working && !undoButton.disabled) undo(); };
  return {root, destroy, setBusy, setVisible, keep:()=>keepButton.onclick(), undo:()=>undoButton.onclick(), get busy(){return keepButton.disabled;}};
}
