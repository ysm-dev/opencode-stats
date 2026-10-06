import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import root from "../../package.json" with { type: "json" };
import { runTimed } from "../time-budget.ts";
import { running, stopRecorded } from "./process-tree.ts";

const folder = mkdtempSync(join(tmpdir(), "opencode-stats-ci-"));
const record = join(folder, "stages.txt");
const pids = join(folder, "workers.txt");
const stages = ["ci:checks", "contracts", "release", "e2e", "verify-gates"];
mkdirSync(join(folder, "scripts"));
copyFileSync("scripts/process-tree.ts", join(folder, "scripts/process-tree.ts"));
writeFileSync(
  join(folder, "scripts/time-budget.ts"),
  readFileSync("scripts/time-budget.ts", "utf8").replace("300_000", "450"),
);
if (existsSync("scripts/ci.ts")) copyFileSync("scripts/ci.ts", join(folder, "scripts/ci.ts"));
writeFileSync(
  join(folder, "stage.ts"),
  `import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
const name = process.argv[2];
if (name === "verify-gates" && process.env["VERIFICATION_SHARD"] !== undefined) throw new Error("Inherited verification selector");
appendFileSync(${JSON.stringify(record)}, name + "\\n");
if (name === process.env["CI_FIXTURE_BLOCK"]) {
  appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
  spawn(process.execPath, ["worker.ts", "1"], { detached: true, stdio: "ignore" }).unref();
  while (true) {}
}
await Bun.sleep(Number(process.env["CI_FIXTURE_DELAY"]));
process.exitCode = name === process.env["CI_FIXTURE_FAIL"] ? 7 : 0;
`,
);
writeFileSync(
  join(folder, "worker.ts"),
  `import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
if (process.argv[2] === "1") spawn(process.execPath, ["worker.ts", "0"], { detached: true, stdio: "ignore" }).unref();
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
);
writeFileSync(
  join(folder, "package.json"),
  JSON.stringify({
    scripts: {
      ci: root.scripts.ci,
      ...Object.fromEntries(stages.map((name) => [name, `bun run stage.ts ${name}`])),
    },
  }),
);
const run = (env: NodeJS.ProcessEnv) =>
  runTimed(["bun", "run", "--cwd", folder, "ci"], 5_000, {
    capture: true,
    env: { ...process.env, ...env },
  });
try {
  const started = performance.now();
  const overdue = await run({ CI_FIXTURE_DELAY: "130" });
  assert.notEqual(
    overdue.status,
    0,
    `The entire public CI aggregate must share one deadline\n${overdue.output}`,
  );
  assert.match(overdue.output, /exceeded its time budget/u);
  assert.ok(performance.now() - started < 2_000, "Aggregate timeout did not fail promptly");
  rmSync(record);
  const success = await run({
    CI_FIXTURE_DELAY: "0",
    VERIFICATION_SHARD: "invalid-inherited-selector",
  });
  assert.equal(success.status, 0, success.output);
  assert.deepEqual(readFileSync(record, "utf8").trim().split("\n"), stages);
  rmSync(record);
  const failure = await run({ CI_FIXTURE_DELAY: "0", CI_FIXTURE_FAIL: "contracts" });
  assert.notEqual(failure.status, 0);
  assert.deepEqual(readFileSync(record, "utf8").trim().split("\n"), stages.slice(0, 2));
  const blocked = await run({ CI_FIXTURE_DELAY: "0", CI_FIXTURE_BLOCK: "contracts" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.output, /exceeded its time budget/u);
  const workers = readFileSync(pids, "utf8").trim().split("\n").map(Number);
  assert.equal(workers.length, 3, "Blocked stage did not create both detached descendants");
  assert.deepEqual(
    workers.filter(running),
    [],
    "CI left descendants alive after its aggregate deadline",
  );
} finally {
  stopRecorded(pids);
  rmSync(folder, { recursive: true, force: true });
}
process.stdout.write("Public CI shares one deadline, runs all gates in order and fails closed.\n");
