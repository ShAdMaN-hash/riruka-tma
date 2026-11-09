import {
  apiError, HISTORY_LIMIT, isTurn, MAX_BODY_BYTES, MAX_REPLY, reactionMood, UUID,
  type ChatEvent, type ChatRequest,
} from "@/lib/chat";
import { mockReply } from "@/lib/mock";
import { getProviders, providerText } from "@/lib/providers";
import { verifyTelegram } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const WINDOW_MS = 60000;
const encoder = new TextEncoder();
const limits = new Map<string, { count: number; expires: number }>();
const inFlight = new Map<string, number>();

function admitTurn(id: string) {
  const now = Date.now();
  for (const [key, limit] of limits) {
    if (limit.expires <= now) limits.delete(key);
  }
  const limit = limits.get(id) ?? { count: 0, expires: now + WINDOW_MS };
  if (limit.count >= 12) return Math.max(1, Math.ceil((limit.expires - now) / 1000));
  const active = inFlight.get(id) ?? 0;
  if (active >= 2) return 3;
  limit.count += 1;
  limits.set(id, limit);
  inFlight.set(id, active + 1);
  return () => {
    const remaining = (inFlight.get(id) ?? 1) - 1;
    if (remaining) inFlight.set(id, remaining);
    else inFlight.delete(id);
  };
}

async function readRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  let bytes = 0;
  let content = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(content + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      content += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function isRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== "object") return false;
  const { messages, initData, sessionId, turnId } = value as Partial<ChatRequest>;
  return Array.isArray(messages) && messages.length > 0 && messages.length <= HISTORY_LIMIT &&
    messages.every(isTurn) && messages.at(-1)?.role === "user" &&
    typeof sessionId === "string" && UUID.test(sessionId) &&
    typeof turnId === "string" && UUID.test(turnId) &&
    (initData === undefined || (typeof initData === "string" && initData.length <= 8192));
}

async function* generateEvents(
  { messages, sessionId, turnId }: ChatRequest,
  liveUser: string | null,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  if (liveUser) {
    for (const provider of getProviders()) {
      let length = 0;
      try {
        for await (const text of providerText(provider, messages, "riruka-" + liveUser + "-" + sessionId, turnId, signal)) {
          if (length === 0 && !text.trim()) continue;
          if (length === 0) yield { type: "source", source: provider.source };
          const remaining = MAX_REPLY - length;
          const chunk = text.length >= remaining
            ? text.slice(0, remaining).replace(/[\uD800-\uDBFF]$/, "")
            : text;
          length += chunk.length;
          if (chunk) yield { type: "delta", text: chunk };
          if (text.length >= remaining) break;
        }
        if (length) {
          yield { type: "done", mood: reactionMood(messages.at(-1)!.content) };
          return;
        }
      } catch {
        if (signal.aborted) return;
        if (length) {
          yield { type: "error", code: "upstream_interrupted", message: apiError };
          return;
        }
        console.warn("[riruka] Upstream unavailable:", provider.source);
      }
    }
  }

  if (signal.aborted) return;
  const { reply, mood } = mockReply(messages);
  yield { type: "source", source: "mock" };
  for (const word of reply.match(/\S+\s*|\s+/g) ?? []) {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 26));
    yield { type: "delta", text: word };
  }
  yield { type: "done", mood };
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "درخواست از مبدأ مجاز ارسال نشده است." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "قالب درخواست باید JSON باشد." }, { status: 400 });
  }
  let data: unknown;
  try {
    data = await readRequest(request);
  } catch (error) {
    return Response.json(
      { error: "درخواست قابل پردازش نیست." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  if (!isRequest(data)) return Response.json({ error: "متن یا تاریخچهٔ پیام معتبر نیست." }, { status: 400 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const userId = botToken && data.initData ? verifyTelegram(data.initData, botToken) : null;
  if (botToken && data.initData && userId === null) {
    return Response.json({ error: "نشست تلگرام معتبر نیست. مینی‌اپ را دوباره از تلگرام باز کن." }, { status: 401 });
  }
  const allowlist = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((id) => id.trim());
  const liveUser = userId !== null && allowlist.includes(String(userId)) ? String(userId) : null;
  const admission = liveUser && getProviders().length ? admitTurn(liveUser) : undefined;
  if (typeof admission === "number") {
    return Response.json({ error: "چند لحظه صبر کن و دوباره پیام بفرست." }, {
      status: 429, headers: { "Retry-After": String(admission) },
    });
  }
  const finishAdmission = typeof admission === "function" ? admission : undefined;

  const cancel = new AbortController();
  const events = generateEvents(data, liveUser, AbortSignal.any([request.signal, cancel.signal]));
  let heartbeat: ReturnType<typeof setInterval>;
  let closed = false;
  function release() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    finishAdmission?.();
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      heartbeat = setInterval(() => {
        if (!closed && (controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 8000);
    },
    async pull(controller) {
      try {
        const next = await events.next();
        if (closed) return;
        if (next.done) {
          release();
          controller.close();
        }
        else controller.enqueue(encoder.encode("data: " + JSON.stringify(next.value) + "\n\n"));
      } catch (error) {
        if (!closed) {
          release();
          controller.error(error);
        }
      }
    },
    async cancel() {
      release();
      cancel.abort();
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
