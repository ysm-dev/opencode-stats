import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TIME_BUDGET_MS } from "../time-budget.ts";
import { killProcessTree } from "../process-tree.ts";

// A separate process keeps the clock running even if the coordinator blocks.
export async function startTestDeadline(
  milliseconds = TIME_BUDGET_MS,
): Promise<() => Promise<void>> {
  if (!(milliseconds > 0 && milliseconds <= TIME_BUDGET_MS))
    throw new Error("Invalid test-run time budget");
  const started = performance.now();
  const watchdog = spawn(
    "bun",
    [
      fileURLToPath(new URL("./test-watchdog.ts", import.meta.url)),
      String(process.pid),
      String(Date.now() + milliseconds),
    ],
    {
      detached: true,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      serialization: "json",
    },
  );
  let cancelled = false;
  const exited = new Promise<number | null>((resolve) => {
    watchdog.once("exit", (code) => {
      resolve(code);
      if (!cancelled) {
        process.stderr.write("Test watchdog exited unexpectedly\n");
        killProcessTree(process.pid);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    watchdog.once("message", () => resolve());
    watchdog.once("error", reject);
    watchdog.once("exit", () => reject(new Error("Test watchdog failed to start")));
  });
  watchdog.unref();
  watchdog.channel?.unref();
  return async () => {
    cancelled = true;
    watchdog.ref();
    watchdog.disconnect();
    if ((await exited) !== 0 || performance.now() - started >= milliseconds)
      throw new Error("Five-minute test-run time budget exceeded");
  };
}

export default function setup(): Promise<() => Promise<void>> {
  return startTestDeadline();
}
