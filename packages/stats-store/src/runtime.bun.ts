import * as Sqlite from "@effect/sql-sqlite-bun/SqliteClient";
// oxlint-disable-next-line import/no-unassigned-import -- ADR 0017: initialize the controlled native library before any SQLite client opens
import "./sqlite-library.bun.ts";
import * as Drizzle from "drizzle-orm/effect-sqlite-bun";
import * as Layer from "effect/Layer";
import { Database, type DatabaseAdapter, type StoreRuntime } from "./database.ts";
import { bunWorker } from "./worker.bun.ts";

export const bunDatabase: DatabaseAdapter = (config) =>
  Layer.provide(Layer.effect(Database, Drizzle.makeWithDefaults()), Sqlite.layer(config));
export const bunRuntime: StoreRuntime = { database: bunDatabase, worker: bunWorker };
export { initializeSQLite } from "./sqlite-library.bun.ts";
