"use client";

import { useEffect, useState } from "react";
import { readSse } from "@/lib/sse";
import { isActive, isRunActivity, MAX_ACTIVITY, type Task } from "@/lib/tasks";
import { useRirukaStore } from "@/store/useRirukaStore";

export function useRunActivity(task: Task, initData: string, visible: boolean) {
  const profile = useRirukaStore((state) => state.profile);
  const [transport, setTransport] = useState<"connecting" | "live" | "status">("connecting");
  const tracking = visible && isActive(task.status) && Boolean(task.ticket && initData && profile);

  useEffect(() => {
    if (!tracking || !profile || !task.ticket) return;
    const id = task.id;
    const ticket = task.ticket;
    let after = -1;
    for (const entry of useRirukaStore.getState().tasks.find((item) => item.id === id)?.activity ?? []) {
      if (/^event-\d+$/.test(entry.id)) after = Math.max(after, Number(entry.id.slice(6)));
    }
    let controller: AbortController | undefined;
    let reconnect: ReturnType<typeof setTimeout>;
    let failures = 0;
    let disposed = false;

    async function listen() {
      if (disposed || document.hidden || controller) return;
      const connection = new AbortController();
      controller = connection;
      const timeout = setTimeout(() => connection.abort(), 28000);
      setTransport("connecting");
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: connection.signal,
          body: JSON.stringify({ action: "events", initData, ticket, after }),
        });
        if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
          throw new Error("SSE unavailable");
        }
        if (disposed) return;
        failures = 0;
        setTransport("live");
        for await (const frame of readSse(response.body)) {
          if (disposed || connection.signal.aborted) break;
          let packet: { seq?: number; activity?: unknown };
          try { packet = JSON.parse(frame.data); } catch { continue; }
          if (typeof packet.seq === "number" && Number.isSafeInteger(packet.seq)) after = Math.max(after, packet.seq);
          if (!isRunActivity(packet.activity)) continue;
          const activity = packet.activity;
          useRirukaStore.getState().updateTask(profile!, id, (current) => {
            const entries = current.activity ?? [];
            return entries.some((entry) => entry.id === activity.id)
              ? {} : { activity: [...entries, activity].slice(-MAX_ACTIVITY) };
          });
        }
      } catch {
        if (!connection.signal.aborted) failures++;
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        if (!disposed) {
          setTransport("status");
          if (!document.hidden && failures < 2) reconnect = setTimeout(listen, 3000);
        }
      }
    }

    function resume() {
      clearTimeout(reconnect);
      if (document.hidden) controller?.abort();
      else {
        failures = 0;
        void listen();
      }
    }
    document.addEventListener("visibilitychange", resume);
    void listen();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [tracking, task.id, task.ticket, initData, profile]);

  return tracking ? transport : "status";
}
