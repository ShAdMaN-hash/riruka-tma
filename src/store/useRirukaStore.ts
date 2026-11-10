"use client";

import { create } from "zustand";
import { DEVICE_LIMIT, isSource, isTurn, UUID, type Message } from "@/lib/chat";
import { CHECKLIST_LIMIT, isActive, isRunActivity, MAX_ACTIVITY, MAX_TASK_INPUT, MAX_TASK_OUTPUT, TASK_LIMIT, taskKinds, taskStatuses, type Task } from "@/lib/tasks";

type Saved = {
  version: 1;
  sessionId: string;
  messages: Message[];
  affection: number;
  sound: boolean;
  tasks: Task[];
  glasses: boolean;
  aura: boolean;
};

type RirukaState = Saved & {
  profile: string | null;
  openProfile: (id: string) => void;
  addMessage: (message: Message) => void;
  removeMessage: (id: string) => void;
  clearChat: () => void;
  addAffection: (points: number) => void;
  toggleSound: () => void;
  toggleGlasses: () => void;
  toggleAura: () => void;
  addTask: (task: Task) => boolean;
  removeTask: (profile: string, id: string) => void;
  updateTask: (profile: string, id: string, patch: Partial<Task> | ((task: Task) => Partial<Task>)) => void;
};

const initial: Saved = { version: 1, sessionId: "", messages: [], affection: 0, sound: false, tasks: [], glasses: false, aura: false };
const key = (id: string) => "riruka:v1:" + id;

function isMessage(value: unknown): value is Message {
  if (!isTurn(value)) return false;
  const { id, at, source } = value as Partial<Message>;
  return typeof id === "string" && UUID.test(id) && typeof at === "number" && Number.isFinite(at) &&
    (source === undefined || isSource(source));
}

function readProfile(id: string): Saved {
  const fresh = { ...initial, sessionId: crypto.randomUUID() };
  try {
    const item: Partial<Saved> | null = JSON.parse(localStorage.getItem(key(id)) ?? "null");
    if (item?.version !== 1) return fresh;
    return {
      ...fresh,
      sessionId: typeof item.sessionId === "string" && UUID.test(item.sessionId) ? item.sessionId : fresh.sessionId,
      messages: Array.isArray(item.messages) ? item.messages.filter(isMessage).slice(-DEVICE_LIMIT) : [],
      affection: typeof item.affection === "number" && Number.isFinite(item.affection)
        ? Math.max(0, Math.min(100, Math.round(item.affection))) : 0,
      sound: item.sound === true,
      glasses: item.glasses === true,
      aura: item.aura === true,
      tasks: Array.isArray(item.tasks) ? item.tasks.filter((task): task is Task =>
        Boolean(task && UUID.test(task.id) && taskKinds.includes(task.kind) && taskStatuses.includes(task.status) &&
          typeof task.at === "number" && Number.isFinite(task.at) && typeof task.title === "string" &&
          typeof task.input === "string" && task.input.length <= MAX_TASK_INPUT &&
          typeof task.output === "string" && task.output.length <= MAX_TASK_OUTPUT &&
          Array.isArray(task.items) && task.items.length <= CHECKLIST_LIMIT &&
          task.items.every((part) => part && typeof part.text === "string" && typeof part.checked === "boolean"))
      ).slice(0, TASK_LIMIT).map((task) => ({
        ...task,
        pinned: task.pinned === true,
        status: task.status === "queued" && !task.ticket ? "unknown" : task.status,
        activity: Array.isArray(task.activity) ? task.activity.filter(isRunActivity).slice(-MAX_ACTIVITY) : undefined,
        controls: undefined,
      })) : [],
    };
  } catch {
    return fresh;
  }
}

export const useRirukaStore = create<RirukaState>((set, get) => ({
  ...initial,
  profile: null,
  openProfile: (id) => {
    if (get().profile !== id) set({ ...readProfile(id), profile: id });
  },
  addMessage: (message) => set(({ messages }) => ({
    messages: [...messages.filter(({ id }) => id !== message.id), message].slice(-DEVICE_LIMIT),
  })),
  removeMessage: (id) => set(({ messages }) => ({
    messages: messages.filter((message) => message.id !== id),
  })),
  clearChat: () => set({ messages: [], sessionId: crypto.randomUUID() }),
  addAffection: (points) => set(({ affection }) => ({ affection: Math.max(0, Math.min(100, affection + points)) })),
  toggleSound: () => set(({ sound }) => ({ sound: !sound })),
  toggleGlasses: () => set(({ glasses }) => ({ glasses: !glasses })),
  toggleAura: () => set(({ aura }) => ({ aura: !aura })),
  addTask: (task) => {
    if (!get().profile || get().tasks.length >= TASK_LIMIT) return false;
    set(({ tasks }) => ({ tasks: [task, ...tasks] }));
    return true;
  },
  removeTask: (profile, id) => {
    if (get().profile !== profile) return;
    set(({ tasks }) => ({ tasks: tasks.filter((task) => task.id !== id || isActive(task.status) || task.status === "unknown") }));
  },
  updateTask: (profile, id, patch) => {
    if (get().profile !== profile) return;
    set(({ tasks }) => ({ tasks: tasks.map((task) => task.id === id ? { ...task, ...(typeof patch === "function" ? patch(task) : patch) } : task) }));
  },
}));

useRirukaStore.subscribe(({ profile, version, sessionId, messages, affection, sound, tasks, glasses, aura }) => {
  if (!profile) return;
  try {
    localStorage.setItem(key(profile), JSON.stringify({ version, sessionId, messages, affection, sound, tasks: tasks.map(({ controls: _controls, ...task }) => task), glasses, aura }));
  } catch {
    // The session continues in memory when storage is blocked or full.
  }
});
