import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import { streamingFixture } from "./testing/index.ts";
import { storePaths } from "./location.ts";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { observedStore } from "./testing/store.ts";
import { bunRuntime } from "./runtime.bun.ts";
import type { StoreEvent } from "./build-events.ts";
import { syncWorkerFile } from "./paths.ts";

test.each(["source.missing", "schema.newer"] as const)(
  "native Bun Worker reports a typed %s stop, recovers automatically and terminates cleanly",
  async (reason) => {
    const fixture = streamingFixture();
    const missing = `${fixture.source}.missing`;
    const migration = "20261007120000_first_run_future";
    if (reason === "source.missing") {
      fixture.writer.close();
      renameSync(fixture.source, missing);
    } else fixture.writer.migration(migration);
    try {
      const paths = storePaths({
        source: fixture.source,
        resolvedSource: fixture.source,
        cacheHome: fixture.folder,
      });
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const stopped = yield* Deferred.make<StoreEvent>();
            const resumed = yield* Deferred.make<StoreEvent>();
            const store = yield* observedStore(
              {
                source: fixture.source,
                resolvedSource: fixture.source,
                cacheHome: fixture.folder,
              },
              bunRuntime,
              () => {},
              (event) => {
                if (event.kind === "sync.stopped")
                  Deferred.doneUnsafe(stopped, Effect.succeed(event));
                if (event.kind === "sync.resumed")
                  Deferred.doneUnsafe(resumed, Effect.succeed(event));
              },
            );
            expect(yield* Deferred.await(stopped)).toMatchObject({
              kind: "sync.stopped",
              reason,
              code: "unavailable",
            });
            expect((yield* store.read()).steps).toEqual([]);
            if (reason === "source.missing") renameSync(missing, fixture.source);
            else fixture.writer.migration(migration, false);
            expect(yield* Deferred.await(resumed).pipe(Effect.timeout("3 seconds"))).toMatchObject({
              kind: "sync.resumed",
              reason,
            });
            const recovered = yield* store.read();
            expect(recovered.steps[0]!.output).toBe(1);
            expect(recovered.historyComplete).toBe(true);
          }),
        ),
      );
      // The recovered worker's scoped native writer must already be closed on Windows too.
      renameSync(paths.store, `${paths.store}.released`);
    } finally {
      fixture.dispose();
    }
  },
);

test("native Bun Worker rejects a malformed startup request as a fatal protocol failure", async () => {
  const worker = new Worker(syncWorkerFile);
  const closed = new Promise<void>((resolve) => worker.addEventListener("close", () => resolve()));
  const messages: Array<boolean | string> = [];
  const stopped = new Promise<void>((resolve) => {
    worker.addEventListener("message", (event: MessageEvent<boolean | string>) => {
      messages.push(event.data);
      if (event.data === "stopped") resolve();
    });
  });
  try {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- dedicated Worker IPC has no target origin
    worker.postMessage("malformed-startup-request");
    await stopped;
    expect(messages).toEqual([false, "stopped"]);
  } finally {
    worker.terminate();
    await closed;
  }
});

test("native long-lived worker announces streaming commits and releases its writer before fixture removal", async () => {
  const fixture = streamingFixture();
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* observedStore(
            { source: fixture.source, cacheHome: fixture.folder },
            bunRuntime,
          );
          const first = yield* store.committed;
          fixture.writer.message({
            id: "msg-live",
            session: "ses-live",
            seq: 0,
            start: 1000,
            tokens: { output: 9 },
          });
          const latest = yield* store.committed;
          expect(latest.steps[0]!.output).toBe(9);
          expect(latest.revision).toBe(first.revision + 1);
          expect(latest.steps).toEqual((yield* store.read()).steps);
        }),
      ),
    );
    renameSync(join(fixture.folder, "opencode-stats"), join(fixture.folder, "released-store"));
  } finally {
    fixture.dispose();
  }
});
