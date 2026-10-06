import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTimed } from "../time-budget.ts";
import { running, stopRecorded } from "./process-tree.ts";
import { VERIFICATION_SHARDS } from "../shard.ts";

const folder = mkdtempSync(join(tmpdir(), "opencode-stats-verification-"));
const source = join(folder, "source");
const record = join(folder, "shards.txt");
const pids = join(folder, "workers.txt");
const ready = join(folder, "ready.json");
mkdirSync(join(source, "scripts"), { recursive: true });
for (const name of ["time-budget", "process-tree", "verification-shards", "shard"])
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
  `import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { verifyShards } from "./verification-shards.ts";
const selector = process.env["VERIFICATION_SHARD"];
if (!selector) await verifyShards();
else {
  if (readFileSync("canary.txt", "utf8") !== "original") throw new Error("Shared planted fixtures");
  writeFileSync("canary.txt", selector);
  appendFileSync(${JSON.stringify(record)}, selector + "\\n");
  if (process.env["VERIFICATION_FIXTURE_FAIL"] && selector === "1/${VERIFICATION_SHARDS}") {
    spawn(process.execPath, ["scripts/worker.ts", String(process.pid)], { detached: true, stdio: "ignore" }).unref();
    while (true) {}
  }
  if (process.env["VERIFICATION_FIXTURE_FAIL"] && selector === "2/${VERIFICATION_SHARDS}") {
    // The failure must happen after the detached worker is live and owned by
    // the blocked sibling, not after an arbitrary startup delay.
    while (!existsSync(${JSON.stringify(ready)})) await Bun.sleep(10);
    const worker = JSON.parse(readFileSync(${JSON.stringify(ready)}, "utf8"));
    assert.equal(worker.shard, "1/${VERIFICATION_SHARDS}");
    assert.equal(worker.parent, worker.owner);
    assert.notEqual(worker.directory, process.cwd());
    assert.equal(readFileSync(worker.directory + "/canary.txt", "utf8"), "1/${VERIFICATION_SHARDS}");
    process.kill(worker.pid, 0);
    process.kill(worker.parent, 0);
    process.stdout.write("Blocked sibling owns a live detached worker\\n");
    process.exit(7);
  }
  await Bun.sleep(100);
}
`,
);
writeFileSync(
  join(source, "scripts/worker.ts"),
  `import { appendFileSync, renameSync, writeFileSync } from "node:fs";
process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
writeFileSync(${JSON.stringify(`${ready}.pending`)}, JSON.stringify({
  pid: process.pid, parent: process.ppid, directory: process.cwd(),
  owner: Number(process.argv[2]),
  shard: process.env["VERIFICATION_SHARD"],
}));
renameSync(${JSON.stringify(`${ready}.pending`)}, ${JSON.stringify(ready)});
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
    Array.from(
      { length: VERIFICATION_SHARDS },
      (_, index) => `${index + 1}/${VERIFICATION_SHARDS}`,
    ).toSorted(),
    "Missing verification shards",
  );
  assert.equal(readFileSync(join(source, "canary.txt"), "utf8"), "original");
  rmSync(record);
  const started = performance.now();
  const failure = await run({ VERIFICATION_FIXTURE_FAIL: "1" });
  assert.notEqual(failure.status, 0);
  assert.ok(failure.output.includes(`shard 2/${VERIFICATION_SHARDS} failed`), failure.output);
  assert.match(failure.output, /Blocked sibling owns a live detached worker/u);
  assert.ok(
    performance.now() - started < 5_000,
    "Sibling failure did not cancel blocked verification promptly",
  );
  const workers = readFileSync(pids, "utf8").trim().split("\n").map(Number);
  assert.equal(workers.length, 1);
  assert.deepEqual(workers.filter(running), [], "Failed verification left detached siblings alive");
  assert.ok(
    !readFileSync(record, "utf8").includes(`${VERIFICATION_SHARDS}/${VERIFICATION_SHARDS}`),
    "Verification kept starting shards after failure",
  );
  assert.equal(readFileSync(join(source, "canary.txt"), "utf8"), "original");
} finally {
  stopRecorded(pids);
  rmSync(folder, { recursive: true, force: true });
}
process.stdout.write("Verification shards are exhaustive, isolated and cancel failed siblings.\n");
