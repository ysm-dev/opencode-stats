import * as Sqlite from "@effect/sql-sqlite-bun/SqliteClient";
// oxlint-disable-next-line import/no-unassigned-import -- ADR 0017: initialize the controlled native library before any SQLite client opens
import "./sqlite-library.bun.ts";
import * as Drizzle from "drizzle-orm/effect-sqlite-bun";
import * as Layer from "effect/Layer";
import { Database, type DatabaseAdapter, type StoreRuntime } from "./database.ts";
import { bunWorker } from "./worker.bun.ts";
import { Database as NativeDatabase } from "bun:sqlite";
import * as Effect from "effect/Effect";
import { sourceReader, type SourceAdapter } from "./source-reader.ts";
import { sqlFailure } from "./errors.ts";

export const bunSource: SourceAdapter = Effect.fnUntraced(function* (filename: string) {
  const db = yield* Effect.acquireRelease(
    Effect.try({
      try: () => new NativeDatabase(filename, { readonly: true, readwrite: false, create: false }),
      catch: (error) => sqlFailure(error, "readSource"),
    }),
    (connection) => Effect.sync(() => connection.close()),
  );
  return sourceReader({
    all: (statement, ...params) =>
      db
        .query<Record<string, string | number | bigint | null | Uint8Array>, string[]>(statement)
        .all(...params),
    exec: (statement) => db.run(statement),
  });
});

export const bunDatabase: DatabaseAdapter = (config) =>
  Layer.provide(Layer.effect(Database, Drizzle.makeWithDefaults()), Sqlite.layer(config));
export const bunRuntime: StoreRuntime = { database: bunDatabase, worker: bunWorker };
export { initializeSQLite } from "./sqlite-library.bun.ts";
