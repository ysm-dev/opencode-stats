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
import { pricingForPass } from "./pricing.ts";
import type { BuildReport } from "./build-events.ts";
import { steps, sessionFacts } from "./schema.ts";

export const sync = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
  source: SourceAdapter,
  announce: () => Effect.Effect<void, Error>,
  report: BuildReport = () => Effect.void,
) {
  const reason = yield* initializeStore(paths, adapter);
  const started = yield* Clock.currentTimeMillis;
  let building = reason !== undefined;
  if (reason)
    yield* report({ kind: "build.start", reason, sessions: 0, steps: 0, milliseconds: 0 });
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
      const price = pricingForPass(reader);
      let baseline = yield* reader.version;
      let reconciliation = yield* Clock.currentTimeMillis;
      const pass = Effect.fnUntraced(function* (checkBounds: boolean) {
        let changed: boolean;
        do {
          const version = yield* reader.version;
          const inventory = yield* reader.inventory;
          const pricer = yield* price(announce);
          changed = yield* reconcile(
            reader,
            inventory.sessions,
            inventory.projects,
            yield* Clock.currentTimeMillis,
            announce,
            checkBounds,
            pricer,
            version,
          );
        } while (changed);
      });
      const collect = Effect.gen(function* () {
        yield* collectTombstones(yield* Clock.currentTimeMillis, announce);
      });
      yield* pass(true);
      if (building) {
        const db = yield* Database;
        yield* report({
          kind: "build.end",
          reason: reason!,
          sessions: (yield* db.select().from(sessionFacts)).filter((row) => row.id === row.session)
            .length,
          steps: (yield* db.select({ id: steps.id }).from(steps)).length,
          milliseconds: (yield* Clock.currentTimeMillis) - started,
        });
        building = false;
      }
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
