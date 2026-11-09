export const MAX_TASK_INPUT = 5000;
export const MAX_TASK_OUTPUT = 24000;
export const TASK_LIMIT = 24;

export const taskKinds = ["checklist", "brief", "hermes"] as const;
export const taskStatuses = ["queued", "running", "waiting", "stopping", "done", "failed", "cancelled", "unknown"] as const;
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
};

export const taskLabels: Record<TaskStatus, string> = {
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
    const items = lines.slice(0, 30).map((text) => ({ text, checked: false }));
    return { items, output: "", note: !items.length ? "در متن موردی برای چک‌لیست پیدا نشد." : lines.length > 30 ? "۳۰ مورد اول به چک‌لیست اضافه شد." : undefined };
  }
  const paragraphs = input.trim().split(/\n\s*\n/);
  const excerpts = [...new Set(paragraphs.map((paragraph) =>
    paragraph.split(/(?<=[.!؟!?])\s+|\r?\n/).find((sentence) => sentence.trim().length >= 12)?.trim()
  ).filter((sentence): sentence is string => Boolean(sentence)))].slice(0, 8);
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
  if (task.kind !== "checklist") return task.output;
  return "# " + task.title + "\n\n" + task.items.map((item) => "- [" + (item.checked ? "x" : " ") + "] " + item.text).join("\n") + "\n";
}
