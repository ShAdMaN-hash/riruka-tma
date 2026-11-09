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
const runs = new Map();
const reservations = new Map();
const stub = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url.startsWith("/agent/v1/runs")) {
      assert.equal(request.headers.authorization, "Bearer fixture-agent-key");
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/agent/v1/runs" && request.method === "POST") {
        const job = JSON.parse(Buffer.concat(chunks));
        const key = request.headers["idempotency-key"];
        assert.match(key, /^[a-f0-9]{64}$/);
        assert.match(job.session_id, /^riruka-task-/);
        let run = reservations.get(key);
        if (!run) {
          run = "run_fixture_" + (runs.size + 1);
          reservations.set(key, run);
          runs.set(run, { polls: 0, input: job.input });
        }
        response.writeHead(202).end(JSON.stringify({ run_id: run, status: "started" }));
        return;
      }
      const [, id, stop] = request.url.match(/\/runs\/([^/]+)(\/stop)?$/) ?? [];
      const run = runs.get(id);
      if (!run) { response.writeHead(404).end("{}"); return; }
      if (stop) {
        assert.equal(request.method, "POST");
        run.stopped = true;
        response.end(JSON.stringify({ status: "stopping" }));
      } else {
        assert.equal(request.method, "GET");
        const status = run.stopped ? "cancelled" : run.polls++ ? "completed" : "running";
        response.end(JSON.stringify({ status, output: status === "completed" ? "# خروجی ایجنت\n" + run.input : "" }));
      }
      return;
    }
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
    TELEGRAM_ALLOWED_USER_IDS: [user, user + 2].join(","),
    HERMES_BASE_URL: base + "/hermes/v1",
    HERMES_API_KEY: "fixture-api-key",
    HERMES_MODEL: "hermes-agent",
    LLM_BASE_URL: base + "/fallback/v1",
    LLM_API_KEY: "fixture-api-key",
    LLM_MODEL: "fixture",
    HERMES_TASKS_ENABLED: "true",
    HERMES_TASK_BASE_URL: base + "/agent/v1",
    HERMES_TASK_API_KEY: "fixture-agent-key",
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

function task(action, fields, initData = signedInitData()) {
  return fetch(origin + "/api/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, initData, ...fields }), signal: AbortSignal.timeout(12000),
  });
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
  assert.match(await home.text(), /حالت‌های چهره/);
  const image = await fetch(origin + "/riruka-model.webp");
  assert.match(image.headers.get("content-type"), /image\/webp/);
  assert.ok((await image.arrayBuffer()).byteLength > 100000);

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

  const job = { id: randomUUID(), input: "گزارش آزمایشی" };
  assert.equal((await task("start", job, "")).status, 401);
  assert.equal((await task("start", job, signedInitData(user + 1))).status, 403);
  const start = await task("start", job);
  assert.equal(start.status, 200);
  const { ticket } = await start.json();
  assert.equal((await (await task("start", job)).json()).ticket, ticket);
  assert.equal(runs.size, 1);
  assert.equal((await task("status", { ticket }, signedInitData(user + 2))).status, 403);
  assert.equal((await (await task("status", { ticket })).json()).status, "running");
  const result = await (await task("status", { ticket })).json();
  assert.equal(result.status, "done");
  assert.match(result.output, /گزارش آزمایشی/);
  const second = await (await task("start", { ...job, id: randomUUID() })).json();
  assert.equal((await (await task("stop", { ticket: second.ticket })).json()).status, "stopping");
  assert.equal((await (await task("status", { ticket: second.ticket })).json()).status, "cancelled");

  console.log("Production studio, chat SSE, authorization, and Hermes Runs admission, tracking, idempotency, and stopping verified.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  child.kill();
  stub.closeAllConnections();
  await new Promise((resolve) => stub.close(resolve));
}
