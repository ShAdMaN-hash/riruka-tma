import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const flags = process.argv.slice(2)
  .filter((flag) => flag !== "--strictPort")
  .map((flag) => flag.replace(/^--host(?==|$)/, "--hostname"));
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...flags], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.on("exit", (code) => { process.exitCode = code ?? 0; });
