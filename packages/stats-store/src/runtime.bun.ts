import * as Sqlite from "@effect/sql-sqlite-bun/SqliteClient";
import * as Drizzle from "drizzle-orm/effect-sqlite-bun";
import * as Layer from "effect/Layer";
import { Database, type DatabaseAdapter, type StoreRuntime } from "./database.ts";
import { bunWorker } from "./worker.bun.ts";

export const bunDatabase: DatabaseAdapter = (config) =>
  Layer.provide(Layer.effect(Database, Drizzle.makeWithDefaults()), Sqlite.layer(config));
export const bunRuntime: StoreRuntime = { database: bunDatabase, worker: bunWorker };
