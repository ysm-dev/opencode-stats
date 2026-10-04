import * as Effect from "effect/Effect";
import type { nodeServer } from "./http.node.ts";
import { parseArguments } from "./arguments.ts";
import { startServer } from "./server.ts";

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: process arguments pass immediately to the argument parser
export const program = (args: unknown, adapter: typeof nodeServer) =>
  Effect.gen(function* () {
    const options = yield* Effect.try({
      try: () => parseArguments(args),
      catch: () => new Error("Can't start: invalid dashboard server arguments. Use --port <n>."),
    });
    yield* Effect.gen(function* () {
      yield* startServer();
      yield* Effect.sync(() => process.stdout.write("opencode-stats-ready\n"));
      yield* Effect.never;
    }).pipe(Effect.provide(adapter(options.port)));
  }).pipe(Effect.scoped);
