import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { workerProgram, type WorkerPort } from "../worker-program.ts";
import { workerClient } from "../worker-client.ts";
import { nodeDatabase } from "../runtime.node.ts";
import type { DatabaseAdapter } from "../database.ts";
import * as Clock from "effect/Clock";
import { nodeSource } from "../runtime.node.ts";
import type { SourceAdapter } from "../source-reader.ts";
import { sync } from "../sync.ts";
import type { StoreRuntime } from "../database.ts";
import type { SqlFailure } from "../errors.ts";

export class InThreadWorker {
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  readonly requests = new Set<(event: MessageEvent) => void>();
  readonly fiber: Fiber.Fiber<void>;
  terminated = false;
  constructor(
    adapter: DatabaseAdapter = nodeDatabase,
    source: SourceAdapter = nodeSource,
    clock: Clock.Clock = Clock.Clock.defaultValue(),
  ) {
    this.fiber = Effect.runFork(
      workerProgram(
        {
          postMessage: (value) => this.emit("message", value),
          addEventListener: (type, listener) => {
            if (type === "message") this.requests.add(listener);
          },
          removeEventListener: (_type, listener) => {
            this.requests.delete(listener);
          },
        },
        adapter,
        source,
      ).pipe(Effect.scoped, Effect.provideService(Clock.Clock, clock)),
    );
  }
  addEventListener(type: "message" | "error" | "close", listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(
    type: "message" | "error" | "close",
    listener: (event: MessageEvent) => void,
  ) {
    this.listeners.get(type)!.delete(listener);
  }
  postMessage(value: Parameters<WorkerPort["postMessage"]>[0]) {
    queueMicrotask(() => {
      for (const listener of this.requests) listener(new MessageEvent("message", { data: value }));
    });
  }
  emit(
    type: "message" | "error" | "close",
    value: Exclude<Parameters<WorkerPort["postMessage"]>[0], string> | string,
  ) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new MessageEvent(type, { data: value }));
  }
  async terminate() {
    this.terminated = true;
    await Effect.runPromise(Fiber.interrupt(this.fiber));
    this.emit("close", false);
  }
}

export const inThreadRuntime = {
  database: nodeDatabase,
  worker: workerClient((clock) => new InThreadWorker(nodeDatabase, nodeSource, clock)),
};

export const sourceFaultRuntime = (fault: () => SqlFailure | undefined): StoreRuntime => ({
  database: nodeDatabase,
  worker: (paths, announce = () => Effect.void, report) =>
    sync(
      paths,
      nodeDatabase,
      (filename) =>
        nodeSource(filename).pipe(
          Effect.map((reader) => ({
            ...reader,
            version: Effect.suspend(() => {
              const error = fault();
              return error ? Effect.fail(error) : reader.version;
            }),
          })),
        ),
      announce,
      report,
    ),
});
