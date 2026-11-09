import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { signedInitData, token, user } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const calls = [];
const stub = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const text = body.messages.at(-1).content;
    const hermes = request.url === "/hermes/v1/chat/completions";
    calls.push({ hermes, key: request.headers["idempotency-key"], session: request.headers["x-hermes-session-id"] });
    assert.equal(request.headers.authorization, "Bearer fixture-api-key");
    assert.equal(body.stream, true);
    assert.equal(body.messages[0].role, "system");
    if (text === "هیچ مدل" || (text === "مدل جایگزین" && hermes)) {
      response.writeHead(503).end("unavailable");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(": keepalive\n\nevent: hermes.tool.progress\ndata: ignored\n\n");
    response.write("data: " + JSON.stringify({
      choices: [{ delta: { content: hermes ? "سلام از Hermes" : "سلام از مدل جایگزین" } }],
    }) + "\n\n");
    if (text === "قطع میان پاسخ") { response.end(); return; }
    if (text === "موک آهسته") {
      const wait = setTimeout(() => response.end(), 5000);
      response.on("close", () => clearTimeout(wait));
      return;
    }
    response.end('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  } catch {
    response.writeHead(500).end("test stub rejected request");
  }
});
const slot = createServer();
stub.listen(0, "127.0.0.1");
slot.listen(0, "127.0.0.1");
await Promise.all([once(stub, "listening"), once(slot, "listening")]);
const port = slot.address().port;
await new Promise((resolve) => slot.close(resolve));

const base = "http://127.0.0.1:" + stub.address().port;
const origin = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
  env: {
    ...process.env,
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_ALLOWED_USER_IDS: String(user),
    HERMES_BASE_URL: base + "/hermes/v1",
    HERMES_API_KEY: "fixture-api-key",
    HERMES_MODEL: "hermes-agent",
    LLM_BASE_URL: base + "/fallback/v1",
    LLM_API_KEY: "fixture-api-key",
    LLM_MODEL: "fixture",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (data) => { serverLog += data; });
child.stderr.on("data", (data) => { serverLog += data; });

const sessionId = randomUUID();
const turnId = randomUUID();
function post(content, initData, fields) {
  return fetch(origin + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, turnId, messages: [{ role: "user", content }], initData, ...fields }),
    signal: AbortSignal.timeout(12000),
  });
}
async function events(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  return (await response.text()).split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

try {
  let home;
  for (let step = 0; step < 60; step++) {
    if (child.exitCode !== null) throw new Error("Production server stopped");
    home = await fetch(origin, { signal: AbortSignal.timeout(1000) }).catch(() => undefined);
    if (home?.ok) break;
    await delay(150);
  }
  assert.equal(home?.status, 200);
  assert.match(await home.text(), /گفت‌وگو با ریروکا/);

  const mock = await events(await post("ریروکا، امروز خیلی زیبایی!"));
  assert.equal(mock[0].source, "mock");
  assert.equal(mock.at(-1).mood, "FLUSTERED");
  assert.ok(mock.filter(({ type }) => type === "delta").length > 4);
  assert.equal((await events(await post("سلام", signedInitData(user + 1))))[0].source, "mock");
  assert.equal(calls.length, 0);
  assert.equal((await post("سلام", signedInitData().replace("fixture-query", "tampered"))).status, 401);
  assert.equal((await post("سلام", signedInitData(user, 1))).status, 401);
  assert.equal((await post("سلام", undefined, { turnId: "bad" })).status, 400);
  assert.equal((await post("ب".repeat(105000))).status, 413);

  const hermes = await events(await post("سلام", signedInitData()));
  assert.equal(hermes[0].source, "hermes");
  assert.equal(hermes[1].text, "سلام از Hermes");
  assert.equal(hermes.at(-1).type, "done");
  await events(await post("سلام", signedInitData()));
  assert.ok(calls[0].session.endsWith(sessionId));
  assert.match(calls[0].key, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].key, calls[1].key);

  assert.equal((await events(await post("مدل جایگزین", signedInitData(), { turnId: randomUUID() })))[0].source, "llm");
  assert.equal((await events(await post("هیچ مدل", signedInitData(), { turnId: randomUUID() })))[0].source, "mock");
  const partial = await events(await post("قطع میان پاسخ", signedInitData(), { turnId: randomUUID() }));
  assert.deepEqual(partial.map(({ type }) => type), ["source", "delta", "error"]);
  assert.equal(partial[2].code, "upstream_interrupted");

  const slow = await Promise.all([1, 2].map(() => post("موک آهسته", signedInitData(), { turnId: randomUUID() })));
  assert.deepEqual(slow.map(({ status }) => status), [200, 200]);
  const limited = await post("سلام", signedInitData(), { turnId: randomUUID() });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.has("retry-after"));
  await Promise.all(slow.map(({ body }) => body.cancel()));

  console.log("Production page, mock SSE, Telegram authorization, Hermes, fallback, partial error, and concurrency verified.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  child.kill();
  stub.closeAllConnections();
  await new Promise((resolve) => stub.close(resolve));
}
