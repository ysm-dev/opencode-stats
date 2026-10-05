import { spawnSync } from "node:child_process";
import process from "node:process";

const signal = (pid: number, name: NodeJS.Signals): boolean => {
  try {
    process.kill(pid, name);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
};

export const killProcessTree = (pid: number): void => {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Expected a positive process ID");
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000,
    });
    if (result.error) throw result.error;
    return;
  }
  // Freeze each parent before discovering its children so it cannot fork past
  // the snapshot. PPIDs include detached sessions; process groups do not.
  // The caller cannot fork while this synchronous traversal is running.
  if (pid !== process.pid && !signal(pid, "SIGSTOP")) return;
  try {
    const result = spawnSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Cannot inventory test workers: ${result.stderr}`);
    for (const row of result.stdout.trim().split("\n")) {
      const [child, parent] = row.trim().split(/\s+/u).map(Number);
      if (parent === pid && child !== undefined && child !== process.pid) killProcessTree(child);
    }
  } finally {
    // Children die before their parent, preserving ancestry until cleanup is done.
    signal(pid, "SIGKILL");
  }
};
