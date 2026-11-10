import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "@/lib/chat";
import { relayRunEvents } from "@/lib/hermes-events";
import { MAX_TASK_INPUT, MAX_TASK_OUTPUT, type HermesAccess, type RunControl, type TaskStatus } from "@/lib/tasks";
import { verifyTelegram } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const RUN = /^run_[a-zA-Z0-9_-]{1,100}$/;
const BODY_LIMIT = 49152;
const starts = new Map<number, { count: number; expires: number }>();

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function availability(state: HermesAccess) {
  return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
}

function settings() {
  const key = process.env.HERMES_TASK_API_KEY?.trim();
  const bot = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (process.env.HERMES_TASKS_ENABLED !== "true" || !key || !bot || !process.env.HERMES_TASK_BASE_URL) return null;
  try {
    const url = new URL(process.env.HERMES_TASK_BASE_URL);
    if (url.username || url.password || url.hash || url.search) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    url.pathname = (url.pathname.replace(/\/+$/, "") || "/v1") + "/runs";
    return { url: url.toString(), key, bot };
  } catch {
    return null;
  }
}

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(text + decoder.decode()) as unknown;
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new RangeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function sign(key: string, owner: number, run: string) {
  return createHmac("sha256", key).update("riruka-run:" + owner + ":" + run).digest("hex");
}

function verifyTicket(ticket: unknown, key: string, owner: number) {
  if (typeof ticket !== "string" || ticket.length > 170) return null;
  const [run, proof, ...extra] = ticket.split(".");
  if (!RUN.test(run) || !/^[a-f0-9]{64}$/.test(proof) || extra.length) return null;
  return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(sign(key, owner, run), "hex")) ? run : null;
}

function taskStatus(upstream: unknown): TaskStatus {
  switch (upstream) {
    case "started": case "queued": return "queued";
    case "running": return "running";
    case "waiting": case "waiting_for_approval": case "waiting_for_clarification": return "waiting";
    case "stopping": return "stopping";
    case "completed": return "done";
    case "cancelled": return "cancelled";
    case "failed": case "interrupted": return "failed";
    default: return "unknown";
  }
}

