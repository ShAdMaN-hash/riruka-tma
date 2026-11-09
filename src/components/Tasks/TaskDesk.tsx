"use client";

import { Activity, ArrowDownToLine, ArrowLeft, Braces, Check, ClipboardList, Copy, FileText, Radio, Sparkles, Square } from "lucide-react";
import { useState } from "react";
import { faNumber } from "@/lib/chat";
import { isActive, MAX_TASK_INPUT, taskLabels, taskMarkdown, type Task, type TaskKind } from "@/lib/tasks";
import { SafeMarkdown } from "../Chat/MessageBubble";

const tools = {
  checklist: { title: "چک‌لیست", icon: ClipboardList, summary: "هر خط را به یک کار قابل تیک‌زدن تبدیل کن.", label: "مواردی که می‌خواهی انجام بدهی", example: "مرور فایل‌های درس\nتمرین اسلایدها\nآماده کردن نسخهٔ نهایی ارائه", button: "ساخت چک‌لیست" },
  brief: { title: "مرور یادداشت", icon: FileText, summary: "متن را مرتب کن و جمله‌های اول بندها را جدا ببین.", label: "متنی که می‌خواهی مرتب کنی", example: "برای جلسهٔ بعد باید وضعیت نسخه را مرور کنیم. ابتدا تغییرات رابط را چک کنیم.\n\nبعد از بررسی، مواردی را که به تصمیم نیاز دارند جدا می‌کنیم.", button: "مرتب کردن متن" },
  hermes: { title: "اجرای ایجنت", icon: Braces, summary: "یک کار واقعی به Hermes بسپار و وضعیت اجرا را دنبال کن.", label: "کار، محدوده و نتیجهٔ مورد انتظار", example: "پروژهٔ نمونه‌ای را که در اختیارت گذاشتم بررسی کن و مراحل اجرای آن را در یک گزارش Markdown بنویس.", button: "ارسال کار به Hermes" },
} satisfies Record<TaskKind, { title: string; icon: typeof Activity; summary: string; label: string; example: string; button: string }>;

const toolOrder = ["checklist", "brief", "hermes"] as const;
const formatDate = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function download(task: Task) {
  const url = URL.createObjectURL(new Blob([taskMarkdown(task)], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "riruka-" + task.kind + "-" + task.id.slice(0, 8) + ".md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TaskDetails({ task, canRun, onToggle, onControl }: {
  task: Task; canRun: boolean; onToggle: (task: Task, index: number) => void;
  onControl: (task: Task, action: "status" | "stop") => Promise<void>;
}) {
  const [copy, setCopy] = useState("");
  const [busy, setBusy] = useState(false);
  const completed = task.items.filter((item) => item.checked).length;
  const recoverable = task.ticket || Date.now() - task.at < 20 * 60 * 60 * 1000;
  const content = taskMarkdown(task);
  async function control(action: "status" | "stop") {
    setBusy(true);
    try { await onControl(task, action); }
    finally { setBusy(false); }
  }

  return (
    <article className="task-result">
      <header className="task-result-head">
        <div><div className="task-eyebrow">{tools[task.kind].title}</div><h3>{task.title}</h3></div>
        <span className="task-status" data-status={task.status}>{taskLabels[task.status]}</span>
      </header>
      {task.note && <p className="task-note" aria-live="polite">{task.note}</p>}
      {task.kind === "hermes" && <>
        <p className="task-brief" dir="auto">{task.input}</p>
        {isActive(task.status) && <div className="task-live"><Radio size={15} /> وضعیت از Hermes دریافت می‌شود.</div>}
        <div className="task-controls">
          {task.ticket && isActive(task.status) && task.status !== "stopping" &&
            <button type="button" onClick={() => void control("stop")} disabled={!canRun || busy}><Square size={14} /> درخواست توقف</button>}
          {task.status === "unknown" && recoverable && <button type="button" onClick={() => void control("status")} disabled={!canRun || busy}>
            <Activity size={15} /> بازیابی وضعیت
          </button>}
        </div>
      </>}
      {task.items.length > 0 && <>
        <div className="task-progress">
          <span>{faNumber.format(completed)} از {faNumber.format(task.items.length)} انجام شده</span>
          <progress aria-label="پیشرفت چک‌لیست" value={completed} max={task.items.length} />
        </div>
        <ul className="task-checklist">
          {task.items.map((item, index) => <li key={index}><label data-checked={item.checked}>
            <input type="checkbox" checked={item.checked} onChange={() => onToggle(task, index)} />
            <span dir="auto">{item.text}</span>
          </label></li>)}
        </ul>
      </>}
      {task.output && <div className="task-output" tabIndex={0}><SafeMarkdown content={task.output} /></div>}
      {task.status === "done" && content && <div className="task-controls">
        <button type="button" onClick={() => download(task)}><ArrowDownToLine size={16} /> دریافت Markdown</button>
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(content); setCopy("کپی شد"); }
          catch { setCopy("برای برداشتن خروجی از دریافت Markdown استفاده کن."); }
        }}><Copy size={15} /> کپی خروجی</button>
        <span role="status">{copy}</span>
      </div>}
    </article>
  );
}

