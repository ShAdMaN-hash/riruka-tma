"use client";

import { useCallback, useEffect, useRef } from "react";

export function useRirukaVoice(enabled: boolean) {
  const audio = useRef<AudioContext | null>(null);

  const play = useCallback((kind: "tap" | "success" | "gift" = "tap", line?: string, force = false) => {
    if (!enabled && !force) return;
    try {
      const context = audio.current ??= new AudioContext();
      if (context.state === "suspended") void context.resume().catch(() => {});
      const now = context.currentTime;
      if (kind === "gift") {
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const osc = context.createOscillator();
          const gain = context.createGain();
          const startAt = now + idx * 0.065;
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, startAt);
          gain.gain.setValueAtTime(0.065, startAt);
          gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.16);
          osc.connect(gain).connect(context.destination);
          osc.start(startAt);
          osc.stop(startAt + 0.17);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        });
      } else {
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(kind === "tap" ? 420 : 580, now);
        oscillator.frequency.exponentialRampToValueAtTime(kind === "tap" ? 275 : 870, now + 0.14);
        volume.gain.setValueAtTime(0.075, now);
        volume.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        oscillator.connect(volume).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.18);
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      }
    } catch {
      // Haptics and visual feedback are independent of audio support.
    }
    if (line && "speechSynthesis" in window) {
      const speech = window.speechSynthesis;
      const voice = speech.getVoices().find(({ lang }) => /^fa(?:-|$)/i.test(lang));
      if (voice) {
        const utterance = new SpeechSynthesisUtterance(line);
        utterance.lang = "fa-IR";
        utterance.voice = voice;
        speech.cancel();
        speech.speak(utterance);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [enabled]);

  useEffect(() => () => {
    void audio.current?.close().catch(() => {});
    audio.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return play;
}
