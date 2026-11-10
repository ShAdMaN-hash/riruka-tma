"use client";

import { Activity, ArrowDownToLine, ArrowLeft, Braces, Check, CheckCheck, ClipboardList, Copy, FileText, Layers3, MessageSquareShare, PencilLine, Pin, Play, Plus, Radio, RefreshCw, Search, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskAccess } from "@/hooks/useTasks";
import { faNumber } from "@/lib/chat";
import { CHECKLIST_ITEM_LIMIT, CHECKLIST_LIMIT, isActive, matchesTask, MAX_TASK_INPUT, TASK_LIMIT, taskMarkdown, taskProgress, taskStatusLabel, type RunDecision, type Task, type TaskKind } from "@/lib/tasks";
import { SafeMarkdown } from "../Chat/MessageBubble";
import { RunPanel } from "./RunPanel";

const tools = {
  checklist: { title: "چک‌لیست", icon: ClipboardList, summary: "هر خط را به یک کار قابل تیک‌زدن تبدیل کن.", label: "مواردی که می‌خواهی انجام بدهی", example: "مرور فایل‌های درس\nتمرین اسلایدها\nآماده کردن نسخهٔ نهایی ارائه", button: "ساخت چک‌لیست" },
  brief: { title: "مرور یادداشت", icon: FileText, summary: "متن را مرتب کن و جمله‌های اول بندها را جدا ببین.", label: "متنی که می‌خواهی مرتب کنی", example: "برای جلسهٔ بعد باید وضعیت نسخه را مرور کنیم. ابتدا تغییرات رابط را چک کنیم.\n\nبعد از بررسی، مواردی را که به تصمیم نیاز دارند جدا می‌کنیم.", button: "مرتب کردن متن" },
  workflow: { title: "یادداشت تا اقدام", icon: Layers3, summary: "یادداشت را به خلاصه و چک‌لیست اقدام تبدیل کن.", label: "یادداشت و اقدام‌ها", example: "جلسهٔ هماهنگی انتشار\n\nتیم تصمیم گرفت ابتدا نسخهٔ موبایل و مسیر ورود تلگرام را بررسی کند.\n\n- تست مسیر ورود در موبایل\nاقدام: مرور خطاهای بیلد\n- آماده کردن یادداشت انتشار", button: "استخراج اقدام‌ها" },
  hermes: { title: "مأموریت Hermes", icon: Braces, summary: "دستور را ذخیره کن، سپس اجرای واقعی را شروع کن.", label: "هدف، محدوده و خروجی مورد انتظار", example: "هدف: بررسی یک پروژهٔ نمونه\nمحدوده: فقط فایل‌های پوشهٔ پروژه را بخوان.\nخروجی: دستورهای اجرا و مواردی که نیاز به بررسی دارند، در Markdown.", button: "ذخیره در صف" },
} satisfies Record<TaskKind, { title: string; icon: typeof Activity; summary: string; label: string; example: string; button: string }>;

const toolOrder = ["workflow", "hermes", "checklist", "brief"] as const;
const formatDate = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const filters = [
  ["all", "همه"], ["draft", "صف"], ["open", "در جریان"], ["done", "انجام‌شده"], ["attention", "نیازمند بررسی"],
] as const;
type Filter = typeof filters[number][0];
const accessLabels: Record<TaskAccess, string> = {
  checking: "در حال بررسی امکان اجرای Hermes…",
  ready: "اجرای Hermes برای این حساب فعال است.",
  unconfigured: "اجرای Hermes هنوز روی سرور تنظیم نشده است.",
  telegram: "برای اجرای Hermes، ریروکا را از داخل بات تلگرام باز کن.",
  expired: "برای تازه‌کردن نشست، ریروکا را دوباره از داخل تلگرام باز کن.",
  denied: "این حساب تلگرام مجوز اجرای Hermes را ندارد.",
  unreachable: "وضعیت دسترسی در دسترس نیست. دوباره بررسی کن.",
};

