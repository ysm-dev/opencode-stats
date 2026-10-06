import { remainingBudget, runTimed } from "./time-budget.ts";

// The public e2e watchdog owns one deadline for preparation and tests together.
const started = performance.now();
const controller = new AbortController();
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
  ...(process.env["E2E_BROWSER"] === "chromium" ? ["chromium"] : ["chromium", "webkit"]),
];
await run(["bun", "run", "native:prepare"]);
const preparation = [run(browser), run(["bun", "run", "opencode:prepare"])];
try {
  await Promise.all(preparation);
} catch (error) {
  controller.abort();
  await Promise.allSettled(preparation);
  throw error;
}
await run([
  "bun",
  "run",
  "vitest",
  "run",
  "--config",
  "packages/e2e/vitest.config.ts",
  ...process.argv.slice(2),
]);
