import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import type { DatabaseAdapter } from "./database.ts";
import { bunWorker } from "./worker.bun.ts";
import { syncWorkerFile } from "./paths.ts";
import { storePaths } from "./location.ts";
import { nodeDatabase } from "./runtime.node.ts";
import { workerProgram } from "./worker-program.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { InThreadWorker } from "./testing/worker.ts";

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
      await expect(Effect.runPromise(Effect.scoped(bunWorker(paths)))).rejects.toMatchObject({
        message:
          kind === "throw"
            ? "Sync worker couldn't start."
            : kind === "invalid"
              ? "Invalid sync worker response."
              : "Stats store build failed.",
      });
      expect(worker.terminated).toBe(kind !== "throw");
    } finally {
      worker.terminate();
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
    worker.terminate();
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it("rejects untrusted requests without opening either database", async () => {
  let receive!: (event: MessageEvent) => void;
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
        },
        removeEventListener,
      },
      adapter,
    ),
  );
  receive(new MessageEvent("message", { data: { source: 123, store: "SYNTHETIC" } }));
  await Effect.runPromise(Fiber.join(fiber));
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(false);
  expect(removeEventListener).toHaveBeenCalledWith("message", receive);
  expect(adapter).not.toHaveBeenCalled();
});
