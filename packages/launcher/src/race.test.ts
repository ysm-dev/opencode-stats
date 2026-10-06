import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import * as childProcess from "node:child_process";
import { once } from "node:events";

vi.mock("node:child_process", { spy: true });
import { holdServer, startOrJoin } from "./hold.ts";
import { readRecord } from "./record.ts";
import { standIn, stopProcess } from "./testing/server.ts";
import { temporaryPort } from "./testing/port.ts";

it("concurrent detached starters on different ports all join the answering lock winner", async () => {
  const fixture = standIn();
  const ports = await Promise.all([temporaryPort(), temporaryPort(), temporaryPort()]);
  const controller = new AbortController();
  let pid: number | undefined;
  try {
    const records = await Promise.all(
      ports.map((port) =>
        startOrJoin(
          {
            ...fixture,
            port,
            version: "1.3.0",
            wait: async () => {
              await vi.waitFor(
                () => expect(readRecord(join(fixture.folder, "opencode-stats"))).toBeDefined(),
                { timeout: 5000 },
              );
            },
          },
          controller.signal,
        ),
      ),
    );
    pid = records[0]!.pid;
    expect(records[1]).toEqual(records[0]);
    expect(records[2]).toEqual(records[0]);
    expect(records[0]!.database).toBe(realpathSync(fixture.db));
    const trace = readFileSync(join(fixture.folder, "opencode-stats/trace.json"), "utf8");
    expect(trace).toContain('"--starter","plugin"');
    expect(trace).not.toContain("API_KEY");
    expect(trace).toContain('"BUN_BE_BUN":"1"');
    const spawns = vi.mocked(childProcess.spawn).mock.calls.length;
    expect(
      await startOrJoin({ ...fixture, port: ports[0], version: "1.3.0" }, controller.signal),
    ).toEqual(records[0]);
    expect(vi.mocked(childProcess.spawn).mock.calls.length).toBe(spawns);
  } finally {
    pid ??= readRecord(join(fixture.folder, "opencode-stats"))?.pid;
    if (pid) {
      await stopProcess(pid);
    }
    controller.abort();
    fixture.clean();
  }
});

it("the starter exits naturally while its detached server stays alive", async ({
  onTestFinished,
}) => {
  const local = standIn();
  const record = await startOrJoin(
    { ...local, port: await temporaryPort(), version: "1.3.0" },
    new AbortController().signal,
  );
  onTestFinished(() => {
    process.kill(record.pid);
    local.clean();
  });
  expect(process.kill(record.pid, 0)).toBe(true);
  const fixture = standIn();
  const script = join(fixture.folder, "caller.mjs");
  const options = { ...fixture, clean: undefined, port: await temporaryPort(), version: "1.3.0" };
  writeFileSync(
    script,
    `import {startOrJoin} from ${JSON.stringify(new URL("./hold.ts", import.meta.url).href)}; await startOrJoin(${JSON.stringify(options)},new AbortController().signal);`,
  );
  const caller = childProcess.spawn(process.execPath, [script]);
  const controller = new AbortController();
  const exit = once(caller, "exit", { signal: controller.signal });
  onTestFinished(() => {
    controller.abort();
    caller.kill();
    const running = readRecord(join(fixture.folder, "opencode-stats"));
    if (running) process.kill(running.pid);
    fixture.clean();
  });
  await vi.waitFor(() => expect(readRecord(join(fixture.folder, "opencode-stats"))).toBeDefined(), {
    timeout: 4000,
  });
  expect(await exit).toEqual([0, null]);
  expect(process.kill(readRecord(join(fixture.folder, "opencode-stats"))!.pid, 0)).toBe(true);
});

it("the normal holder starts a detached server with the real scheduling boundary", async () => {
  const fixture = standIn();
  const hold = holdServer({ ...fixture, port: await temporaryPort(), version: "1.3.0" });
  let pid: number | undefined;
  try {
    const record = await hold.ready;
    pid = record.pid;
    expect(record.starter).toBe("plugin");
  } finally {
    hold.release();
    pid ??= readRecord(join(fixture.folder, "opencode-stats"))?.pid;
    if (pid) {
      await stopProcess(pid);
    }
    fixture.clean();
  }
});

it("sanitizes failed starts, bounds lock-loser waiting, and observes cancellation", async () => {
  const fixture = standIn();
  const controller = new AbortController();
  const options = {
    ...fixture,
    executable: "/does-not-exist",
    port: 22439,
    version: "1.3.0",
    wait: async () => {
      await setImmediate();
    },
  };
  try {
    await expect(startOrJoin(options, controller.signal)).rejects.toThrow(
      "Can't start: dashboard server stopped.",
    );
    controller.abort();
    await expect(startOrJoin(options, controller.signal)).rejects.toThrow(
      "Can't start: dashboard server did not answer.",
    );
  } finally {
    fixture.clean();
  }
});

it.each([0, 1])(
  "an exited starter with code %s is a lock loser or a real failure, never an unbounded wait",
  async (code) => {
    const files = standIn();
    writeFileSync(files.executable, `#!${process.execPath}\nprocess.exit(${code});`, {
      mode: 0o700,
    });
    let waits = 0;
    try {
      await expect(
        startOrJoin(
          {
            ...files,
            port: 22439,
            version: "1.3.0",
            wait: async (milliseconds) => {
              expect(milliseconds).toBe(100);
              waits += 1;
              if (waits === 1) {
                const result = vi.mocked(childProcess.spawn).mock.results.at(-1)!;
                if (result.type !== "return") throw new Error("No synthetic child");
                await once(result.value, "close");
              }
            },
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow(
        code === 0
          ? "Can't start: dashboard server did not answer."
          : "Can't start: dashboard server stopped.",
      );
      expect(waits).toBe(code === 0 ? 100 : 1);
    } finally {
      files.clean();
    }
  },
);
