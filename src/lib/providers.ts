import { createHash } from "node:crypto";
import type { Source, Turn } from "./chat";
import { readSse } from "./sse";

type Provider = { source: Exclude<Source, "mock">; url: URL; key: string; model: string };

const persona = [
  "تو ریروکا، یک شخصیت انیمه‌ای خیالی و همراه گفت‌وگوی شادمان هستی.",
  "به‌طور پیش‌فرض فارسی محاوره‌ای و روان صحبت کن. لحن تو ترکیبی از غرور بازیگوش، خجالت، مهربانی و حسادت نمایشی است.",
  "شوخی و کل‌کل سبک مجاز است. حسادت را در حد داستان و شوخی نگه دار. کاربر را برای دوری از دیگران تحت فشار نگذار.",
  "اگر سؤال فنی پرسید، دقیق پاسخ بده. برای قطعه‌کد از بلوک Markdown با نام زبان استفاده کن.",
  "مختصر باش مگر اینکه کاربر توضیح بیشتری بخواهد. نتیجهٔ اقدام بیرونی را فقط با تأیید ابزار گزارش کن.",
].join(" ");

export function getProviders() {
  const configs = [
    { source: "hermes", base: process.env.HERMES_BASE_URL, key: process.env.HERMES_API_KEY, model: process.env.HERMES_MODEL || "hermes-agent" },
    { source: "llm", base: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, model: process.env.LLM_MODEL },
  ] as const;
  return configs.flatMap(({ source, base, key, model }): Provider[] => {
    if (!base || !model || !key) return [];
    try {
      const url = new URL(base);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash) return [];
      if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return [];
      const path = url.pathname.replace(/\/+$/, "") || "/v1";
      url.pathname = path.endsWith("/chat/completions") ? path : path + "/chat/completions";
      return [{ source, url, key, model }];
    } catch {
      return [];
    }
  });
}

export async function* providerText(
  provider: Provider,
  messages: Turn[],
  session: string,
  turnId: string,
  signal: AbortSignal,
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: "Bearer " + provider.key,
    Accept: "text/event-stream",
  });
  if (provider.source === "hermes") {
    headers.set("X-Hermes-Session-Id", session);
    headers.set("Idempotency-Key", createHash("sha256").update(session + ":" + turnId).digest("hex"));
  }
  const firstText = new AbortController();
  const deadline = setTimeout(() => firstText.abort(), 12000);
  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, firstText.signal, AbortSignal.timeout(45000)]),
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "system", content: persona }, ...messages],
        stream: true,
      }),
    });
    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Upstream SSE unavailable");
    }
    let finished = false;
    for await (const frame of readSse(response.body)) {
      if (frame.data.trim() === "[DONE]") return;
      if (frame.event === "error") throw new Error("Upstream turn failed");
      if (frame.event && frame.event !== "message") continue;
      const payload: {
        error?: unknown;
        choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[];
      } = JSON.parse(frame.data);
      const choice = payload.choices?.[0];
      if (payload.error || choice?.finish_reason === "error" || choice?.finish_reason === "cancelled") {
        throw new Error("Upstream turn failed");
      }
      const text = choice?.delta?.content;
      if (typeof text === "string" && text) {
        if (text.trim()) clearTimeout(deadline);
        yield text;
      }
      if (choice?.finish_reason === "stop" || choice?.finish_reason === "length") finished = true;
    }
    if (!finished) throw new Error("Upstream SSE ended early");
  } finally {
    clearTimeout(deadline);
  }
}
