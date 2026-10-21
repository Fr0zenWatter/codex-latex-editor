import {t} from './latex-settings.mjs';

const quotedDraft = text => text.split('\n').map(line => '> ' + line).join('\n') + '\n\n';

export function renderChatQuestion(container, text, renderReply, initialQuote = '') {
  const excerpts = [], parts = [];
  // Fold the numbered quote blocks produced by question(), including saved messages in other languages.
  const pattern = /(?:^|\n)(\d+)\. [^\n]+\n((?:> [^\n]*\n)+)\n/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (Number(match[1]) !== excerpts.length + 1 || (!excerpts.length && match.index !== 0)) break;
    parts.push(text.slice(end,match.index));
    excerpts.push(match[2].replace(/^> /gm,'').trimEnd()); end = match.index + match[0].length;
  }
  parts.push(text.slice(end));
  if (initialQuote && !excerpts.includes(initialQuote)) excerpts.unshift(initialQuote);
  renderReply(container,parts.join('\n\n').trim());
  if (!excerpts.length) return;
  const details = document.createElement('details'); details.className = 'chat-sent-quotes';
  const summary = document.createElement('summary'); summary.textContent = t('引用 {count} 条',{count:excerpts.length});
  const content = document.createElement('div'); content.className = 'chat-sent-quote-content';
  for (const excerpt of excerpts) {
    const quote = document.createElement('blockquote'); quote.textContent = excerpt; content.append(quote);
  }
  details.append(summary,content); container.append(details);
}

