import { spawnSync } from "node:child_process";
import process from "node:process";

const cleanupTimeout = (deadline: number): number => {
  const remaining = Math.ceil(deadline - performance.now());
  if (remaining <= 0) throw new Error("Owned process cleanup exceeded its one-second deadline");
  return remaining;
};

const gone = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ESRCH";
  }
};

const elevatedSignal = (
  pid: number,
  name: NodeJS.Signals,
  deadline: number,
  cause: Error,
): boolean => {
  const result = spawnSync("sudo", ["-n", "--", "/bin/kill", "-s", name, "--", String(pid)], {
    encoding: "utf8",
    timeout: cleanupTimeout(deadline),
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (gone(pid)) return false;
  throw new Error(`Cannot signal owned elevated descendant ${pid}: ${result.stderr}`, { cause });
};

const signal = (
  pid: number,
  name: NodeJS.Signals,
  deadline: number,
  descendant = false,
): boolean => {
  try {
    process.kill(pid, name);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    if (
      descendant &&
      process.platform === "linux" &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      // Only a child discovered beneath a frozen, owned parent may need the
      // same noninteractive privilege that preparation used. Never elevate the
      // initial PID, signal a group, or silently accept a permission failure.
      return elevatedSignal(pid, name, deadline, error);
    }
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
  killOwnedTree(pid, performance.now() + 1000, false);
};

const terminate = (pid: number, deadline: number, descendant: boolean): void => {
  try {
    signal(pid, "SIGKILL", deadline - 200, descendant);
  } catch (error) {
    // Never strand a stopped sudo monitor if permission or inventory fails.
    // A resumed monitor can forward shutdown; the failure still propagates.
    try {
      signal(pid, "SIGCONT", deadline, descendant);
    } catch (resumeError) {
      throw new AggregateError(
        [error, resumeError],
        `Cannot terminate or resume owned PID ${pid}`,
        { cause: resumeError },
      );
    }
    throw error;
  }
};

const killOwnedTree = (pid: number, deadline: number, descendant: boolean): void => {
  // Freeze each parent before discovering its children so it cannot fork past
  // the snapshot. PPIDs include detached sessions; process groups do not.
  // The caller cannot fork while this synchronous traversal is running.
  const failures: Error[] = [];
  let stopped = false;
  try {
    // A privileged helper may apply STOP and then time out: acquisition is
    // uncertain until it returns, so owned descendants still need recovery.
    stopped = pid === process.pid || signal(pid, "SIGSTOP", deadline - 400, descendant);
    if (!stopped) return;
    const result = spawnSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf8",
      // One shared deadline for the whole tree; reserve its final 400ms for
      // KILL and CONT, including a separate 200ms resume allowance.
      timeout: cleanupTimeout(deadline - 400),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Cannot inventory test workers: ${result.stderr}`);
    for (const row of result.stdout.trim().split("\n")) {
      const [child, parent] = row.trim().split(/\s+/u).map(Number);
      if (parent !== pid || child === undefined || child === process.pid) continue;
      try {
        killOwnedTree(child, deadline, true);
      } catch (error) {
        failures.push(new Error(String(error), { cause: error }));
      }
    }
  } finally {
    // Children die before their parent, preserving ancestry until cleanup is done.
    if (stopped || descendant) terminate(pid, deadline, descendant);
  }
  if (failures.length) throw new AggregateError(failures, "Owned process cleanup failed");
};
