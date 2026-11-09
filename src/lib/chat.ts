export const MAX_INPUT = 2000;
export const MAX_REPLY = 16000;
export const MAX_BODY_BYTES = 192 * 1024;
export const HISTORY_LIMIT = 24;
export const DEVICE_LIMIT = 60;
export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export const moods = ["TSUNDERE", "YANDERE", "FLUSTERED", "HAPPY", "ANGRY", "THINKING"] as const;
export type Mood = (typeof moods)[number];
export type Reaction = Exclude<Mood, "THINKING">;
export type Source = "hermes" | "llm" | "mock";
export type Role = "user" | "assistant";
export type Turn = { role: Role; content: string };
export type Message = Turn & { id: string; at: number; source?: Source };
export type ChatRequest = { messages: Turn[]; sessionId: string; turnId: string; initData?: string };
export type ChatEvent =
  | { type: "source"; source: Source }
  | { type: "delta"; text: string }
  | { type: "done"; mood: Reaction }
  | { type: "error"; code: string; message: string };

export const moodLabels: Record<Mood, string> = {
  TSUNDERE: "خجالتی و مغرور",
  YANDERE: "حسود",
  FLUSTERED: "دستپاچه",
  HAPPY: "خوشحال",
  ANGRY: "عصبی",
  THINKING: "در حال فکر",
};

export const sourceLabels: Record<Source, string> = {
  mock: "آزمایشی",
  hermes: "Hermes",
  llm: "مدل جایگزین",
};

export const badges = [
  { at: 20, label: "جرقه", line: "هومف… کم‌کم دارم به دیدنت عادت می‌کنم." },
  { at: 50, label: "هم‌دل", line: "شادمان، کنار تو راحت‌تر حرف می‌زنم." },
  { at: 80, label: "ستارهٔ هم‌صحبت", line: "گفت‌وگوهای ما دیگه یه جای خاص توی روزم دارن." },
] as const;

export const faNumber = new Intl.NumberFormat("fa-IR");
export const greeting = "سلام، شادمان… بالاخره پیدات شد. خب، امروز می‌خوای دربارهٔ چی حرف بزنیم؟";
export const apiError = "ارتباط با ریروکا قطع شد. دوباره امتحان کن.";

export function isSource(value: unknown): value is Source {
  return value === "mock" || value === "hermes" || value === "llm";
}

export function isTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object") return false;
  const { role, content } = value as Partial<Turn>;
  return (role === "user" || role === "assistant") && typeof content === "string" &&
    Boolean(content.trim()) && content.length <= (role === "user" ? MAX_INPUT : MAX_REPLY);
}

export function reactionMood(input: string): Reaction {
  if (/حسادت|یکی دیگه|دوست دیگه|دوست[‌\s]+های جدید|دوست جدید|یکی دیگر|حسود|رقیب|jealous/i.test(input)) return "YANDERE";
  if (/عصبانی|عصبی|کلافه|angry/i.test(input)) return "ANGRY";
  if (/زیبا|خوشگل|ناز|دوستت دارم|تعریف|cute|beautiful/i.test(input)) return "FLUSTERED";
  if (/ممنون|مرسی|خوشحال|عالی|thanks|سلام/i.test(input)) return "HAPPY";
  return "TSUNDERE";
}
