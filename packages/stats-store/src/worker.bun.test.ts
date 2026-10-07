import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { expect, it, vi } from "vitest";
import type { DatabaseAdapter } from "./database.ts";
import { bunWorker } from "./worker.bun.ts";
import { syncWorkerFile } from "./paths.ts";
import { storePaths } from "./location.ts";
import { nodeDatabase, nodeSource } from "./runtime.node.ts";
import { workerProgram } from "./worker-program.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { InThreadWorker } from "./testing/worker.ts";
import { stayInSync, sqlFailure, type StoreEvent } from "./store.ts";
vi.mock("bun:sqlite", () => ({ Database: { setCustomSQLite: vi.fn<(file: string) => void>() } }));

it("builds through the Bun Worker adapter with an in-thread worker, and removes listeners before terminating", async () => {
  const fixture = syntheticFixture();
  const workers: InThreadWorker[] = [];
  const create = vi.fn<() => InThreadWorker>(function () {
    const worker = new InThreadWorker();
    workers.push(worker);
    return worker;
  });
  vi.stubGlobal("Worker", create);
  try {
    const copy = await readBuilt({ source: fixture.source, cacheHome: fixture.folder }, () => {}, {
      database: nodeDatabase,
      worker: bunWorker,
    });
    expect(copy.steps).toEqual([]);
    expect(create).toHaveBeenCalledWith(syncWorkerFile);
    expect(syncWorkerFile).toMatch(/\/sync-worker\.ts$/u);
    expect(workers[0]!.terminated).toBe(true);
    expect([...workers[0]!.listeners.values()].every((listeners) => listeners.size === 0)).toBe(
      true,
    );
    expect(workers[0]!.requests.size).toBe(0);
    await Effect.runPromise(
      Effect.scoped(bunWorker(storePaths({ source: fixture.source, cacheHome: fixture.folder }))),
    );
  } finally {
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it.each([
  { statement: "readSource", transport: "payload" },
  { statement: "writeSteps", transport: "payload" },
  { statement: "readStore", transport: "payload" },
  { statement: "readStore", transport: "throw" },
] as const)(
  "normalizes a fatal worker transport failure for $statement ($transport)",
  async ({ statement, transport }) => {
    const fixture = syntheticFixture();
    const worker = new InThreadWorker();
    const payload = {
      kind: "sqlite" as const,
      code: "SQLITE_FULL",
      statement,
      message: "PRIVATE_TITLE",
      cause: "PRIVATE_CAUSE",
      stack: "PRIVATE_STACK",
    };
    if (transport === "throw") {
      const emit = worker.emit.bind(worker);
      worker.emit = (type, value) => {
        if (value === true) throw sqlFailure(payload, statement);
        emit(type, value);
      };
    } else worker.postMessage = () => queueMicrotask(() => worker.emit("message", payload));
    vi.stubGlobal("Worker", function () {
      return worker;
    });
    try {
      await expect(
        Effect.runPromise(
          Effect.scoped(
            bunWorker(storePaths({ source: fixture.source, cacheHome: fixture.folder })),
          ).pipe(Effect.provide(TestClock.layer())),
        ),
      ).rejects.toMatchObject({
        kind: "sqlite",
        code: "SQLITE_FULL",
        statement,
        message: "Stats store build failed.",
      });
    } finally {
      await worker.terminate();
      vi.unstubAllGlobals();
      fixture.dispose();
    }
  },
);

it("a genuine unwritable store reports a recoverable stop through the Bun Worker adapter", async () => {
  const fixture = syntheticFixture();
  const options = { source: fixture.source, cacheHome: fixture.folder };
  const reports: StoreEvent[] = [];
  try {
    const initial = await readBuilt(options);
    fixture.writer.session("private");
    fixture.writer.message({ id: "PRIVATE_TITLE", session: "private", seq: 0, start: 1 });
    vi.stubGlobal("Worker", function () {
      return new InThreadWorker((config) => nodeDatabase({ ...config, readonly: true }));
    });
    const stopped = await readBuilt(
      options,
      () => {},
      { database: nodeDatabase, worker: bunWorker },
      (event) => reports.push(event),
    );
    expect(stopped).toEqual(initial);
    expect(reports).toContainEqual(
      expect.objectContaining({
        kind: "sync.stopped",
        reason: "store.unwritable",
        code: "permission",
      }),
    );
    expect(JSON.stringify(reports)).not.toMatch(/PRIVATE_TITLE|Failed query|params:/u);
    expect((await readBuilt(options)).steps).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it.each(["false", "invalid", "error", "throw"])(
  "sanitizes %s worker failures and releases its handles",
  async (kind) => {
    const fixture = syntheticFixture();
    const worker = new InThreadWorker();
    worker.postMessage = () => {
      queueMicrotask(() =>
        worker.emit(
          kind === "error" ? "error" : "message",
          kind === "false" ? false : "SYNTHETIC SECRET",
        ),
      );
    };
    vi.stubGlobal("Worker", function () {
      if (kind === "throw") throw new Error("SYNTHETIC SECRET");
      return worker;
    });
    try {
      const paths = storePaths({ source: fixture.source, cacheHome: fixture.folder });
      await expect(
        Effect.runPromise(Effect.scoped(bunWorker(paths)).pipe(Effect.provide(TestClock.layer()))),
      ).rejects.toMatchObject({
        message:
          kind === "throw"
            ? "Sync worker couldn't start."
            : kind === "invalid"
              ? "Invalid sync worker response."
              : "Stats store build failed.",
      });
      expect(worker.terminated).toBe(kind !== "throw");
    } finally {
      await worker.terminate();
      vi.unstubAllGlobals();
      fixture.dispose();
    }
  },
);

it("cancels a pending worker request without retaining the message or error listeners", async () => {
  const fixture = syntheticFixture();
  const worker = new InThreadWorker();
  let sent!: () => void;
  const requested = new Promise<void>((resolve) => {
    sent = resolve;
  });
  worker.postMessage = () => sent();
  vi.stubGlobal("Worker", function () {
    return worker;
  });
  try {
    const paths = storePaths({ source: fixture.source, cacheHome: fixture.folder });
    const fiber = Effect.runFork(Effect.scoped(bunWorker(paths)));
    await requested;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(worker.terminated).toBe(true);
    expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  } finally {
    await worker.terminate();
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it("rejects untrusted requests without opening either database", async () => {
  let receive!: (event: MessageEvent) => void;
  let listening!: () => void;
  const started = new Promise<void>((resolve) => {
    listening = resolve;
  });
  const postMessage = vi.fn<(value: boolean) => void>();
  const removeEventListener =
    vi.fn<(type: "message", listener: (event: MessageEvent) => void) => void>();
  const adapter = vi.fn<DatabaseAdapter>(nodeDatabase);
  const fiber = Effect.runFork(
    workerProgram(
      {
        postMessage,
        addEventListener: (_type, listener) => {
          receive = listener;
          listening();
        },
        removeEventListener,
      },
      adapter,
      nodeSource,
    ).pipe(Effect.scoped),
  );
  await started;
  receive(new MessageEvent("message", { data: { source: 123, store: "SYNTHETIC" } }));
  await Effect.runPromise(Fiber.join(fiber));
  expect(postMessage.mock.calls).toEqual([[false], ["stopped"]]);
  expect(removeEventListener).toHaveBeenCalledWith("message", receive);
  expect(adapter).not.toHaveBeenCalled();
});

it("a malformed late worker response fails safely only after its native resources have been released", async () => {
  const fixture = syntheticFixture();
  const worker = new InThreadWorker();
  vi.stubGlobal("Worker", function () {
    return worker;
  });
  try {
    await expect(
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const store = yield* stayInSync(
              { source: fixture.source, cacheHome: fixture.folder },
              { database: nodeDatabase, worker: bunWorker },
              () => {},
            );
            worker.emit("message", "SYNTHETIC PRIVATE RESPONSE");
            yield* store.read();
          }),
        ),
      ),
    ).rejects.toMatchObject({ message: "Invalid sync worker response." });
    fixture.writer.close();
    expect(worker.terminated).toBe(true);
  } finally {
    await worker.terminate();
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});
