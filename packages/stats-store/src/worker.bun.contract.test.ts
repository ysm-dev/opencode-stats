import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { bunWorker } from "./worker.bun.ts";
import { syntheticFixture, streamingFixture } from "./testing/index.ts";
import { storePaths } from "./location.ts";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { observedStore } from "./testing/store.ts";
import { bunRuntime } from "./runtime.bun.ts";

test("native Bun Worker reports a failed build and terminates cleanly", async () => {
  const fixture = syntheticFixture();
  try {
    const paths = storePaths({ source: fixture.source, cacheHome: fixture.folder });
    const failure = await Effect.runPromise(
      Effect.exit(Effect.scoped(bunWorker({ ...paths, source: `${paths.source}.missing` }))),
    );
    expect(Exit.isFailure(failure)).toBe(true);
    // The failed worker's scoped native writer must already be closed on Windows too.
    renameSync(paths.store, `${paths.store}.released`);
  } finally {
    fixture.dispose();
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
