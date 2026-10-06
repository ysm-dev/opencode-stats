import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runTimed } from "../time-budget.ts";
import { killProcessTree } from "../process-tree.ts";

export const running = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    if (process.platform === "win32") return true;
    const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" });
    return state.status === 0 && !state.stdout.trim().startsWith("Z");
  } catch {
    return false;
  }
};

const recorded = (file: string): number[] => {
  const pids = existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map(Number) : [];
  assert.ok(pids.every((pid) => Number.isSafeInteger(pid) && pid > 0));
  return pids;
};

export const stopRecorded = (file: string): void => {
  for (const pid of recorded(file)) {
    if (running(pid)) killProcessTree(pid);
  }
};

export async function verifyProcessCleanup(): Promise<void> {
  mkdirSync(".dev", { recursive: true });
  const folder = mkdtempSync(resolve(".dev/time-budget-"));
  const child = join(folder, "descendant.ts");
  const config = join(folder, "vitest.config.ts");
  const fixture = join(folder, "blocked.test.ts");
  const setup = join(folder, "setup.ts");
  const coordinator = join(folder, "coordinator.ts");
  const record = 'appendFileSync(process.env["BUDGET_PID_FILE"], `${process.pid}\\n`);';
  writeFileSync(
    child,
    `import { appendFileSync } from "node:fs";\nimport { spawn } from "node:child_process";\n${record}\nconst depth = Number(process.argv[2]);\nif (depth > 0) spawn(process.execPath, [process.argv[1], String(depth - 1)], { detached: true, stdio: "ignore" }).unref();\nprocess.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n`,
  );
  writeFileSync(
    fixture,
    `import { it } from "vitest";\nimport { appendFileSync } from "node:fs";\nimport { spawn } from "node:child_process";\nit("blocks with detached descendants", () => { ${record}\nspawn("bun", [${JSON.stringify(child)}, "1"], { detached: true, stdio: "ignore" }).unref();\nwhile (true) {}\n});\n`,
  );
  writeFileSync(
    setup,
    `import { startTestDeadline } from ${JSON.stringify(pathToFileURL(resolve("scripts/testing/time-budget-setup.ts")).href)};\nexport default () => startTestDeadline(2000);\n`,
  );
  writeFileSync(
    coordinator,
    `import { startTestDeadline } from ${JSON.stringify(pathToFileURL(resolve("scripts/testing/time-budget-setup.ts")).href)};\nimport { appendFileSync } from "node:fs";\nimport { spawn } from "node:child_process";\n${record}\nspawn("bun", [${JSON.stringify(child)}, "1"], { detached: true, stdio: "ignore" }).unref();\nawait startTestDeadline(1500);\nwhile (true) {}\n`,
  );
  writeFileSync(
    config,
    `export default { test: { include: [${JSON.stringify(fixture.replaceAll("\\", "/"))}], globalSetup: [${JSON.stringify(setup)}] } };\n`,
  );
  const failures: string[] = [];
  // A slow whole-system scan must not consume discovery time at every depth.
  // The fixture still requires all detached descendants to be gone before rescue.
  writeFileSync(
    join(folder, "ps"),
    '#!/bin/sh\nif [ "$1" = -A ]; then /bin/sleep 0.25; fi\nexec /bin/ps "$@"\n',
    { mode: 0o755 },
  );
  try {
    for (const mode of ["command", "vitest", "coordinator"]) {
      const pidsFile = join(folder, `${mode}.pids`);
      try {
        const options = {
          capture: true,
          env: {
            ...process.env,
            BUDGET_PID_FILE: pidsFile,
            PATH:
              process.platform === "win32"
                ? process.env["PATH"]
                : `${folder}:${process.env["PATH"]}`,
          },
        };
        if (mode === "command") {
          await assert.rejects(
            runTimed(["bun", child, "2"], 1000, options),
            /exceeded its time budget/u,
          );
        } else {
          const result = await runTimed(
            mode === "vitest"
              ? ["bun", "run", "vitest", "run", "--config", config]
              : ["node", coordinator],
            10_000,
            options,
          );
          assert.notEqual(result.status, 0);
          assert.match(result.output, /Five-minute test-run time budget exceeded/u);
        }
        const pids = recorded(pidsFile);
        assert.ok(
          pids.length >= 3,
          `${mode}: fixture did not create its worker and detached descendants`,
        );
        assert.deepEqual(pids.filter(running), [], `${mode}: workers survived the deadline`);
      } catch (error) {
        failures.push(`${mode}: ${String(error)}`);
      } finally {
        // Clean up even on the intentionally red run against the old watchdog.
        stopRecorded(pidsFile);
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export async function verifyCleanupDiagnostics(): Promise<void> {
  if (process.platform === "win32") return;
  const folder = mkdtempSync(resolve(".dev/cleanup-diagnostics-"));
  const pidsFile = join(folder, "pids");
  const child = join(folder, "child.ts");
  const originalPath = process.env["PATH"];
  const control = spawn("sleep", ["30"], { stdio: "ignore" });
  writeFileSync(
    child,
    `import { appendFileSync } from "node:fs";
appendFileSync(process.env["BUDGET_PID_FILE"], process.pid + "\\n");
setInterval(() => {}, 1000);
`,
  );
  writeFileSync(
    join(folder, "pgrep"),
    `#!/bin/sh
if [ "$1" = -P ]; then echo 'PRIVATE-cleanup-sentinel' >&2; exec /bin/sleep 2; fi
exec /usr/bin/pgrep "$@"
`,
    { mode: 0o755 },
  );
  try {
    process.env["PATH"] = `${folder}:${originalPath}`;
    const started = performance.now();
    await assert.rejects(
      runTimed([process.execPath, child], 500, {
        capture: true,
        env: { ...process.env, BUDGET_PID_FILE: pidsFile },
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(String(error), /Command cleanup failed/u);
        assert.match(String(error), /phase=inventory/u);
        assert.match(String(error), /code=ETIMEDOUT/u);
        assert.match(String(error), /inventoryMs=\d+/u);
        assert.match(String(error), /remainingMs=-?\d+/u);
        assert.doesNotMatch(String(error), /PRIVATE-cleanup-sentinel/u);
        assert.doesNotMatch(String(error), /exceeded its time budget/u);
        let original = error;
        while (original.cause instanceof Error) original = original.cause;
        assert.ok("code" in original && original.code === "ETIMEDOUT", "Original cause was lost");
        process.stdout.write(`Injected inventory timeout: ${String(error)}\n`);
        return true;
      },
    );
    process.env["PATH"] = originalPath;
    assert.ok(performance.now() - started < 2000, "Diagnostic fault escaped cleanup deadline");
    assert.equal(recorded(pidsFile).length, 1);
    assert.deepEqual(recorded(pidsFile).filter(running), [], "Diagnostic fault left owned workers");
    assert.ok(control.pid && running(control.pid), "Diagnostic fault killed unrelated control");
  } finally {
    process.env["PATH"] = originalPath;
    stopRecorded(pidsFile);
    control.kill("SIGKILL");
    rmSync(folder, { recursive: true, force: true });
  }
}
