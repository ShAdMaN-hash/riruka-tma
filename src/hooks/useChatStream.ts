"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiError, HISTORY_LIMIT, isSource, MAX_BODY_BYTES, MAX_INPUT, MAX_REPLY, moods,
  type ChatEvent, type ChatRequest, type Message, type Reaction, type Source,
} from "@/lib/chat";
import { readSse } from "@/lib/sse";
import { useRirukaStore } from "@/store/useRirukaStore";

type Reply = {
  id: string;
  text: string;
  status: "streaming" | "stopped" | "error";
  source?: Source;
  notice?: string;
};
type Active = { abort: AbortController; reply: Reply; profile: string; sessionId: string };

function requestBody(messages: Message[], sessionId: string, turnId: string, initData: string) {
  const request: ChatRequest = {
    messages: messages.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content })),
    sessionId, turnId, initData: initData || undefined,
  };
  const encoder = new TextEncoder();
  let body = JSON.stringify(request);
  while (encoder.encode(body).length > MAX_BODY_BYTES && request.messages.length > 1) {
    request.messages.shift();
    body = JSON.stringify(request);
  }
  return body;
}

export function useChatStream(initData: string, onDone: (mood: Reaction) => void) {
  const active = useRef<Active | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [source, setSource] = useState<Source>();
  const resetSource = useCallback(() => setSource(undefined), []);

  const cancel = useCallback((discard = false) => {
    const run = active.current;
    active.current = null;
    run?.abort.abort();
    if (discard) setReply(null);
    else if (run) setReply({ ...run.reply, status: "stopped", notice: "دریافت پاسخ متوقف شد." });
  }, []);

  useEffect(() => () => {
    active.current?.abort.abort();
    active.current = null;
  }, []);

  const send = useCallback(async (text?: string) => {
    if (active.current) return false;
    const state = useRirukaStore.getState();
    if (!state.profile) return false;
    const content = text?.trim();
    if (text !== undefined && (!content || content.length > MAX_INPUT)) return false;
    const last = state.messages.at(-1);
    const user: Message | undefined = content
      ? { id: crypto.randomUUID(), content, role: "user", at: Date.now() }
      : last?.role === "user" ? last : undefined;
    if (!user) return false;
    if (content) state.addMessage(user);

    const run: Active = {
      abort: new AbortController(),
      reply: { id: crypto.randomUUID(), text: "", status: "streaming" },
      profile: state.profile,
      sessionId: state.sessionId,
    };
    active.current = run;
    setSource(undefined);
    setReply(run.reply);
    const isCurrent = () => {
      const store = useRirukaStore.getState();
      return active.current === run && store.profile === run.profile && store.sessionId === run.sessionId;
    };
    const update = (patch: Partial<Reply>) => {
      run.reply = { ...run.reply, ...patch };
      setReply(run.reply);
    };

    try {
      const body = requestBody(useRirukaStore.getState().messages, run.sessionId, user.id, initData);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        signal: run.abort.signal,
        body,
      });
      if (!response.ok) {
        const error: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(typeof error.error === "string" ? error.error : apiError);
      }
      if (!response.body) throw new Error(apiError);

      for await (const frame of readSse(response.body)) {
        if (!isCurrent()) return false;
        const event: ChatEvent = JSON.parse(frame.data);
        if (event.type === "source" && isSource(event.source)) {
          setSource(event.source);
          update({ source: event.source });
        } else if (event.type === "delta" && typeof event.text === "string") {
          update({ text: (run.reply.text + event.text).slice(0, MAX_REPLY) });
        } else if (event.type === "error") {
          throw new Error(typeof event.message === "string" ? event.message : apiError);
        } else if (event.type === "done" && run.reply.text.trim() && moods.includes(event.mood)) {
          const store = useRirukaStore.getState();
          store.addMessage({ id: run.reply.id, content: run.reply.text, role: "assistant", at: Date.now(), source: run.reply.source });
          store.addAffection(3);
          setReply(null);
          onDone(event.mood);
          return true;
        }
      }
      throw new Error(apiError);
    } catch (error) {
      if (isCurrent()) update({
        status: "error",
        notice: error instanceof Error && error.message.length < 180 && /[\u0600-\u06ff]/.test(error.message)
          ? error.message : apiError,
      });
    } finally {
      if (active.current === run) active.current = null;
    }
    return false;
  }, [initData, onDone]);

  return { reply, source, send, cancel, resetSource, streaming: reply?.status === "streaming" };
}
