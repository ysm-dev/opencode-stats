import * as Effect from "effect/Effect";
import { vi } from "vitest";
import type { ServerRecord } from "@opencode-stats/launcher";
import { lifecycle } from "../lifecycle.ts";
import { startServer } from "../server.ts";

export const readySignal = () => {
  let notify!: () => void;
  const ready = new Promise<void>((done) => {
    notify = done;
  });
  const output = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    if (value === "opencode-stats-ready\n") notify();
    return true;
  });
  return { ready, output };
};

export const controlledServer = (record: ServerRecord) =>
  Effect.gen(function* () {
    const control = yield* lifecycle(record);
    const origin = yield* startServer("unused", undefined, control);
    return { control, origin };
  });
