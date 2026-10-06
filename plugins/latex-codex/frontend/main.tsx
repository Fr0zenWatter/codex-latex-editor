import * as React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import PillMorphTabs from "@/components/ui/pill-morph-tabs";
import OptionWheel from "@/components/ui/option-wheel";

type SourceFile = {path: string; name: string};
export function mountSourceWheel({button, popup, translate, onSelect}: {
  button: HTMLButtonElement; popup: HTMLElement; translate: (key: string) => string;
  onSelect: (path: string) => Promise<boolean>;
}) {
  const root = createRoot(popup);
  let files: SourceFile[] = [], current = "", main = "", choosing = false, opening = 0;
  const basename = (path: string) => path.split(/[\\/]/).pop() || path;
  const label = (file: SourceFile) => files.filter(item => basename(item.path) === basename(file.path)).length > 1 ? file.name : basename(file.path);
  const close = () => { popup.hidePopover(); button.setAttribute("aria-expanded", "false"); };
  function render() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    flushSync(() => root.render(<OptionWheel key={opening + current + files.map(file => file.path).join("|")}
      id="source-wheel" aria-label={translate("项目源码")} items={files.map(label)}
      defaultSelected={Math.max(0, files.findIndex(file => file.path === current))}
      fontSize={.94} spacing={2.25} inset={34} tilt={9} blur={.45} minOpacity={.1} smoothing={reduced ? 1 : 150}
      textColor="var(--muted)" activeColor="var(--text)" className="source-option-wheel"
      itemClassName={index => files[index].path === main ? "is-main" : ""}
      onCommit={async index => {
        if (button.disabled || choosing) return;
        const file = files[index]; if (!file) return;
        choosing = true; close();
        try { await onSelect(file.path); } finally { choosing = false; render(); }
      }} />));
  }
  function open() {
    if (button.disabled || !files.length) return;
    const rect = button.getBoundingClientRect(), pane = button.closest("section")!.getBoundingClientRect();
    const width = Math.max(120, Math.min(360, pane.width - 16, window.innerWidth - 16));
    popup.style.width = width + "px";
    popup.style.left = Math.max(8, Math.min(rect.right + 12, window.innerWidth - width - 8)) + "px";
    const top = Math.max(8, rect.top + rect.height / 2 - 120);
    popup.style.top = top + "px";
    popup.style.setProperty("--source-wheel-center", rect.top + rect.height / 2 - top + "px");
    opening++; render(); popup.showPopover(); button.setAttribute("aria-expanded", "true");
    popup.querySelector<HTMLElement>('[role="listbox"]')?.focus();
  }
  button.onclick = () => popup.matches(":popover-open") ? close() : open();
  button.onkeydown = event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); } };
  popup.addEventListener("toggle", () => button.setAttribute("aria-expanded", String(popup.matches(":popover-open"))));
  popup.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); button.focus(); } });
  window.addEventListener("resize", close);
  window.addEventListener("latex-language-change", () => { button.setAttribute("aria-label", translate("项目源码")); render(); });
  return {
    update(data: {files: SourceFile[]; path: string; mainFile: string}) {
      main = data.mainFile; files = [...data.files].sort((a, b) => Number(b.path === main) - Number(a.path === main)); current = data.path;
      button.textContent = basename(current);
      button.title = current; button.classList.toggle("is-main", current === main); render();
    },
    setDisabled(disabled: boolean) { button.disabled = disabled; if (disabled) close(); },
  };
}

export function mountHistoryTabs(translate: (key:string) => string) {
  function HistoryTabs() {
    const [,refresh] = React.useReducer(count => count+1,0);
    React.useEffect(() => {
      const update = () => refresh(); window.addEventListener("latex-language-change",update);
      return () => window.removeEventListener("latex-language-change",update);
    },[]);
    return <PillMorphTabs defaultValue="diff" label={translate("历史视图")} items={[
      {value:"diff",id:"history-diff",label:translate("改动对比")},
      {value:"pdf",id:"history-pdf",label:translate("PDF 改动")},
      {value:"source",id:"history-source",label:translate("此版本源码")}
    ]} onValueChange={value => (document.getElementById("history-"+value) as HTMLButtonElement)?.onclick?.(new PointerEvent("click"))} />;
  }
  const root = createRoot(document.getElementById("history-tabs")!);
  flushSync(() => root.render(<HistoryTabs />));
}