function pendingControls(data: Record<string, unknown>): RunControl[] {
  if (!Array.isArray(data.pending_controls)) return [];
  return data.pending_controls.slice(0, 8).flatMap((raw: unknown): RunControl[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = item.prompt_id;
    const generation = item.execution_generation ?? data.execution_generation;
    if (typeof id !== "string" || !/^[\w.:-]{1,160}$/.test(id) ||
        typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 0 ||
        (item.kind !== "approval" && item.kind !== "clarify")) return [];
    const content = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : item;
    const prompt = [content.command, content.description, content.question, content.prompt, content.text]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (!prompt.length) return [];
    const text = [...new Set(prompt)].join("\n").trim();
    const choices = content.choices ?? item.choices;
    const allowOnce = text.length <= 1600 && Array.isArray(choices) && choices.includes("once");
    return [{ id, generation, kind: item.kind, prompt: text.length <= 1600 ? text : text.slice(0, 1599) + "…", allowOnce }];
  });
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return failure("درخواست میز کار معتبر نیست.", 400);
  }
  let payload: unknown;
  try {
    payload = await body(request);
  } catch (error) {
    return failure("درخواست میز کار قابل خواندن نیست.", error instanceof RangeError ? 413 : 400);
  }
  if (!payload || typeof payload !== "object") return failure("درخواست میز کار معتبر نیست.", 400);
  const { action, initData, id, input, ticket, after, controlId, generation, choice, answer } = payload as Record<string, unknown>;
  const config = settings();
  if (!config) return action === "availability" ? availability("unconfigured") : failure("اجرای Hermes هنوز روی سرور تنظیم نشده است.", 503);
  const owner = typeof initData === "string" && initData.length <= 8192 ? verifyTelegram(initData, config.bot) : null;
  if (!owner) return action === "availability"
    ? availability(initData ? "expired" : "telegram") : failure("برای اجرای ایجنت، مینی‌اپ را دوباره از تلگرام باز کن.", 401);
  const allowed = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(",").some((value) => value.trim() === String(owner));
  if (action === "availability") return availability(allowed ? "ready" : "denied");
  if (!allowed) return failure("این حساب اجازهٔ اجرای کار با Hermes را ندارد.", 403);

  const headers = new Headers({ Authorization: "Bearer " + config.key, Accept: "application/json" });
  const options: RequestInit = { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) };
  const url = new URL(config.url);
  try {
    if (action === "start") {
      if (typeof id !== "string" || !UUID.test(id) || typeof input !== "string" || !input.trim() || input.length > MAX_TASK_INPUT) {
        return failure("متن یا شناسهٔ کار معتبر نیست.", 400);
      }
      const now = Date.now();
      for (const [user, rate] of starts) if (rate.expires <= now) starts.delete(user);
      const rate = starts.get(owner) ?? { count: 0, expires: now + 60000 };
      if (rate.count >= 5) return failure("کمی صبر کن و دوباره وضعیت کار را بگیر.", 429);
      rate.count += 1;
      starts.set(owner, rate);
      headers.set("Content-Type", "application/json");
      headers.set("Idempotency-Key", sign(config.key, owner, id));
      options.method = "POST";
      options.body = JSON.stringify({
        input: input.trim(),
        session_id: "riruka-task-" + owner + "-" + id,
        instructions: "در محدودهٔ ابزارهای مجاز و درخواست کاربر کار را انجام بده. نتیجه و اقدام‌های تأییدشده را دقیق گزارش کن. خروجی پیش‌فرض فارسی و قابل خواندن در Markdown باشد.",
      });
    } else if (action === "status" || action === "stop" || action === "events" || action === "respond") {
      const run = verifyTicket(ticket, config.key, owner);
      if (!run) return failure("شناسهٔ پیگیری معتبر نیست.", 403);
      url.pathname += "/" + run;
      if (action === "events") {
        url.pathname += "/events";
        return await relayRunEvents(url, headers, request, after);
      }
      if (action === "respond") {
        if (typeof controlId !== "string" || typeof generation !== "number" || !Number.isSafeInteger(generation)) {
          return failure("شناسهٔ درخواست Hermes معتبر نیست.", 400);
        }
        const current = await fetch(url, options);
        if (!current.ok) return failure("درخواست Hermes قابل بررسی نیست.", 409);
        const item = pendingControls(await current.json()).find((control) => control.id === controlId && control.generation === generation);
        if (!item) return failure("این درخواست دیگر در انتظار پاسخ نیست. وضعیت را تازه کن.", 409);
        const decision = item.kind === "approval"
          ? (choice === "deny" || (choice === "once" && item.allowOnce)) && { choice }
          : typeof answer === "string" && answer.trim() && answer.length <= 1000 && { answer: answer.trim() };
        if (!decision) return failure("پاسخ این درخواست معتبر نیست.", 400);
        url.pathname += item.kind === "approval" ? "/approval" : "/clarify";
        headers.set("Content-Type", "application/json");
        const response = await fetch(url, {
          ...options, signal: AbortSignal.timeout(10000), method: "POST",
          body: JSON.stringify({ request_id: item.id, execution_generation: item.generation, ...decision }),
        });
        return response.ok ? Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } })
          : failure("Hermes پاسخ را ثبت نکرد. وضعیت را دوباره بررسی کن.", response.status === 409 ? 409 : 502);
      }
      if (action === "stop") {
        url.pathname += "/stop";
        options.method = "POST";
      }
    } else {
      return failure("عملیات میز کار معتبر نیست.", 400);
    }

    const response = await fetch(url, options);
    if (response.status === 404 && action === "status") return failure("Hermes دیگر وضعیت این کار را در دسترس ندارد.", 404);
    if (!response.ok) return failure("Hermes این عملیات را تأیید نکرد. وضعیت را دوباره بررسی کن.", 502);
    const data = await response.json() as Record<string, unknown>;
    if (action === "start") {
      if (typeof data.run_id !== "string" || !RUN.test(data.run_id)) return failure("شناسهٔ اجرای Hermes دریافت نشد.", 502);
      return Response.json({ ticket: data.run_id + "." + sign(config.key, owner, data.run_id), status: "queued" });
    }
    const reported = taskStatus(data.status);
    const status = action === "status" && reported === "running" && Array.isArray(data.pending_controls) && data.pending_controls.length
      ? "waiting" : reported;
    const output = status === "done" && typeof data.output === "string" ? data.output.slice(0, MAX_TASK_OUTPUT) : "";
    const note = status === "failed" ? "Hermes اجرای کار را ناموفق گزارش کرد."
      : status === "waiting" ? "ادامهٔ این کار به ورودی یا تأیید در Hermes نیاز دارد."
      : status === "unknown" ? "نتیجهٔ کار هنوز از Hermes تأیید نشده است." : undefined;
    return Response.json({ status, output, note, controls: status === "waiting" ? pendingControls(data) : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("ارتباط با Hermes برقرار نشد. وضعیت را دوباره بررسی کن.", 502);
  }
}
