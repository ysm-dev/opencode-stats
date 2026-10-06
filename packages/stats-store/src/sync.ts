import { statSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import { Database, type DatabaseAdapter, type StorePaths } from "./database.ts";
import type { SourceAdapter } from "./source-reader.ts";
import { initializeStore, reconcile, collectTombstones } from "./build.ts";
import { sqlFailure } from "./errors.ts";

export const sync = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
  source: SourceAdapter,
  announce: () => Effect.Effect<void, Error>,
) {
  yield* initializeStore(paths, adapter);
  const context = yield* Layer.build(
    adapter({
      filename: paths.store,
      readonly: false,
      disableWAL: false,
      busyTimeout: "20 millis",
    }),
  );
  const ready = yield* Deferred.make<void, Error>();
  const identity = Effect.try({
    try: () => {
      const stat = statSync(paths.source);
      return `${stat.dev}:${stat.ino}`;
    },
    catch: (error) => sqlFailure(error, "readSource"),
  });
  const connection = Effect.scoped(
    Effect.gen(function* () {
      const file = yield* identity;
      const reader = yield* source(paths.source);
      let baseline = yield* reader.version;
      let reconciliation = yield* Clock.currentTimeMillis;
      const pass = Effect.fnUntraced(function* (checkBounds: boolean) {
        const inventory = yield* reader.inventory;
        yield* reconcile(
          reader,
          inventory.sessions,
          inventory.projects,
          yield* Clock.currentTimeMillis,
          announce,
          checkBounds,
        );
      });
      const collect = Effect.gen(function* () {
        yield* collectTombstones(yield* Clock.currentTimeMillis, announce);
      });
      yield* pass(true);
      yield* collect;
      yield* Deferred.succeed(ready, undefined);
      yield* Effect.forever(
        Effect.gen(function* () {
          yield* Effect.sleep("500 millis");
          if ((yield* identity) !== file) yield* Effect.fail(new Error());
          const version = yield* reader.version;
          const now = yield* Clock.currentTimeMillis;
          const due = now - reconciliation >= 600000;
          if (version !== baseline || due) {
            // Keep the pre-pass baseline: writes racing this pass remain dirty next poll.
            yield* pass(due);
            baseline = version;
            if (due) reconciliation = now;
          }
          yield* collect;
        }),
      );
    }).pipe(Effect.provideService(Database, Context.get(context, Database))),
  );
  yield* Effect.forkScoped(
    Effect.forever(
      connection.pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Deferred.fail(ready, error);
            yield* Effect.sleep("500 millis");
          }),
        ),
      ),
    ),
  );
  yield* Deferred.await(ready);
});
