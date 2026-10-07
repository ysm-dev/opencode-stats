import { spawn } from "node:child_process";
import process from "node:process";
import { killProcessTree } from "./process-tree.ts";

export const TIME_BUDGET_MS = 300_000;

export const remainingBudget = (started: number, now = performance.now()): number => {
  const remaining = TIME_BUDGET_MS - (now - started);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > TIME_BUDGET_MS)
    throw new Error("Five-minute time budget exceeded or invalid start time");
  return remaining;
};

export const runTimed = async (
  command: readonly string[],
  milliseconds = TIME_BUDGET_MS,
  options: { capture?: boolean; env?: NodeJS.ProcessEnv; cwd?: string; signal?: AbortSignal } = {},
): Promise<{ status: number; output: string }> => {
  const [executable, ...args] = command;
  if (!executable || !(milliseconds > 0 && milliseconds <= TIME_BUDGET_MS))
    throw new Error("Expected a command and a time budget of at most five minutes");
  if (options.signal?.aborted) throw new Error("Command interrupted");
  const started = performance.now();
  const child = spawn(executable, args, {
    // Route terminal interrupts through our cleanup before workers can orphan.
    detached: process.platform !== "win32",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  let output = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  let expired = false;
  let interrupted = false;
  const cleanupFailed = Promise.withResolvers<never>();
  const stop = (): void => {
    try {
      if (child.pid) killProcessTree(child.pid);
    } catch (error) {
      // A timer/signal callback must not throw and then wait indefinitely for
      // pipes retained by a child whose cleanup failed. Fail explicitly.
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      cleanupFailed.reject(new Error(`Command cleanup failed: ${String(error)}`, { cause: error }));
    }
  };
  const interrupt = (): void => {
    interrupted = true;
    stop();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  options.signal?.addEventListener("abort", interrupt, { once: true });
  const timer = setTimeout(() => {
    expired = true;
    stop();
  }, milliseconds);
  try {
    const status = await Promise.race([
      new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      }),
      cleanupFailed.promise,
    ]);
    if (expired || performance.now() - started >= milliseconds)
      throw new Error(`Command exceeded its time budget (${milliseconds}ms): ${command.join(" ")}`);
    if (interrupted) throw new Error("Command interrupted");
    return { status: status ?? 1, output };
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    options.signal?.removeEventListener("abort", interrupt);
  }
};

if (import.meta.main)
  process.exitCode = (await runTimed(["bun", "run", ...process.argv.slice(2)])).status;
