import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { workerProgram } from "../worker-program.ts";
import { workerClient } from "../worker-client.ts";
import { nodeDatabase } from "../runtime.node.ts";
import type { DatabaseAdapter, StorePaths } from "../database.ts";

export class InThreadWorker {
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  readonly requests = new Set<(event: MessageEvent) => void>();
  readonly fiber: Fiber.Fiber<void>;
  terminated = false;
  constructor(adapter: DatabaseAdapter = nodeDatabase) {
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
      ),
    );
  }
  addEventListener(type: "message" | "error", listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent) => void) {
    this.listeners.get(type)!.delete(listener);
  }
  postMessage(value: boolean | StorePaths) {
    queueMicrotask(() => {
      for (const listener of this.requests) listener(new MessageEvent("message", { data: value }));
    });
  }
  emit(type: "message" | "error", value: boolean | string | StorePaths) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new MessageEvent(type, { data: value }));
  }
  terminate() {
    this.terminated = true;
    Effect.runFork(Fiber.interrupt(this.fiber));
  }
}

export const inThreadRuntime = {
  database: nodeDatabase,
  worker: workerClient(() => new InThreadWorker()),
};
