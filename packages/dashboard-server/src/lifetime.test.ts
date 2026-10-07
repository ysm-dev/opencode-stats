import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { expect, it, vi } from "vitest";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { readRecord, answering, discover } from "@opencode-stats/launcher";
import { syntheticFixture } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { sqlFailure } from "@opencode-stats/stats-store";
import { program, processProgram } from "./main.ts";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { readySignal } from "./testing/program.ts";
import { liveEvents } from "./testing/live-events.ts";
import { decode } from "@opencode-stats/browser-copy";

it("publishes the bound winner, a loser writes nothing, and an authenticated stop cleans up before releasing its lifetime lock", async () => {
  const fixture = syntheticFixture();
  const port = await temporaryPort();
  const folder = join(fixture.folder, "opencode-stats");
  mkdirSync(folder, { mode: 0o777 });
  chmodSync(folder, 0o777);
  const env = { XDG_STATE_HOME: fixture.folder, XDG_CACHE_HOME: fixture.folder };
  const oldRuntime = Object.getOwnPropertyDescriptor(process.versions, "bun");
  Object.defineProperty(process.versions, "bun", { value: "1.4.2", configurable: true });
  const { ready: listening, output } = readySignal();
  const fiber = Effect.runFork(
    program(
      ["--port", String(port), "--db", fixture.source],
      nodeServer,
      nodeRuntime,
      (file) =>
        Effect.gen(function* () {
          expect(statSync(folder).mode & 0o777).toBe(0o700);
          yield* nodeLock(file);
        }),
      env,
    ),
  );
  try {
    await listening;
    await vi.waitFor(() =>
      expect(readFileSync(join(folder, "server.log"), "utf8")).toContain("event=build.end"),
    );
    const record = readRecord(folder)!;
    expect(record).toMatchObject({
      address: `http://127.0.0.1:${port}`,
      database: realpathSync(fixture.source),
      pid: process.pid,
      version: "0.2.0-dev",
      starter: "terminal",
      protocol: 1,
    });
    expect(record.secret).toMatch(/^[a-f0-9]{64}$/u);
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    expect(statSync(join(folder, "server.lock")).mode & 0o777).toBe(0o600);
    const before = readFileSync(join(folder, "server.log"), "utf8");
    expect(before).toContain(
      `event=start version="0.2.0-dev" platform="${process.platform}" runtime="1.4.2" starter="terminal" port=${port}`,
    );
    expect(before).toContain(
      `event=database database=${JSON.stringify(fixture.source)} source="flag"`,
    );
    expect(before).toContain('event=build.start reason="first" sessions=0 steps=0 milliseconds=0');
    expect(before).toContain('event=build.end reason="first" sessions=0 steps=0 milliseconds=');
    expect(readdirSync(folder).filter((file) => file.endsWith(".db"))).toHaveLength(1);
    await Effect.runPromise(
      program(
        ["--port", String(port + 1), "--db", fixture.source],
        nodeServer,
        nodeRuntime,
        nodeLock,
        env,
      ),
    );
    expect(readFileSync(join(folder, "server.log"), "utf8")).toBe(before);
    expect(output).toHaveBeenCalledTimes(3);
    await expect(discover(folder, "/synthetic/different.db", "0.2.0-dev")).rejects.toThrow(
      "opencode-stats serves one OpenCode database at a time.",
    );
    expect(readFileSync(join(folder, "server.log"), "utf8")).toContain(
      'event=conflict kind="database"',
    );
    unlinkSync(join(folder, "server.json"));
    const response = await fetch(`${record.address}/api/stop`, {
      method: "POST",
      headers: {
        Origin: record.address,
        Authorization: `Bearer ${record.secret}`,
        "X-Opencode-Stats-Protocol": "1",
      },
    });
    expect(response.status).toBe(204);
    await Effect.runPromise(Fiber.join(fiber));
    expect(existsSync(join(folder, "server.json"))).toBe(false);
    expect(readFileSync(join(folder, "server.log"), "utf8")).toContain("event=stop");
    expect(readFileSync(join(folder, "server.log"), "utf8")).toContain(
      `event=stop version="0.2.0-dev" platform="${process.platform}" runtime="1.4.2" starter="terminal" port=${port}`,
    );
    await Effect.runPromise(Effect.scoped(nodeLock(join(folder, "server.lock"))));
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
    if (oldRuntime) Object.defineProperty(process.versions, "bun", oldRuntime);
    else Reflect.deleteProperty(process.versions, "bun");
    output.mockRestore();
    fixture.dispose();
  }
});

