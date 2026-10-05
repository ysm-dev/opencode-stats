import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Queue from "effect/Queue";
import { expect, it } from "vitest";
import { stayInSync } from "./store.ts";
import { nodeRuntime, nodeSource, nodeDatabase } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import { readCopy, observedStore } from "./testing/store.ts";
import { runWithClock } from "./testing/clock.ts";
import { tokenKinds } from "@opencode-stats/browser-copy";
import { syntheticFixture, streamingFixture, inThreadRuntime } from "./testing/index.ts";

it.each([nodeRuntime, inThreadRuntime])(
  "follows streaming rewrites within one 500ms poll and announces the committed copy",
  async (runtime) => {
    const fixture = streamingFixture();
    const { writer, source, folder } = fixture;
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const revisions: number[] = [];
            const commits = yield* Queue.unbounded<number>();
            const store = yield* stayInSync({ source, cacheHome: folder }, runtime, (copy) => {
              revisions.push(copy.revision);
              Queue.offerUnsafe(commits, copy.revision);
            });
            yield* Queue.take(commits);
            const initial = yield* store.read();
            writer.message({
              id: "msg-live",
              session: "ses-live",
              seq: 0,
              start: 1000,
              tokens: { output: 9 },
            });
            yield* TestClock.adjust("499 millis");
            expect((yield* store.read()).steps[0]!.output).toBe(1);
            yield* TestClock.adjust("1 millis");
            yield* Queue.take(commits);
            const updated = yield* store.read();
            expect(updated.steps[0]!.output).toBe(9);
            expect(updated.revision).toBe(initial.revision + 1);
            expect(updated.generation).toBe(initial.generation);
            expect(revisions).toEqual([initial.revision, updated.revision]);
          }).pipe(Effect.provide(TestClock.layer())),
        ),
      );
    } finally {
      fixture.dispose();
    }
  },
);

it("expires tombstones after 30 days without forgetting the fallback watermark", async () => {
  const fixture = syntheticFixture();
  fixture.writer.session("ses-expiry");
  fixture.writer.message({ id: "msg-expiry", session: "ses-expiry", seq: 0, start: 1 });
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const [initial, deletion] = yield* Effect.scoped(
          Effect.gen(function* () {
            const commits = yield* Queue.unbounded<number>();
            const store = yield* stayInSync(
              { source: fixture.source, cacheHome: fixture.folder },
              nodeRuntime,
              (copy) => {
                Queue.offerUnsafe(commits, copy.revision);
              },
            );
            yield* Queue.take(commits);
            const first = yield* store.read();
            expect((yield* store.read({ ...first, generation: "another-generation" })).kind).toBe(
              "whole",
            );
            fixture.writer.deleteSession("ses-expiry");
            yield* TestClock.adjust("500 millis");
            yield* Queue.take(commits);
            const deleted = yield* store.read();
            return [first, deleted] as const;
          }),
        );
        yield* TestClock.setTime(30 * 86400000 + 499);
        const before = yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* stayInSync(
              { source: fixture.source, cacheHome: fixture.folder },
              nodeRuntime,
              () => {},
            );
            return yield* store.read(initial);
          }),
        );
        expect(before.tombstones).toEqual([{ id: "msg-expiry", revision: 2 }]);
        yield* TestClock.setTime(30 * 86400000 + 500);
        const [fallback, current] = yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* stayInSync(
              { source: fixture.source, cacheHome: fixture.folder },
              nodeRuntime,
              () => {},
            );
            return [yield* store.read(initial), yield* store.read(deletion)] as const;
          }),
        );
        expect(fallback.kind).toBe("whole");
        expect(current.kind).toBe("changes");
        expect(current.tombstones).toEqual([]);
        expect(fallback.generation).toBe(initial.generation);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  } finally {
    fixture.dispose();
  }
});

it("reports an unwritable tombstone expiry commit without discarding the existing store", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-expiry-error");
  writer.message({ id: "msg-expiry-error", session: "ses-expiry-error", seq: 0, start: 1 });
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const commits = yield* Queue.unbounded<number>();
            yield* stayInSync({ source, cacheHome: folder }, nodeRuntime, (copy) => {
              Queue.offerUnsafe(commits, copy.revision);
            });
            yield* Queue.take(commits);
            writer.deleteSession("ses-expiry-error");
            yield* TestClock.adjust("500 millis");
            yield* Queue.take(commits);
          }),
        );
        yield* TestClock.setTime(30 * 86400000 + 500);
        const result = yield* Effect.scoped(
          stayInSync(
            { source, cacheHome: folder },
            {
              database: nodeDatabase,
              worker: (paths, announce = () => Effect.void) =>
                sync(
                  paths,
                  (config) => nodeDatabase({ ...config, readonly: true }),
                  nodeSource,
                  announce,
                ),
            },
            () => {},
          ),
        ).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }));
        expect(result).toMatchObject({ statement: "writeSteps", code: "SQLITE_ERROR" });
        const restored = yield* Effect.scoped(readCopy({ source, cacheHome: folder }, nodeRuntime));
        expect(restored.revision).toBe(3);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  } finally {
    fixture.dispose();
  }
});

