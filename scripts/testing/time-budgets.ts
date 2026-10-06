import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { remainingBudget, runTimed, TIME_BUDGET_MS } from "../time-budget.ts";
import { verifyProcessCleanup } from "./process-tree.ts";

assert.equal(TIME_BUDGET_MS, 300_000);
assert.equal(remainingBudget(0, 299_999), 1);
for (const now of [300_000, 300_001, -1, Number.NaN, Number.POSITIVE_INFINITY])
  assert.throws(() => remainingBudget(0, now), /time budget/u);
assert.equal((await runTimed(["bun", "-e", "process.exit(7)"], 5_000)).status, 7);
const success = await runTimed(["bun", "-e", "process.stdout.write('finished')"], 5_000, {
  capture: true,
});
assert.deepEqual(success, { status: 0, output: "finished" });
await assert.rejects(runTimed(["gate-canary-command-does-not-exist"]));
await assert.rejects(runTimed([]), /Expected a command/u);
await assert.rejects(
  runTimed(["bun", "--version"], 5_000, { signal: AbortSignal.abort() }),
  /Command interrupted/u,
);
if (process.platform !== "win32") {
  await assert.rejects(
    runTimed(
      [
        "bun",
        "-e",
        "setTimeout(() => process.kill(process.ppid, 'SIGTERM'), 20); setInterval(() => {}, 1000);",
      ],
      5_000,
    ),
    /Command interrupted/u,
  );
}
for (const timeout of [0, -1, 300_001, Number.NaN, Number.POSITIVE_INFINITY])
  await assert.rejects(runTimed(["bun", "--version"], timeout), /time budget/u);

// These exercise real subprocesses, including a nested public command and a
// blocked event loop. Short injected budgets keep the regression check fast.
const folder = mkdtempSync(join(tmpdir(), "opencode-stats-budget-"));
const file = join(folder, "slow.ts");
try {
  writeFileSync(file, 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);\n');
  for (const command of [
    ["bun", "-e", "while (true) {}"],
    ["bun", "run", "scripts/time-budget.ts", file],
  ]) {
    const started = performance.now();
    await assert.rejects(runTimed(command, 1_000, { capture: true }), /exceeded its time budget/u);
    assert.ok(
      performance.now() - started < 5_000,
      "Timed-out process tree did not terminate promptly",
    );
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}
for (const started of [
  "",
  "invalid",
  new Date(Date.now() - TIME_BUDGET_MS - 1000).toISOString(),
  new Date(Date.now() + 1000).toISOString(),
]) {
  const result = await runTimed(["bun", "run", "scripts/ci-duration.ts", started], 5_000, {
    capture: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Five-minute time budget/u);
}
assert.equal(
  (await runTimed(["bun", "run", "scripts/ci-duration.ts", new Date().toISOString()], 5_000))
    .status,
  0,
);
await verifyProcessCleanup();
if (process.platform === "linux") await import("./privileged-cleanup.ts");
process.stdout.write("Time budgets reject overdue runs and terminate test workers.\n");
