import * as React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import PillMorphTabs from "@/components/ui/pill-morph-tabs";

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
