import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { join } from "node:path";
import { expect, it } from "vitest";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { observedStore } from "./testing/store.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";

it("counts only each fork's own history, including rewritten copies, forks of forks and imported orphan forks", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  try {
    writer.session("origin");
    writer.message({
      id: "msg_abcdefghijklmnopqrstuvwxyz",
      session: "origin",
      seq: 0,
      start: 10,
      tokens: { input: 100 },
    });
    writer.fork("origin", "fork");
    writer.message({ id: "own-fork", session: "fork", seq: 1, start: 20, tokens: { input: 2 } });
    writer.fork("fork", "fork-again", 2);
    writer.message({
      id: "own-again",
      session: "fork-again",
      seq: 2,
      start: 30,
      tokens: { input: 3 },
    });
    writer.message({
      id: "msg_abcdefghijklmnopqrstuvwxyz_2",
      session: "fork-again",
      seq: 0,
      start: 40,
      tokens: { input: 10000 },
    });
    writer.rewriteWithoutCounter("msg_abcdefghijklmnopqrstuvwxyz_2", "SYNTHETIC BROKEN COPY JSON");
    writer.deleteSession("origin");
    writer.session("imported", null, { fork: "deleted-import" });
    writer.message({
      id: "msg_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456",
      session: "imported",
      seq: 0,
      start: 50,
      tokens: { input: 100000 },
    });
    writer.message({ id: "own-import", session: "imported", seq: 1, start: 60 });
    const copy = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    expect(copy.facts.map((row) => row.id)).toEqual(["own-fork", "own-again", "own-import"]);
    expect(copy.steps.map((row) => row.input)).toEqual([2, 3, null]);
    expect(canonicalCopy(copy).sessions.map((row) => [row.code, row.fork])).toEqual([
      ["fork", "origin"],
      ["fork-again", "fork"],
      ["imported", "deleted-import"],
    ]);
  } finally {
    fixture.dispose();
  }
});

