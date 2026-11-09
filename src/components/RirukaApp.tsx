"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, ClipboardList, MessagesSquare, Shield, Sparkles, Trash2 } from "lucide-react";
import { AffectionBar } from "./Avatar/AffectionBar";
import { RirukaAvatar } from "./Avatar/RirukaAvatar";
import { ChatContainer } from "./Chat/ChatContainer";
import { ChatInput } from "./Chat/ChatInput";
import { QuickActions } from "./Chat/QuickActions";
import { Header } from "./Common/Header";
import { TaskDesk } from "./Tasks/TaskDesk";
import { useChatStream } from "@/hooks/useChatStream";
import { useRirukaVoice } from "@/hooks/useRirukaVoice";
import { useTasks } from "@/hooks/useTasks";
import { useTelegram, useTelegramDialog } from "@/hooks/useTelegram";
import { badges, faNumber, moodLabels, moods, type Mood, type Reaction } from "@/lib/chat";
import { isActive } from "@/lib/tasks";
import { useRirukaStore } from "@/store/useRirukaStore";

const touch = {
  first: { mood: "TSUNDERE", line: "هوی! اول بگو می‌خوای سرمو نوازش کنی، باکا!" },
  second: { mood: "FLUSTERED", line: "هومف… اگه دستای تو باشه شادمان، بدم هم نمیاد…" },
  hold: { mood: "YANDERE", line: "هومف… داری نازمو می‌کشی، شادمان؟ خب، همین یه بار اجازه داری." },
} as const;

const views = [
  { id: "studio", label: "استودیوی ریروکا", icon: Sparkles },
  { id: "tasks", label: "میز کار", icon: ClipboardList },
  { id: "chat", label: "گفت‌وگو", icon: MessagesSquare },
] as const;

export default function RirukaApp() {
  const telegram = useTelegram();
  const { success: hapticSuccess } = telegram;
  const state = useRirukaStore();
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<Mood>("TSUNDERE");
  const [view, setView] = useState<typeof views[number]["id"]>("studio");
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
  const desk = useTasks(activeProfile ? state.profile : null, telegram.initData);

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

  const avatar = <aside className="avatar-card" aria-label="پنل ریروکا">
    <RirukaAvatar mood={view === "chat" && streaming ? "THINKING" : mood} line={line}
      glasses={activeProfile && state.glasses} onGlasses={() => { if (activeProfile) state.toggleGlasses(); }} onInteract={interact} />
    {view === "studio" && <section className="mood-studio" aria-labelledby="mood-title">
      <div className="studio-section-title"><Sparkles size={19} /><div><h2 id="mood-title">حالت‌های چهره</h2><p>حالت را عوض کن و حرکت چهره را ببین.</p></div></div>
      <div className="mood-grid">
        {moods.map((choice) => <button type="button" key={choice} data-choice={choice}
          aria-pressed={choice === mood} onClick={() => { setMood(choice); setLine(""); telegram.impact(); }}>
          <span className="mood-sample" aria-hidden="true" />{moodLabels[choice]}
        </button>)}
      </div>
    </section>}
    <AffectionBar value={activeProfile ? state.affection : 0} />
  </aside>;
  const doneCount = desk.tasks.filter(({ status }) => status === "done").length;
  const activeCount = desk.tasks.filter(({ status }) => isActive(status)).length;

  return (
    <div className="app-shell" data-view={view}>
      <Header name={telegram.name} source={source} sound={state.sound} streaming={streaming} onSound={() => {
        if (!activeProfile) return;
        if (!state.sound) play("tap", undefined, true);
        state.toggleSound();
      }} />
      <nav className="experience-nav" aria-label="بخش‌های مینی‌اپ">
        {views.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>
          <Icon size={17} aria-hidden="true" />{label}
          {(id === "tasks" && activeCount > 0 || id === "chat" && streaming) && <span className="nav-activity" aria-label="در حال اجرا" />}
        </button>)}
        <span className="experience-version" lang="en" dir="ltr">RIRUKA · STUDIO</span>
      </nav>
      {view === "studio" && <main className="studio-workspace">
        {avatar}
        <section className="studio-panel">
          <div className="studio-intro">
            <div className="studio-kicker"><span /> استودیوی ریروکا</div>
            <h1>سلام، <bdi>{telegram.name}</bdi>.</h1>
            <p>یه حالت برای من انتخاب کن یا بگو امروز چه کاری رو با هم جلو ببریم.</p>
            <div className="studio-actions">
              <button className="primary-action" type="button" onClick={() => setView("tasks")}><ClipboardList size={18} /> باز کردن میز کار <ArrowLeft size={17} /></button>
              <button className="secondary-action" type="button" onClick={() => setView("chat")}><MessagesSquare size={18} /> گفت‌وگو</button>
            </div>
          </div>
          <button type="button" className="studio-activity" onClick={() => setView("tasks")}>
            <span className="activity-icon"><CircleCheck size={21} /></span>
            <span><strong>کارهای من</strong><small>{faNumber.format(doneCount)} انجام‌شده · {faNumber.format(activeCount)} در جریان</small></span>
            <ArrowLeft size={17} />
          </button>
        </section>
      </main>}
      {view === "tasks" && <TaskDesk key={state.profile ?? "loading"} tasks={desk.tasks} ready={activeProfile}
        canRun={desk.canRun} onAdd={desk.add} onControl={desk.control} onToggle={desk.toggle} />}
      {view === "chat" && <main className="workspace">
        {avatar}
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
      </main>}
      <footer className="shell-footer"><Sparkles size={13} /> همراه خیالی شادمان <span lang="en" dir="ltr">RIRUKA · 02</span></footer>
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
