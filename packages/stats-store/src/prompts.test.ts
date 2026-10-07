import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { observedStore } from "./testing/store.ts";
import { readSourceStopped } from "./testing/stopped-store.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import type { StoreRuntime } from "./database.ts";
import type { SourceAdapter } from "./source-reader.ts";
import type { StoreCopy } from "./store.ts";
import { sync } from "./sync.ts";
import { sqlFailure } from "./errors.ts";

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

it("reattributes both roots' prompts before announcing project moves, even when the second unit fails and resumes without a transcript change", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  const options = { source, cacheHome: folder };
  for (const [session, start] of [
    ["root-a", 200],
    ["root-b", 100],
  ] as const) {
    writer.session(session);
    writer.message({ id: `${session}-prompt`, session, seq: 0, start, type: "user" });
    writer.message({ id: `${session}-step`, session, seq: 1, start: start + 1 });
  }
  writer.project("moved-a", "/synthetic-a");
  writer.project("moved-b", "/synthetic-b");
  const reads: string[] = [];
  const failingSource: SourceAdapter = (filename) =>
    nodeSource(filename).pipe(
      Effect.map((reader) => ({
        ...reader,
        read: (session: string) => {
          reads.push(session);
          return session === "root-b"
            ? Effect.fail(sqlFailure(new Error("Synthetic read interruption"), "readSource"))
            : reader.read(session);
        },
      })),
    );
  const interrupted: StoreRuntime = {
    database: nodeDatabase,
    worker: (paths, announce = () => Effect.void, report) =>
      sync(paths, nodeDatabase, failingSource, announce, report),
  };
  try {
    const initial = await readBuilt(options, () => {}, nodeRuntime);
    // These moves advance project counters only, matching OpenCode's worktree projection.
    writer.move("root-a", "moved-a");
    writer.move("root-b", "moved-b");
    const announced: StoreCopy[] = [];
    const stopped = await readSourceStopped(options, interrupted, (copy) => announced.push(copy));
    expect(reads).toEqual(["root-a", "root-b"]);
    const commits = announced.filter((copy) => copy.revision > initial.revision);
    expect(commits).toHaveLength(1);
    const moved = commits[0]!;
    expect(stopped).toEqual(moved);
    const canonical = canonicalCopy(moved);
    expect(canonical.prompts.map((prompt) => [prompt.session, prompt.project])).toEqual([
      ["root-a", "moved-a"],
      ["root-b", "moved-b"],
    ]);
    for (const copy of announced) {
      const snapshot = canonicalCopy(copy);
      for (const prompt of snapshot.prompts) {
        expect(snapshot.sessions.find((session) => session.code === prompt.session)!.project).toBe(
          prompt.project,
        );
        expect(snapshot.steps.find((step) => step.session === prompt.session)!.project).toBe(
          prompt.project,
        );
      }
    }
    const promptChanges = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* observedStore(options, nodeRuntime);
          const resumed = yield* store.read();
          expect(resumed.generation).toBe(initial.generation);
          expect(resumed.revision).toBe(moved.revision);
          const changes = yield* store.read(initial);
          const fresh = yield* observedStore(
            { ...options, cacheHome: join(folder, "fresh") },
            nodeRuntime,
          );
          expect(canonicalCopy(resumed)).toEqual(canonicalCopy(yield* fresh.read()));
          return changes.prompts;
        }),
      ),
    );
    expect(promptChanges).toHaveLength(2);
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
                      ...(action === 1 ? {} : { variant: "high" }),
                      ...(action === 2
                        ? { error: "aborted" }
                        : action === 3
                          ? { error: "api.error" }
                          : {}),
                      ...(action === 4 ? { streamEnd: 4 } : {}),
                      ...(action === 5 ? { completed: 5 } : {}),
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
