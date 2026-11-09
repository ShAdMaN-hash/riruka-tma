"use client";

import { useEffect, useRef } from "react";
import { isActive, localTask, MAX_TASK_INPUT, taskStatuses, taskTitle, type Task, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { useRirukaStore } from "@/store/useRirukaStore";

type Reply = { status: TaskStatus; ticket?: string; output?: string; note?: string };
class TaskRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function query(initData: string, action: "start" | "status" | "stop", fields: object): Promise<Reply> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(13000),
    body: JSON.stringify({ initData, action, ...fields }),
  });
  const data = await response.json();
  if (!response.ok) throw new TaskRequestError(typeof data.error === "string" ? data.error : "عملیات تأیید نشد.", response.status);
  if (!taskStatuses.includes(data.status)) throw new Error("وضعیت نامعتبر");
  return data;
}

function errorText(error: unknown) {
  return error instanceof TaskRequestError ? error.message : "ارتباط قطع شد. وضعیت کار را دوباره بررسی کن.";
}

export function useTasks(profile: string | null, initData: string) {
  const tasks = useRirukaStore((state) => state.tasks);
  const starting = useRef(false);
  const watch = tasks.filter((task) => task.ticket && isActive(task.status)).map((task) => task.id).join(",");

  useEffect(() => {
    if (!profile || !initData || !watch) return;
    let disposed = false;
    let next: ReturnType<typeof setTimeout>;
    const ids = watch.split(",");
    const failures = new Map<string, number>();
    async function poll() {
      const store = useRirukaStore.getState();
      await Promise.all(ids.map(async (id) => {
        const task = store.tasks.find((item) => item.id === id);
        if (!task?.ticket || !isActive(task.status)) return;
        try {
          const result = await query(initData, "status", { ticket: task.ticket });
          if (disposed) return;
          failures.delete(id);
          const current = useRirukaStore.getState().tasks.find((item) => item.id === id);
          if (!current || !isActive(current.status) || (current.status === "stopping" && (result.status === "running" || result.status === "queued"))) return;
          if (result.status !== current.status || result.note !== current.note || (result.output && result.output !== current.output)) {
            store.updateTask(profile!, id, { status: result.status, output: result.output ?? "", note: result.note });
          }
        } catch (error) {
          if (disposed) return;
          const attempts = (failures.get(id) ?? 0) + 1;
          failures.set(id, attempts);
          if (attempts >= 3 || (error instanceof TaskRequestError && [401, 403, 404].includes(error.status))) {
            store.updateTask(profile!, id, { status: "unknown", note: errorText(error) });
          }
        }
      }));
      if (!disposed) next = setTimeout(poll, 1800);
    }
    void poll();
    return () => { disposed = true; clearTimeout(next); };
  }, [profile, initData, watch]);

  async function start(task: Task) {
    if (!profile || !initData || starting.current) return;
    starting.current = true;
    const { updateTask } = useRirukaStore.getState();
    try {
      const result = await query(initData, "start", { id: task.id, input: task.input });
      if (!result.ticket) throw new Error("شناسهٔ پیگیری دریافت نشد");
      updateTask(profile, task.id, { ticket: result.ticket, status: "queued", note: undefined });
    } catch (error) {
      const rejected = error instanceof TaskRequestError && [400, 401, 403, 503].includes(error.status);
      updateTask(profile, task.id, { status: rejected ? "failed" : "unknown", note: errorText(error) });
    } finally {
      starting.current = false;
    }
  }

  function add(kind: TaskKind, raw: string) {
    const input = raw.trim();
    if (!profile || !input || input.length > MAX_TASK_INPUT || (kind === "hermes" && (!initData || starting.current))) return;
    const task: Task = { id: crypto.randomUUID(), at: Date.now(), kind, input, title: taskTitle(input),
      status: kind === "hermes" ? "queued" : "done", output: "", items: [] };
    if (kind !== "hermes") Object.assign(task, localTask(kind, input));
    useRirukaStore.getState().addTask(task);
    if (kind === "hermes") void start(task);
    return task.id;
  }

  async function control(task: Task, action: "status" | "stop") {
    if (!profile || !initData) return;
    const { updateTask } = useRirukaStore.getState();
    if (!task.ticket) {
      if (action === "status" && task.status === "unknown" && Date.now() - task.at < 20 * 60 * 60 * 1000) await start(task);
      return;
    }
    function stillTracked() {
      const current = useRirukaStore.getState().tasks.find(({ id }) => id === task.id);
      return current && (isActive(current.status) || current.status === "unknown");
    }
    try {
      const result = await query(initData, action, { ticket: task.ticket });
      if (stillTracked()) updateTask(profile, task.id, { status: result.status, output: result.output ?? "", note: result.note });
    } catch (error) {
      if (stillTracked()) updateTask(profile, task.id, { status: "unknown", note: errorText(error) });
    }
  }

  function toggle(task: Task, index: number) {
    if (!profile) return;
    useRirukaStore.getState().updateTask(profile, task.id, {
      items: task.items.map((item, i) => i === index ? { ...item, checked: !item.checked } : item),
    });
  }

  return { tasks: profile ? tasks : [], add, control, toggle, canRun: Boolean(profile && initData) };
}
