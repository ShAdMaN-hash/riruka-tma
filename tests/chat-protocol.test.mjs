import assert from "node:assert/strict";
import test from "node:test";
import { readSse } from "../src/lib/sse.ts";
import { verifyTelegram } from "../src/lib/telegram-auth.ts";
import { signedInitData, token, user } from "./fixtures.mjs";

test("validates Telegram data with Unicode, plus signs and signature field", () => {
  assert.equal(verifyTelegram(signedInitData(), token), user);
  assert.equal(verifyTelegram(signedInitData(), "wrong"), null);
  assert.equal(verifyTelegram(signedInitData().replace("fixture-query", "other-query"), token), null);
  assert.equal(verifyTelegram(signedInitData() + "&query_id=duplicate", token), null);
});

test("rejects old and future auth timestamps", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyTelegram(signedInitData(user, now - 3601), token), null);
  assert.equal(verifyTelegram(signedInitData(user, now + 120), token), null);
});

test("parses Persian byte boundaries, CRLF, named events, comments and multiline data", async () => {
  const bytes = new TextEncoder().encode(": heartbeat\r\n\r\nevent: test\r\ndata: سَلام\r\ndata: شادمان\r\n\r\ndata: [DONE]");
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const frames = [];
  for await (const frame of readSse(stream)) frames.push(frame);
  assert.deepEqual(frames, [{ event: "test", data: "سَلام\nشادمان" }, { event: "", data: "[DONE]" }]);
});

test("bounds oversized SSE frames and cancels the reader on early exit", async () => {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode("data: first\n\n")); },
    cancel() { cancelled = true; },
  });
  for await (const _ of readSse(stream)) break;
  assert.equal(cancelled, true);

  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("data: " + "a".repeat(131073) + "\n\n"));
      controller.close();
    },
  });
  await assert.rejects(async () => { for await (const _ of readSse(oversized)) {} }, /too large/);
});
