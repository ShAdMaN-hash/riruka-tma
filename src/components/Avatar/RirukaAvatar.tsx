"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Hand, Sparkles } from "lucide-react";
import { useEffect, useRef, type PointerEvent } from "react";
import { moodLabels, type Mood } from "@/lib/chat";

const expression: Record<Mood, { color: string; eyes: string; mouth: string; brows: string; blush: number }> = {
  TSUNDERE: { color: "#f467ae", eyes: "#d7479c", mouth: "M155 203 Q168 197 179 202", brows: "M105 146 Q122 140 141 151 M190 152 Q208 141 226 146", blush: 0.30 },
  YANDERE: { color: "#ff3f76", eyes: "#ff3b68", mouth: "M153 198 Q167 215 182 198 Q168 204 153 198Z", brows: "M107 144 Q126 147 143 151 M191 151 Q207 144 225 144", blush: 0.48 },
  FLUSTERED: { color: "#ff83b2", eyes: "#f37caf", mouth: "M157 200 Q166 191 175 200 Q174 205 166 205 Q158 205 157 200Z", brows: "M106 143 Q124 135 142 145 M190 145 Q208 135 226 143", blush: 0.91 },
  HAPPY: { color: "#59dfe7", eyes: "#b35eef", mouth: "M150 198 Q166 205 183 196 Q177 217 166 217 Q154 216 150 198Z", brows: "M106 146 Q125 135 142 143 M189 143 Q208 134 226 146", blush: 0.58 },
  THINKING: { color: "#af8aff", eyes: "#9a66e6", mouth: "M162 201 Q167 196 173 201 Q170 208 166 207 Q163 206 162 201Z", brows: "M108 145 Q125 137 140 147 M190 148 Q208 145 225 149", blush: 0.25 },
};

