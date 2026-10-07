import { spawnSync } from "node:child_process";
import { remainingBudget, runTimed } from "./time-budget.ts";
import { prepareE2e, selectE2e } from "./e2e-plan.ts";

// The public e2e watchdog owns one deadline for preparation and tests together.
const started = performance.now();
const controller = new AbortController();
const plan = prepareE2e(selectE2e(process.argv.slice(2)));
const run = async (command: string[]): Promise<void> => {
  const result = await runTimed(command, remainingBudget(started), { signal: controller.signal });
  if (result.status !== 0) throw new Error(`E2e command failed: ${command.join(" ")}`);
};
const browser = [
  "bun",
  "run",
  "--cwd",
  "packages/e2e",
  "playwright",
  "install",
  "--only-shell",
  ...(process.platform === "linux" ? ["--with-deps"] : []),
  ...plan.browsers,
];
await run(["bun", "run", "native:prepare"]);
const preparation = [
  ...(plan.browsers.length ? [run(browser)] : []),
  ...(plan.opencode ? [run(["bun", "run", "opencode:prepare"])] : []),
];
try {
  await Promise.all(preparation);
} catch (error) {
  controller.abort();
  await Promise.allSettled(preparation);
  throw error;
}
try {
  await run([
    "bun",
    "run",
    "vitest",
    "run",
    "--config",
    "packages/e2e/vitest.config.ts",
    ...process.argv.slice(2),
  ]);
} catch (error) {
  try {
    if (process.platform !== "win32") {
      // Failure-only probe: correlate detached source PIDs with post-Vitest
      // ancestry before runner finalization. Never collect argv or environment.
      const inventoryStarted = performance.now();
      process.stderr.write("[DEBUG-intel-lifetime] inventory-start\n");
      const inventory = spawnSync("ps", ["-A", "-o", "pid=,ppid=,pgid=,stat="], {
        encoding: "utf8",
        timeout: Math.min(1000, remainingBudget(started)),
      });
      process.stderr.write(
        `[DEBUG-intel-lifetime] inventory-end elapsedMs=${Math.round(performance.now() - inventoryStarted)} status=${inventory.status}\n`,
      );
      for (const line of (inventory.stdout ?? "").split("\n")) {
        const row = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([RSDTZWIXUENLsl+<>]+)\s*$/u.exec(line);
        if (row)
          process.stderr.write(
            `[DEBUG-intel-lifetime] pid=${row[1]} ppid=${row[2]} pgid=${row[3]} state=${row[4]}\n`,
          );
      }
    }
  } catch {
    process.stderr.write("[DEBUG-intel-lifetime] inventory-unavailable\n");
  }
  throw error;
}