function download(task: Task) {
  const url = URL.createObjectURL(new Blob([taskMarkdown(task)], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "riruka-" + task.kind + "-" + task.id.slice(0, 8) + ".md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TaskDetails({ task, visible, initData, canRun, activeRun, onToggle, onAddItem, onRemoveItem, onToggleAll, onClearChecked, onTogglePin, onDiscuss, onControl, onStart, onRespond, onRemove, onEdit }: {
  task: Task; visible: boolean; initData: string; canRun: boolean; activeRun: boolean;
  onToggle: (task: Task, index: number) => void;
  onAddItem: (task: Task, text: string) => void;
  onRemoveItem?: (task: Task, index: number) => void;
  onToggleAll?: (task: Task) => void;
  onClearChecked?: (task: Task) => void;
  onTogglePin?: (task: Task) => void;
  onDiscuss?: (task: Task) => void;
  onControl: (task: Task, action: "status" | "stop") => Promise<void>;
  onStart: (task: Task) => Promise<void>;
  onRespond: (task: Task, decision: RunDecision) => Promise<void>;
  onRemove: (task: Task) => void;
  onEdit: (task: Task, text: string) => void;
}) {
  const [copy, setCopy] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const completed = task.items.filter((item) => item.checked).length;
  const allChecked = task.items.length > 0 && completed === task.items.length;
  const recoverable = task.ticket || Date.now() - (task.startedAt ?? task.at) < 20 * 60 * 60 * 1000;
  const content = taskMarkdown(task);
  async function control(action: "status" | "stop") {
    setBusy(true);
    try { await onControl(task, action); }
    finally { setBusy(false); }
  }

  return (
    <article className="task-result">
      <header className="task-result-head">
        <div>
          <div className="task-eyebrow">
            {tools[task.kind].title}
            {task.pinned && <span className="pinned-badge"><Pin size={11} /> سنجاق‌شده</span>}
          </div>
          <h3>{task.title}</h3>
        </div>
        <div className="task-head-actions">
          {onTogglePin && (
            <button
              type="button"
              className="pin-button"
              aria-pressed={ Boolean(task.pinned) }
              onClick={() => onTogglePin(task)}
              title={task.pinned ? "برداشتن سنجاق" : "سنجاق کردن در بالای فهرست"}
            >
              <Pin size={14} />
              <span>{task.pinned ? "سنجاق‌شده" : "سنجاق"}</span>
            </button>
          )}
          <span className="task-status" data-status={taskProgress(task)}>{taskStatusLabel(task)}</span>
        </div>
      </header>
      {task.note && <p className="task-note" aria-live="polite">{task.note}</p>}
      {task.kind === "hermes" && <>
        {editing !== null && task.status === "draft" ? <form className="clarify-form" onSubmit={(event) => {
          event.preventDefault();
          if (!editing.trim()) return;
          onEdit(task, editing);
          setEditing(null);
        }}>
          <label htmlFor="mission-edit">ویرایش دستور مأموریت</label>
          <textarea id="mission-edit" dir="auto" value={editing} rows={4} maxLength={MAX_TASK_INPUT} onChange={(event) => setEditing(event.target.value)} />
          <div className="task-controls"><button type="submit" disabled={!editing.trim()}>ذخیرهٔ تغییرات</button><button type="button" onClick={() => setEditing(null)}>انصراف</button></div>
        </form> : <p className="task-brief" dir="auto">{task.input}</p>}
        {task.status === "draft" && editing === null && <div className="task-controls">
          <button type="button" className="launch-button" onClick={() => void onStart(task)} disabled={!canRun || activeRun}><Play size={15} /> شروع مأموریت</button>
          <button type="button" onClick={() => setEditing(task.input)}><PencilLine size={15} /> ویرایش</button>
          {!canRun && <span>شروع اجرا به حساب مجاز و اتصال Hermes نیاز دارد.</span>}
        </div>}
        <div className="task-controls">
          {task.ticket && isActive(task.status) && task.status !== "stopping" &&
            <button type="button" onClick={() => void control("stop")} disabled={!canRun || busy}><Square size={14} /> درخواست توقف</button>}
          {task.status === "unknown" && recoverable && <button type="button" onClick={() => void control("status")} disabled={!canRun || busy || (!task.ticket && activeRun)}>
            <Activity size={15} /> بازیابی وضعیت
          </button>}
        </div>
      </>}
      {task.items.length > 0 && <>
        <div className="task-progress">
          <div className="task-progress-row">
            <span>{faNumber.format(completed)} از {faNumber.format(task.items.length)} انجام شده</span>
            <div className="checklist-bulk-actions">
              {onToggleAll && (
                <button type="button" onClick={() => onToggleAll(task)}>
                  <CheckCheck size={13} /> {allChecked ? "لغو تیک همه" : "تیک زدن همه"}
                </button>
              )}
              {onClearChecked && completed > 0 && (
                <button type="button" onClick={() => onClearChecked(task)}>
                  <Trash2 size={13} /> پاکسازی انجام‌شده‌ها
                </button>
              )}
            </div>
          </div>
          <progress aria-label="پیشرفت چک‌لیست" value={completed} max={task.items.length} />
        </div>
        <ul className="task-checklist">
          {task.items.map((item, index) => <li key={index} className="checklist-row">
            <label data-checked={item.checked}>
              <input type="checkbox" checked={item.checked} onChange={() => onToggle(task, index)} />
              <span dir="auto">{item.text}</span>
            </label>
            {onRemoveItem && (
              <button
                type="button"
                className="item-remove-btn"
                aria-label="حذف این مورد"
                title="حذف این مورد"
                onClick={() => onRemoveItem(task, index)}
              >
                <X size={14} />
              </button>
            )}
          </li>)}
        </ul>
      </>}
      {(task.kind === "checklist" || task.kind === "workflow") && task.items.length < CHECKLIST_LIMIT &&
        <form className="task-add-item" onSubmit={(event) => {
          event.preventDefault();
          if (!itemDraft.trim()) return;
          onAddItem(task, itemDraft);
          setItemDraft("");
        }}>
          <label className="sr-only" htmlFor="checklist-item">مورد تازهٔ چک‌لیست</label>
          <input id="checklist-item" type="text" dir="auto" value={itemDraft} maxLength={CHECKLIST_ITEM_LIMIT}
            onChange={(event) => setItemDraft(event.target.value)} placeholder="یک مورد دیگر اضافه کن…" />
          <button type="submit" disabled={!itemDraft.trim()}><Plus size={16} /> افزودن مورد</button>
        </form>}
      {task.output && <div className="task-output" tabIndex={0}><SafeMarkdown content={task.output} /></div>}
      <RunPanel task={task} visible={visible} initData={initData} canRun={canRun} onRespond={onRespond} />
      <div className="task-controls">
        {task.status === "done" && content && <>
          <button type="button" onClick={() => download(task)}><ArrowDownToLine size={16} /> دریافت Markdown</button>
          <button type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(content); setCopy("کپی شد"); }
            catch { setCopy("برای برداشتن خروجی از دریافت Markdown استفاده کن."); }
          }}><Copy size={15} /> کپی خروجی</button>
        </>}
        {onDiscuss && (
          <button type="button" onClick={() => onDiscuss(task)}>
            <MessageSquareShare size={15} /> مشورت با ریروکا
          </button>
        )}
        <span role="status">{copy}</span>
      </div>
      {!isActive(task.status) && task.status !== "unknown" && <div className="task-remove">
        {remove ? <>
          <span>این مورد از تابلوی همین دستگاه پاک می‌شود.</span>
          <button type="button" onClick={() => onRemove(task)}>تأیید حذف</button>
          <button type="button" onClick={() => setRemove(false)}>انصراف</button>
        </> : <button type="button" onClick={() => setRemove(true)}><Trash2 size={15} /> حذف از تابلو</button>}
      </div>}
    </article>
  );
}

