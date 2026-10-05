import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stayInSync } from "./store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { syntheticFixture } from "./testing/index.ts";
import { histories, historyWriter } from "./testing/history.ts";

it.each([0, 1, 2, 3])(
  "incremental generated histories equal a fresh build and an independent reference (partition %i/4)",
  async (partition) => {
    const fixture = syntheticFixture();
    let run = 0;
    try {
      await fc.assert(
        fc.asyncProperty(histories, async (history) => {
          fixture.writer.reset();
          const writer = historyWriter(fixture.writer);
          await Effect.runPromise(
            Effect.scoped(
              Effect.gen(function* () {
                const commits = yield* Queue.unbounded<number>();
                const options = { source: fixture.source, cacheHome: fixture.folder };
                const store = yield* stayInSync(options, nodeRuntime, (copy) => {
                  Queue.offerUnsafe(commits, copy.revision);
                });
                yield* Queue.take(commits);
                for (const [index, action] of history.entries()) {
                  writer.apply(action, index);
                  yield* TestClock.adjust("500 millis");
                  do {
                    yield* Queue.take(commits);
                  } while (
                    !(yield* store.read()).steps.some(
                      (step) => step.start === -100000 && step.output === index,
                    )
                  );
                  expect((yield* store.read()).steps).toEqual(writer.expected());
                }
                const incremental = yield* store.read();
                const fresh = yield* stayInSync(
                  { ...options, cacheHome: join(fixture.folder, "fresh", String(run++)) },
                  nodeRuntime,
                  () => {},
                );
                expect((yield* fresh.read()).steps).toEqual(incremental.steps);
              }).pipe(Effect.provide(TestClock.layer())),
            ),
          );
        }),
        {
          numRuns: 25,
          ...(process.env["GITHUB_EVENT_NAME"] === "schedule"
            ? {}
            : { seed: Number(process.env["FC_SEED"] ?? 20261004) + partition }),
        },
      );
    } finally {
      fixture.dispose();
    }
  },
);
