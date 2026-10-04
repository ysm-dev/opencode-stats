import * as Sqlite from "@effect/sql-sqlite-node/SqliteClient";
import * as Drizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database, type DatabaseAdapter, type StoreRuntime } from "./database.ts";
import { build } from "./build.ts";

export const nodeDatabase: DatabaseAdapter = (config) =>
  Layer.effect(Database, Drizzle.makeWithDefaults()).pipe(Layer.provide(Sqlite.layer(config)));
// Same sync program, run in this thread: tests exercise the public store seam without IPC.
export const nodeRuntime: StoreRuntime = {
  database: nodeDatabase,
  worker: (paths) => Effect.scoped(build(paths, nodeDatabase)),
};