export function TaskDesk({ tasks, visible, ready, initData, access, onRecheck, onAdd, onAddItem, onRemoveItem, onToggleAll, onClearChecked, onTogglePin, onDiscuss, onControl, onToggle, onStart, onRespond, onRemove, onEdit }: {
  tasks: Task[]; visible: boolean; ready: boolean; initData: string; access: TaskAccess;
  onRecheck: () => void;
  onAdd: (kind: TaskKind, input: string) => string | undefined;
  onAddItem: (task: Task, text: string) => void;
  onRemoveItem?: (task: Task, index: number) => void;
  onToggleAll?: (task: Task) => void;
  onClearChecked?: (task: Task) => void;
  onTogglePin?: (task: Task) => void;
  onDiscuss?: (task: Task) => void;
  onControl: (task: Task, action: "status" | "stop") => Promise<void>;
  onToggle: (task: Task, index: number) => void;
  onStart: (task: Task) => Promise<void>;
  onRespond: (task: Task, decision: RunDecision) => Promise<void>;
  onRemove: (task: Task) => void;
  onEdit: (task: Task, text: string) => void;
}) {
  const [kind, setKind] = useState<TaskKind>("workflow");
  const [drafts, setDrafts] = useState({ checklist: "", brief: "", workflow: "", hermes: "" });
  const currentDrafts = useRef(drafts);
  currentDrafts.current = drafts;
  const [selection, setSelection] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [importNote, setImportNote] = useState("");
  const result = useRef<HTMLDivElement>(null);
  const jumpToResult = useRef(false);
  const filtered = tasks.filter((task) => (filter === "all" || taskProgress(task) === filter) && matchesTask(task, search));
  const active = filtered.find((task) => task.id === selection) ?? filtered[0];
  const spec = tools[kind];
  const liveCount = tasks.filter((task) => isActive(task.status)).length;
  const open = tasks.filter((task) => taskProgress(task) === "open").length;
  const completed = tasks.filter((task) => taskProgress(task) === "done").length;
  const staged = tasks.filter((task) => task.status === "draft").length;
  const canRun = access === "ready";
  const full = tasks.length >= TASK_LIMIT;
  const canSubmit = ready && !!drafts[kind].trim() && !full;
  const setDraft = (value: string) => setDrafts((previous) => ({ ...previous, [kind]: value }));

  function revealResult() {
    const card = result.current;
    const desk = card?.closest("main");
    if (!card || !desk) return;
    card.focus({ preventScroll: true });
    const top = card.getBoundingClientRect().top;
    const viewport = desk.getBoundingClientRect();
    if (top < viewport.top || top + 56 > viewport.bottom) card.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    if (!visible || !active || !jumpToResult.current) return;
    jumpToResult.current = false;
    revealResult();
  }, [visible, active?.id, selection]);

  return (
    <main className="task-desk" hidden={!visible}>
      <header className="desk-heading">
        <div><div className="task-eyebrow"><span className="desk-index" dir="ltr">02</span> فضای شخصی ریروکا</div><h1>میز مأموریت</h1>
          <p>دستور را آماده کن، اجرا را دنبال کن و خروجی را بردار.</p></div>
        <div className="desk-metrics">
          <span><Layers3 size={16} /><b>{faNumber.format(staged)}</b> در صف</span>
          <span><Activity size={16} /><b>{faNumber.format(open)}</b> در جریان</span>
          <span><Check size={16} /><b>{faNumber.format(completed)}</b> انجام‌شده</span></div>
      </header>
      <div className="desk-grid">
        <section className="desk-panel" aria-labelledby="new-task">
          <div className="desk-section-head"><h2 id="new-task">کار تازه</h2><span dir="ltr">COMPOSE</span></div>
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
            if (!canSubmit) return;
            const id = onAdd(kind, drafts[kind]);
            if (id) {
              jumpToResult.current = true;
              setSelection(id);
              setFilter("all");
              setSearch("");
              setDraft("");
            }
          }}>
            <div className="task-input-label"><label htmlFor="task-input">{spec.label}</label>
              <div className="task-input-actions">
                <label className="task-file" title="افزودن فایل متنی به پیش‌نویس"><Upload size={15} aria-hidden="true" /><span>ورود متن</span>
                  <input type="file" aria-label="ورود فایل متنی" accept=".txt,.md,text/plain,text/markdown" disabled={!ready} onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    if (!/\.(txt|md)$/i.test(file.name) || file.size > 20000) {
                      setImportNote("یک فایل متنی TXT یا Markdown تا ۲۰ کیلوبایت انتخاب کن.");
                      return;
                    }
                    try {
                      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).trim();
                      const existing = currentDrafts.current[kind].trim();
                      const merged = [existing, text].filter(Boolean).join("\n\n");
                      if (!text || merged.length > MAX_TASK_INPUT) {
                        setImportNote("فایل خالی است یا مجموع متن بیش از ۵٬۰۰۰ نویسه می‌شود.");
                        return;
                      }
                      setDraft(merged);
                      setImportNote("متن به پیش‌نویس اضافه شد.");
                    } catch { setImportNote("فایل متنی UTF-8 قابل خواندن نیست."); }
                  }} />
                </label>
                <button type="button" disabled={!ready || !!drafts[kind].trim()} onClick={() => setDraft(spec.example)}>نمونه</button>
              </div>
            </div>
            <textarea id="task-input" rows={5} maxLength={MAX_TASK_INPUT} value={drafts[kind]}
              onChange={(event) => setDraft(event.target.value)} dir="auto" placeholder={spec.example} disabled={!ready} />
            {importNote && <p className="task-note" role="status">{importNote}</p>}
            {kind === "hermes" && <div className="task-access" data-access={access}>
              <Radio size={16} aria-hidden="true" />
              <p className="task-note" role="status">{accessLabels[access]}{canRun && liveCount > 0 && " یک اجرا در جریان است."}</p>
              {(access === "unreachable" || access === "unconfigured") &&
                <button type="button" onClick={onRecheck} aria-label="بررسی دوبارهٔ دسترسی Hermes"><RefreshCw size={15} /></button>}
            </div>}
            <button type="submit" className="primary-action" disabled={!canSubmit}>
              {spec.button}<ArrowLeft size={17} />
            </button>
            {full && <p className="task-note" role="status">تابلو پر است. برای ثبت کار تازه، یکی از کارهای پایان‌یافته یا پیش‌نویس‌ها را حذف کن.</p>}
          </form>
        </section>
        <section className="desk-panel desk-history" aria-labelledby="task-history">
          <div className="desk-section-head"><h2 id="task-history">تابلوی کارها</h2><span dir="ltr">{tasks.length.toString().padStart(2, "0")} / {TASK_LIMIT}</span></div>
          {tasks.length ? <>
            <label className="task-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">جست‌وجوی کارها</span>
              <input type="search" dir="auto" value={search} maxLength={100} placeholder="جست‌وجو در کارها…" onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="task-filters" role="group" aria-label="فیلتر وضعیت">
              {filters.map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
            {!!filtered.length && <div className="task-list" aria-label="کارهای اخیر">
              {filtered.map((task) => <button type="button" key={task.id} aria-pressed={active?.id === task.id} onClick={() => {
                if (active?.id === task.id) {
                  revealResult();
                } else {
                  jumpToResult.current = true;
                  setSelection(task.id);
                }
              }}>
                <span dir="auto">{task.pinned ? "📌 " : ""}{task.title}</span><small>{taskStatusLabel(task)} · {formatDate.format(task.at)}</small>
              </button>)}
            </div>}
            {active ? <div ref={result} tabIndex={-1} className="task-selected">
              <TaskDetails key={active.id} task={active} visible={visible} initData={initData} canRun={canRun} activeRun={liveCount > 0}
                onControl={onControl} onToggle={onToggle} onAddItem={onAddItem} onRemoveItem={onRemoveItem}
                onToggleAll={onToggleAll} onClearChecked={onClearChecked} onTogglePin={onTogglePin} onDiscuss={onDiscuss}
                onStart={onStart} onRespond={onRespond} onRemove={onRemove} onEdit={onEdit} />
            </div> : <p className="task-no-match" role="status">کاری با این جست‌وجو یا فیلتر پیدا نشد.</p>}
          </> : <div className="desk-empty"><ClipboardList size={28} /><strong>میزت برای کار اول آماده است.</strong>
            <p>از یک یادداشت شروع کن یا دستور اولین مأموریت را در صف بگذار.</p></div>}
        </section>
      </div>
    </main>
  );
}
