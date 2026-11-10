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
  { at: 100, label: "هم‌پیمان ویژه", line: "هومف… فکر نکنی خیلی برام مهمیا! ولی خب… همیشه پیشم بمون، شادمان." },
] as const;

export const gifts = [
  {
    id: "donut",
    label: "دونات توت‌فرنگی",
    points: 5,
    mood: "HAPPY" as Reaction,
    line: "واو! دونات توت‌فرنگی؟ از کجا می‌دونستی عاشقشم؟ هومف… مرسی شادمان!",
  },
  {
    id: "plush",
    label: "عروسک خرگوشی",
    points: 6,
    mood: "FLUSTERED" as Reaction,
    line: "چـقدر نازه! یعنی… برای من گرفتیش؟ خب، می‌ذارمش کنار میزم تا یادت بیفتم.",
  },
  {
    id: "matcha",
    label: "لاتهٔ ماچا",
    points: 4,
    mood: "TSUNDERE" as Reaction,
    line: "هومف… درست موقعی که خسته بودم! معلومه حواست خوب به من جمعه‌ها.",
  },
] as const;

export type GiftId = (typeof gifts)[number]["id"];

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
  if (/ممنون|مرسی|خوشحال|عالی|thanks|سلام|دونات|هدیه|برنامه|مأموریت/i.test(input)) return "HAPPY";
  return "TSUNDERE";
}

function normalizeChatSearch(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[\s\u064b-\u065f\u200c\u200d]+/g, "");
}

export function matchesMessage(message: Message, query: string) {
  const needle = normalizeChatSearch(query);
  return !needle || normalizeChatSearch(message.content).includes(needle);
}

export function chatMarkdown(messages: Message[], userName: string) {
  const header = `# تاریخچهٔ گفت‌وگو با ریروکا\n\nکاربر: ${userName}\nتعداد پیام‌ها: ${faNumber.format(messages.length)}\n`;
  if (!messages.length) return header + "\n_(هنوز پیامی ثبت نشده است.)_\n";
  const body = messages.map((msg) => {
    const speaker = msg.role === "user" ? userName : "ریروکا";
    return `## ${speaker}\n\n${msg.content.trim()}`;
  }).join("\n\n---\n\n");
  return `${header}\n${body}\n`;
}
