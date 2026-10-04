import * as Effect from "effect/Effect";
import type { bunServer } from "./http.bun.ts";
import { parseArguments } from "./arguments.ts";
import { startServer } from "./server.ts";
import { stayInSync, type StoreCopy, type StoreRuntime } from "@opencode-stats/stats-store";

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: process arguments pass immediately to the argument parser
export const program = (args: unknown, adapter: typeof bunServer, runtime: StoreRuntime) =>
  Effect.gen(function* () {
    const options = yield* Effect.try({
      try: () => parseArguments(args),
      catch: () =>
        new Error("Can't start: invalid dashboard server arguments. Use --db <path> --port <n>."),
    });
    let copy: StoreCopy | undefined;
    yield* stayInSync({ source: options.db }, runtime, (value) => {
      copy = value;
    });
    yield* Effect.gen(function* () {
      yield* startServer(undefined, copy);
      yield* Effect.sync(() => process.stdout.write("opencode-stats-ready\n"));
      yield* Effect.never;
    }).pipe(Effect.provide(adapter(options.port)));
  }).pipe(Effect.scoped);
