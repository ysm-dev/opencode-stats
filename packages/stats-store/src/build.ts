import { randomUUID } from "node:crypto";
import { closeSync, openSync, rmSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import { sqlFailure } from "./errors.ts";
import { Database, type DatabaseAdapter, type StorePaths } from "./database.ts";
import { readSource } from "./source.ts";
import { metadata, steps } from "./schema.ts";
import statements from "./statements.json" with { type: "json" };

export const statsStoreVersion = 1;
export const build = Effect.fnUntraced(
  function* (paths: StorePaths, adapter: DatabaseAdapter) {
    const facts = yield* readSource.pipe(
      Effect.provide(
        adapter({
          filename: paths.source,
          readonly: true,
          disableWAL: true,
          busyTimeout: "20 millis",
        }),
      ),
    );
    const writeStore = Effect.gen(function* () {
      const db = yield* Database;
      for (const statement of statements)
        yield* db.$client.unsafe(statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
      yield* db.$client.unsafe("PRAGMA synchronous=NORMAL");
      const write = Effect.gen(function* () {
        const old = yield* db.select().from(metadata);
        if (old[0] && old[0].version !== statsStoreVersion) yield* Effect.fail(new Error());
        yield* db.delete(steps);
        for (const row of facts) yield* db.insert(steps).values(row);
        yield* db.delete(metadata);
        yield* db.insert(metadata).values({
          id: 1,
          version: statsStoreVersion,
          generation: old[0]?.generation ?? randomUUID(),
          revision: (old[0]?.revision ?? 0) + 1,
          historyCompleteFrom: facts.reduce(
            (earliest, row) => Math.min(earliest, row.start),
            facts[0]?.start ?? 0,
          ),
        });
      });
      yield* db.$client.withTransaction(write);
    }).pipe(
      Effect.provide(
        adapter({
          filename: paths.store,
          readonly: false,
          disableWAL: false,
          busyTimeout: "20 millis",
        }),
      ),
    );
    yield* writeStore.pipe(
      Effect.catchCause(() =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            for (const suffix of ["", "-wal", "-shm"])
              rmSync(`${paths.store}${suffix}`, { force: true });
            closeSync(openSync(paths.store, "a", 0o600));
          });
          return yield* writeStore;
        }),
      ),
    );
  },
  Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "writeSteps"))),
);