export function attachChatBranches({panel, messages, request, renderReply, mainState, selectMain, addQuote,
  isBusy, setBusy, model, referencesEnabled, resize}) {
  const $ = id => document.querySelector('#' + id);
  const tree = $('chat-tree'), nodes = $('chat-tree-nodes'), roots = $('chat-roots');
  const side = $('chat-branch'), log = $('chat-branch-messages'), input = $('chat-branch-input');
  const status = $('chat-branch-status'), menu = $('chat-text-menu');
  const nodeMenu = document.createElement('div'); nodeMenu.id = 'chat-tree-menu';
  nodeMenu.setAttribute('popover','auto'); nodeMenu.setAttribute('role','menu');
  const renameItem = document.createElement('button'); renameItem.type = 'button'; renameItem.setAttribute('role','menuitem');
  const deleteItem = document.createElement('button'); deleteItem.type = 'button'; deleteItem.setAttribute('role','menuitem'); deleteItem.dataset.danger = 'true';
  nodeMenu.append(renameItem,deleteItem); tree.append(nodeMenu);
  let menuOrigin = null;
  nodeMenu.onkeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); nodeMenu.hidePopover(); menuOrigin?.focus({preventScroll:true});
    } else if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
      event.preventDefault();
      const items = [renameItem,deleteItem].filter(item => !item.hidden && !item.disabled), current = items.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[index]?.focus({preventScroll:true});
    }
  };
  let treeToggle = $('chat-tree-toggle');
  if (!treeToggle) { treeToggle = document.createElement('button'); treeToggle.id = 'chat-tree-toggle'; }
  treeToggle.type = 'button'; treeToggle.setAttribute('aria-controls','chat-tree');
  treeToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="2" y="9" width="5" height="6" rx="1"/><rect x="17" y="2" width="5" height="6" rx="1"/><rect x="17" y="16" width="5" height="6" rx="1"/><path d="M7 12h5m5-7h-5v14h5"/></svg>';
  const treeLabel = document.createElement('span'); treeToggle.append(treeLabel); $('chat-end').before?.(treeToggle);
  let treeOpen = false;
  let navigationTimer = null;
  treeToggle.onclick = () => { treeOpen = !treeOpen; renderTree(); };
  let threads = [], active = null, selected = null, epoch = 0, busy = false, job = null, loading = false, pendingQuestion = null;
  const drafts = new Map(), scrolls = new Map(), mainDrafts = new Map();
  const quotes = new Map(), expandedQuotes = new Map();
  const mainInput = $('chat-input');
  const workspace = $('chat-workspace'), splitter = document.createElement('div'); splitter.id = 'chat-branch-splitter';
  splitter.tabIndex = 0; splitter.hidden = true; splitter.setAttribute('role','separator');
  splitter.setAttribute('aria-controls','chat-main chat-branch'); workspace.insertBefore(splitter,side);
  const deleteDialog = document.createElement('dialog'); deleteDialog.id = 'chat-delete-dialog';
  const deleteTitle = document.createElement('h3'); deleteTitle.id = 'chat-delete-title';
  const deleteDescription = document.createElement('p'); deleteDescription.id = 'chat-delete-description';
  const deleteActions = document.createElement('div'); deleteActions.className = 'chat-delete-actions';
  const cancelDelete = document.createElement('button'); cancelDelete.type = 'button'; cancelDelete.id = 'chat-delete-cancel';
  const confirmDelete = document.createElement('button'); confirmDelete.type = 'button'; confirmDelete.id = 'chat-delete-confirm';
  deleteDialog.setAttribute('aria-labelledby',deleteTitle.id); deleteDialog.setAttribute('aria-describedby',deleteDescription.id);
  deleteActions.append(cancelDelete,confirmDelete); deleteDialog.append(deleteTitle,deleteDescription,deleteActions); workspace.append(deleteDialog);
  let deletionPlan = null;
  cancelDelete.onclick = () => { deletionPlan = null; deleteDialog.close(); menuOrigin?.focus({preventScroll:true}); };
  deleteDialog.oncancel = () => { deletionPlan = null; };
  deleteDialog.addEventListener('keydown',event => { if (event.key === 'Escape') event.stopPropagation(); });
  confirmDelete.onclick = async () => {
    const plan = deletionPlan; deletionPlan = null; deleteDialog.close();
    if (plan) await commitDelete(plan);
  };
  let splitShare = .5, splitDrag = null, splitFrame = null;
  const stacked = () => window.innerWidth <= 650;
  function splitSize() {
    const rect = workspace.getBoundingClientRect();
    return Math.max(1,(stacked() ? rect.height - splitter.offsetHeight : rect.width - splitter.offsetWidth));
  }
  function readingPositions() {
    return [messages,log].map(container => {
      const top = container.getBoundingClientRect().top;
      const anchor = [...container.querySelectorAll('.markdown-block')].find(item => item.getBoundingClientRect().bottom > top);
      const rect = anchor?.getBoundingClientRect();
      return {container,anchor,offset:rect ? (top - rect.top) / Math.max(1,rect.height) : 0,scroll:container.scrollTop,
        bottom:container.scrollHeight - container.clientHeight - container.scrollTop <= 2};
    });
  }
  function setSplit(value, positions = []) {
    const limit = Math.min(.4,180 / splitSize());
    splitShare = Math.max(limit,Math.min(1 - limit,value));
    workspace.style.setProperty('--chat-main-share',String(splitShare));
    workspace.style.setProperty('--chat-branch-share',String(1 - splitShare));
    splitter.setAttribute('aria-orientation',stacked() ? 'horizontal' : 'vertical');
    splitter.setAttribute('aria-valuemin',String(Math.round(limit * 100)));
    splitter.setAttribute('aria-valuemax',String(Math.round((1 - limit) * 100)));
    splitter.setAttribute('aria-valuenow',String(Math.round(splitShare * 100)));
    for (const {container,anchor,offset,scroll,bottom} of positions) {
      if (bottom) container.scrollTop = container.scrollHeight;
      else if (anchor && container.contains(anchor)) {
        const rect = anchor.getBoundingClientRect();
        container.scrollTop += rect.top + offset * rect.height - container.getBoundingClientRect().top;
      } else container.scrollTop = scroll;
    }
  }
  function endSplit(event) {
    if (!splitDrag || (event?.pointerId !== undefined && event.pointerId !== splitDrag.id)) return;
    if (splitFrame !== null) window.cancelAnimationFrame(splitFrame); splitFrame = null;
    const drag = splitDrag; splitDrag = null;
    if (event?.type === 'pointerup') drag.next = drag.share + ((drag.stacked ? event.clientY : event.clientX) - drag.start) / drag.size;
    setSplit(drag.next,drag.positions); delete panel.dataset.splitting;
    if (splitter.hasPointerCapture(drag.id)) splitter.releasePointerCapture(drag.id);
  }
  splitter.onpointerdown = event => {
    if (event.button !== 0 || side.hidden || panel.hidden || panel.dataset.collapsed === 'true') return;
    event.preventDefault(); endSplit();
    splitDrag = {id:event.pointerId,stacked:stacked(),start:stacked() ? event.clientY : event.clientX,
      share:splitShare,next:splitShare,size:splitSize(),positions:readingPositions()};
    splitter.setPointerCapture(event.pointerId); panel.dataset.splitting = 'true';
  };
  splitter.onpointermove = event => {
    if (!splitDrag || event.pointerId !== splitDrag.id) return;
    if (!(event.buttons & 1)) { endSplit(); return; }
    event.preventDefault();
    splitDrag.next = splitDrag.share + ((splitDrag.stacked ? event.clientY : event.clientX) - splitDrag.start) / splitDrag.size;
    if (splitFrame === null) splitFrame = window.requestAnimationFrame(() => {
      splitFrame = null; if (splitDrag) setSplit(splitDrag.next,splitDrag.positions);
    });
  };
  splitter.onpointerup = splitter.onpointercancel = splitter.onlostpointercapture = endSplit;
  splitter.onkeydown = event => {
    if (event.key === 'Escape' && splitDrag) { event.preventDefault(); event.stopPropagation(); endSplit(); return; }
    const keys = stacked() ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
    if ((!keys.includes(event.key) && !['Home','End'].includes(event.key)) || side.hidden) return;
    event.preventDefault(); endSplit();
    setSplit(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : splitShare + (event.key === keys[0] ? -.03 : .03),readingPositions());
  };
  splitter.ondblclick = () => { endSplit(); setSplit(.5,readingPositions()); };
  window.addEventListener('blur',() => endSplit());
  window.addEventListener('resize',() => { endSplit(); if (!side.hidden) setSplit(splitShare); });
  const trays = [false,true].map(sidebar => {
    const id = sidebar ? 'chat-branch-quotes' : 'chat-quotes';
    let tray = $(id);
    if (!tray) { tray = document.createElement('div'); tray.id = id; $(sidebar ? 'chat-branch-form' : 'chat-form').prepend(tray); }
    tray.className = 'chat-quote-tray'; tray.hidden = true;
    $(sidebar ? 'chat-branch-model' : 'chat-config').before?.(tray);
    return {tray,sidebar};
  });
  const quoteThread = sidebar => sidebar ? active?.thread : mainState().thread;
  function question(text, sidebar = false) {
    const items = quotes.get(quoteThread(sidebar)) || [];
    if (!items.length) return text.trim();
    const context = items.map((item,index) => `${index + 1}. ${t('所选文本：')}\n${quotedDraft(item.text)}`
      + (item.note.trim() ? item.note.trim() + '\n\n' : '')).join('\n');
    return context + (text.trim() || (items.some(item => item.note.trim()) ? '' : t('请解释所选文本。')));
  }
  function clearQuotes(sidebar = false) {
    quotes.delete(quoteThread(sidebar)); renderQuotes();
  }
  function renderQuotes() {
    for (const {tray,sidebar} of trays) {
      const thread = quoteThread(sidebar), items = quotes.get(thread) || [];
      tray.replaceChildren(); tray.hidden = !items.length;
      if (!items.length) continue;
      const locked = isBusy() || loading;
      const cards = document.createElement('div'); cards.className = 'chat-quote-cards';
      cards.hidden = expandedQuotes.get(thread) !== true;
      for (const [index,item] of items.entries()) {
        const card = document.createElement('div'); card.className = 'chat-quote-card';
        const number = document.createElement('span'); number.className = 'chat-quote-number'; number.textContent = (index + 1) + '.';
        const content = document.createElement('div'); content.className = 'chat-quote-content';
        const label = document.createElement('span'); label.className = 'chat-quote-label'; label.textContent = t('所选文本：');
        const text = document.createElement('div'); text.className = 'chat-quote-text'; text.textContent = item.text;
        const note = document.createElement('div'); note.className = 'chat-quote-note'; note.textContent = item.note; note.hidden = !item.note;
        const editInput = document.createElement('textarea'); editInput.className = 'chat-quote-edit'; editInput.hidden = true;
        editInput.value = item.note; editInput.maxLength = 12000; editInput.placeholder = t('写下批注或问题…'); editInput.setAttribute('aria-label',t('批注要求'));
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'chat-quote-edit-button'; edit.disabled = locked;
        edit.setAttribute('aria-label',t('编辑批注 {number}',{number:index + 1})); edit.title = edit.getAttribute('aria-label');
        edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z"/></svg>';
        let previousNote = item.note;
        function finishEdit(cancel = false) {
          item.note = cancel ? previousNote : editInput.value; editInput.value = item.note;
          note.textContent = item.note; note.hidden = !item.note; editInput.hidden = true;
        }
        edit.onclick = () => { previousNote = item.note; editInput.value = item.note; note.hidden = true; editInput.hidden = false; editInput.focus({preventScroll:true}); };
        editInput.oninput = () => { item.note = editInput.value; };
        editInput.onblur = () => finishEdit();
        editInput.onkeydown = event => {
          if (!event.isComposing && (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey)))) {
            event.preventDefault(); event.stopPropagation(); finishEdit(event.key === 'Escape'); edit.focus({preventScroll:true});
          }
        };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'chat-quote-remove'; remove.disabled = locked;
        remove.setAttribute('aria-label',t('删除批注')); remove.title = t('删除批注');
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
        remove.onclick = () => { items.splice(items.indexOf(item),1); renderQuotes(); };
        content.append(label,text,note,editInput); card.append(number,content,edit,remove); cards.append(card);
      }
      const tools = document.createElement('div'); tools.className = 'chat-quote-tools';
      const count = document.createElement('button'); count.type = 'button'; count.className = 'chat-quote-count';
      count.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7 9h10M7 13h6"/></svg>';
      const countLabel = document.createElement('span'); countLabel.textContent = t('{count} 条批注',{count:items.length}); count.append(countLabel);
      count.setAttribute('aria-expanded',String(!cards.hidden));
      let hovering = false, focused = false;
      const keepsFocus = target => target?.className === 'chat-quote-edit' || target?.matches?.(':focus-visible');
      function showCards() {
        cards.hidden = !(hovering || focused || expandedQuotes.get(thread) === true);
        cards.style.width = Math.min(360,Math.max(0,($(sidebar ? 'chat-branch-form' : 'chat-form').clientWidth || 400) - 32)) + 'px';
        count.setAttribute('aria-expanded',String(!cards.hidden));
      }
      tray.onpointerenter = event => { if (event.pointerType !== 'touch') { hovering = true; showCards(); } };
      tray.onpointerleave = () => { hovering = false; showCards(); };
      tray.onfocusin = event => { focused = keepsFocus(event.target); showCards(); };
      tray.onfocusout = () => setTimeout(() => { focused = tray.contains(document.activeElement) && keepsFocus(document.activeElement); showCards(); },0);
      count.onclick = () => { expandedQuotes.set(thread,expandedQuotes.get(thread) !== true); showCards(); };
      const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'chat-quote-clear'; clear.textContent = '×'; clear.disabled = locked;
      clear.setAttribute('aria-label',t('清空引用批注')); clear.onclick = () => clearQuotes(sidebar);
      tools.append(count,clear); tray.append(cards,tools);
    }
  }
  function notify(text = '') { status.textContent = text; }
  function saveDraft() {
    if (active) { drafts.set(active.thread, input.value); scrolls.set(active.thread, log.scrollTop); }
  }
  function setOpen(open) {
    const changed = side.hidden === open;
    endSplit(); splitter.hidden = !open;
    side.hidden = !open; panel.dataset.branchOpen = String(open);
    if (changed) resize(open);
    if (open) setSplit(splitShare);
  }
  function labels() {
    deleteTitle.textContent = t('删除对话'); cancelDelete.textContent = t('取消'); confirmDelete.textContent = t('确认删除');
    splitter.title = t('调整主对话和侧栏大小'); splitter.setAttribute('aria-label',splitter.title);
    nodeMenu.setAttribute('aria-label',t('对话分支')); renameItem.textContent = t('重命名'); deleteItem.textContent = t('删除对话');
    tree.setAttribute('aria-label',t('对话分支')); roots.setAttribute('aria-label',t('主对话'));
    side.setAttribute('aria-label',t('侧边子对话')); log.setAttribute('aria-label',t('子对话记录'));
    for (const [id,key] of [['chat-text-add','添加到对话'],['chat-text-branch','在侧边聊天中提问'],
      ['chat-branch-send','发送'],['chat-branch-stop','停止']]) $(id).textContent = t(key);
    $('chat-branch-close').setAttribute('aria-label',t('关闭侧边栏'));
    input.setAttribute('aria-label',t('子对话问题')); input.placeholder = t('围绕引用继续追问…');
    const label = $('chat-branch-form').querySelector('label'); if (label) label.textContent = t('子对话问题');
    renderQuotes();
  }
  function renderTree() {
    clearTimeout(navigationTimer);
    nodeMenu.hidePopover();
    const main = mainState(), root = main.root || main.thread;
    const visible = threads.filter(node => node.root === root && (!node.parent || node.has_messages !== false));
    const count = visible.filter(node => node.parent).length;
    tree.hidden = !treeOpen || !threads.length; treeToggle.hidden = !threads.length;
    treeToggle.setAttribute('aria-expanded',String(!tree.hidden)); treeToggle.title = t('对话分支');
    treeLabel.textContent = t('对话分支') + (count ? ' · ' + count : '');
    roots.replaceChildren(); nodes.replaceChildren();
    for (const node of threads.filter(node => !node.parent)) {
      const option = document.createElement('option'); option.value = node.id;
      option.textContent = node.title || t('主对话'); roots.append(option);
    }
    roots.value = root || ''; roots.disabled = isBusy() || loading;
    $('chat-send').disabled = isBusy() || loading;
    $('chat-branch-send').disabled = isBusy() || loading;
    const children = new Map();
    for (const node of visible) {
      if (!children.has(node.parent)) children.set(node.parent,[]);
      children.get(node.parent).push(node);
    }
    const rootNode = threads.find(node => node.id === root);
    if (!rootNode) return;
    // Build iteratively so deeply nested discussions do not consume the JS stack.
    const pending = [{node:rootNode,container:nodes}];
    while (pending.length) {
      const {node,container} = pending.pop(), group = document.createElement('div'); group.className = 'chat-tree-node';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.thread = node.id;
      button.textContent = node.title || t('主对话'); button.title = node.title || t('主对话');
      button.setAttribute('aria-pressed',String(node.id === (side.hidden ? root : active?.thread)));
      button.disabled = isBusy() || loading;
      const navigate = () => node.parent ? openThread(node.id) : close();
      button.onclick = event => {
        clearTimeout(navigationTimer);
        if (event?.detail) navigationTimer = setTimeout(navigate,350);
        else return navigate();
      };
      function rename(event) {
        event.preventDefault(); clearTimeout(navigationTimer);
        if (isBusy() || loading || button.hidden) return;
        const rect = button.getBoundingClientRect();
        const name = document.createElement('input'); name.className = 'chat-tree-name'; name.value = node.title || t('主对话');
        name.maxLength = 120; name.setAttribute('aria-label',t('修改对话名称'));
        name.style.width = rect.width + 'px'; name.style.height = rect.height + 'px';
        group.insertBefore(name,button); button.hidden = true;
        name.focus({preventScroll:true}); name.select();
        let finished = false;
        async function finish(cancel = false) {
          if (finished) return;
          const title = name.value.trim();
          if (!cancel && !title) { name.focus({preventScroll:true}); return; }
          finished = true; name.disabled = true;
          if (!cancel && title !== node.title) {
            const token = epoch, project = mainState().project;
            try {
              const result = await request('/chat/rename',{method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({project,thread:node.id,title})});
              if (token !== epoch || project !== mainState().project) return;
              const current = threads.find(item => item.id === result.thread); if (current) current.title = result.title;
              if (active?.thread === result.thread) $('chat-branch-title').textContent = result.title;
            } catch (error) { if (token === epoch) { notify(error.message); $('chat-status').textContent = error.message; } }
          }
          name.remove(); button.hidden = false; renderTree();
          nodes.querySelector('[data-thread="' + node.id + '"]')?.focus({preventScroll:true});
        }
        name.onblur = () => finish();
        name.onkeydown = event => {
          event.stopPropagation();
          if (!event.isComposing && ['Enter','Escape'].includes(event.key)) {
            event.preventDefault(); return finish(event.key === 'Escape');
          }
        };
      }
      function contextMenu(event) {
        if (event.shiftKey && event.type === 'contextmenu') return;
        event.preventDefault(); clearTimeout(navigationTimer);
        if (isBusy() || loading) return;
        const rect = button.getBoundingClientRect(); menuOrigin = button;
        nodeMenu.style.left = Math.max(8,Math.min(event.clientX ?? rect.left,window.innerWidth - 148)) + 'px';
        nodeMenu.style.top = Math.max(8,Math.min(event.clientY ?? rect.bottom,window.innerHeight - 80)) + 'px';
        renameItem.onclick = event => { nodeMenu.hidePopover(); rename(event); };
        deleteItem.hidden = !node.parent;
        deleteItem.onclick = () => deleteThread(node);
        nodeMenu.showPopover(); renameItem.focus({preventScroll:true});
      }
      button.ondblclick = rename; button.oncontextmenu = contextMenu; button.setAttribute('aria-haspopup','menu');
      button.onkeydown = event => {
        if (event.key === 'F2') rename(event);
        else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) contextMenu(event);
      };
      group.append(button); container.append(group);
      const descendants = children.get(node.id) || [];
      if (descendants.length) {
        const list = document.createElement('div'); list.className = 'chat-tree-children'; group.append(list);
        for (const child of [...descendants].reverse()) pending.push({node:child,container:list});
      }
    }
  }
  function deleteThread(node) {
    nodeMenu.hidePopover();
    if (!node.parent || isBusy() || loading) return;
    const descendants = new Set([node.id]);
    const children = new Map();
    for (const item of threads) {
      if (!children.has(item.parent)) children.set(item.parent,[]);
      children.get(item.parent).push(item.id);
    }
    for (const id of descendants) for (const child of children.get(id) || []) descendants.add(child);
    deleteDescription.textContent = t('确定删除“{title}”？共 {count} 个对话（包含子对话），其中未发送的草稿也会清空。', {title:node.title,count:descendants.size});
    deletionPlan = {thread:node.id,descendants:[...descendants]}; deleteDialog.showModal(); cancelDelete.focus({preventScroll:true});
  }
  async function commitDelete({thread,descendants}) {
    if (isBusy() || loading) return;
    const token = epoch;
    loading = true; syncBusy(); input.readOnly = true; $('chat-branch-close').disabled = true;
    try {
      const result = await request('/chat/delete',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:mainState().project,thread,descendants})});
      if (token !== epoch) return;
      for (const id of result.deleted) { drafts.delete(id); scrolls.delete(id); quotes.delete(id); expandedQuotes.delete(id); }
      if (result.deleted.includes(active?.thread)) {
        setOpen(false); active = null; input.value = ''; log.replaceChildren();
      }
      threads = result.threads; selected = null; menu.hidePopover();
      notify(t('对话已删除。')); $('chat-status').textContent = t('对话已删除。');
    } catch (error) { if (token === epoch) { notify(error.message); $('chat-status').textContent = error.message; } }
    finally { if (token === epoch) { loading = false; syncBusy(); } }
  }
  function appendMessage(message) {
    const item = document.createElement('div'); item.className = 'chat-message'; item.dataset.role = message.role;
    if (Number.isInteger(message.id)) item.dataset.id = String(message.id);
    const label = document.createElement('b'); label.textContent = message.role === 'user' ? t('你') : 'Codex';
    const body = document.createElement('div'); body.className = 'chat-markdown';
    let text = message.content;
    if (message.role === 'assistant') { try { text = JSON.parse(text).reply || text; } catch {} }
    if (message.role === 'user') renderChatQuestion(body,text,renderReply,log.children.length ? '' : active?.quote);
    else renderReply(body,text);
    item.append(label,body); log.append(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }
  function show(data) {
    active = data; threads = data.threads || threads;
    $('chat-branch-title').textContent = threads.find(node => node.id === data.thread)?.title || t('侧边子对话');
    $('chat-branch-quote')?.remove();
    log.replaceChildren(); for (const message of data.messages) appendMessage(message);
    input.value = drafts.get(data.thread) || ''; notify(); setOpen(true); renderTree(); renderQuotes();
    if (scrolls.has(data.thread)) log.scrollTop = scrolls.get(data.thread);
    syncBusy();
    input.focus({preventScroll:true});
  }
  async function openThread(thread) {
    if (isBusy() || loading) return;
    if (!canLeaveDraft()) return;
    saveDraft(); const token = epoch; loading = true; renderTree();
    try {
      const data = await request('/chat/history?thread=' + encodeURIComponent(thread));
      if (token === epoch) show(data);
    } catch (error) { if (token === epoch) { notify(error.message); $('chat-status').textContent = error.message; } }
    finally { if (token === epoch) { loading = false; renderTree(); } }
  }
  function close(cancelLoading = true) {
    if (cancelLoading && loading) { epoch++; loading = false; $('chat-text-branch').disabled = false; }
    saveDraft(); setOpen(false); renderTree();
  }
  roots.onchange = async () => {
    if (isBusy() || loading) return;
    if (!canLeaveDraft()) { roots.value = mainState().root || mainState().thread; return; }
    const main = mainState(), thread = roots.value, token = epoch;
    mainDrafts.set(main.thread,$('chat-input').value); saveDraft(); loading = true; renderTree();
    try {
      const data = await request('/chat/history?thread=' + encodeURIComponent(thread));
      if (token !== epoch) return;
      close(false); active = null; selectMain(data); $('chat-input').value = mainDrafts.get(thread) || ''; mainDrafts.delete(thread);
    } catch (error) { if (token === epoch) { notify(error.message); $('chat-status').textContent = error.message; } }
    finally { if (token === epoch) { loading = false; renderTree(); } }
  };
  function canLeaveDraft() {
    if (!active || active.messages.length || (!input.value.trim() && !quotes.get(active.thread)?.length)) return true;
    const message = t('请先发送或清空当前侧栏草稿，再切换对话。');
    notify(message); $('chat-status').textContent = message; return false;
  }
  function stageQuote(thread, choice) {
    const items = quotes.get(thread) || [];
    if (!items.some(item => item.message_id === choice.message_id && item.text === choice.text)) items.push({...choice,note:''});
    quotes.set(thread,items); expandedQuotes.set(thread,false); renderQuotes();
  }
  function capture(event, container, thread) {
    if (isBusy() || loading || !thread || (container === log && side.hidden)) return false;
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return false;
    const range = selection.getRangeAt(0);
    const element = node => node?.nodeType === 1 ? node : node?.parentElement;
    const start = element(range.startContainer)?.closest('.chat-markdown');
    const end = element(range.endContainer)?.closest('.chat-markdown');
    if (!start || start !== end || !container.contains(start)) return false;
    const message = start.closest('.chat-message'), id = Number(message?.dataset.id), text = selection.toString().trim();
    if (!Number.isInteger(id) || id < 1 || !text || text.length > 12000) return false;
    event?.preventDefault?.();
    selected = {thread,message_id:id,text,side:container === log};
    const box = range.getBoundingClientRect();
    menu.showPopover();
    const width = menu.getBoundingClientRect?.().width || 290, height = menu.getBoundingClientRect?.().height || 40;
    menu.style.left = Math.max(8,Math.min(box.left,window.innerWidth - width - 8)) + 'px';
    menu.style.top = Math.max(8,box.bottom + height + 14 <= window.innerHeight ? box.bottom + 6 : box.top - height - 6) + 'px';
    return true;
  }
  let selecting = false, selectionTimer = null;
  function captureCurrent() {
    if (selecting || isBusy() || loading) return;
    if (panel.hidden || panel.dataset.collapsed === 'true') { menu.hidePopover(); return; }
    if (!capture(null,messages,mainState().thread) && !capture(null,log,active?.thread)) { menu.hidePopover(); selected = null; }
  }
  function scheduleCapture() {
    if (selecting) return;
    clearTimeout(selectionTimer);
    // A popover opened during pointerup is immediately closed by native light-dismiss.
    selectionTimer = setTimeout(() => { selectionTimer = null; captureCurrent(); },0);
  }
  for (const container of [messages,log]) {
    const currentThread = () => container === messages ? mainState().thread : active?.thread;
    container.addEventListener('pointerdown',event => { if (event.button === 0) { selecting = true; clearTimeout(selectionTimer); menu.hidePopover(); } });
    container.addEventListener('pointerup',event => { if (event.button === 0) { selecting = false; scheduleCapture(); } });
    container.addEventListener('contextmenu',event => capture(event,container,currentThread()));
    container.addEventListener('keyup',event => { if (event.shiftKey && event.key?.startsWith('Arrow')) scheduleCapture(); });
  }
  window.addEventListener('pointerup',() => { if (selecting) { selecting = false; scheduleCapture(); } });
  window.addEventListener('pointercancel',() => { selecting = false; clearTimeout(selectionTimer); menu.hidePopover(); });
  document.addEventListener?.('selectionchange',scheduleCapture);
  menu.addEventListener('pointerdown',event => event.preventDefault());
  menu.addEventListener('keydown',event => { if (event.key === 'Escape') { event.stopPropagation(); menu.hidePopover(); } });
  $('chat-text-add').onclick = () => {
    if (!selected || isBusy()) return;
    if (selected.thread !== quoteThread(selected.side)) return;
    stageQuote(selected.thread,selected);
    if (selected.side) input.focus({preventScroll:true});
    else { addQuote(); mainInput.focus({preventScroll:true}); }
    menu.hidePopover(); window.getSelection?.()?.removeAllRanges();
  };
  $('chat-text-branch').onclick = async () => {
    if (!selected || isBusy() || loading) return;
    const choice = selected, token = epoch;
    if (!choice.side && active && active.root === mainState().root && (!side.hidden || !active.messages.length)) {
      stageQuote(active.thread,choice); setOpen(true); renderTree();
      menu.hidePopover(); window.getSelection?.()?.removeAllRanges(); input.focus({preventScroll:true}); return;
    }
    saveDraft(); loading = true; renderTree(); $('chat-text-branch').disabled = true;
    try {
      const data = await request('/chat/branch',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:mainState().project,parent:choice.thread,message_id:choice.message_id,quote:choice.text})});
      if (token === epoch) { show(data); menu.hidePopover(); window.getSelection?.()?.removeAllRanges(); }
    } catch (error) { if (token === epoch) { menu.hidePopover(); notify(error.message); $('chat-status').textContent = error.message; } }
    finally { if (token === epoch) { loading = false; $('chat-text-branch').disabled = false; renderTree(); } }
  };
  function syncBusy() {
    input.readOnly = busy; $('chat-branch-send').disabled = isBusy(); $('chat-branch-stop').hidden = !busy;
    $('chat-branch-close').disabled = busy;
    const settings = model(); $('chat-branch-model').textContent = settings.name;
    renderTree(); renderQuotes();
  }
  async function stop() {
    if (!busy) return;
    epoch++; const id = job; job = null; busy = false; markAsked(!!active?.messages.length); setBusy(false); syncBusy();
    if (pendingQuestion && active?.thread === pendingQuestion.thread) {
      input.value = pendingQuestion.question; drafts.set(active.thread,input.value);
      log.replaceChildren(); for (const message of active.messages) appendMessage(message);
    }
    pendingQuestion = null;
    notify(t('已停止，可继续提问。'));
    if (id) { try { await request('/chat/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); }
      catch (error) { notify(error.message); } }
  }
  $('chat-branch-stop').onclick = stop;
  $('chat-branch-close').onclick = () => { clearQuotes(true); expandedQuotes.delete(active?.thread); close(); };
  function markAsked(value) {
    const node = threads.find(node => node.id === active?.thread); if (node) node.has_messages = value;
  }
  $('chat-branch-form').onsubmit = async event => {
    event.preventDefault(); if (!active || isBusy() || loading) return;
    const draft = input.value, text = question(draft,true);
    if (!text) return;
    const thread = active.thread, token = ++epoch;
    pendingQuestion = {thread,question:draft};
    const conversation = [...active.messages.slice(-38),{role:'user',content:text}];
    const user = appendMessage(conversation.at(-1)); input.value = '';
    busy = true; markAsked(true); setBusy(true); syncBusy(); notify(t('Codex 正在思考…'));
    let completed = false;
    try {
      const settings = model();
      const started = await request('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        source:settings.source,selection:'',messages:conversation,remember:true,thread,memory_revision:active.revision,
        model:settings.model,effort:settings.effort,references:referencesEnabled(),request_id:crypto.randomUUID().replaceAll('-','')})});
      if (token !== epoch) {
        await request('/chat/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:started.id})}); return;
      }
      job = started.id;
      while (token === epoch) {
        const result = await request('/chat?id=' + encodeURIComponent(job));
        if (token !== epoch) return;
        if (result.status === 'running') { await new Promise(resolve => setTimeout(resolve,700)); continue; }
        if (result.status !== 'done') throw new Error(result.error || t('本次回复已停止。'));
        active.revision = result.memory_revision;
        user.dataset.id = String(result.memory_revision - 1);
        active.messages = [...conversation,{id:result.memory_revision,role:'assistant',content:JSON.stringify({reply:result.reply,replacement:null})}];
        appendMessage(active.messages.at(-1)); clearQuotes(true); notify(); completed = true; return;
      }
    } catch (error) {
      if (token === epoch) {
        notify(error.message); input.value = draft;
        if (error.conflict) {
          try {
            const data = await request('/chat/history?thread=' + encodeURIComponent(thread));
            if (token === epoch) active = data;
          } catch {}
        }
      }
    } finally {
      if (token === epoch) {
        if (!completed) {
          drafts.set(thread,draft); input.value = draft; log.replaceChildren(); for (const item of active.messages) appendMessage(item);
          markAsked(!!active.messages.length);
        } else drafts.delete(thread);
        pendingQuestion = null; job = null; busy = false; setBusy(false); syncBusy();
      }
    }
  };
  input.addEventListener('keydown',event => {
    if (event.key === 'Enter' && !event.isComposing && (!event.shiftKey || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); $('chat-branch-form').requestSubmit();
    }
  });
  window.addEventListener('latex-language-change',() => { labels(); renderTree(); });
  window.addEventListener('pagehide',() => {
    if (job) fetch('/chat/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job}),keepalive:true});
  });
  window.addEventListener('beforeunload',event => {
    saveDraft(); if (busy || [...quotes.values()].some(items => items.length) || $('chat-input').value.trim() || [...drafts.values()].some(text => text.trim()) || [...mainDrafts.values()].some(text => text.trim())) {
      event.preventDefault(); event.returnValue = '';
    }
  });
  labels(); side.hidden = true;
  return {get busy() { return busy; }, get loading() { return loading; },
    get hasDrafts() { return [...quotes.values()].some(items => items.length) || !!input.value.trim() || [...drafts.values()].some(text => text.trim()) || [...mainDrafts.values()].some(text => text.trim()); },
    syncBusy, stop, question, clearQuotes,
    memory(data) { threads = data.threads || []; renderTree(); renderQuotes(); },
    reset(preserveDrafts = false) {
      deletionPlan = null; if (deleteDialog.open) deleteDialog.close();
      clearTimeout(selectionTimer); selecting = false;
      saveDraft(); if (preserveDrafts) mainDrafts.set(mainState().thread,$('chat-input').value);
      stop(); epoch++; pendingQuestion = null; active = null; selected = null; threads = []; loading = false; treeOpen = false;
      if (!preserveDrafts) { drafts.clear(); scrolls.clear(); mainDrafts.clear(); quotes.clear(); expandedQuotes.clear(); }
      input.value = ''; $('chat-text-branch').disabled = false; menu.hidePopover(); setOpen(false); renderTree(); renderQuotes(); },
  };
}
