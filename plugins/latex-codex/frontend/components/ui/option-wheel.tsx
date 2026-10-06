"use client";

import {useRef, useState, useCallback, useEffect, type ComponentProps} from "react";
import {cn} from "@/lib/utils";

export type OptionWheelProps = Omit<ComponentProps<"div">, "onChange"> & {
  items?: string[];
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  onCommit?: (index: number, item: string) => void;
  itemClassName?: (index: number) => string;
  textColor?: string;
  activeColor?: string;
  side?: "left" | "right";
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
};

const DEFAULT_ITEMS = ["Ambient", "House", "Techno", "Jazz", "Lo-Fi", "Synthwave", "Trance", "Funk", "Disco", "Hip-Hop", "Chillwave", "Drum & Bass"];

export default function OptionWheel({
  items = DEFAULT_ITEMS, defaultSelected = 3, onChange, onCommit, itemClassName,
  textColor = "#a6a6a6", activeColor = "#ffffff", side = "left", fontSize = 3,
  spacing = 1.4, curve = 1, tilt = 6, blur = 2, fade = .25, minOpacity = .05,
  smoothing = 200, inset = 80, loop = false, draggable = true,
  soundUrl = "", soundVolume = .5, className, style, ...props
}: OptionWheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(defaultSelected), targetRef = useRef(defaultSelected);
  const rafRef = useRef<number | null>(null), lastRef = useRef(0);
  const selectedRef = useRef(defaultSelected), wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{y: number; start: number; id: number} | null>(null);
  const dragMovedRef = useRef(false), audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef(""), lastTickRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(defaultSelected), [isDragging, setIsDragging] = useState(false);
  const remPx = typeof window !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  const cfgRef = useRef({items, rowH: 1, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, draggable, soundUrl, soundVolume});
  const onChangeRef = useRef(onChange), onCommitRef = useRef(onCommit);
  onChangeRef.current = onChange; onCommitRef.current = onCommit;
  cfgRef.current = {items, rowH: Math.max(fontSize * spacing * remPx, 1), curve, tilt, blur, fade, minOpacity, side, loop, smoothing, draggable, soundUrl, soundVolume};

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, .05); lastRef.current = now;
    const cfg = cfgRef.current, k = 1 - Math.exp(-dt / (Math.max(cfg.smoothing, 1) / 1000));
    let next = posRef.current + (targetRef.current - posRef.current) * k;
    const settled = Math.abs(targetRef.current - next) < .001;
    if (settled) next = targetRef.current;
    posRef.current = next;
    const mirror = cfg.side === "right" ? -1 : 1, tiltRad = cfg.tilt * Math.PI / 180;
    const radius = tiltRad > .0005 ? cfg.rowH / tiltRad : 0;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      let d = i - next;
      if (cfg.loop && cfg.items.length > 1) {
        d = ((d % cfg.items.length) + cfg.items.length) % cfg.items.length;
        if (d > cfg.items.length / 2) d -= cfg.items.length;
      }
      const dist = Math.abs(d);
      let x = 0, y = d * cfg.rowH, rotation = 0;
      if (radius > 0) {
        const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
        y = radius * Math.sin(angle); x = -mirror * radius * (1 - Math.cos(angle)) * cfg.curve;
        rotation = mirror * angle * 180 / Math.PI;
      }
      el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rotation.toFixed(3)}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade));
      el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : "none";
      el.style.setProperty("--ow-p", Math.max(0, 1 - Math.min(dist, 1)).toFixed(4));
    });
    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);
  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    lastRef.current = performance.now(); rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);
  const playTick = useCallback(() => {
    const cfg = cfgRef.current;
    if (!cfg.soundUrl || performance.now() - lastTickRef.current < 70) return;
    lastTickRef.current = performance.now();
    if (!audioRef.current || audioUrlRef.current !== cfg.soundUrl) {
      audioRef.current = new Audio(cfg.soundUrl); audioRef.current.preload = "auto"; audioUrlRef.current = cfg.soundUrl;
    }
    audioRef.current.volume = Math.max(0, Math.min(1, cfg.soundVolume));
    audioRef.current.currentTime = 0; audioRef.current.play()?.catch(() => {});
  }, []);
  const applyTarget = useCallback((value: number, snap: boolean, commit = false) => {
    const cfg = cfgRef.current, count = cfg.items.length;
    if (!count) return;
    let next = cfg.loop ? value : Math.max(0, Math.min(count - 1, value));
    if (snap) next = Math.round(next);
    targetRef.current = next;
    const index = ((Math.round(next) % count) + count) % count;
    if (index !== selectedRef.current) {
      selectedRef.current = index; setSelectedIndex(index); onChangeRef.current?.(index, cfg.items[index]); playTick();
    }
    startLoop();
    if (commit) onCommitRef.current?.(index, cfg.items[index]);
  }, [startLoop, playTick]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? el.clientHeight : 1);
      if (!delta) return;
      applyTarget(targetRef.current + Math.max(-1, Math.min(1, delta / cfgRef.current.rowH)), false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    el.addEventListener("wheel", onWheel, {passive: false});
    return () => { el.removeEventListener("wheel", onWheel); if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current); };
  }, [applyTarget]);
  useEffect(() => { applyTarget(targetRef.current, false); }, [items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
  }, []);
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    dragRef.current = null; setIsDragging(false);
    if (rootRef.current?.hasPointerCapture(drag.id)) rootRef.current.releasePointerCapture(drag.id);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }
  return <div ref={rootRef} role="listbox" tabIndex={0} aria-label="Option wheel"
    aria-activedescendant={props.id ? `${props.id}-option-${selectedIndex}` : undefined}
    className={cn("relative w-full h-full overflow-hidden select-none touch-none outline-none", isDragging ? "cursor-grabbing" : "cursor-grab", className)}
    style={{...style, "--ow-text-color": textColor, "--ow-active-color": activeColor, "--ow-font-size": `${fontSize}rem`, "--ow-inset": `${inset}px`} as React.CSSProperties}
    onPointerDown={event => {
      if (!cfgRef.current.draggable || event.button !== 0) return;
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      dragRef.current = {y: event.clientY, start: targetRef.current, id: event.pointerId}; dragMovedRef.current = false; setIsDragging(true);
    }}
    onPointerMove={event => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) { dragMovedRef.current = true; rootRef.current?.setPointerCapture(drag.id); }
      if (dragMovedRef.current) applyTarget(drag.start - dy / cfgRef.current.rowH, false);
    }}
    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onKeyDown={event => {
      const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : null;
      if (delta !== null) { event.preventDefault(); applyTarget(Math.round(targetRef.current) + delta, true); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); applyTarget(event.key === "Home" ? 0 : items.length - 1, true); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); applyTarget(targetRef.current, true, true); }
    }} {...props}>
    {items.map((label, index) => <div key={`${label}-${index}`} ref={el => { itemRefs.current[index] = el; }}
      id={props.id ? `${props.id}-option-${index}` : undefined} role="option" aria-selected={selectedIndex === index} title={label}
      className={cn("absolute top-1/2 whitespace-nowrap leading-none will-change-[transform,opacity,filter] cursor-pointer",
        side === "right" ? "right-[var(--ow-inset)] origin-right" : "left-[var(--ow-inset)] origin-left",
        selectedIndex === index ? "font-medium" : "font-extralight", itemClassName?.(index))}
      style={{fontSize: "var(--ow-font-size)", color: "color-mix(in srgb, var(--ow-active-color) calc(var(--ow-p, 0) * 100%), var(--ow-text-color))"}}
      onClick={() => { if (!dragMovedRef.current) applyTarget(index, true, true); }}>
      <span className="option-wheel-label" style={{animationDelay: `${Math.min(6, Math.abs(index - defaultSelected)) * 36}ms`}}>{label}</span>
    </div>)}
  </div>;
}
