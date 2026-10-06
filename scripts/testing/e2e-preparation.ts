import assert from "node:assert/strict";
import root from "../../package.json" with { type: "json" };
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTimed } from "../time-budget.ts";
import { running, stopRecorded } from "./process-tree.ts";

// Control commands at the public workspace boundary, not production env flags.
// A cold canary must never download browsers, run apt, or touch user config.
const folder = fs.mkdtempSync(join(tmpdir(), "opencode-stats-e2e-preparation-"));
const record = join(folder, "stages");
const pids = join(folder, "pids");
fs.mkdirSync(join(folder, "scripts"));
fs.mkdirSync(join(folder, "packages/e2e"), { recursive: true });
for (const name of ["e2e", "process-tree"])
  fs.copyFileSync(`scripts/${name}.ts`, join(folder, `scripts/${name}.ts`));
fs.writeFileSync(
  join(folder, "scripts/time-budget.ts"),
  fs.readFileSync("scripts/time-budget.ts", "utf8").replace("300_000", "500"),
);
fs.writeFileSync(
  join(folder, "package.json"),
  JSON.stringify({
    scripts: {
      e2e: root.scripts.e2e,
      "opencode:prepare": "bun stage.ts OpenCode",
      vitest: "bun stage.ts tests",
    },
  }),
);
fs.writeFileSync(
  join(folder, "packages/e2e/package.json"),
  JSON.stringify({ scripts: { playwright: "bun ../../stage.ts Playwright" } }),
);
fs.writeFileSync(
  join(folder, "stage.ts"),
  `import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
const stage = process.argv[2];
const steps = stage === "Playwright" ? ${process.platform === "linux" ? '["OS", "browser"]' : '["browser"]'} : [stage];
if (stage === "Playwright") assert.deepEqual(process.argv.slice(3), ["install", "--only-shell", ${process.platform === "linux" ? '"--with-deps", ' : ""}"chromium", "webkit"]);
for (const step of steps) {
  appendFileSync(${JSON.stringify(record)}, step + "\\n");
  if (step === process.env["BLOCK_PREPARATION"]) {
    appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
    spawn(process.execPath, [${JSON.stringify(join(folder, "worker.ts"))}], { detached: true, stdio: "inherit" }).unref();
    process.stdout.write(step + " preparation started\\n");
    while (true) {}
  }
}
`,
);
fs.writeFileSync(
  join(folder, "worker.ts"),
  `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
`,
);
const stages = [...(process.platform === "linux" ? ["OS"] : []), "browser", "OpenCode", "tests"];
try {
  for (const stage of stages) {
    const started = performance.now();
    const result = await runTimed(["bun", "run", "e2e"], 5000, {
      capture: true,
      cwd: folder,
      env: { ...process.env, BLOCK_PREPARATION: stage },
    });
    assert.notEqual(result.status, 0, `${stage}: public e2e lost its shared deadline`);
    assert.match(result.output, /exceeded its time budget \(500ms\)/u);
    assert.ok(result.output.includes(`${stage} preparation started`), result.output);
    assert.ok(performance.now() - started < 2000, `${stage}: preparation escaped its deadline`);
    assert.deepEqual(
      fs.readFileSync(record, "utf8").trim().split("\n"),
      stages.slice(0, stages.indexOf(stage) + 1),
    );
    const workers = fs.readFileSync(pids, "utf8").trim().split("\n").map(Number);
    assert.equal(workers.length, 2, `${stage}: detached workload was not reached`);
    assert.deepEqual(workers.filter(running), [], `${stage}: owned preparation workers survived`);
    process.stdout.write(
      `${stage}: ${Math.round(performance.now() - started)}ms; cold preparation workers stopped\n`,
    );
    fs.rmSync(record);
    fs.rmSync(pids);
  }
} finally {
  stopRecorded(pids);
  fs.rmSync(folder, { recursive: true, force: true });
}
process.stdout.write(
  "Public e2e preparation and tests share one deadline and clean up cold workloads.\n",
);
