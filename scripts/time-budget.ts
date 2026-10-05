import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

export const TIME_BUDGET_MS = 300_000;

export const remainingBudget = (started: number, now = performance.now()): number => {
  const remaining = TIME_BUDGET_MS - (now - started);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > TIME_BUDGET_MS)
    throw new Error("Five-minute time budget exceeded or invalid start time");
  return remaining;
};

// Kill the command's process tree, including test workers that ignore SIGTERM.
const killTree = (pid: number): void => {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    if (result.error) throw result.error;
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error;
    }
  }
};

export const runTimed = async (
  command: readonly string[],
  milliseconds = TIME_BUDGET_MS,
  options: { capture?: boolean; env?: NodeJS.ProcessEnv; nested?: boolean } = {},
): Promise<{ status: number; output: string }> => {
  const [executable, ...args] = command;
  if (!executable || !(milliseconds > 0 && milliseconds <= TIME_BUDGET_MS))
    throw new Error("Expected a command and a time budget of at most five minutes");
  const started = performance.now();
  // Public wrappers nested under verification stay in its process group, so
  // the outer deadline can kill every worker before restoring planted files.
  const child = spawn(executable, args, {
    detached: process.platform !== "win32" && !options.nested,
    stdio: options.capture ? "pipe" : "inherit",
    env: { ...(options.env ?? process.env), TIMED_COMMAND: "1" },
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
  const stop = (): void => {
    if (child.pid) {
      if (options.nested && process.platform !== "win32") child.kill("SIGKILL");
      else killTree(child.pid);
    }
  };
  const interrupt = (): void => {
    interrupted = true;
    stop();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const timer = setTimeout(() => {
    expired = true;
    stop();
  }, milliseconds);
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (expired || performance.now() - started >= milliseconds)
      throw new Error(`Command exceeded its time budget (${milliseconds}ms): ${command.join(" ")}`);
    if (interrupted) throw new Error("Command interrupted");
    return { status: status ?? 1, output };
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
};

if (import.meta.main)
  process.exitCode = (
    await runTimed(["bun", "run", ...process.argv.slice(2)], TIME_BUDGET_MS, {
      nested: process.env["TIMED_COMMAND"] === "1",
    })
  ).status;
