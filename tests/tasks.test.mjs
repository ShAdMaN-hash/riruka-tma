import assert from "node:assert/strict";
import test from "node:test";
import { chatMarkdown, matchesMessage } from "../src/lib/chat.ts";
import { localTask, matchesTask, sortTasks, taskMarkdown, taskProgress, taskPromptForChat, taskStatusLabel, taskTitle } from "../src/lib/tasks.ts";

test("builds a deduplicated checklist from Persian numbered and bullet items", () => {
  const input = "۱. آماده‌سازی\n- مرور؛ 3. تمرین\n• مرور";
  const result = localTask("checklist", input);
  assert.deepEqual(result.items.map(({ text }) => text), ["آماده‌سازی", "مرور", "تمرین"]);
  result.items[1].checked = true;
  assert.match(taskMarkdown({ title: taskTitle(input), kind: "checklist", ...result }), /- \[x\] مرور/);
});

test("exports an extractive summary with the organized original", () => {
  const result = localTask("brief", "این یادداشت اول جلسه است. این جمله دوم است.\n\nاین یادداشت دوم جلسه است.");
  assert.match(result.output, /## جمله‌های آغازین بندها\n\n- این یادداشت اول جلسه است\./);
  assert.match(result.output, /## متن مرتب‌شده[\s\S]+این جمله دوم است\./);
});

test("counts saved checklist items as open until every item is checked", () => {
  const task = { kind: "checklist", status: "done", ...localTask("checklist", "تمرین\nمرور") };
  assert.equal(taskProgress(task), "open");
  assert.equal(taskStatusLabel(task), "در دست انجام");
  task.items[0].checked = true;
  assert.equal(taskProgress(task), "open");
  task.items[1].checked = true;
  assert.equal(taskProgress(task), "done");
  task.items.push({ text: "مورد تازه", checked: false });
  assert.equal(taskProgress(task), "open");
});

test("searches Persian checklist text across equivalent letters, digits and spacing", () => {
  const task = { kind: "checklist", status: "done", title: "ارائه", input: "کپی فایل", items: [{ text: "تمرین اسلایدهای ۲", checked: false }] };
  assert.equal(matchesTask(task, "كپي"), true);
  assert.equal(matchesTask(task, "اسلایدهای٢"), true);
  assert.equal(matchesTask(task, "پرینت"), false);
});

test("extracts explicit actions without turning descriptive notes into tasks", () => {
  const input = "جلسهٔ هماهنگی انتشار\n\nتیم نسخهٔ موبایل را بررسی کرد.\n\n- تست مسیر ورود\nاقدام: مرور خطاهای بیلد\nTODO: آماده‌کردن گزارش";
  const result = localTask("workflow", input);
  assert.deepEqual(result.items.map(({ text }) => text), ["تست مسیر ورود", "مرور خطاهای بیلد", "آماده‌کردن گزارش"]);
  assert.match(result.output, /تیم نسخهٔ موبایل را بررسی کرد/);
  const task = { kind: "workflow", title: "جلسه", status: "done", ...result };
  assert.equal(taskProgress(task), "open");
  result.items[0].checked = true;
  assert.match(taskMarkdown(task), /- \[x\] تست مسیر ورود/);
  assert.equal(taskProgress({ kind: "hermes", status: "draft" }), "draft");
});

test("sorts pinned tasks first and builds chat consultation prompt", () => {
  const olderPinned = { id: "1", at: 100, pinned: true, title: "کار مهم", kind: "checklist", status: "done", input: "الف", output: "", items: [{ text: "گام اول", checked: false }] };
  const newerUnpinned = { id: "2", at: 200, pinned: false, title: "کار عادی", kind: "checklist", status: "done", input: "ب", output: "", items: [] };
  const sorted = sortTasks([newerUnpinned, olderPinned]);
  assert.equal(sorted[0].id, "1");
  assert.match(taskPromptForChat(olderPinned), /گام اول/);
});

test("searches and exports Persian chat messages to Markdown", () => {
  const messages = [
    { id: "1", role: "user", content: "سلام ریروکا، برنامهٔ شماره ۲", at: 1000 },
    { id: "2", role: "assistant", content: "باشه شادمان، بررسی می‌کنیم.", at: 2000 },
  ];
  assert.equal(matchesMessage(messages[0], "شماره٢"), true);
  assert.match(chatMarkdown(messages, "شادمان"), /# تاریخچهٔ گفت‌وگو با ریروکا/);
});
