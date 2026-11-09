"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Mood } from "@/lib/chat";
import { makeRig, pose } from "@/lib/portrait-rig";

export function PortraitModel({ mood, glasses, pointer }: {
  mood: Mood; glasses: boolean; pointer: RefObject<[number, number]>;
}) {
  const surface = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLImageElement>(null);
  const target = useRef({ mood, glasses });
  target.current = { mood, glasses };
  const [rigged, setRigged] = useState(false);

  useEffect(() => {
    const canvas = surface.current;
    const texture = art.current;
    if (!canvas || !texture) return;
    let rig: ReturnType<typeof makeRig>;
    let frame = 0;
    let visible = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const blend = [...pose[target.current.mood]];
    const gaze = [0, 0];
    let lens = Number(target.current.glasses);
    let last = 0;
    let reducedKey = "";
    let blinkAt = performance.now() + 2400;

    function draw(now: number) {
      if (!rig) return;
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden || now - last < 31) return;
      const reduced = reduce.matches;
      const current = target.current;
      const key = current.mood + current.glasses;
      if (reduced && reducedKey === key) return;
      reducedKey = reduced ? key : "";
      last = now;
      const desired = pose[current.mood];
      for (let i = 0; i < blend.length; i++) blend[i] += (desired[i] - blend[i]) * (reduced ? 1 : .20);
      const aim = pointer.current;
      gaze[0] += ((reduced ? 0 : aim[0]) - gaze[0]) * (reduced ? 1 : .16);
      gaze[1] += ((reduced ? 0 : aim[1]) - gaze[1]) * (reduced ? 1 : .16);
      lens += (Number(current.glasses) - lens) * (reduced ? 1 : .22);
      const phase = (now - blinkAt) / 185;
      const blink = !reduced && phase >= 0 && phase < 1 ? Math.sin(Math.PI * phase) * 1.48 : 0;
      if (phase >= 1) blinkAt = now + 2600 + Math.random() * 2900;
      rig.draw(blend, gaze, blink, reduced ? 0 : (now % 90000) / 1000, lens, !reduced);
    }

    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    const start = () => {
      if (rig || !texture.naturalWidth) return;
      try {
        rig = makeRig(canvas, texture);
        if (!rig) return;
        rig.draw(blend, gaze, 0, 0, lens, false);
        frame = requestAnimationFrame(draw);
        setRigged(true);
      } catch {
        setRigged(false);
      }
    };
    texture.addEventListener("load", start);
    start();
    return () => {
      observer.disconnect();
      texture.removeEventListener("load", start);
      cancelAnimationFrame(frame);
    };
  }, [pointer]);

  return (
    <span className="portrait-model" data-renderer={rigged ? "mesh" : "layered"} aria-hidden="true">
      {/* Canvas requires the unscaled same-origin alpha texture. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={art} src="/riruka-model.webp" alt="" draggable={false} className="model-texture" />
      <canvas ref={surface} width={640} height={640} className="model-mesh" />
      {!rigged && <svg viewBox="0 0 1000 1000" className="model-fallback" fill="none">
        <g className="fallback-cheeks" fill="#ff4f86"><ellipse cx="414" cy="380" rx="31" ry="12" /><ellipse cx="588" cy="380" rx="31" ry="12" /></g>
        {mood === "ANGRY" && <path d="m402 309 65 20m66 0 65-20M480 461q22-13 44 0" stroke="#74243c" strokeWidth="5" strokeLinecap="round" />}
        {mood === "HAPPY" && <path d="M476 453q26 34 52 0-26 8-52 0Z" fill="#8c284e" stroke="#793047" strokeWidth="2" />}
        {mood === "FLUSTERED" && <ellipse cx="502" cy="455" rx="12" ry="8" fill="#982a53" stroke="#bd5e72" strokeWidth="2" />}
        {mood === "YANDERE" && <path d="M475 455q28 25 55-3" stroke="#903553" strokeWidth="5" strokeLinecap="round" />}
        {mood === "THINKING" && <ellipse cx="502" cy="455" rx="11" ry="4" fill="#8e3b53" />}
        {glasses && <g stroke="#382235" strokeWidth="8"><ellipse cx="425" cy="344" rx="64" ry="48" /><ellipse cx="577" cy="344" rx="64" ry="48" /><path d="M488 332q13-8 26 0" /></g>}
      </svg>}
    </span>
  );
}
