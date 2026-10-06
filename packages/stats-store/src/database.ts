import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type { SqlClient } from "effect/sql/SqlClient";
import type { EffectSQLiteNodeDatabase } from "drizzle-orm/effect-sqlite-node";
import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun";
import type { BuildReport } from "./build-events.ts";

export class Database extends Context.Service<
  Database,
  (EffectSQLiteNodeDatabase | EffectSQLiteBunDatabase) & { $client: SqlClient }
>()(import.meta.url) {}
type DatabaseConfig = {
  filename: string;
  readonly: boolean;
  disableWAL: boolean;
  busyTimeout: "20 millis";
};
export type DatabaseAdapter = (config: DatabaseConfig) => Layer.Layer<Database>;

export type StorePaths = { readonly source: string; readonly store: string };
export type SyncWorker = (
  paths: StorePaths,
  announce?: () => Effect.Effect<void, Error>,
  report?: BuildReport,
) => Effect.Effect<void, Error, Scope.Scope>;
export type StoreRuntime = { readonly database: DatabaseAdapter; readonly worker: SyncWorker };
