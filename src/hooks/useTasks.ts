"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKLIST_ITEM_LIMIT, CHECKLIST_LIMIT, hermesAccessStates, isActive, localTask, MAX_TASK_INPUT, sortTasks, taskStatuses, taskTitle, type HermesAccess, type RunControl, type RunDecision, type Task, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { useRirukaStore } from "@/store/useRirukaStore";

type Reply = { status: TaskStatus; ticket?: string; output?: string; note?: string; controls?: RunControl[] };
export type TaskAccess = HermesAccess | "checking" | "unreachable";
class TaskRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request(initData: string, action: "availability" | "start" | "status" | "stop" | "respond", fields: object = {}, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, action === "availability" ? 8000 : 13000);
  parentSignal?.addEventListener("abort", abort, { once: true });
  if (parentSignal?.aborted) abort();
  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ initData, action, ...fields }),
    });
    const data = await response.json();
    if (!response.ok) throw new TaskRequestError(typeof data.error === "string" ? data.error : "عملیات تأیید نشد.", response.status);
    return data;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abort);
  }
}

async function query(initData: string, action: "start" | "status" | "stop", fields: object): Promise<Reply> {
  const data = await request(initData, action, fields);
  if (!taskStatuses.includes(data.status)) throw new Error("وضعیت نامعتبر");
  return data;
}

function errorText(error: unknown) {
  return error instanceof TaskRequestError ? error.message : "ارتباط قطع شد. وضعیت کار را دوباره بررسی کن.";
}

