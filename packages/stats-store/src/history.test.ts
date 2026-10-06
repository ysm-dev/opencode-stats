import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, it, beforeAll, afterAll } from "vitest";
import { stayInSync, type StoreCopy } from "./store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { syntheticFixture } from "./testing/index.ts";
import { histories, historyWriter, historyPartitions } from "./testing/history.ts";
import { runWithClock } from "./testing/clock.ts";

it("the history partitions preserve every original seeded case exactly once with bounded work per test", () => {
  const plan = historyPartitions(20261004);
  expect(plan.every((part) => part.numRuns <= 5)).toBe(true);
  expect(plan.reduce((total, part) => total + part.numRuns, 0)).toBe(100);
  for (const partition of [0, 1, 2, 3]) {
    const selected = plan.filter((part) => part.partition === partition);
    const original = fc.sample(histories, { seed: 20261004 + partition, numRuns: 25 });
    expect(selected.flatMap((part) => fc.sample(histories, part))).toEqual(original);
  }
});

const baseSeed = Number(
  process.env["FC_SEED"] ??
    (process.env["GITHUB_EVENT_NAME"] === "schedule" ? randomBytes(4).readInt32LE() : 20261004),
);
const fixtures = new Map<number, { fixture: ReturnType<typeof syntheticFixture>; run: number }>();
beforeAll(() => {
  for (const seed of new Set(historyPartitions(baseSeed).map((part) => part.seed)))
    fixtures.set(seed, { fixture: syntheticFixture(), run: 0 });
});
afterAll(() => {
  for (const { fixture } of fixtures.values()) fixture.dispose();
});
it.each(historyPartitions(baseSeed))(
  "incremental generated histories equal a fresh build and an independent reference (seed $seed, starting case $path)",
  async ({ seed, path, numRuns }) => {
    const context = fixtures.get(seed)!;
    const { fixture } = context;
    await fc.assert(
      fc.asyncProperty(histories, async (history) => {
        fixture.writer.reset();
        const writer = historyWriter(fixture.writer);
        await runWithClock((time) =>
          Effect.gen(function* () {
            const commits = yield* Queue.unbounded<StoreCopy>();
            const options = { source: fixture.source, cacheHome: fixture.folder };
            const store = yield* stayInSync(options, nodeRuntime, (copy) => {
              Queue.offerUnsafe(commits, copy);
            });
            yield* Queue.take(commits);
            for (const [index, action] of history.entries()) {
              writer.apply(action, index);
              yield* time.tick;
              let copy: StoreCopy;
              do {
                copy = yield* Queue.take(commits);
              } while (!copy.steps.some((step) => step.start === -100000 && step.output === index));
              expect((yield* store.read()).steps).toEqual(writer.expected());
            }
            const incremental = yield* store.read();
            const fresh = yield* stayInSync(
              { ...options, cacheHome: join(fixture.folder, "fresh", String(context.run++)) },
              nodeRuntime,
              () => {},
            );
            expect((yield* fresh.read()).steps).toEqual(incremental.steps);
          }),
        );
      }),
      {
        numRuns,
        seed,
        path,
      },
    );
  },
);
