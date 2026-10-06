import * as Effect from "effect/Effect";
import { stayInSync, type StoreCopy } from "../store.ts";
import { inThreadRuntime } from "./worker.ts";
import type { StoreOptions } from "../location.ts";
import type { StoreRuntime } from "../database.ts";
import { Database, type DatabaseAdapter } from "../database.ts";
import * as Queue from "effect/Queue";

export const observedStore = Effect.fnUntraced(function* (
  options: StoreOptions,
  runtime: StoreRuntime,
  onCopy: (copy: StoreCopy) => void = () => {},
) {
  const commits = yield* Queue.unbounded<StoreCopy>();
  const store = yield* stayInSync(options, runtime, (copy) => {
    onCopy(copy);
    Queue.offerUnsafe(commits, copy);
  });
  return { ...store, committed: Queue.take(commits) };
});

export const readCopy = Effect.fnUntraced(function* (options: StoreOptions, runtime: StoreRuntime) {
  const store = yield* stayInSync(options, runtime, () => {});
  return yield* store.read();
});

export const readBuilt = (
  options: StoreOptions,
  announce: (copy: StoreCopy) => void = () => {},
  runtime: StoreRuntime = inThreadRuntime,
  report: Parameters<typeof stayInSync>[3] = () => {},
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* stayInSync(options, runtime, announce, report);
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
