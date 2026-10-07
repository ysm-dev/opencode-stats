import * as Sqlite from "@effect/sql-sqlite-node/SqliteClient";
import * as Drizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database, type DatabaseAdapter, type StoreRuntime } from "./database.ts";
import { DatabaseSync } from "node:sqlite";
import { sourceReader, type SourceAdapter } from "./source-reader.ts";
import { sync } from "./sync.ts";
import { sqlFailure } from "./errors.ts";

export const nodeSource: SourceAdapter = Effect.fnUntraced(function* (filename: string) {
  const db = yield* Effect.acquireRelease(
    Effect.try({
      try: () => new DatabaseSync(filename, { readOnly: true }),
      catch: (error) => sqlFailure(error, "readSource"),
    }),
    (connection) => Effect.sync(connection.close.bind(connection)),
  );
  return sourceReader({
    all: (statement, ...params) => db.prepare(statement).all(...params),
    exec: db.exec.bind(db),
  });
});

export const nodeDatabase: DatabaseAdapter = (config) =>
  Layer.effect(Database, Drizzle.makeWithDefaults()).pipe(Layer.provide(Sqlite.layer(config)));
// Same sync program, run in this thread: tests exercise the public store seam without IPC.
export const nodeRuntime: StoreRuntime = {
  database: nodeDatabase,
  worker: (paths, announce = () => Effect.void, report) =>
    sync(paths, nodeDatabase, nodeSource, announce, report),
};
