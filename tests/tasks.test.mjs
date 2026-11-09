import assert from "node:assert/strict";
import test from "node:test";
import { localTask, taskMarkdown, taskTitle } from "../src/lib/tasks.ts";

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
