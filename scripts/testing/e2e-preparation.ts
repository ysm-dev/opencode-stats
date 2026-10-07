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
fs.mkdirSync(join(folder, "packages/e2e/tests"), { recursive: true });
fs.writeFileSync(join(folder, "packages/e2e/tests/synthetic.test.ts"), "export {};\n");
for (const name of ["e2e", "process-tree", "e2e-plan", "shard"])
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
      "native:prepare": "bun stage.ts Native",
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
import { appendFileSync, existsSync, readFileSync } from "node:fs";
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
if (process.env["VERIFY_OVERLAP"] === "1" && (stage === "Playwright" || stage === "OpenCode")) {
  const sibling = stage === "Playwright" ? "OpenCode" : "browser";
  while (!readFileSync(${JSON.stringify(record)}, "utf8").split("\\n").includes(sibling)) await Bun.sleep(5);
}
if (process.env["FAIL_PREPARATION"] === stage) {
  while (!existsSync(${JSON.stringify(pids)}) || readFileSync(${JSON.stringify(pids)}, "utf8").trim().split("\\n").length !== 2) await Bun.sleep(5);
  process.exit(42);
}
if (stage === "tests" && process.env["FAIL_TESTS"] === "1") process.exit(42);
`,
);
fs.writeFileSync(
  join(folder, "worker.ts"),
  `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
`,
);
const stages = [
  "Native",
  ...(process.platform === "linux" ? ["OS"] : []),
  "browser",
  "OpenCode",
  "tests",
];
try {
  const overlap = await runTimed(["bun", "run", "e2e"], 5000, {
    capture: true,
    cwd: folder,
    env: { ...process.env, VERIFY_OVERLAP: "1" },
  });
  assert.equal(overlap.status, 0, `Parallel e2e preparation did not complete\n${overlap.output}`);
  assert.equal(
    fs.readFileSync(record, "utf8").trim().split("\n")[0],
    "Native",
    "Native preparation must precede runtimes and tests",
  );
  assert.deepEqual(
    fs.readFileSync(record, "utf8").trim().split("\n").toSorted(),
    stages.toSorted(),
  );
  fs.rmSync(record);
  if (process.platform !== "win32")
    fs.writeFileSync(
      join(folder, "ps"),
      '#!/bin/sh\necho PRIVATE-lifetime-sentinel\necho PRIVATE-lifetime-sentinel >&2\nexec /bin/ps "$@"\n',
      { mode: 0o755 },
    );
  const failedTests = await runTimed(["bun", "run", "e2e"], 5000, {
    capture: true,
    cwd: folder,
    env: {
      ...process.env,
      FAIL_TESTS: "1",
      PATH: `${folder}${process.platform === "win32" ? ";" : ":"}${process.env["PATH"]}`,
    },
  });
  assert.notEqual(failedTests.status, 0);
  assert.match(failedTests.output, /E2e command failed/u);
  if (process.platform !== "win32") {
    assert.match(failedTests.output, /\[DEBUG-intel-lifetime\] inventory-start/u);
    assert.match(failedTests.output, /\[DEBUG-intel-lifetime\] inventory-end elapsedMs=\d+ status=0/u);
    assert.match(
      failedTests.output,
      /\[DEBUG-intel-lifetime\] pid=\d+ ppid=\d+ pgid=\d+ state=[A-Za-z+<]+/u,
    );
  }
  assert.doesNotMatch(failedTests.output, /PRIVATE-lifetime-sentinel/u);
  assert.doesNotMatch(overlap.output, /DEBUG-intel-lifetime/u);
  fs.rmSync(record);
  for (const [failure, blocked] of [
    ["OpenCode", "browser"],
    ["Playwright", "OpenCode"],
  ]) {
    const result = await runTimed(["bun", "run", "e2e"], 5000, {
      capture: true,
      cwd: folder,
      env: { ...process.env, FAIL_PREPARATION: failure, BLOCK_PREPARATION: blocked },
    });
    assert.notEqual(result.status, 0, "Failed preparation must reject");
    assert.match(result.output, /E2e command failed/u);
    assert.doesNotMatch(result.output, /exceeded its time budget/u);
    assert.ok(!fs.readFileSync(record, "utf8").split("\n").includes("tests"));
    const workers = fs.readFileSync(pids, "utf8").trim().split("\n").map(Number);
    assert.equal(workers.length, 2, "Failed preparation must reach its sibling's detached worker");
    assert.deepEqual(workers.filter(running), [], "Failed preparation left its sibling running");
    fs.rmSync(record);
    fs.rmSync(pids);
  }
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
    const observed = fs.readFileSync(record, "utf8").trim().split("\n");
    const expected =
      stage === "Native"
        ? ["Native"]
        : stage === "tests" || stage === "OpenCode"
          ? stages.filter((step) => step !== "tests" || stage === "tests")
          : [...stages.slice(0, stages.indexOf(stage) + 1), "OpenCode"];
    assert.deepEqual(observed.toSorted(), expected.toSorted());
    assert.ok(
      !observed.includes("browser") || observed.indexOf("OS") < observed.indexOf("browser"),
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
