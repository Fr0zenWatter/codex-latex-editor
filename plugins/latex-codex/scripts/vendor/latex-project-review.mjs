import {preferences, savePreferences, t} from './latex-settings.mjs';
import {attachProofread} from './latex-proofread.mjs';

export function attachProjectReview({editor, request, capture, adopt, open, message, changed=()=>{}}) {
  const button = document.querySelector('#project-review-open');
  const list = document.querySelector('#project-review-list');
  const popover = document.querySelector('#project-review-menu');
  let rows = [], files = [], signature = '', loading = false, committing = false;
  const enabled = () => preferences.getItem('latex-codex-proofread-project') === 'on';
  const index = (source, offset) => Array.from(source).slice(0, offset).join('').length;
  function clear() {
    for (const row of rows) { row.review.destroy(); row.marker.clear(); }
    rows = []; signature = '';
  }
  async function resolve(file, hunk, action) {
    const state = capture();
    if (committing || !state.clean || state.source !== file.source || state.path !== file.path)
      throw new Error(t('请先保存编辑草稿，再处理项目校对。'));
    committing = true;
    const readonly = editor.getOption('readOnly');
    editor.setOption('readOnly', true); rows.forEach(row => row.review.setBusy(true));
    try {
      const result = await request('/project-review', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({path:file.path, version:file.version, signature:file.signature, id:hunk.id, action})});
      clear();
      await adopt(result.state);
      render(result);
    } finally {
      committing = false; editor.setOption('readOnly', readonly);
      rows.forEach(row => row.review.setBusy(false)); changed();
    }
  }
  function render(data) {
    files = data.enabled && enabled() ? data.files : [];
    const count = files.reduce((sum, file) => sum + file.hunks.length, 0);
    button.hidden = !count; button.textContent = t('项目校对 · {count}', {count});
    const state = capture(), file = files.find(item => item.path === state.path);
    const visible = preferences.getItem('latex-codex-proofread-editor') !== 'off';
    const next = file && state.source === file.source ? JSON.stringify([file.signature, visible]) : '';
    if (next !== signature) {
      clear(); signature = next;
      if (next) for (const hunk of file.hunks) {
        const from = editor.posFromIndex(index(file.source,hunk.start)), to = editor.posFromIndex(index(file.source,hunk.end));
        const row = {id:100000+hunk.id, displayId:hunk.id, projectReview:true, doc:state.doc, original:hunk.after,
          proposed:hunk.after, displayOriginal:hunk.before,
          marker:editor.markText(from,to,{clearWhenEmpty:false})};
        row.review = attachProofread(editor,from,to,hunk.before,hunk.after,hunk.changes,
          () => resolve(file,hunk,'keep'),
          () => { void resolve(file,hunk,'undo').catch(error=>message(error.message)); },changed,visible);
        rows.push(row);
      }
      changed();
    }
    list.replaceChildren();
    for (const file of files) {
      const entry = document.createElement('button'); entry.type = 'button';
      entry.textContent = file.name + ' · ' + file.hunks.length;
      entry.onclick = async () => {
        popover.hidePopover();
        if (await open(file.path)) {
          await refresh();
          const first = rows[0]?.marker.find();
          if (first) editor.scrollIntoView(first.from,80);
        }
      };
      list.append(entry);
    }
    if (!visible) rows.forEach(row=>list.append(row.review.root));
  }
  async function refresh() {
    if (loading || committing) return;
    if (!enabled()) { clear(); render({enabled:false,files:[]}); changed(); return; }
    loading = true;
    try {
      const result = await request('/project-review');
      if (capture().clean) render(result);
    } catch (error) { message(error.message); }
    finally { loading = false; }
  }
  popover.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    popover.style.right = '8px'; popover.style.top = button.getBoundingClientRect().bottom + 6 + 'px';
  });
  editor.on('swapDoc', () => { clear(); void refresh(); });
  window.addEventListener('latex-project-review-change', () => { void savePreferences().then(refresh).catch(()=>{}); });
  window.addEventListener('latex-proofread-change', () => { signature=''; void refresh(); });
  window.addEventListener('latex-language-change', () => { signature=''; void refresh(); });
  const timer = setInterval(refresh,2000);
  window.addEventListener('pagehide',()=>clearInterval(timer));
  void Promise.resolve().then(refresh);
  return {refresh, clear, get items(){return rows;}, get busy(){return committing;}};
}
