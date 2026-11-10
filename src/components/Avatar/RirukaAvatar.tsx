"use client";

import { Glasses, Hand, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, type PointerEvent } from "react";
import { moodLabels, type Mood } from "@/lib/chat";
import { PortraitModel } from "./PortraitModel";

export function RirukaAvatar({ mood, line, glasses, aura = false, onGlasses, onAura, onInteract }: {
  mood: Mood; line: string; glasses: boolean; aura?: boolean; onGlasses: () => void; onAura?: () => void; onInteract: (hold?: boolean) => void;
}) {
  const gesture = useRef<{ id: number; x: number; y: number; timeout: number; held: boolean } | null>(null);
  const pointer = useRef<[number, number]>([0, 0]);
  const onAction = useRef(onInteract);
  onAction.current = onInteract;

  function cancel() {
    if (gesture.current) clearTimeout(gesture.current.timeout);
    gesture.current = null;
  }

  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); cancel(); };
  }, []);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    cancel();
    event.currentTarget.setPointerCapture(event.pointerId);
    const timeout = window.setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.held = true;
      onAction.current(true);
    }, 600);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, timeout, held: false };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const area = event.currentTarget.getBoundingClientRect();
    const clamp = (position: number) => Math.max(-1, Math.min(1, position));
    pointer.current = [clamp((event.clientX - area.left) / area.width * 2 - 1), clamp((event.clientY - area.top) / area.height * 2 - 1)];
    const press = gesture.current;
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 13) cancel();
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const press = gesture.current;
    if (press?.id === event.pointerId && !press.held) onInteract();
    cancel();
    if (event.pointerType === "touch") pointer.current = [0, 0];
  }

  return (
    <div className="avatar" data-mood={mood} data-aura={aura ? "true" : "false"}>
      <div className="portrait-heading">
        <span><span className="signal-dot" /> آواتار تعاملی</span>
        <span lang="en" dir="ltr">RIRUKA / LIVE PORTRAIT</span>
      </div>
      <button className="portrait-trigger" type="button" aria-label="نوازش سر ریروکا" onPointerDown={start}
        onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onPointerLeave={() => { pointer.current = [0, 0]; }}
        onClick={(event) => { if (event.detail === 0) onInteract(); }}
        onContextMenu={(event) => event.preventDefault()}>
        <span className="portrait-orbits" aria-hidden="true"><i /><i /><i /></span>
        <PortraitModel mood={mood} glasses={glasses} pointer={pointer} />
        <span className="portrait-grain" aria-hidden="true" />
        <span className="portrait-sparks" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>✧</i></span>
      </button>
      <div className="avatar-meta">
        <div className="mood-pill"><span className="signal-dot" /> {moodLabels[mood]}</div>
        <div className="portrait-copy" aria-live="polite">{line || "آواتار را لمس کن یا نگه دار تا واکنشش را ببینی."}</div>
        <div className="portrait-controls">
          <button className="hold-action" type="button" onClick={() => onInteract(true)}>
            {mood === "HAPPY" ? <Sparkles size={14} /> : <Hand size={14} />} نگه‌داشتن
          </button>
          <button className="hold-action" type="button" onClick={onGlasses} aria-label="عینک ریروکا" aria-pressed={glasses}><Glasses size={16} /> عینک</button>
          {onAura && <button className="hold-action" type="button" onClick={onAura} aria-label="هالهٔ نوری ریروکا" aria-pressed={aura}><WandSparkles size={15} /> هاله</button>}
        </div>
      </div>
    </div>
  );
}