it.each(["unreadable", "unsupported"])(
  "keeps a %s source failure recoverable without raw process diagnostics",
  async (kind) => {
    const fixture = syntheticFixture();
    const source = kind === "unreadable" ? fixture.source : join(fixture.folder, "unsupported.db");
    if (kind === "unreadable") chmodSync(source, 0o000);
    else writeFileSync(source, "");
    const port = await temporaryPort();
    const origin = `http://127.0.0.1:${port}`;
    const signal = readySignal();
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const previous = process.exitCode;
    const fiber = Effect.runFork(
      processProgram(["--port", String(port), "--db", source], nodeServer, nodeRuntime, nodeLock, {
        XDG_STATE_HOME: fixture.folder,
        XDG_CACHE_HOME: fixture.folder,
      }),
    );
    let stream: Awaited<ReturnType<typeof liveEvents>> | undefined;
    try {
      await signal.ready;
      stream = await liveEvents(origin);
      expect((await stream.read()).stop?.reason).toBe(
        kind === "unreadable" ? "source.unreadable" : "schema.other",
      );
      const copy = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
      expect(copy.revision).toBe(0);
      expect(copy.historyComplete).toBe(false);
      expect(await answering(join(fixture.folder, "opencode-stats"))).toBeDefined();
      expect(process.exitCode).toBe(previous);
      const text = readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8");
      expect(text).toContain("event=sync.stopped");
      expect(text).not.toMatch(/event=crash|session_message|Failed query/u);
      expect(error.mock.calls.map(([line]) => String(line)).join("")).toContain("Not updating:");
      let recovered = false;
      if (kind === "unreadable") {
        chmodSync(source, 0o600);
        recovered = (await stream.read()).stop === null;
      }
      expect(recovered).toBe(kind === "unreadable");
      expect(
        decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer()).historyComplete,
      ).toBe(recovered);
    } finally {
      await stream?.close();
      await Effect.runPromise(Fiber.interrupt(fiber));
      chmodSync(fixture.source, 0o600);
      signal.output.mockRestore();
      error.mockRestore();
      fixture.dispose();
    }
  },
);

it("an interrupted sync worker is not mistaken for a crash by either process boundary", async () => {
  const fixture = syntheticFixture();
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const before = process.exitCode;
  try {
    await Effect.runPromise(
      processProgram(
        ["--port", String(await temporaryPort()), "--db", fixture.source],
        nodeServer,
        { ...nodeRuntime, worker: () => Effect.failCause(Cause.interrupt(999)) },
        nodeLock,
        { XDG_STATE_HOME: fixture.folder },
      ),
    );
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
    expect(readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8")).not.toContain(
      "event=crash",
    );
  } finally {
    error.mockRestore();
    fixture.dispose();
  }
});

it("the process boundary prints only our decided messages and never raw startup defects", async () => {
  const fixture = syntheticFixture();
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const previous = process.exitCode;
  try {
    await Effect.runPromise(
      processProgram(["--db", fixture.folder], nodeServer, nodeRuntime, nodeLock),
    );
    expect(error).toHaveBeenCalledExactlyOnceWith("OpenCode database must be an existing file.\n");
    error.mockClear();
    await Effect.runPromise(
      processProgram(
        ["--db", fixture.source],
        nodeServer,
        nodeRuntime,
        () => Effect.die(new Error("PRIVATE_NATIVE_TITLE")),
        { XDG_STATE_HOME: fixture.folder },
      ),
    );
    expect(error).toHaveBeenCalledExactlyOnceWith("Can't start: dashboard server unavailable.\n");
    expect(process.exitCode).toBe(1);
  } finally {
    process.exitCode = previous;
    error.mockRestore();
    fixture.dispose();
  }
});