export function TaskDesk({ tasks, ready, canRun, onAdd, onControl, onToggle }: {
  tasks: Task[]; ready: boolean; canRun: boolean;
  onAdd: (kind: TaskKind, input: string) => string | undefined;
  onControl: (task: Task, action: "status" | "stop") => Promise<void>;
  onToggle: (task: Task, index: number) => void;
}) {
  const [kind, setKind] = useState<TaskKind>("checklist");
  const [drafts, setDrafts] = useState({ checklist: "", brief: "", hermes: "" });
  const [selection, setSelection] = useState("");
  const active = tasks.find((task) => task.id === selection) ?? tasks[0];
  const spec = tools[kind];
  const liveCount = tasks.filter((task) => isActive(task.status)).length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const setDraft = (value: string) => setDrafts((previous) => ({ ...previous, [kind]: value }));

  return (
    <main className="task-desk">
      <header className="desk-heading">
        <div><div className="task-eyebrow"><Sparkles size={14} /> فضای کار ریروکا</div><h1>میز کار</h1>
          <p>کارهایت را مرتب کن، یک اجرا به ایجنت بسپار و نتیجه را اینجا بردار.</p></div>
        <div className="desk-metrics"><span><Activity size={15} /> {faNumber.format(liveCount)} فعال</span>
          <span><Check size={15} /> {faNumber.format(completed)} انجام‌شده</span></div>
      </header>
      <div className="desk-grid">
        <section className="desk-panel" aria-labelledby="new-task">
          <h2 id="new-task">کار تازه</h2>
          <div className="task-tools" aria-label="نوع کار">
            {toolOrder.map((tool) => {
              const Icon = tools[tool].icon;
              return <button type="button" aria-pressed={kind === tool} key={tool} onClick={() => setKind(tool)}>
                <Icon size={20} /><strong>{tools[tool].title}</strong><span>{tools[tool].summary}</span>
              </button>;
            })}
          </div>
          <form className="task-form" onSubmit={(event) => {
            event.preventDefault();
            const id = onAdd(kind, drafts[kind]);
            if (id) { setSelection(id); setDraft(""); }
          }}>
            <div className="task-input-label"><label htmlFor="task-input">{spec.label}</label>
              <button type="button" onClick={() => setDraft(spec.example)}>نمونه</button></div>
            <textarea id="task-input" rows={5} maxLength={MAX_TASK_INPUT} value={drafts[kind]}
              onChange={(event) => setDraft(event.target.value)} dir="auto" placeholder={spec.example} />
            {kind === "hermes" && <p className="task-note">این مسیر به حساب مجاز تلگرام و پروفایل اجرایی Hermes نیاز دارد. درخواست به سرور تنظیم‌شده ارسال می‌شود.</p>}
            <button type="submit" className="primary-action" disabled={!ready || !drafts[kind].trim() || (kind === "hermes" && (!canRun || liveCount > 0))}>
              {spec.button}<ArrowLeft size={17} />
            </button>
          </form>
        </section>
        <section className="desk-panel desk-history" aria-labelledby="task-history">
          <h2 id="task-history">تابلوی کارها</h2>
          {tasks.length ? <>
            <div className="task-list" aria-label="کارهای اخیر">
              {tasks.map((task) => <button type="button" key={task.id} aria-pressed={active?.id === task.id} onClick={() => setSelection(task.id)}>
                <span>{task.title}</span><small>{taskLabels[task.status]} · {formatDate.format(task.at)}</small>
              </button>)}
            </div>
            {active && <TaskDetails key={active.id} task={active} canRun={canRun} onControl={onControl} onToggle={onToggle} />}
          </> : <div className="desk-empty"><ClipboardList size={28} /><strong>میزت برای کار اول آماده است.</strong>
            <p>از چک‌لیست شروع کن یا یک یادداشت را برای مرتب‌سازی وارد کن.</p></div>}
        </section>
      </div>
    </main>
  );
}
