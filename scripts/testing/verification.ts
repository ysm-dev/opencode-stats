import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTimed } from "../time-budget.ts";
import { running, stopRecorded } from "./process-tree.ts";

const folder = mkdtempSync(join(tmpdir(), "opencode-stats-verification-"));
const source = join(folder, "source");
const record = join(folder, "shards.txt");
const pids = join(folder, "workers.txt");
mkdirSync(join(source, "scripts"), { recursive: true });
for (const name of ["time-budget", "process-tree", "verification-shards"])
  copyFileSync(`scripts/${name}.ts`, join(source, `scripts/${name}.ts`));
writeFileSync(
  join(source, "package.json"),
  JSON.stringify({
    name: "verification-fixture",
    scripts: { "verify-gates": "bun run scripts/time-budget.ts scripts/check.ts" },
  }),
);
writeFileSync(join(source, "canary.txt"), "original");
writeFileSync(
  join(source, "scripts/check.ts"),
  `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { verifyShards } from "./verification-shards.ts";
const selector = process.env["VERIFICATION_SHARD"];
if (!selector) await verifyShards();
else {
  if (readFileSync("canary.txt", "utf8") !== "original") throw new Error("Shared planted fixtures");
  writeFileSync("canary.txt", selector);
  appendFileSync(${JSON.stringify(record)}, selector + "\\n");
  if (process.env["VERIFICATION_FIXTURE_FAIL"] && selector === "1/16") {
    spawn(process.execPath, ["scripts/worker.ts"], { detached: true, stdio: "ignore" }).unref();
    while (true) {}
  }
  await Bun.sleep(100);
  if (process.env["VERIFICATION_FIXTURE_FAIL"] && selector === "2/16") process.exit(7);
}
`,
);
writeFileSync(
  join(source, "scripts/worker.ts"),
  `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
`,
);
const run = (env: NodeJS.ProcessEnv = {}) =>
  runTimed(["bun", "run", "--cwd", source, "verify-gates"], 10_000, {
    capture: true,
    env: { ...process.env, VERIFICATION_SHARD: undefined, ...env },
  });
try {
  const result = await run();
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(
    readFileSync(record, "utf8").trim().split("\n").toSorted(),
    Array.from({ length: 16 }, (_, index) => `${index + 1}/16`).toSorted(),
    "Missing verification shards",
  );
  assert.equal(readFileSync(join(source, "canary.txt"), "utf8"), "original");
  rmSync(record);
  const started = performance.now();
  const failure = await run({ VERIFICATION_FIXTURE_FAIL: "1" });
  assert.notEqual(failure.status, 0);
  assert.match(failure.output, /shard 2\/16 failed/u);
  assert.ok(
    performance.now() - started < 5_000,
    "Sibling failure did not cancel blocked verification promptly",
  );
  const workers = readFileSync(pids, "utf8").trim().split("\n").map(Number);
  assert.equal(workers.length, 1);
  assert.deepEqual(workers.filter(running), [], "Failed verification left detached siblings alive");
  assert.ok(
    !readFileSync(record, "utf8").includes("16/16"),
    "Verification kept starting shards after failure",
  );
  assert.equal(readFileSync(join(source, "canary.txt"), "utf8"), "original");
} finally {
  stopRecorded(pids);
  rmSync(folder, { recursive: true, force: true });
}
process.stdout.write("Verification shards are exhaustive, isolated and cancel failed siblings.\n");
