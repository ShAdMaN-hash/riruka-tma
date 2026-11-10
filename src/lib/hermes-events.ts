import { createHash } from "node:crypto";
import { readSse } from "./sse";
import type { ActivityKind, RunActivity } from "./tasks";

function translate(payload: Record<string, unknown>, frameEvent: string): ActivityKind | undefined {
  switch (typeof payload.event === "string" ? payload.event : frameEvent) {
    case "run.started": return "started";
    case "tool.started": return "tool-start";
    case "tool.completed": return payload.error === true ? "tool-error" : "tool-end";
    case "tool.failed": return "tool-error";
    case "approval.request": case "clarify.request": case "clarification.request": return "waiting";
    case "approval.responded": case "approval.settled": case "clarify.responded": case "clarify.settled": return "reviewed";
    case "run.completed": return "output";
    case "run.cancelled": case "run.failed": case "run.interrupted": return "ended";
  }
}

export async function relayRunEvents(url: URL, headers: Headers, request: Request, after: unknown) {
  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(22000)]);
  headers.set("Accept", "text/event-stream");
  if (typeof after === "number" && Number.isSafeInteger(after) && after >= 0) headers.set("Last-Event-ID", String(after));
  const response = await fetch(url, { headers, signal, redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    await response.body?.cancel().catch(() => {});
    return Response.json({ error: "رویداد زندهٔ Hermes در دسترس نیست." }, { status: 502 });
  }
  const frames = readSse(response.body);
  const encoder = new TextEncoder();
  let closed = false;
  let cursor = -1;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!closed) {
          const next = await frames.next();
          if (closed) return;
          if (next.done) { controller.close(); return; }
          let payload: Record<string, unknown>;
          try {
            const data: unknown = JSON.parse(next.value.data);
            if (!data || typeof data !== "object") continue;
            payload = data as Record<string, unknown>;
          } catch { continue; }
          const seq = typeof payload.seq === "number" && Number.isSafeInteger(payload.seq) && payload.seq >= 0 ? payload.seq : undefined;
          const kind = translate(payload, next.value.event);
          let activity: RunActivity | undefined;
          if (kind) {
            const tool = payload.tool;
            activity = {
              id: seq === undefined ? "event-" + createHash("sha256").update(next.value.data).digest("hex").slice(0, 24) : "event-" + seq,
              at: typeof payload.timestamp === "number" && payload.timestamp > 0 && payload.timestamp < 8640000000000
                ? Math.round(payload.timestamp * 1000) : Date.now(),
              kind,
              detail: typeof tool === "string" && /^[\w.:-]{1,80}$/.test(tool) ? tool : undefined,
            };
          }
          if (!activity && (seq === undefined || seq - cursor < 64)) continue;
          if (seq !== undefined) cursor = Math.max(cursor, seq);
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ seq, activity }) + "\n\n"));
          return;
        }
      } catch {
        if (!closed) controller.close();
      }
    },
    async cancel() {
      closed = true;
      cancel.abort();
      await frames.return(undefined).catch(() => {});
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
