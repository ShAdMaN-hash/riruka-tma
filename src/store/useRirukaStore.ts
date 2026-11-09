"use client";

import { create } from "zustand";
import { DEVICE_LIMIT, isSource, isTurn, UUID, type Message } from "@/lib/chat";

type Saved = {
  version: 1;
  sessionId: string;
  messages: Message[];
  affection: number;
  sound: boolean;
};

type RirukaState = Saved & {
  profile: string | null;
  openProfile: (id: string) => void;
  addMessage: (message: Message) => void;
  clearChat: () => void;
  addAffection: (points: number) => void;
  toggleSound: () => void;
};

const initial: Saved = { version: 1, sessionId: "", messages: [], affection: 0, sound: false };
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
  clearChat: () => set({ messages: [], sessionId: crypto.randomUUID() }),
  addAffection: (points) => set(({ affection }) => ({ affection: Math.min(100, affection + points) })),
  toggleSound: () => set(({ sound }) => ({ sound: !sound })),
}));

useRirukaStore.subscribe(({ profile, version, sessionId, messages, affection, sound }) => {
  if (!profile) return;
  try {
    localStorage.setItem(key(profile), JSON.stringify({ version, sessionId, messages, affection, sound }));
  } catch {
    // The session continues in memory when storage is blocked or full.
  }
});
