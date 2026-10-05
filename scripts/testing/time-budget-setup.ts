import process from "node:process";
import { remainingBudget, TIME_BUDGET_MS } from "../time-budget.ts";

// Also bound direct Vitest invocations that bypass the package-script watchdog.
export default function setup(): () => void {
  const started = performance.now();
  const timer = setTimeout(() => {
    process.stderr.write("Five-minute test-run time budget exceeded\n");
    process.exit(1);
  }, TIME_BUDGET_MS);
  timer.unref();
  return () => {
    clearTimeout(timer);
    remainingBudget(started);
  };
}
