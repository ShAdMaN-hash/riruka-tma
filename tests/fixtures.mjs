import { createHmac } from "node:crypto";

export const token = "123456:test-fixture-token";
export const user = 424242;

export function signedInitData(id = user, authDate = Math.floor(Date.now() / 1000)) {
  const fields = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "fixture-query",
    user: JSON.stringify({ id, first_name: "شادمان + test" }),
    signature: "fixture-signature",
  });
  fields.sort();
  const check = [...fields].map(([key, value]) => key + "=" + value).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  fields.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return fields.toString();
}
