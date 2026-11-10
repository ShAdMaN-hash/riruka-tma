"use client";

import { CircleCheck, CircleDashed, CirclePause, Radio, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { isActive, type RunControl, type RunDecision, type Task } from "@/lib/tasks";
import { useRunActivity } from "@/hooks/useRunActivity";

const labels = {
  accepted: "شناسهٔ اجرا دریافت شد",
  started: "اجرا شروع شد",
  "tool-start": "ابزار شروع شد",
  "tool-end": "ابزار پایان یافت",
  "tool-error": "ابزار خطا گزارش کرد",
  waiting: "درخواست ورودی از کاربر",
  reviewed: "پاسخ درخواست ثبت شد",
  output: "خروجی آماده شد",
  ended: "اجرا پایان یافت",
};
const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function DecisionCard({ item, enabled, send }: { item: RunControl; enabled: boolean; send: (decision: RunDecision) => Promise<void> }) {
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(decision: RunDecision) {
    if (busy || !enabled) return;
    setBusy(true);
    setError("");
    try { await send(decision); setReview(false); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "پاسخ ثبت نشد."); }
    finally { setBusy(false); }
  }

  return (
    <section className="run-review" aria-label={item.kind === "approval" ? "درخواست اجازهٔ ابزار" : "سؤال ایجنت"}>
      <header><ShieldCheck size={19} /><strong>{item.kind === "approval" ? "Hermes برای این اقدام اجازه می‌خواهد" : "Hermes به توضیح نیاز دارد"}</strong></header>
      <p dir="auto">{item.prompt}</p>
      {item.kind === "approval" ? <div className="task-controls">
        {review ? <>
          <button type="button" className="approve-button" disabled={!enabled || busy} onClick={() => void submit({ control: item, choice: "once" })}>تأیید اجرای همین اقدام</button>
          <button type="button" disabled={busy} onClick={() => setReview(false)}>بازگشت</button>
        </> : <>
          {item.allowOnce && <button type="button" disabled={!enabled || busy} onClick={() => setReview(true)}>اجازه فقط این بار</button>}
          <button type="button" disabled={!enabled || busy} onClick={() => void submit({ control: item, choice: "deny" })}>رد درخواست</button>
        </>}
      </div> : <form className="clarify-form" onSubmit={(event) => {
        event.preventDefault();
        if (answer.trim()) void submit({ control: item, answer: answer.trim() });
      }}>
        <label htmlFor={"clarify-" + item.id}>پاسخ برای Hermes</label>
        <textarea id={"clarify-" + item.id} dir="auto" value={answer} maxLength={1000} rows={2} onChange={(event) => setAnswer(event.target.value)} />
        <button type="submit" className="secondary-action" disabled={!enabled || busy || !answer.trim()}>ارسال توضیح</button>
      </form>}
      {error && <span role="alert">{error}</span>}
    </section>
  );
}

export function RunPanel({ task, visible, initData, canRun, onRespond }: {
  task: Task; visible: boolean; initData: string; canRun: boolean; onRespond: (task: Task, decision: RunDecision) => Promise<void>;
}) {
  const transport = useRunActivity(task, initData, visible);
  const entries = task.activity ?? [];
  const active = isActive(task.status);
  if (!entries.length && !active && !task.controls?.length) return null;
  return (
    <section className="run-panel" aria-label="ردپای اجرا">
      <header className="run-panel-head"><h4>ردپای اجرا</h4><span data-transport={transport}><Radio size={14} />
        {task.kind === "workflow" ? "روی این دستگاه" : active ? transport === "live" ? "رویداد زنده" : transport === "connecting" ? "در حال اتصال" : "پیگیری وضعیت" : "تاریخچه"}
      </span></header>
      {task.controls?.map((item) => <DecisionCard key={item.id + ":" + item.generation} item={item}
        enabled={canRun && task.status === "waiting"} send={(decision) => onRespond(task, decision)} />)}
      {entries.length ? <ol className="run-timeline">
        {[...entries].reverse().map((entry) => {
          const Icon = entry.kind === "waiting" ? CirclePause : entry.kind.startsWith("tool") ? Wrench
            : entry.kind === "output" || entry.kind === "reviewed" ? CircleCheck : CircleDashed;
          return <li key={entry.id} data-kind={entry.kind}>
            <span className="run-glyph"><Icon size={15} /></span>
            <span>{labels[entry.kind]}{entry.detail && <bdi>{entry.detail}</bdi>}</span>
            <time dateTime={new Date(entry.at).toISOString()}>{time.format(entry.at)}</time>
          </li>;
        })}
      </ol> : <p className="task-note">در انتظار اولین رویداد اجرا…</p>}
    </section>
  );
}
