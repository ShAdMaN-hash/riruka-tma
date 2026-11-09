"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shield, Sparkles, Trash2 } from "lucide-react";
import { AffectionBar } from "./Avatar/AffectionBar";
import { RirukaAvatar } from "./Avatar/RirukaAvatar";
import { ChatContainer } from "./Chat/ChatContainer";
import { ChatInput } from "./Chat/ChatInput";
import { QuickActions } from "./Chat/QuickActions";
import { Header } from "./Common/Header";
import { useChatStream } from "@/hooks/useChatStream";
import { useRirukaVoice } from "@/hooks/useRirukaVoice";
import { useTelegram, useTelegramDialog } from "@/hooks/useTelegram";
import { badges, type Reaction } from "@/lib/chat";
import { useRirukaStore } from "@/store/useRirukaStore";

const touch = {
  first: { mood: "TSUNDERE", line: "هوی! اول بگو می‌خوای سرمو نوازش کنی، باکا!" },
  second: { mood: "FLUSTERED", line: "هومف… اگه دستای تو باشه شادمان، بدم هم نمیاد…" },
  hold: { mood: "YANDERE", line: "هومف… داری نازمو می‌کشی، شادمان؟ خب، همین یه بار اجازه داری." },
} as const;

export default function RirukaApp() {
  const telegram = useTelegram();
  const { success: hapticSuccess } = telegram;
  const state = useRirukaStore();
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<Reaction>("TSUNDERE");
  const [line, setLine] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastTap = useRef(0);
  const lastReaction = useRef(0);
  const priorAffection = useRef(0);
  const play = useRirukaVoice(state.sound);
  const finish = useCallback((nextMood: Reaction) => {
    setMood(nextMood);
    setLine("");
    play("success");
  }, [play]);
  const { reply, source, send, cancel, resetSource, streaming } = useChatStream(telegram.initData, finish);
  const activeProfile = telegram.ready && state.profile === telegram.profile;

  useEffect(() => {
    if (!telegram.ready || state.profile === telegram.profile) return;
    cancel(true);
    resetSource();
    state.openProfile(telegram.profile);
    priorAffection.current = useRirukaStore.getState().affection;
    lastTap.current = 0;
    lastReaction.current = 0;
    setLine("");
    setMood("TSUNDERE");
    setDraft("");
  }, [telegram.ready, telegram.profile, state.profile, state.openProfile, cancel, resetSource]);

  useEffect(() => {
    if (state.affection > priorAffection.current) {
      const badge = [...badges].reverse().find(({ at }) => at <= state.affection && at > priorAffection.current);
      if (badge) setLine(badge.line);
    }
    priorAffection.current = state.affection;
  }, [state.affection]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const clear = useCallback(() => {
    cancel(true);
    resetSource();
    useRirukaStore.getState().clearChat();
    setDraft("");
    setMood("TSUNDERE");
    setLine("");
    setDialogOpen(false);
    lastTap.current = 0;
    hapticSuccess();
  }, [cancel, resetSource, hapticSuccess]);

  useTelegramDialog(telegram.app, dialogOpen, closeDialog, clear);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialogOpen && dialog && !dialog.open) dialog.showModal();
    else if (!dialogOpen && dialog?.open) dialog.close();
  }, [dialogOpen]);

  function interact(hold = false) {
    if (!activeProfile) return;
    const now = Date.now();
    if (now - lastReaction.current < 180) return;
    const reaction = hold ? touch.hold : lastTap.current && now - lastTap.current <= 3000 ? touch.second : touch.first;
    lastTap.current = reaction === touch.first ? now : 0;
    lastReaction.current = now;
    setLine(reaction.line);
    setMood(reaction.mood);
    state.addAffection(hold ? 2 : 1);
    telegram.impact(hold);
    play("tap", reaction.line);
  }

  return (
    <div className="app-shell">
      <Header name={telegram.name} source={source} sound={state.sound} streaming={streaming} onSound={() => {
        if (!activeProfile) return;
        if (!state.sound) play("tap", undefined, true);
        state.toggleSound();
      }} />
      <main className="workspace">
        <aside className="avatar-card" aria-label="پنل ریروکا">
          <RirukaAvatar mood={streaming ? "THINKING" : mood} line={line} onInteract={interact} />
          <AffectionBar value={activeProfile ? state.affection : 0} />
        </aside>
        <ChatContainer name={telegram.name} messages={activeProfile ? state.messages : []}
          profile={activeProfile ? state.profile : null} sessionId={activeProfile ? state.sessionId : ""}
          reply={activeProfile ? reply : null} onRetry={() => void send()}>
          <QuickActions onPat={() => interact()} onSend={(text) => void send(text)}
            onCode={() => {
              setDraft((value) => value || "می‌تونی برای این مسئلهٔ برنامه‌نویسی کمکم کنی؟ ");
              inputRef.current?.focus();
            }} onClear={() => setDialogOpen(true)} disabled={!activeProfile || streaming} />
          <ChatInput value={draft} onChange={setDraft} onSend={() => {
            void send(draft);
            setDraft("");
          }} onStop={() => cancel()} streaming={streaming} ready={activeProfile} inputRef={inputRef} />
          <div className="chat-caption">
            <Shield size={13} aria-hidden="true" />
            {source === "mock" ? "حالت آزمایشی از پاسخ‌های آماده استفاده می‌کند." : "گفت‌وگو در همین دستگاه ذخیره می‌شود."}
          </div>
        </ChatContainer>
      </main>
      <footer className="shell-footer"><Sparkles size={13} /> همراه خیالی شادمان <span lang="en" dir="ltr">RIRUKA · 01</span></footer>
      <dialog ref={dialogRef} onCancel={closeDialog} onClose={closeDialog} className="clear-dialog" aria-labelledby="clear-title" aria-describedby="clear-description">
        <div className="dialog-icon"><Trash2 size={22} /></div>
        <h2 id="clear-title">گفت‌وگو پاک شود؟</h2>
        <p id="clear-description">پیام‌ها از همین دستگاه پاک می‌شوند و گفت‌وگوی تازه شروع می‌شود. نگه‌داری داده‌ها در Hermes به تنظیمات سرور بستگی دارد.</p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={closeDialog}>انصراف</button>
          <button type="button" className="danger" onClick={clear}>پاک کردن گفت‌وگو</button>
        </div>
      </dialog>
    </div>
  );
}
