import * as Effect from "effect/Effect";
import { stayInSync, type StoreCopy } from "../store.ts";
import { inThreadRuntime } from "./worker.ts";
import type { StoreOptions } from "../location.ts";
import type { StoreRuntime } from "../database.ts";
import { Database, type DatabaseAdapter } from "../database.ts";

export const readBuilt = (
  options: StoreOptions,
  announce: (copy: StoreCopy) => void = () => {},
  runtime: StoreRuntime = inThreadRuntime,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* stayInSync(options, runtime, announce);
        return yield* store.read();
      }),
    ),
  );

export const attemptSourceWrite = (source: string, adapter: DatabaseAdapter) =>
  Effect.runPromise(
    Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.$client.unsafe("CREATE TABLE forbidden(id INTEGER)");
        }).pipe(
          Effect.provide(
            adapter({
              filename: source,
              readonly: true,
              disableWAL: true,
              busyTimeout: "20 millis",
            }),
          ),
        ),
      ),
    ),
  );
