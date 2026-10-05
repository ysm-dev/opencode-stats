import * as Effect from "effect/Effect";
import { metadata, steps, tombstones } from "./schema.ts";
import { gt } from "drizzle-orm";
import { Database, type StoreRuntime } from "./database.ts";
import { storePaths, type StoreOptions } from "./location.ts";
import type { Step } from "@opencode-stats/browser-copy";
import * as Cause from "effect/Cause";
import { sqlFailure } from "./errors.ts";

export type StoreCopy = {
  readonly kind: "whole" | "changes";
  readonly fromRevision: number;
  readonly generation: string;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly steps: ReadonlyArray<Step>;
  readonly facts: ReadonlyArray<
    Step & { id: string; session: string; position: number; revision: number }
  >;
  readonly tombstones: ReadonlyArray<{ id: string; revision: number }>;
};
export type StoreCursor = { readonly generation: string; readonly revision: number };
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
  const read = (since?: StoreCursor) =>
    Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.$client.withTransaction(
        Effect.gen(function* () {
          const headers = yield* db.select().from(metadata);
          const header = headers[0]!;
          const changes =
            since &&
            since.generation === header.generation &&
            since.revision >= header.expiredRevision &&
            since.revision <= header.revision;
          const facts = yield* db
            .select()
            .from(steps)
            .where(changes ? gt(steps.revision, since.revision) : undefined)
            .orderBy(steps.session, steps.position);
          const deleted = changes
            ? yield* db
                .select({ id: tombstones.id, revision: tombstones.revision })
                .from(tombstones)
                .where(gt(tombstones.revision, since.revision))
                .orderBy(tombstones.id)
            : [];
          const counted = facts.map((row) => ({
            start: row.start,
            input: row.input,
            cacheRead: row.cacheRead,
            cacheWrite: row.cacheWrite,
            output: row.output,
            reasoning: row.reasoning,
          }));
          return {
            kind: changes ? ("changes" as const) : ("whole" as const),
            fromRevision: changes ? since.revision : 0,
            generation: header.generation,
            revision: header.revision,
            historyCompleteFrom: header.historyCompleteFrom,
            steps: counted,
            facts,
            tombstones: deleted,
          };
        }),
      );
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
  let last: StoreCursor | undefined;
  const notify = (copy: StoreCopy) => {
    if (
      copy.revision === 0 ||
      (last?.generation === copy.generation && last.revision === copy.revision)
    )
      return;
    last = copy;
    announce(copy);
  };
  // Serve a usable existing store before the worker opens or reconciles the source.
  yield* read().pipe(
    Effect.map(notify),
    Effect.catch(() => Effect.void),
  );
  yield* runtime.worker(paths, () => read().pipe(Effect.map(notify)));
  yield* read().pipe(Effect.map(notify));
  return { read };
});
