"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, ClipboardList, Gift, MessagesSquare, Shield, Sparkles, Trash2 } from "lucide-react";
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
import { badges, faNumber, gifts, moodLabels, moods, type GiftId, type Mood, type Reaction } from "@/lib/chat";
import { isActive, taskProgress, taskPromptForChat, type Task } from "@/lib/tasks";
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
type View = typeof views[number]["id"];

function viewFromLocation(): View {
  const section = new URLSearchParams(location.search).get("view");
  return views.find(({ id }) => id === section)?.id ?? "studio";
}

export default function RirukaApp() {
  const telegram = useTelegram();
  const { success: hapticSuccess } = telegram;
  const state = useRirukaStore();
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<Mood>("TSUNDERE");
  const [view, setCurrentView] = useState<View>("studio");
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
  const desk = useTasks(activeProfile ? state.profile : null, telegram.initData, view === "tasks");

  useEffect(() => {
    const restore = () => setCurrentView(viewFromLocation());
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function setView(next: View) {
    setCurrentView(next);
    const url = new URL(location.href);
    if (next === "studio") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (url.href !== location.href) window.history.replaceState(window.history.state, "", url);
  }

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

  function giveGift(giftId: GiftId) {
    if (!activeProfile) return;
    const item = gifts.find((g) => g.id === giftId);
    if (!item) return;
    setLine(item.line);
    setMood(item.mood);
    state.addAffection(item.points);
    telegram.impact(true);
    play("gift", item.line);
  }

  function discussTask(task: Task) {
    setView("chat");
    const prompt = taskPromptForChat(task);
    void send(prompt);
  }

  const avatar = <aside className="avatar-card" aria-label="پنل ریروکا">
    <RirukaAvatar mood={view === "chat" && streaming ? "THINKING" : mood} line={line}
      glasses={activeProfile && state.glasses} aura={activeProfile && state.aura}
      onGlasses={() => { if (activeProfile) state.toggleGlasses(); }}
      onAura={() => { if (activeProfile) state.toggleAura(); }}
      onInteract={interact} />
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
  const doneCount = desk.tasks.filter((task) => taskProgress(task) === "done").length;
  const openCount = desk.tasks.filter((task) => taskProgress(task) === "open").length;
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
        <span className="experience-version" lang="en" dir="ltr">RIRUKA · V3 STUDIO</span>
      </nav>
      {view === "studio" && <main className="studio-workspace">
        {avatar}
        <section className="studio-panel">
          <div className="studio-intro">
            <div className="studio-kicker"><span /> استودیوی ریروکا · نسخهٔ ۳.۰</div>
            <h1>سلام، <bdi>{telegram.name}</bdi>.</h1>
            <p>یه حالت برای من انتخاب کن، بهم هدیه بده یا بگو امروز چه کاری رو با هم جلو ببریم.</p>
            <div className="studio-actions">
              <button className="primary-action" type="button" onClick={() => setView("tasks")}><ClipboardList size={18} /> باز کردن میز کار <ArrowLeft size={17} /></button>
              <button className="secondary-action" type="button" onClick={() => setView("chat")}><MessagesSquare size={18} /> گفت‌وگو</button>
            </div>
            <div className="gift-bar" aria-label="هدیه‌های ریروکا">
              <span className="gift-label"><Gift size={14} /> هدیه به ریروکا:</span>
              {gifts.map((item) => (
                <button key={item.id} type="button" className="gift-chip" onClick={() => giveGift(item.id)}>
                  <span>{item.label}</span>
                  <small>+{faNumber.format(item.points)}</small>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="studio-activity" onClick={() => setView("tasks")}>
            <span className="activity-icon"><CircleCheck size={21} /></span>
            <span><strong>کارهای من</strong><small>{faNumber.format(doneCount)} انجام‌شده · {faNumber.format(openCount)} در جریان</small></span>
            <ArrowLeft size={17} />
          </button>
        </section>
      </main>}
      <TaskDesk key={state.profile ?? "loading"} tasks={desk.tasks} visible={view === "tasks"} ready={activeProfile} initData={telegram.initData}
        access={desk.access} onRecheck={desk.recheck} onAdd={desk.add} onAddItem={desk.addItem}
        onRemoveItem={desk.removeItem} onToggleAll={desk.toggleAll} onClearChecked={desk.clearChecked}
        onTogglePin={desk.togglePin} onDiscuss={discussTask}
        onControl={desk.control} onToggle={desk.toggle}
        onStart={desk.start} onRespond={desk.respond} onRemove={desk.remove} onEdit={desk.editDraft} />
      {view === "chat" && <main className="workspace">
        {avatar}
        <ChatContainer name={telegram.name} messages={activeProfile ? state.messages : []}
          profile={activeProfile ? state.profile : null} sessionId={activeProfile ? state.sessionId : ""}
          reply={activeProfile ? reply : null} onRetry={() => void send()}
          onRemoveMessage={(id) => state.removeMessage(id)}>
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
      <footer className="shell-footer"><Sparkles size={13} /> فضای شخصی شادمان <span lang="en" dir="ltr">RIRUKA · 3.0</span></footer>
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
