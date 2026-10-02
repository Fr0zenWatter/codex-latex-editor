"use client";
import * as React from "react";
import {motion, useReducedMotion} from "framer-motion";
import {cn} from "@/lib/utils";
import {Tabs, TabsList, TabsTrigger, TabsContent} from "@/components/ui/tabs";

export interface PillTab {value: string; label: React.ReactNode; panel?: React.ReactNode; id?: string;}
interface PillMorphTabsProps {items?: PillTab[]; defaultValue?: string; onValueChange?: (value: string) => void; className?: string; label?: string;}

export default function PillMorphTabs({items = [
  {value:"overview",label:"Overview"}, {value:"features",label:"Features"},
  {value:"pricing",label:"Pricing"}, {value:"faq",label:"FAQ"}
], defaultValue, onValueChange, className, label}: PillMorphTabsProps) {
  const [value, setValue] = React.useState(defaultValue ?? items[0]?.value ?? "tab-0");
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator,setIndicator] = React.useState<{left:number;width:number} | null>(null);
  const [isExpanding,setIsExpanding] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const measure = React.useCallback(() => {
    const list = listRef.current, active = triggerRefs.current[value];
    if (!list || !active) return;
    setIndicator({left:active.getBoundingClientRect().left-list.getBoundingClientRect().left+list.scrollLeft, width:active.getBoundingClientRect().width});
  },[value]);
  React.useEffect(() => {
    measure(); const observer = new ResizeObserver(measure);
    if (listRef.current) observer.observe(listRef.current);
    Object.values(triggerRefs.current).forEach(el => el && observer.observe(el));
    window.addEventListener("resize",measure);
    return () => {observer.disconnect();window.removeEventListener("resize",measure);};
  },[measure]);
  React.useEffect(() => {
    setIsExpanding(true); const timer = window.setTimeout(() => setIsExpanding(false),300);
    return () => window.clearTimeout(timer);
  },[value]);
  const transition = reducedMotion ? {duration:0} : {type:"spring" as const,stiffness:300,damping:28};
  return <div className={cn("history-pill-tabs",className)}>
    <Tabs value={value} onValueChange={next => {setValue(next);onValueChange?.(next);}}>
      <div ref={listRef} className="relative inline-flex items-center rounded-full border border-slate-200/70 bg-slate-50/80 p-1 backdrop-blur-sm">
        {indicator && <>
          <motion.div initial={false} animate={{...indicator,scaleY:isExpanding && !reducedMotion ? 1.06 : 1}} transition={transition}
            className="pointer-events-none absolute inset-y-1 rounded-full border border-white/70"
            style={{background:"linear-gradient(90deg,rgba(124,58,237,.16),rgba(6,182,212,.14))",boxShadow:"0 3px 12px rgba(16,24,40,.06)"}} />
          <motion.div initial={false} animate={indicator} transition={transition} className="pointer-events-none absolute inset-y-1 rounded-full opacity-20 blur-xl"
            style={{background:"linear-gradient(90deg,#7c3aed,#06b6d4)"}} />
        </>}
        <TabsList className="relative gap-1" aria-label={label}>
          {items.map(item => <TabsTrigger key={item.value} value={item.value} id={item.id} aria-controls={item.id ? "history-panes" : undefined}
            ref={el => {triggerRefs.current[item.value]=el;}}
            className={cn("relative z-10 rounded-full px-4 py-2 text-sm font-medium transition-colors",item.value===value ? "text-slate-950" : "text-slate-500 hover:text-slate-800")}>{item.label}</TabsTrigger>)}
        </TabsList>
      </div>
      {items.some(item => item.panel !== undefined) && <div className="mt-4">{items.map(item => <TabsContent key={item.value} value={item.value} className="p-2">{item.panel ?? null}</TabsContent>)}</div>}
    </Tabs>
  </div>;
}
