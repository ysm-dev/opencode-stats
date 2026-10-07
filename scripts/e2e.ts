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
await run([
  "bun",
  "run",
  "vitest",
  "run",
  "--config",
  "packages/e2e/vitest.config.ts",
  ...process.argv.slice(2),
]);
