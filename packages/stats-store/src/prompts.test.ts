import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { syntheticFixture } from "./testing/index.ts";
import { observedStore } from "./testing/store.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import { nodeRuntime } from "./runtime.node.ts";

it("counts delivered non-synthetic root prompts, never copied history, and follows the first subsequent step's recorded dimensions", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("root");
  writer.session("child", "root");
  const user = { id: "prompt", session: "root", seq: 0, start: 10, type: "user" };
  writer.message(user);
  writer.message({ ...user, id: "synthetic", seq: 1, type: "synthetic" });
  writer.message({ ...user, id: "child-prompt", session: "child" });
  writer.fork("root", "fork");
  writer.fork("fork", "fork-twice", 2);
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        const first = yield* store.read();
        expect(canonicalCopy(first).prompts).toEqual([
          {
            id: "prompt",
            start: 10,
            provider: null,
            model: null,
            variant: null,
            agent: null,
            project: "synthetic-project",
            session: "root",
          },
        ]);
        writer.message({
          id: "next",
          session: "root",
          seq: 2,
          start: 20,
          provider: "p",
          model: "m",
          variant: "high",
          agent: "plan",
          error: "aborted",
          completed: 30,
        });
        writer.message({
          id: "later",
          session: "root",
          seq: 3,
          start: 40,
          provider: "later",
          model: "other",
          streamEnd: 50,
          completed: 60,
          error: "api.failure",
        });
        yield* time.tick;
        const next = yield* store.read();
        expect(canonicalCopy(next).prompts[0]).toMatchObject({
          provider: "p",
          model: "p/m",
          variant: "high",
          agent: "plan",
        });
        expect(canonicalCopy(next).steps).toMatchObject([
          { streamEnd: null, completed: 30, error: "aborted", failed: 0, interrupted: 1 },
          { streamEnd: 50, completed: 60, error: "api.failure", failed: 1, interrupted: 0 },
        ]);
        expect((yield* store.read(first)).prompts).toHaveLength(1);
        // An identical session re-read emits no prompt change.
        writer.archive("root");
        writer.message({ ...user });
        yield* time.tick;
        expect((yield* store.read(next)).prompts).toEqual([]);
        writer.project("moved", "/made-up-moved");
        writer.move("root", "moved");
        yield* time.tick;
        expect(canonicalCopy(yield* store.read()).prompts[0]!.project).toBe("moved");
        writer.rewriteWithoutCounter(
          "next",
          JSON.stringify({ time: { created: 20 }, model: { providerID: "p" } }),
        );
        writer.message(user);
        yield* time.tick;
        expect(canonicalCopy(yield* store.read()).prompts[0]).toMatchObject({
          provider: "p",
          model: null,
          agent: null,
          variant: "default",
        });
        writer.rewriteWithoutCounter(
          "next",
          JSON.stringify({ time: { created: 20 }, model: { id: "m" } }),
        );
        writer.message({ ...user, start: 11 });
        yield* time.tick;
        expect(canonicalCopy(yield* store.read()).prompts[0]).toMatchObject({
          start: 11,
          provider: null,
          model: null,
        });
        writer.revert("root", 2);
        yield* time.tick;
        const beforeDelete = yield* store.read();
        expect(canonicalCopy(beforeDelete).prompts[0]!.model).toBeNull();
        writer.revert("root", 0);
        yield* time.tick;
        const deleted = yield* store.read(beforeDelete);
        expect(deleted.prompts).toEqual([]);
        expect(deleted.tombstones.map((row) => row.id)).toContain("prompt");
        writer.message(user);
        yield* time.tick;
        expect((yield* store.read(beforeDelete)).tombstones.map((row) => row.id)).not.toContain(
          "prompt",
        );
        expect((yield* store.read()).prompts).toHaveLength(1);
        writer.deleteSession("root");
        yield* time.tick;
        expect((yield* store.read()).prompts).toEqual([]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("keeps error message content out of the store while preserving only the open-ended error type", async () => {
  const fixture = syntheticFixture();
  fixture.writer.session("root");
  fixture.writer.message({
    id: "step",
    session: "root",
    seq: 0,
    start: 0,
    error: "plugin.custom-error",
    streamEnd: 0,
  });
  try {
    await runWithClock(() =>
      Effect.gen(function* () {
        const store = yield* observedStore(
          { source: fixture.source, cacheHome: fixture.folder },
          nodeRuntime,
        );
        const copy = yield* store.read();
        expect(canonicalCopy(copy).steps[0]).toMatchObject({
          error: "plugin.custom-error",
          streamEnd: 0,
          completed: null,
        });
        const cache = join(fixture.folder, "opencode-stats");
        const files = readdirSync(cache).map((file) => join(cache, file));
        for (const filename of files)
          expect(readFileSync(filename).includes(Buffer.from("SYNTHETIC PRIVATE ERROR"))).toBe(
            false,
          );
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it.each([0, 1, 2, 3])(
  "incremental prompt/timing/error facts equal a full build after generated updates (partition %i)",
  async (partition) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 6 }),
        async (actions) => {
          const fixture = syntheticFixture();
          const { writer, source, folder } = fixture;
          writer.session("root");
          writer.message({ id: "prompt", session: "root", seq: 0, start: 1, type: "user" });
          try {
            await runWithClock((time) =>
              Effect.gen(function* () {
                const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
                for (const [index, action] of actions.entries()) {
                  if (action === 0) writer.revert("root", 1);
                  else
                    writer.message({
                      id: "step",
                      session: "root",
                      seq: 1,
                      start: 2,
                      provider: "p",
                      model: `m-${index}`,
                      agent: "plan",
                      variant: action === 1 ? undefined : "high",
                      error: action === 2 ? "aborted" : action === 3 ? "api.error" : undefined,
                      streamEnd: action === 4 ? 4 : undefined,
                      completed: action === 5 ? 5 : undefined,
                    });
                  yield* time.tick;
                }
                const incremental = yield* store.read();
                const fresh = yield* observedStore(
                  { source, cacheHome: join(folder, "fresh") },
                  nodeRuntime,
                );
                expect(canonicalCopy(yield* fresh.read())).toEqual(canonicalCopy(incremental));
              }),
            );
          } finally {
            fixture.dispose();
          }
        },
      ),
      { ...propertyParameters, seed: propertyParameters.seed + partition, numRuns: 4 },
    );
  },
);
