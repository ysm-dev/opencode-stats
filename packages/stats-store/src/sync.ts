import { accessSync, constants, statSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Cause from "effect/Cause";
import { Database, type DatabaseAdapter, type StorePaths } from "./database.ts";
import type { SourceAdapter } from "./source-reader.ts";
import { initializeStore, reconcile, collectTombstones } from "./build.ts";
import { sqlFailure } from "./errors.ts";
import { pricingForPass } from "./pricing.ts";
import type { BuildReport } from "./build-events.ts";
import { steps, sessionFacts, metadata } from "./schema.ts";
import { readReceipt, SchemaFailure, syncState } from "./sync-state.ts";
import { rereadState } from "./reread.ts";
import { prepareStorePaths } from "./location.ts";

class SourceReplaced extends Error {}

const startSync = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
  source: SourceAdapter,
  announce: () => Effect.Effect<void, Error>,
  report: BuildReport,
  state: ReturnType<typeof syncState>,
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
      accessSync(paths.source, constants.R_OK);
      return `${stat.dev}:${stat.ino}`;
    },
    catch: (error) => sqlFailure(error, "readSource"),
  });
  const rereading = rereadState(paths.store, report);
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
          const schema = yield* reader.schema;
          if (schema.changed)
            yield* report({
              kind: "schema.checked",
              result: schema.kind,
              fingerprint: schema.fingerprint,
              migrations: schema.migrations.length,
            });
          if (schema.kind !== "recognized") yield* Effect.fail(new SchemaFailure(schema.kind));
          const inventory = yield* reader.inventory;
          const db = yield* Database;
          const header = (yield* db.select().from(metadata))[0]!;
          yield* rereading.prepare(schema, inventory.sessions, header, file);
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
            rereading.forced(),
            rereading.read(),
            rereading.changed(),
            report,
          );
          if (!changed) yield* rereading.complete();
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
      yield* state.recovered(yield* Clock.currentTimeMillis);
      yield* Deferred.succeed(ready, undefined);
      yield* Effect.forever(
        Effect.gen(function* () {
          yield* Effect.sleep("500 millis");
          if ((yield* identity) !== file) yield* Effect.fail(new SourceReplaced());
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
          yield* state.recovered(yield* Clock.currentTimeMillis);
        }),
      );
    }).pipe(Effect.provideService(Database, Context.get(context, Database))),
  );
  yield* Effect.forkScoped(
    Effect.forever(
      connection.pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            if (!(error instanceof SourceReplaced))
              yield* state.failed(error, yield* Clock.currentTimeMillis);
            const failure = sqlFailure(error, "readSource");
            if (
              error instanceof SchemaFailure ||
              failure.code === "SQLITE_CORRUPT" ||
              failure.code === "SQLITE_NOTADB"
            )
              rereading.repair();
            yield* Deferred.succeed(ready, undefined);
            yield* Effect.sleep("500 millis");
          }),
        ),
      ),
    ),
  );
  yield* Deferred.await(ready);
});

export const sync = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
  source: SourceAdapter,
  announce: () => Effect.Effect<void, Error>,
  report: BuildReport = () => Effect.void,
) {
  const ready = yield* Deferred.make<void>();
  const state = syncState(
    report,
    readReceipt(paths.store, paths)?.currentAt ?? (yield* Clock.currentTimeMillis),
  );
  const attempt = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => prepareStorePaths(paths),
        catch: (error) => sqlFailure(error, "writeSteps"),
      });
      yield* startSync(paths, adapter, source, announce, report, state);
      yield* Deferred.succeed(ready, undefined);
      yield* Effect.never;
    }),
  ).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        if (Cause.hasInterrupts(cause)) yield* Effect.failCause(cause);
        yield* state.failed(
          sqlFailure(Cause.squash(cause), "writeSteps"),
          yield* Clock.currentTimeMillis,
        );
        yield* Deferred.succeed(ready, undefined);
        yield* Effect.sleep("500 millis");
      }),
    ),
  );
  // Initialization failures are recoverable too: a readable existing store remains served.
  yield* Effect.forkScoped(Effect.forever(attempt));
  yield* Deferred.await(ready);
});
