import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 3600;
const CLOCK_SKEW_SECONDS = 30;

export function verifyTelegram(initData: string, botToken: string): number | null {
  const fields = new URLSearchParams(initData);
  const received = fields.get("hash");
  if (!received || !/^[a-f\d]{64}$/i.test(received)) return null;

  if (new Set(fields.keys()).size !== fields.size) return null;
  fields.delete("hash");
  fields.sort();
  const check = [...fields].map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(received, "hex"))) return null;

  const now = Math.floor(Date.now() / 1000);
  const authDate = Number(fields.get("auth_date"));
  if (!Number.isSafeInteger(authDate) || authDate > now + CLOCK_SKEW_SECONDS || now - authDate > MAX_AGE_SECONDS) {
    return null;
  }

  try {
    const user = JSON.parse(fields.get("user") ?? "null");
    return Number.isSafeInteger(user?.id) && user.id > 0 ? user.id : null;
  } catch {
    return null;
  }
}