function Portrait({ mood }: { mood: Mood }) {
  const reduced = useReducedMotion();
  const face = expression[mood];
  return (
    <svg className="portrait-svg" viewBox="0 0 332 300" aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id="hair" x1="0" x2="1" y1="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#5b2d6d" /><stop offset=".47" stopColor="#321942" /><stop offset="1" stopColor="#171025" />
        </linearGradient>
        <linearGradient id="skin" x2="0" y2="1">
          <stop stopColor="#ffd5db" /><stop offset="1" stopColor="#ed9cae" />
        </linearGradient>
        <linearGradient id="jacket" x2="0" y2="1">
          <stop stopColor="#322040" /><stop offset="1" stopColor="#171224" />
        </linearGradient>
        <radialGradient id="aura">
          <stop stopColor={face.color} stopOpacity=".32" /><stop offset="1" stopColor={face.color} stopOpacity="0" />
        </radialGradient>
        <pattern id="dots" width="15" height="15" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r=".75" fill="#e5b1e9" opacity=".28" />
        </pattern>
      </defs>
      <circle cx="166" cy="145" r="142" fill="url(#aura)" />
      <circle cx="166" cy="148" r="109" fill="url(#dots)" stroke={face.color} strokeOpacity=".22" strokeWidth="1" />
      <motion.circle cx="166" cy="148" r="124" fill="none" stroke={face.color} strokeOpacity=".48" strokeWidth="1" strokeDasharray="25 8 3 8 95 36"
        style={{ originX: "50%", originY: "50%" }} animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 44, ease: "linear", repeat: Infinity }} />
      <path d="M20 147H49 M283 147H312 M165 9V31 M165 266V286" stroke={face.color} opacity=".43" />
      <path d="m38 80 6 6-6 6-6-6Zm253 130 5 5-5 5-5-5Zm-4-128 4 4-4 4-4-4Z" fill={face.color} opacity=".77" />
      <circle cx="65" cy="220" r="2.4" fill="#6fdef1" /><circle cx="260" cy="64" r="2" fill="#6fdef1" />
      <motion.g animate={reduced ? { y: 0 } : mood === "FLUSTERED" ? { x: [0, -2, 2, 0], y: [0, -1, 0] } : { y: [0, -4, 0] }}
        transition={{ duration: mood === "FLUSTERED" ? 0.8 : 4.5, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }}>
        <path d="M99 94C96 60 127 41 166 42c48-4 75 19 77 57l11 85c2 23 13 48 26 60-20 7-40 3-53-6 3 14 11 24 18 32-36 5-57-8-69-21l-17-1c-20 24-51 29-75 23 14-8 20-19 22-33-15 10-35 12-54 6 16-11 25-32 29-57Z"
          fill="url(#hair)" stroke="#b265a4" strokeOpacity=".47" strokeWidth="2" />
        <path d="M79 277c11-26 28-41 62-48l50-1c30 6 53 23 63 49l5 15H73Z" fill="url(#jacket)" stroke="#8f508b" strokeWidth="1.6" />
        <path d="M143 211v20c0 12 11 22 23 22s24-10 24-22v-20Z" fill="url(#skin)" />
        <path d="m128 235 18-9 20 26 21-26 19 8-16 39-24-14-23 14Z" fill="#22142f" stroke="#9a4d91" strokeWidth="1.5" />
        <path d="m166 252-12 8 12 10 12-10Z" fill="#ff528f" /><path d="M92 277l28-22m119 22-28-22" stroke="#f56da9" strokeWidth="2" opacity=".5" />
        <path d="M98 153c-12-10-22-3-20 10 2 11 9 20 24 20m128-30c12-10 23-3 20 10-2 11-9 20-24 20" fill="#eaa1b5" stroke="#934e76" strokeWidth="1.5" />
        <path d="M95 123c2-36 24-58 70-58 46 0 70 25 73 60l-5 44c-2 34-34 64-67 64-30 0-65-30-68-64Z"
          fill="url(#skin)" stroke="#9a557c" strokeWidth="1.8" />
        <path d="M86 139c-7-52 18-88 77-91 65-4 97 33 86 95l-14 30-2-50c-12-9-29-20-36-47-9 27-44 45-63 51l9-16c-16 11-28 19-40 22l-6 38Z"
          fill="url(#hair)" stroke="#b064a7" strokeWidth="1.7" />
        <path d="M100 112c12-35 41-49 67-52m-20 41c20-14 31-26 36-42m22 13c9 22 20 32 35 42M90 176c-1 35-8 55-16 64m170-66c4 37 9 52 19 65"
          fill="none" stroke="#a05299" strokeOpacity=".65" strokeWidth="1.8" strokeLinecap="round" />
        <path d="m214 105 20-9m-15 15 20-9" stroke="#ff91bb" strokeWidth="3.2" strokeLinecap="round" />
        <path d="m228 103 4-8 5 4-2 8Z" fill="#ffd8ea" />
        <path d={face.brows} fill="none" stroke="#6f3b60" strokeWidth="2.1" strokeLinecap="round" />
        <g className="portrait-eyes">
          {[124, 207].map((x) => <g key={x} transform={`translate(${x} 164)`}>
            {mood === "HAPPY"
              ? <path d="M-20 4Q-2-16 19 2" fill="none" stroke="#462038" strokeWidth="3.6" strokeLinecap="round" />
              : <>
                <path d={mood === "TSUNDERE" || mood === "YANDERE" ? "M-21-6Q0-12 20-4 17 13 0 13-16 12-21-6Z" : "M-21-3Q-10-15 1-14 15-13 20-3 17 14 0 14-16 14-21-3Z"}
                  fill="#fff1f4" stroke="#4b253e" strokeWidth="2" />
                <ellipse cx={mood === "THINKING" ? -4 : 1} cy="1" rx="9.5" ry="11.1" fill={face.eyes} />
                <ellipse cx={mood === "THINKING" ? -4 : 1} cy="2" rx="4.1" ry="6.9" fill="#48203d" />
                <circle cx={mood === "THINKING" ? -8 : -3} cy="-3.1" r="3" fill="#fff6fa" />
                <path d="M-23-8l5 3M20-5l4-4" stroke="#4b253e" strokeWidth="2.3" strokeLinecap="round" />
              </>}
          </g>)}
        </g>
        <g opacity={face.blush} fill="#ff5f9a">
          <ellipse cx="118" cy="188" rx="18" ry="8" /><ellipse cx="213" cy="188" rx="18" ry="8" />
          <path d="m112 183-4 8m12-8-4 8m12-8-4 8m82-8-4 8m12-8-4 8m12-8-4 8" fill="none" stroke="#ad345d" strokeWidth="1.1" />
        </g>
        <path d="M164 181l-3 7 4 1" fill="none" stroke="#ba657f" strokeWidth="1.45" strokeLinecap="round" />
        <path d={face.mouth} fill={mood === "TSUNDERE" ? "none" : "#c15c82"} stroke="#8b3b64" strokeWidth="1.8" strokeLinecap="round" />
        {mood === "FLUSTERED" && <path d="M75 111c-11-6 5-14-4-21m183 18c-9-7 7-16 1-22" fill="none" stroke="#ffd5e6" strokeWidth="2" strokeLinecap="round" />}
      </motion.g>
      {(mood === "HAPPY" || mood === "YANDERE") && <motion.path d="m54 119 4 9 9 4-9 3-4 9-3-9-10-3 10-4zm223 57 4 9 9 4-9 3-4 9-3-9-10-3 10-4Z" fill={face.color}
        animate={reduced ? undefined : { opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity }} />}
    </svg>
  );
}

export function RirukaAvatar({ mood, line, onInteract }: {
  mood: Mood; line: string; onInteract: (hold?: boolean) => void;
}) {
  const gesture = useRef<{ id: number; x: number; y: number; timeout: number; held: boolean } | null>(null);
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
    const press = gesture.current;
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 13) cancel();
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const press = gesture.current;
    if (press?.id === event.pointerId && !press.held) onInteract();
    cancel();
  }

  return (
    <div className="avatar" data-mood={mood}>
      <div className="portrait-heading">
        <span><span className="signal-dot" /> آواتار تعاملی</span>
        <span lang="en" dir="ltr">01 / RIRUKA</span>
      </div>
      <button className="portrait-trigger" type="button" aria-label="نوازش سر ریروکا" onPointerDown={start}
        onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onClick={(event) => { if (event.detail === 0) onInteract(); }}
        onContextMenu={(event) => event.preventDefault()}>
        <Portrait mood={mood} />
      </button>
      <div className="avatar-meta">
        <div className="mood-pill"><span className="signal-dot" /> {moodLabels[mood]}</div>
        <div className="portrait-copy" aria-live="polite">{line || "برای دیدن واکنش، آواتار را لمس کن یا نگه دار."}</div>
        <button className="hold-action" type="button" onClick={() => onInteract(true)}>
          {mood === "HAPPY" ? <Sparkles size={14} /> : <Hand size={14} />} واکنش نگه‌داشتن
        </button>
      </div>
    </div>
  );
}