it("rolls nested steps into their session, then into their topmost surviving ancestor, without counting archives twice", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("root");
  writer.session("child", "root");
  writer.session("grandchild", "child");
  writer.session("empty");
  writer.message({ id: "deep-step", session: "grandchild", seq: 0, start: 10 });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime, (copy) => {
          const counted = canonicalCopy(copy);
          for (const step of counted.steps)
            expect(counted.sessions.some((session) => session.code === step.session)).toBe(true);
        });
        const first = yield* store.read();
        expect(canonicalCopy(first).steps[0]).toMatchObject({
          session: "root",
          subagent: "grandchild",
        });
        writer.archive("root");
        yield* time.tick;
        expect((yield* store.read()).revision).toBe(first.revision);
        writer.deleteSession("root");
        yield* time.tick;
        const orphaned = yield* store.read();
        expect(canonicalCopy(orphaned).steps[0]).toMatchObject({
          session: "child",
          subagent: "grandchild",
        });
        expect((yield* store.read(first)).sessionTombstones).toEqual([
          first.sessions.find(
            (row) => first.names.find((name) => name.code === row.code)?.id === "root",
          )!.code,
        ]);
        writer.deleteSession("child");
        yield* time.tick;
        expect(canonicalCopy(yield* store.read()).steps[0]).toMatchObject({
          session: "grandchild",
          subagent: null,
        });
        writer.deleteSession("grandchild");
        yield* time.tick;
        expect((yield* store.read()).steps).toEqual([]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("rereads details and projects without a session counter, moves all steps, carries names, and never reuses codes", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.project("one", "/parent-one/shared");
  writer.project("two", "/parent-two/shared");
  writer.project("global", "/");
  writer.session("session", null, { project: "one", title: "Before" });
  writer.message({
    id: "first",
    session: "session",
    seq: 0,
    start: 1,
    provider: "p",
    model: "m",
    agent: "plan",
  });
  writer.message({
    id: "second",
    session: "session",
    seq: 1,
    start: 2,
    provider: "q",
    model: "m",
    variant: "high",
    agent: "explore",
  });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        const initial = yield* store.read();
        const dimension = (copy: typeof initial, name: string, id: string) =>
          copy.names.find((row) => row.dimension === name && row.id === id)!;
        expect(dimension(initial, "project", "one").name).toBe("parent-one/shared");
        expect(dimension(initial, "project", "two").name).toBe("parent-two/shared");
        expect(dimension(initial, "project", "global").name).toBe("Global");
        expect(canonicalCopy(initial).steps).toMatchObject([
          {
            provider: "p",
            model: "p/m",
            variant: "default",
            agent: "plan",
            project: "one",
            session: "session",
          },
          {
            provider: "q",
            model: "q/m",
            variant: "high",
            agent: "explore",
            project: "one",
            session: "session",
          },
        ]);
        writer.title("session", "After");
        writer.move("session", "two");
        writer.project("one", "/parent-one/shared", "Named");
        yield* time.tick;
        const moved = yield* store.read();
        expect(canonicalCopy(moved).steps.every((step) => step.project === "two")).toBe(true);
        expect(dimension(moved, "session", "session")).toMatchObject({
          name: "After",
          code: dimension(initial, "session", "session").code,
        });
        expect(dimension(moved, "project", "one")).toMatchObject({
          name: "Named",
          code: dimension(initial, "project", "one").code,
        });
        expect(dimension(moved, "project", "two").name).toBe("shared");
        const changes = yield* store.read(initial);
        expect(changes.facts).toHaveLength(2);
        expect(changes.sessions).toHaveLength(1);
        writer.deleteProject("two");
        yield* time.tick;
        const removed = yield* store.read(moved);
        expect(removed.projectTombstones).toEqual([dimension(initial, "project", "two").code]);
        expect(removed.sessionTombstones).toEqual([dimension(initial, "session", "session").code]);
        writer.project("new", "/new");
        writer.session("new-session", null, { project: "new" });
        writer.message({ id: "new-step", session: "new-session", seq: 0, start: 3 });
        yield* time.tick;
        const recreated = yield* store.read();
        expect(dimension(recreated, "session", "new-session").code).toBeGreaterThan(
          Math.max(...initial.names.map((row) => row.code)),
        );
        writer.project("two", "/return");
        writer.session("session", null, { project: "two" });
        yield* time.tick;
        const returned = yield* store.read();
        expect(dimension(returned, "session", "session").code).toBe(
          dimension(initial, "session", "session").code,
        );
        expect(dimension(returned, "project", "two").code).toBe(
          dimension(initial, "project", "two").code,
        );
        expect((yield* store.read(moved)).projectTombstones).toEqual([]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("the stand-in removes deepest subagents first in separate commits", () => {
  const fixture = syntheticFixture();
  try {
    fixture.writer.session("root");
    fixture.writer.session("child", "root");
    fixture.writer.session("grandchild", "child");
    const removed: string[] = [];
    fixture.writer.removeTree("root", (id) => removed.push(id));
    expect(removed).toEqual(["grandchild", "child", "root"]);
  } finally {
    fixture.dispose();
  }
});

it("removes the details of a session that disappears between build units even when no transcript remains dirty", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("new");
  writer.session("doomed");
  writer.message({ id: "new-step", session: "new", seq: 0, start: 2 });
  writer.message({ id: "old-step", session: "doomed", seq: 0, start: 1 });
  try {
    const copy = await readBuilt(
      { source, cacheHome: folder },
      (commit) => {
        if (commit.revision === 1) writer.deleteSession("doomed");
      },
      nodeRuntime,
    );
    // Check the completed pass before a later poll could repair missing metadata.
    expect(canonicalCopy(copy).sessions.map((row) => row.code)).toEqual(["new"]);
    expect(copy.facts.map((row) => row.id)).toEqual(["new-step"]);
  } finally {
    fixture.dispose();
  }
});

it("keeps earlier deletions excluded when several build units disappear in one pass", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("newest");
  writer.session("root");
  writer.session("child", "root");
  writer.session("other");
  for (const [session, start] of [
    ["newest", 3],
    ["child", 2],
    ["other", 1],
  ] as const)
    writer.message({ id: `${session}-step`, session, seq: 0, start });
  const copies: ReturnType<typeof canonicalCopy>[] = [];
  try {
    await runWithClock(() =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime, (copy) => {
          if (copy.revision === 1) {
            writer.deleteSession("root");
            writer.deleteSession("other");
          } else copies.push(canonicalCopy(copy));
        });
        expect(
          copies.map((copy) => copy.steps.find((step) => step.id === "child-step")?.session),
        ).toEqual(["child", "child"]);
        expect(
          copies.map((copy) => copy.sessions.some((session) => session.code === "root")),
        ).toEqual([false, false]);
        expect(canonicalCopy(yield* store.read()).sessions.map((session) => session.code)).toEqual([
          "child",
          "newest",
        ]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("removes unread session details when an interrupted build resumes after that session was deleted", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("read");
  writer.session("unread");
  writer.message({ id: "read-step", session: "read", seq: 0, start: 2 });
  writer.message({
    id: "unread-step",
    session: "unread",
    seq: 0,
    start: 1,
    tokens: { output: -1 },
  });
  try {
    await expect(readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime)).rejects.toThrow(
      "Stats store build failed.",
    );
    writer.deleteSession("unread");
    const resumed = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    expect(canonicalCopy(resumed).sessions.map((row) => row.code)).toEqual(["read"]);
    expect(resumed.facts.map((row) => row.id)).toEqual(["read-step"]);
    expect(resumed.historyCompleteFrom).toBe(2);
  } finally {
    fixture.dispose();
  }
});

it("keeps missing migrated dimensions missing, defaults only the variant, and follows project-only renames", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("migrated", null, { title: "" });
  for (const [index, dimensions] of [{}, { providerID: "p" }, { id: "m" }].entries()) {
    writer.message({ id: `old-${index}`, session: "migrated", seq: index, start: index });
    writer.rewriteWithoutCounter(
      `old-${index}`,
      JSON.stringify({ time: { created: index }, model: dimensions }),
    );
  }
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        const initial = yield* store.read();
        expect(canonicalCopy(initial).steps).toMatchObject([
          { provider: null, model: null, agent: null, variant: "default" },
          { provider: "p", model: null, agent: null, variant: "default" },
          { provider: null, model: null, agent: null, variant: "default" },
        ]);
        expect(canonicalCopy(initial).sessions[0]!.title).toBe("Untitled");
        writer.project("synthetic-project", "/made-up", "New name");
        yield* time.tick;
        const changes = yield* store.read(initial);
        expect(changes.facts).toEqual([]);
        expect(changes.sessions).toEqual([]);
        expect(changes.projects).toEqual(initial.projects);
        expect(changes.names).toEqual([
          { ...initial.names.find((name) => name.dimension === "project")!, name: "New name" },
        ]);
        writer.project("synthetic-project", "/renamed-folder", "New name");
        yield* time.tick;
        const relocated = yield* store.read(changes);
        expect(relocated.projects).toEqual(initial.projects);
        expect(relocated.names).toEqual([]);
        expect(relocated.facts).toEqual([]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("updates each dimension from the rewritten step rather than from a session's current choices", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("session");
  const dimensions = { provider: "p", model: "m", variant: "default", agent: "build" };
  const record = () =>
    writer.message({ id: "step", session: "session", seq: 0, start: 1, ...dimensions });
  record();
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        for (const key of ["provider", "model", "variant", "agent"] as const) {
          dimensions[key] = `new-${key}`;
          record();
          yield* time.tick;
          expect(canonicalCopy(yield* store.read()).steps[0]).toMatchObject({
            provider: dimensions.provider,
            model: `${dimensions.provider}/${dimensions.model}`,
            variant: dimensions.variant,
            agent: dimensions.agent,
          });
        }
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it.each([0, 1, 2, 3, 4, 5])(
  "incremental facts equal a fresh build through generated forks, nesting, deletion, moves and renames (partition %i)",
  async (partition) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 8 }),
        async (actions) => {
          const fixture = syntheticFixture();
          const { writer, source, folder } = fixture;
          try {
            writer.project("other", "/other");
            writer.session("root");
            writer.session("child", "root");
            writer.session("deep", "child");
            writer.message({ id: "original", session: "root", seq: 0, start: 1 });
            writer.message({ id: "nested", session: "deep", seq: 0, start: 2 });
            writer.fork("root", "fork");
            writer.fork("fork", "fork-again", 2);
            writer.message({ id: "fork-own", session: "fork-again", seq: 10, start: 3 });
            let rootPresent = true;
            await runWithClock((time) =>
              Effect.gen(function* () {
                const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
                for (const [index, action] of actions.entries()) {
                  if (action === 0) writer.move("deep", index % 2 ? "other" : "synthetic-project");
                  if (action === 1) writer.project("other", "/other", `Renamed ${index}`);
                  if (action === 2) writer.title("deep", `Title ${index}`);
                  if (action === 3) {
                    writer.message({
                      id: "fork-own",
                      session: "fork-again",
                      seq: 10,
                      start: 3,
                      tokens: { input: index },
                    });
                  }
                  if (action === 4 && rootPresent) {
                    writer.deleteSession("root");
                    rootPresent = false;
                  }
                  if (action === 5) writer.revert("fork-again", 10);
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
