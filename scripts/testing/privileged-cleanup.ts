import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTimed } from "../time-budget.ts";
import { killProcessTree } from "../process-tree.ts";

// Run in a disposable Linux container as a non-root user with passwordless sudo.
assert.equal(process.platform, "linux");
assert.notEqual(process.getuid?.(), 0);
assert.equal(spawnSync("sudo", ["-n", "true"], { timeout: 1000 }).status, 0);
// kill(pid, 0) returns EPERM for live root descendants; it cannot prove exit.
const alive = (pid: number): boolean => {
  const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], {
    encoding: "utf8",
    timeout: 1000,
  });
  if (state.error) throw state.error;
  assert.ok(state.status === 0 || state.status === 1, "Cannot inspect owned fixture process");
  return state.status === 0 && !state.stdout.trim().startsWith("Z");
};
const folder = mkdtempSync(join(tmpdir(), "owned-privileged-cleanup-"));
const fixture = join(folder, "child.ts");
const pids = join(folder, "pids");
const controlPids = join(folder, "control-pids");
const runner = join(folder, "runner.ts");
writeFileSync(
  fixture,
  `import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
if (process.argv[3] !== "user" && process.getuid() !== 0) throw new Error("Expected privileged fixture");
appendFileSync(process.argv[2], process.pid + "\\n");
if (process.argv[3] === "user") appendFileSync(process.argv[2] + ".user", process.pid + "\\n");
if (!process.argv[3]) appendFileSync(process.argv[2] + ".monitor", process.ppid + "\\n");
if (!process.argv[3]) spawn(process.execPath, [process.argv[1], process.argv[2], "leaf"], { detached: true, stdio: "inherit" }).unref();
process.on("SIGTERM", () => {});
process.on("SIGHUP", () => {});
setInterval(() => process.stdout.write("owned preparation heartbeat\\n"), 50);
`,
);
writeFileSync(
  runner,
  `import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");
spawn("/usr/bin/sudo", ["-n", process.execPath, ${JSON.stringify(fixture)}, ${JSON.stringify(pids)}], { stdio: "inherit" });
spawn(process.execPath, [${JSON.stringify(fixture)}, ${JSON.stringify(pids)}, "user"], { detached: true, stdio: "inherit" }).unref();
setInterval(() => {}, 1000);
`,
);
const control = spawn("sleep", ["30"], { stdio: "ignore" });
const elevatedControl = spawn(
  "/usr/bin/sudo",
  ["-n", process.execPath, fixture, controlPids, "control"],
  { stdio: "ignore" },
);
const recorded = (file: string): number[] =>
  existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map(Number) : [];
const rescue = (file: string): void => {
  const owned = recorded(file).filter(alive);
  assert.ok(owned.every((pid) => Number.isSafeInteger(pid) && pid > 1));
  if (owned.length) {
    const result = spawnSync(
      "/usr/bin/sudo",
      ["-n", "/bin/kill", "-s", "SIGKILL", "--", ...owned.map(String)],
      { timeout: 1000 },
    );
    assert.equal(result.status, 0, String(result.error));
  }
};
try {
  for (const mode of ["deadline", "abort", "SIGINT", "SIGTERM", "denied", "kill-denied"]) {
    const originalPath = process.env["PATH"];
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (mode === "abort") controller.abort();
      if (mode === "SIGINT" || mode === "SIGTERM") process.kill(process.pid, mode);
    }, 500);
    const denied = join(folder, mode);
    const failure = mode === "denied" || mode === "kill-denied";
    if (failure) {
      mkdirSync(denied);
      writeFileSync(
        join(denied, "sudo"),
        mode === "denied"
          ? "#!/bin/sh\necho 'fixture denies elevated cleanup' >&2\nexit 9\n"
          : '#!/bin/sh\nif [ "$5" = SIGKILL ]; then echo "fixture denies elevated kill" >&2; exit 9; fi\nexec /usr/bin/sudo "$@"\n',
        { mode: 0o755 },
      );
      process.env["PATH"] = `${denied}:${originalPath}`;
    }
    const started = performance.now();
    let rejection = "";
    try {
      await assert.rejects(
        runTimed([process.execPath, runner], mode === "deadline" || failure ? 500 : 5000, {
          capture: true,
          signal: controller.signal,
          env: {
            ...process.env,
          },
        }),
        (error) => {
          rejection = String(error);
          return true;
        },
      );
      assert.ok(
        performance.now() - started < 2000,
        `${mode}: elevated preparation escaped its deadline`,
      );
      const owned = recorded(pids);
      assert.equal(
        owned.length,
        4,
        "Fixture must reach the user coordinator/sibling and detached root descendants",
      );
      if (failure) {
        assert.ok(
          owned[0] && !alive(owned[0]),
          "Partial failure did not stop the owned coordinator",
        );
        assert.equal(recorded(`${pids}.user`).length, 1);
        assert.deepEqual(
          recorded(`${pids}.user`).filter(alive),
          [],
          "Partial failure skipped the ordinary sibling",
        );
        for (const pid of [...owned, ...recorded(`${pids}.monitor`)]) {
          const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], {
            encoding: "utf8",
            timeout: 1000,
          });
          assert.ok(
            !state.stdout.trim().startsWith("T"),
            "Partial failure stranded an owned process or sudo monitor frozen",
          );
        }
        rescue(pids);
        rescue(`${pids}.monitor`);
        await Bun.sleep(20);
      }
      assert.deepEqual(
        owned.filter(alive),
        [],
        `${mode}: elevated owned descendants survived cleanup`,
      );
      assert.match(
        rejection,
        failure
          ? /Command cleanup failed/u
          : mode === "deadline"
            ? /exceeded its time budget/u
            : /Command interrupted/u,
      );
      assert.ok(control.pid && alive(control.pid), `${mode}: unrelated user control was killed`);
      assert.equal(recorded(controlPids).length, 1, "Privileged unrelated control was not reached");
      if (mode === "deadline") {
        const [rootControl] = recorded(controlPids);
        assert.ok(rootControl);
        assert.throws(() => killProcessTree(rootControl), /EPERM|Operation not permitted/u);
      }
      assert.ok(recorded(controlPids).every(alive), `${mode}: unrelated root control was killed`);
      process.stdout.write(
        `${mode}: ${Math.round(performance.now() - started)}ms; owned children stopped, controls survive\n`,
      );
    } finally {
      process.env["PATH"] = originalPath;
      clearTimeout(timer);
      rescue(pids);
      rescue(`${pids}.monitor`);
      rmSync(pids, { force: true });
      rmSync(`${pids}.user`, { force: true });
      rmSync(`${pids}.monitor`, { force: true });
    }
  }
  process.stdout.write("Owned elevated descendants terminate; unrelated control survives.\n");
} finally {
  rescue(pids);
  rescue(controlPids);
  control.kill("SIGKILL");
  elevatedControl.kill("SIGKILL");
  rmSync(folder, { recursive: true, force: true });
}