export function useTasks(profile: string | null, initData: string, visible: boolean) {
  const tasks = useRirukaStore((state) => state.tasks);
  const starting = useRef(false);
  const stops = useRef(new Set<string>());
  const [access, setAccess] = useState<{ profile: string; initData: string; state: TaskAccess }>();
  const [attempt, setAttempt] = useState(0);
  const accessState = access && access.profile === profile && access.initData === initData ? access.state : "checking";
  const watch = tasks.filter((task) => task.ticket && isActive(task.status)).map((task) => task.id).join(",");

  useEffect(() => {
    if (!profile || !visible) return;
    const abort = new AbortController();
    setAccess({ profile, initData, state: "checking" });
    void request(initData, "availability", {}, abort.signal).then((data) => {
      if (!abort.signal.aborted) setAccess({ profile, initData, state: hermesAccessStates.includes(data.state) ? data.state : "unreachable" });
    }).catch(() => {
      if (!abort.signal.aborted) setAccess({ profile, initData, state: "unreachable" });
    });
    return () => abort.abort();
  }, [profile, initData, visible, attempt]);

  useEffect(() => {
    if (!profile || !initData || !watch) return;
    let disposed = false;
    let polling = false;
    let next: ReturnType<typeof setTimeout>;
    const ids = watch.split(",");
    const failures = new Map<string, number>();
    async function poll() {
      if (polling || document.hidden || disposed) return;
      polling = true;
      const store = useRirukaStore.getState();
      await Promise.all(ids.map(async (id) => {
        const task = store.tasks.find((item) => item.id === id);
        if (!task?.ticket || !isActive(task.status) || stops.current.has(id)) return;
        try {
          const result = await query(initData, "status", { ticket: task.ticket });
          if (disposed || stops.current.has(id)) return;
          failures.delete(id);
          const current = useRirukaStore.getState().tasks.find((item) => item.id === id);
          if (!current || !isActive(current.status) || (current.status === "stopping" && isActive(result.status) && result.status !== "stopping")) return;
          if (result.status !== current.status || result.note !== current.note || (result.output && result.output !== current.output) ||
              JSON.stringify(result.controls ?? []) !== JSON.stringify(current.controls ?? [])) {
            store.updateTask(profile!, id, { status: result.status, output: result.output ?? "", note: result.note, controls: result.controls });
          }
        } catch (error) {
          if (disposed || stops.current.has(id)) return;
          const attempts = (failures.get(id) ?? 0) + 1;
          failures.set(id, attempts);
          if (attempts >= 3 || (error instanceof TaskRequestError && [401, 403, 404].includes(error.status))) {
            store.updateTask(profile!, id, { status: "unknown", note: errorText(error) });
          }
        }
      }));
      polling = false;
      if (!disposed && !document.hidden) next = setTimeout(poll, 1800);
    }
    function visibilityChanged() {
      clearTimeout(next);
      if (!document.hidden) void poll();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(next);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [profile, initData, watch]);

  async function start(task: Task) {
    if (!profile || !initData || accessState !== "ready" || starting.current ||
        useRirukaStore.getState().tasks.some((entry) => entry.id !== task.id && isActive(entry.status))) return;
    starting.current = true;
    const { updateTask } = useRirukaStore.getState();
    const startedAt = task.startedAt ?? Date.now();
    updateTask(profile, task.id, { status: "queued", startedAt, note: undefined });
    try {
      const result = await query(initData, "start", { id: task.id, input: task.input });
      if (!result.ticket) throw new Error("شناسهٔ پیگیری دریافت نشد");
      updateTask(profile, task.id, {
        ticket: result.ticket, status: "queued", note: undefined,
        activity: [{ id: "local-accepted", at: Date.now(), kind: "accepted" }],
      });
    } catch (error) {
      const rejected = error instanceof TaskRequestError && [400, 401, 403, 503].includes(error.status);
      const rejectedDraft = rejected && task.status === "draft";
      updateTask(profile, task.id, { status: rejectedDraft ? "draft" : "unknown", startedAt: rejectedDraft ? undefined : startedAt, note: errorText(error) });
    } finally {
      starting.current = false;
    }
  }

  function add(kind: TaskKind, raw: string) {
    const input = raw.trim();
    if (!profile || !input || input.length > MAX_TASK_INPUT) return;
    const task: Task = { id: crypto.randomUUID(), at: Date.now(), kind, input, title: taskTitle(input),
      status: kind === "hermes" ? "draft" : "done", output: "", items: [], pinned: false };
    if (kind !== "hermes") Object.assign(task, localTask(kind, input));
    if (kind === "workflow") task.activity = [
      { id: "local-source", at: task.at, kind: "started", detail: "خواندن یادداشت" },
      { id: "local-output", at: task.at, kind: "output", detail: "مرتب‌سازی متن و استخراج اقدام‌ها" },
    ];
    return useRirukaStore.getState().addTask(task) ? task.id : undefined;
  }

  async function control(task: Task, action: "status" | "stop") {
    if (!profile || !initData) return;
    const { updateTask } = useRirukaStore.getState();
    if (!task.ticket) {
      if (action === "status" && task.status === "unknown" && Date.now() - (task.startedAt ?? task.at) < 20 * 60 * 60 * 1000) await start(task);
      return;
    }
    if (action === "stop") {
      if (stops.current.has(task.id)) return;
      stops.current.add(task.id);
    }
    function stillTracked() {
      const current = useRirukaStore.getState().tasks.find(({ id }) => id === task.id);
      return current && (isActive(current.status) || current.status === "unknown");
    }
    try {
      const result = await query(initData, action, { ticket: task.ticket });
      if (stillTracked()) updateTask(profile, task.id, { status: result.status, output: result.output ?? "", note: result.note, controls: result.controls });
    } catch (error) {
      if (stillTracked()) updateTask(profile, task.id, { status: "unknown", note: errorText(error) });
    } finally {
      if (action === "stop") stops.current.delete(task.id);
    }
  }

  async function respond(task: Task, decision: RunDecision) {
    if (!profile || !initData || !task.ticket || stops.current.has(task.id)) return;
    stops.current.add(task.id);
    try {
      await request(initData, "respond", {
        ticket: task.ticket, controlId: decision.control.id, generation: decision.control.generation,
        ...("choice" in decision ? { choice: decision.choice } : { answer: decision.answer }),
      });
      useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
        controls: current.controls?.filter((entry) => entry.id !== decision.control.id),
      }));
    } catch (error) {
      throw new Error(errorText(error));
    } finally {
      stops.current.delete(task.id);
    }
  }

  function toggle(task: Task, index: number) {
    if (!profile) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
      items: current.items.map((item, i) => i === index ? { ...item, checked: !item.checked } : item),
    }));
  }

  function addItem(task: Task, raw: string) {
    const text = raw.trim();
    if (!profile || !text || text.length > CHECKLIST_ITEM_LIMIT) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => current.items.length >= CHECKLIST_LIMIT
      ? {} : { items: [...current.items, { text, checked: false }], note: current.items.length ? current.note : undefined });
  }

  function removeItem(task: Task, index: number) {
    if (!profile) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
      items: current.items.filter((_, i) => i !== index),
    }));
  }

  function toggleAll(task: Task) {
    if (!profile || !task.items.length) return;
    const nextState = !task.items.every((item) => item.checked);
    useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
      items: current.items.map((item) => ({ ...item, checked: nextState })),
    }));
  }

  function clearChecked(task: Task) {
    if (!profile) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
      items: current.items.filter((item) => !item.checked),
    }));
  }

  function togglePin(task: Task) {
    if (!profile) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => ({
      pinned: !current.pinned,
    }));
  }

  function remove(task: Task) {
    if (profile) useRirukaStore.getState().removeTask(profile, task.id);
  }

  function editDraft(task: Task, raw: string) {
    const input = raw.trim();
    if (!profile || !input || input.length > MAX_TASK_INPUT) return;
    useRirukaStore.getState().updateTask(profile, task.id, (current) => current.status === "draft"
      ? { input, title: taskTitle(input), note: undefined } : {});
  }

  return {
    tasks: profile ? sortTasks(tasks) : [],
    add, addItem, removeItem, toggleAll, clearChecked, togglePin,
    control, start, respond, remove, editDraft, toggle,
    access: accessState, recheck: () => setAttempt((count) => count + 1),
  };
}