it.each(["io", "sqlite"])(
  "a fatal %s worker transport failure reaches the safe main-thread formatter",
  async (kind) => {
    const fixture = syntheticFixture();
    const failure = Object.assign(new Error("PRIVATE_WORKER_TITLE"), {
      code: "EACCES",
      cause: new Error("PRIVATE_WORKER_CAUSE"),
      stack: "PRIVATE_WORKER_STACK",
    });
    const runtime = {
      ...nodeRuntime,
      worker: () => Effect.fail(kind === "sqlite" ? sqlFailure(failure, "readStore") : failure),
    };
    try {
      await expect(
        Effect.runPromise(
          program(
            ["--port", String(await temporaryPort()), "--db", fixture.source],
            nodeServer,
            runtime,
            nodeLock,
            { XDG_STATE_HOME: fixture.folder },
          ),
        ),
      ).rejects.toThrow(`Can't start: ${kind}.`);
      const text = readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8");
      expect(text).toContain(
        `event=crash kind="${kind}" code="EACCES" statement="${kind === "sqlite" ? "readStore" : "startup"}"`,
      );
      expect(text).not.toContain("PRIVATE_WORKER");
      expect(text).not.toContain("event=conflict");
    } finally {
      fixture.dispose();
    }
  },
);

it("a non-address bind error logs its kind but is not a port conflict", async () => {
  const fixture = syntheticFixture();
  try {
    await expect(
      Effect.runPromise(
        program(["--db", fixture.source], () => nodeServer(-1), nodeRuntime, nodeLock, {
          XDG_STATE_HOME: fixture.folder,
        }),
      ),
    ).rejects.toThrow("Can't start: couldn't bind 127.0.0.1:-1.");
    const log = readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8");
    expect(log).toContain('code="BIND_FAILED"');
    expect(log).not.toContain("event=conflict");
  } finally {
    fixture.dispose();
  }
});

it("publishes an answering server before a build finishes without serving an invalid binary copy, and handles interruption quietly", async () => {
  const fixture = syntheticFixture();
  const port = await temporaryPort();
  let complete!: () => void;
  const blocked = new Promise<void>((done) => {
    complete = done;
  });
  const runtime = {
    ...nodeRuntime,
    worker: (paths: Parameters<typeof nodeRuntime.worker>[0]) =>
      nodeRuntime.worker(paths).pipe(Effect.andThen(Effect.promise(() => blocked))),
  };
  const env = { XDG_STATE_HOME: fixture.folder, XDG_CACHE_HOME: fixture.folder };
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const before = process.exitCode;
  const controller = new AbortController();
  let settled = false;
  let request: Promise<Response | undefined> | undefined;
  const fiber = Effect.runFork(
    processProgram(
      ["--port", String(port), "--db", fixture.source],
      nodeServer,
      runtime,
      nodeLock,
      env,
    ),
  );
  try {
    await vi.waitFor(async () =>
      expect(await answering(join(fixture.folder, "opencode-stats"))).toBeDefined(),
    );
    request = fetch(`http://127.0.0.1:${port}/api/browser-copy`, {
      signal: controller.signal,
    }).then(
      (response) => {
        settled = true;
        return response;
      },
      () => {
        settled = true;
        return undefined;
      },
    );
    expect(await answering(join(fixture.folder, "opencode-stats"))).toBeDefined();
    expect(settled).toBe(false);
    const interruption = Effect.runPromise(Fiber.interrupt(fiber));
    controller.abort();
    expect(await request).toBeUndefined();
    await interruption;
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
  } finally {
    controller.abort();
    await request;
    complete();
    await Effect.runPromise(Fiber.interrupt(fiber));
    error.mockRestore();
    fixture.dispose();
  }
});