it("keeps fact identities and last-change revisions, and tombstones reverted and deleted facts", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-live");
  writer.message({
    id: "msg-first",
    session: "ses-live",
    seq: 0,
    start: 1000,
    tokens: { input: 3 },
  });
  writer.message({
    id: "msg-next",
    session: "ses-live",
    seq: 1,
    start: 2000,
    tokens: { output: 4 },
  });
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
          yield* store.committed;
          const initial = yield* store.read();
          expect(yield* store.read(initial)).toMatchObject({
            kind: "changes",
            fromRevision: initial.revision,
            facts: [],
            tombstones: [],
          });
          expect((yield* store.read({ ...initial, revision: initial.revision + 1 })).kind).toBe(
            "whole",
          );
          writer.message({
            id: "msg-next",
            session: "ses-live",
            seq: 1,
            start: 2000,
            tokens: { output: 8 },
          });
          yield* TestClock.adjust("500 millis");
          yield* store.committed;
          const streaming = yield* store.read(initial);
          expect(streaming.kind).toBe("changes");
          expect(streaming.facts.map((fact) => [fact.id, fact.output, fact.revision])).toEqual([
            ["msg-next", 8, 2],
          ]);
          expect((yield* store.read()).facts.map((fact) => [fact.id, fact.revision])).toEqual([
            ["msg-first", 1],
            ["msg-next", 2],
          ]);
          writer.revert("ses-live", 1);
          yield* TestClock.adjust("500 millis");
          yield* store.committed;
          expect((yield* store.read(streaming)).tombstones).toEqual([
            { id: "msg-next", revision: 3 },
          ]);
          writer.deleteSession("ses-live");
          yield* TestClock.adjust("500 millis");
          yield* store.committed;
          const empty = yield* store.read();
          expect(empty.steps).toEqual([]);
          expect(empty.tombstones).toEqual([]);
          expect((yield* store.read(initial)).tombstones).toEqual([
            { id: "msg-first", revision: 4 },
            { id: "msg-next", revision: 3 },
          ]);
        }).pipe(Effect.provide(TestClock.layer())),
      ),
    );
  } finally {
    fixture.dispose();
  }
});

it("announces the tombstone expiry commit while the worker remains running", async () => {
  const fixture = streamingFixture();
  const announced: number[] = [];
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore(
          { source: fixture.source, cacheHome: fixture.folder },
          nodeRuntime,
          (copy) => announced.push(copy.revision),
        );
        fixture.writer.deleteSession("ses-live");
        yield* time.tick;
        time.setTime(30 * 86400000 + 500);
        yield* time.tick;
        expect(announced).toEqual([1, 2, 3]);
        expect((yield* store.read()).revision).toBe(3);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("updates each token kind and the start independently, including a previously missing session counter", async () => {
  const fixture = streamingFixture();
  const amounts = { input: 0, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
  const recordUsage = (start: number) =>
    fixture.writer.message({
      id: "msg-live",
      session: "ses-live",
      seq: 0,
      start,
      tokens: {
        input: amounts.input,
        output: amounts.output,
        reasoning: amounts.reasoning,
        cache: { read: amounts.cacheRead, write: amounts.cacheWrite },
      },
    });
  recordUsage(1000);
  fixture.writer.removeCounter("ses-live");
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore(
          { source: fixture.source, cacheHome: fixture.folder },
          nodeRuntime,
        );
        for (const [index, kind] of tokenKinds.entries()) {
          amounts[kind] = 10 + index;
          recordUsage(1000);
          yield* time.tick;
          const fact = (yield* store.read()).facts[0]!;
          expect(fact[kind]).toBe(10 + index);
          expect(fact.revision).toBe(index + 2);
        }
        recordUsage(2000);
        yield* time.tick;
        expect((yield* store.read()).facts[0]).toMatchObject({ start: 2000, revision: 7 });
      }),
    );
  } finally {
    fixture.dispose();
  }
});
