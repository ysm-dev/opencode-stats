import * as Effect from "effect/Effect";
import { metadata, steps } from "./schema.ts";
import { Database, type StoreRuntime } from "./database.ts";
import { storePaths, type StoreOptions } from "./location.ts";
import type { Step } from "@opencode-stats/browser-copy";
import * as Cause from "effect/Cause";
import { sqlFailure } from "./errors.ts";

export type StoreCopy = {
  readonly generation: string;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly steps: ReadonlyArray<Step>;
};
export type { StoreRuntime } from "./database.ts";
export { statsStoreVersion } from "./build.ts";
export { sqlFailure, SqlFailure } from "./errors.ts";

export const stayInSync = Effect.fnUntraced(function* (
  options: StoreOptions,
  runtime: StoreRuntime,
  announce: (copy: StoreCopy) => void,
) {
  const paths = yield* Effect.try({
    try: () => storePaths(options),
    catch: () => new Error("OpenCode database must be an existing readable file."),
  });
  yield* runtime.worker(paths);
  const read = Effect.gen(function* () {
    const db = yield* Database;
    const headers = yield* db.select().from(metadata);
    const header = headers[0]!;
    const facts = yield* db
      .select({
        start: steps.start,
        input: steps.input,
        cacheRead: steps.cacheRead,
        cacheWrite: steps.cacheWrite,
        output: steps.output,
        reasoning: steps.reasoning,
      })
      .from(steps)
      .orderBy(steps.session, steps.position);
    return {
      generation: header.generation,
      revision: header.revision,
      historyCompleteFrom: header.historyCompleteFrom,
      steps: facts,
    };
  }).pipe(
    Effect.provide(
      runtime.database({
        filename: paths.store,
        readonly: true,
        disableWAL: true,
        busyTimeout: "20 millis",
      }),
    ),
    Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "readStore"))),
  );
  const copy = yield* read;
  yield* Effect.sync(() => announce(copy));
  return { read: () => read };
});