it("a copy request waits during startup while control requests answer, then returns only a valid complete copy", async () => {
  const f = syntheticFixture();
  const port = await temporaryPort();
  const gate = Promise.withResolvers<void>();
  const { ready, output } = readySignal();
  const controller = new AbortController();
  let settled = false;
  let request: Promise<Response> | undefined;
  const runtime = {
    ...nodeRuntime,
    worker: (...args: Parameters<typeof nodeRuntime.worker>) =>
      Effect.promise(() => gate.promise).pipe(Effect.andThen(nodeRuntime.worker(...args))),
  };
  const fiber = Effect.runFork(
    program(["--db", f.source, "--port", String(port)], nodeServer, runtime, nodeLock, {
      XDG_STATE_HOME: f.folder,
      XDG_CACHE_HOME: f.folder,
    }),
  );
  try {
    await ready;
    const url = `http://127.0.0.1:${port}/api/browser-copy`;
    request = fetch(url, { signal: controller.signal });
    void request.then(
      () => {
        settled = true;
        return undefined;
      },
      () => {
        settled = true;
      },
    );
    expect(await answering(join(f.folder, "opencode-stats"))).toBeDefined();
    expect(settled).toBe(false);
    gate.resolve();
    const response = await request;
    const bytes = await response.arrayBuffer();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(decode(bytes).historyComplete).toBe(true);
  } finally {
    controller.abort();
    await request?.catch(() => undefined);
    gate.resolve();
    await Effect.runPromise(Fiber.interrupt(fiber));
    output.mockRestore();
    f.dispose();
  }
});

it("a plugin-started server with no holders stops after ten seconds on the injected clock", async () => {
  const fixture = syntheticFixture();
  const port = await temporaryPort();
  const { ready: listening, output } = readySignal();
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* program(
            ["--port", String(port), "--db", fixture.source, "--starter", "plugin"],
            nodeServer,
            nodeRuntime,
            nodeLock,
            { XDG_STATE_HOME: fixture.folder, XDG_CACHE_HOME: fixture.folder },
          ).pipe(Effect.forkScoped);
          yield* Effect.promise(() => listening);
          yield* TestClock.adjust("9 seconds");
          yield* Effect.promise(async () => {
            const response = await fetch(`http://127.0.0.1:${port}/api/missing`);
            expect(response.status).toBe(404);
            await response.text();
          });
          yield* TestClock.adjust("1 second");
          yield* TestClock.adjust("100 millis");
          yield* Fiber.join(fiber);
          yield* Effect.promise(async () => {
            await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow("fetch failed");
          });
        }).pipe(Effect.provide(TestClock.layer())),
      ),
    );
  } finally {
    output.mockRestore();
    fixture.dispose();
  }
});

it("logs and reports the exact held-port failure without raw platform errors", async () => {
  const fixture = syntheticFixture();
  const held = createServer();
  await new Promise<void>((done) => held.listen(0, "127.0.0.1", done));
  const address = held.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  try {
    await expect(
      Effect.runPromise(
        program(
          ["--port", String(address.port), "--db", fixture.source],
          nodeServer,
          nodeRuntime,
          nodeLock,
          { XDG_STATE_HOME: fixture.folder },
        ),
      ),
    ).rejects.toThrow(
      `Can't start: 127.0.0.1:${address.port} is in use by another program. Free it, or pass \`--port <n>\`.`,
    );
    const text = readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8");
    expect(text).toContain('event=crash kind="io" code="EADDRINUSE" statement="startup"');
    expect(text).toContain('event=conflict kind="port"');
    expect(text).not.toContain("listen EADDRINUSE");
    expect(existsSync(join(fixture.folder, "opencode-stats/server.json"))).toBe(false);
  } finally {
    await new Promise<void>((done) => held.close(() => done()));
    fixture.dispose();
  }
});
