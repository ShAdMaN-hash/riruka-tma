export const MAX_TASK_INPUT = 5000;
export const MAX_TASK_OUTPUT = 24000;
export const TASK_LIMIT = 24;
export const CHECKLIST_LIMIT = 30;
export const CHECKLIST_ITEM_LIMIT = 280;

export const taskKinds = ["checklist", "brief", "workflow", "hermes"] as const;
export const hermesAccessStates = ["ready", "unconfigured", "telegram", "expired", "denied"] as const;
export type HermesAccess = typeof hermesAccessStates[number];
export const taskStatuses = ["draft", "queued", "running", "waiting", "stopping", "done", "failed", "cancelled", "unknown"] as const;
export const activityKinds = ["accepted", "started", "tool-start", "tool-end", "tool-error", "waiting", "reviewed", "output", "ended"] as const;
export const MAX_ACTIVITY = 36;
export type ActivityKind = typeof activityKinds[number];
export type RunActivity = { id: string; at: number; kind: ActivityKind; detail?: string };
export type RunControl = {
  id: string;
  generation: number;
  kind: "approval" | "clarify";
  prompt: string;
  allowOnce: boolean;
};
export type RunDecision = { control: RunControl; choice: "once" | "deny" } | { control: RunControl; answer: string };
export type TaskKind = typeof taskKinds[number];
export type TaskStatus = typeof taskStatuses[number];
export type Task = {
  id: string;
  at: number;
  kind: TaskKind;
  title: string;
  input: string;
  status: TaskStatus;
  output: string;
  items: { text: string; checked: boolean }[];
  ticket?: string;
  note?: string;
  activity?: RunActivity[];
  controls?: RunControl[];
  startedAt?: number;
};

export const taskLabels: Record<TaskStatus, string> = {
  draft: "پیش‌نویس",
  queued: "در صف",
  running: "در حال اجرا",
  waiting: "منتظر ورودی در Hermes",
  stopping: "در حال توقف",
  done: "انجام‌شده",
  failed: "ناموفق",
  cancelled: "متوقف‌شده",
  unknown: "نیازمند بررسی وضعیت",
};

export function isActive(status: TaskStatus) {
  return status === "queued" || status === "running" || status === "waiting" || status === "stopping";
}

export function taskProgress(task: Task): "draft" | "open" | "done" | "attention" {
  if (task.status === "draft") return "draft";
  if (isActive(task.status)) return "open";
  if (task.status !== "done") return "attention";
  if (task.kind !== "checklist" && task.kind !== "workflow") return "done";
  if (task.kind === "workflow" && !task.items.length) return "done";
  if (!task.items.length) return "attention";
  return task.items.every((item) => item.checked) ? "done" : "open";
}

export function taskStatusLabel(task: Task) {
  if ((task.kind === "checklist" || task.kind === "workflow") && task.status === "done") {
    if (task.kind === "workflow" && !task.items.length) return "خروجی آماده";
    if (!task.items.length) return "خالی";
    if (taskProgress(task) === "open") return "در دست انجام";
  }
  return taskLabels[task.status];
}

function searchKey(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[\s\u064b-\u065f\u200c\u200d]+/g, "");
}

export function matchesTask(task: Task, query: string) {
  const needle = searchKey(query);
  return !needle || [task.title, task.input, ...task.items.map(({ text }) => text)]
    .some((value) => searchKey(value).includes(needle));
}

function linesFrom(input: string) {
  return [...new Set(input.split(/\r?\n|[؛;]/).map((line) =>
    line.replace(/^\s*(?:[-*•]\s*|[0-9۰-۹]+[.)٫-]\s*)/, "").replace(/^\[[ xX]\]\s*/, "").trim()).filter(Boolean))];
}

export function taskTitle(input: string) {
  const title = linesFrom(input)[0] ?? input.trim();
  return title.length > 72 ? title.slice(0, 69) + "…" : title;
}

export function localTask(kind: Exclude<TaskKind, "hermes">, input: string) {
  const lines = linesFrom(input);
  if (kind === "checklist") {
    const items = lines.slice(0, CHECKLIST_LIMIT).map((text) => ({ text, checked: false }));
    return { items, output: "", note: !items.length ? "در متن موردی برای چک‌لیست پیدا نشد." : lines.length > CHECKLIST_LIMIT ? "۳۰ مورد اول به چک‌لیست اضافه شد." : undefined };
  }
  const paragraphs = input.trim().split(/\n\s*\n/);
  const excerpts = [...new Set(paragraphs.map((paragraph) =>
    paragraph.split(/(?<=[.!؟!?])\s+|\r?\n/).find((sentence) => sentence.trim().length >= 12)?.trim()
  ).filter((sentence): sentence is string => Boolean(sentence)))].slice(0, 8);
  if (kind === "workflow") {
    const explicitActions = input.split(/\r?\n/).filter((line) => /^\s*(?:[-*•]|[۰-۹0-9]+[.)]|اقدام\s*[:：]|کار\s*[:：]|TODO\s*:)/i.test(line));
    const items = linesFrom(explicitActions.map((line) => line.replace(/^\s*(?:اقدام|کار|TODO)\s*[:：]\s*/i, "")).join("\n"))
      .slice(0, CHECKLIST_LIMIT).map((text) => ({ text, checked: false }));
    return {
      items,
      output: ["## نکته‌های یادداشت", ...(excerpts.length ? excerpts : lines.slice(0, 5)).map((text) => "- " + text),
        "## متن مرتب‌شده", lines.join("\n\n")].join("\n\n"),
      note: items.length ? undefined : "برای ساخت چک‌لیست، اقدام‌ها را با خط تیره یا «اقدام:» شروع کن.",
    };
  }
  return {
    items: [],
    output: [
      "# مرور یادداشت",
      "تعداد واژه‌ها: " + input.trim().split(/\s+/).length,
      "## جمله‌های آغازین بندها",
      ...(excerpts.length ? excerpts : lines.slice(0, 8)).map((text) => "- " + text.replace(/\n/g, " ")),
      "## متن مرتب‌شده",
      lines.join("\n\n"),
    ].join("\n\n"),
  };
}

export function taskMarkdown(task: Task) {
  const items = task.items.map((item) => "- [" + (item.checked ? "x" : " ") + "] " + item.text).join("\n");
  if (task.kind === "workflow") return ["# " + task.title, task.output, items ? "## اقدامات\n\n" + items : ""].filter(Boolean).join("\n\n") + "\n";
  if (task.kind === "checklist") return "# " + task.title + "\n\n" + items + "\n";
  return task.output;
}

export function isRunActivity(value: unknown): value is RunActivity {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RunActivity>;
  return typeof item.id === "string" && item.id.length <= 100 && typeof item.at === "number" &&
    Number.isFinite(item.at) && item.at > 0 && item.at < 8640000000000000 && activityKinds.includes(item.kind as ActivityKind) &&
    (item.detail === undefined || (typeof item.detail === "string" && item.detail.length <= 100));
}
