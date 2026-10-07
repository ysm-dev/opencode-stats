import { expect, it } from "vitest";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import type { StoreCopy, StoreEvent } from "./store.ts";
import * as Effect from "effect/Effect";
import { observedStore } from "./testing/store.ts";
import { readSourceStopped } from "./testing/stopped-store.ts";
import { runWithClock } from "./testing/clock.ts";

it("commits newest build units before an interruption and resumes without rereading unchanged units", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-new");
  writer.session("ses-old");
  writer.message({ id: "msg-new", session: "ses-new", seq: 0, start: 2000, tokens: { output: 2 } });
  writer.message({
    id: "msg-old",
    session: "ses-old",
    seq: 0,
    start: 1000,
    tokens: { output: -1 },
  });
  const committed: StoreCopy[] = [];
  try {
    const stopped = await readSourceStopped({ source, cacheHome: folder }, nodeRuntime, (copy) =>
      committed.push(copy),
    );
    expect(committed).toHaveLength(1);
    expect(stopped).toEqual(committed[0]);
    expect(committed[0]!.steps[0]!.output).toBe(2);
    expect(committed[0]!.historyCompleteFrom).toBe(1000);
    expect(committed[0]!.historyComplete).toBe(false);
    writer.rewriteWithoutCounter("msg-new", "SYNTHETIC INVALID JSON: must not be reread");
    writer.message({
      id: "msg-old",
      session: "ses-old",
      seq: 0,
      start: 1000,
      tokens: { output: 3 },
    });
    const resumed = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    expect(resumed.generation).toBe(committed[0]!.generation);
    expect(resumed.revision).toBe(2);
    expect(resumed.steps.map((step) => step.output)).toEqual([2, 3]);
    expect(resumed.historyCompleteFrom).toBe(1000);
    expect(resumed.historyComplete).toBe(true);
  } finally {
    fixture.dispose();
  }
});

it.each(["migration", "import"] as const)(
  "an interrupted first build still rereads committed units after a downtime %s",
  async (reason) => {
    const fixture = syntheticFixture("2.0.0");
    const { writer, source, folder } = fixture;
    const options = { source, cacheHome: folder };
    const newest = { id: "new", session: "new", seq: 0, start: 2000 };
    const oldest = { id: "old", session: "old", seq: 0, start: 1000 };
    try {
      writer.session("new");
      writer.session("old");
      writer.message({ ...newest, tokens: { output: 2 } });
      writer.message({ ...oldest, tokens: { output: -1 } });
      const before = await readSourceStopped(options, nodeRuntime);
      expect(before.historyComplete).toBe(false);
      writer.message({ ...newest, tokens: { output: 9 } }, false);
      writer.message({ ...oldest, tokens: { output: 3 } });
      if (reason === "migration") writer.migrate();
      else writer.importMarker("completed");
      const events: StoreEvent[] = [];
      const after = await readBuilt(
        options,
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(after.generation).toBe(before.generation);
      expect(after.steps.map((step) => step.output)).toEqual([9, 3]);
      expect(after.historyComplete).toBe(true);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "reread.end", reason, sessions: 2, changed: 2 }),
      );
    } finally {
      fixture.dispose();
    }
  },
);

it("keeps the next unread unit's boundary while known units and new subagents are interleaved", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-known-a");
  writer.session("ses-known-b");
  writer.message({ id: "msg-a", session: "ses-known-a", seq: 0, start: 5000 });
  writer.message({ id: "msg-b", session: "ses-known-b", seq: 0, start: 3000 });
  try {
    await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    writer.session("ses-newest");
    writer.session("ses-new-child", "ses-known-a");
    writer.session("ses-new-old");
    writer.message({ id: "msg-newest", session: "ses-newest", seq: 0, start: 6000 });
    writer.message({ id: "msg-child", session: "ses-new-child", seq: 0, start: 4000 });
    writer.message({ id: "msg-old", session: "ses-new-old", seq: 0, start: 1000 });
    writer.message({
      id: "msg-b",
      session: "ses-known-b",
      seq: 0,
      start: 3000,
      tokens: { output: 1 },
    });
    const boundaries: number[] = [];
    await readBuilt(
      { source, cacheHome: folder },
      (copy) => boundaries.push(copy.historyCompleteFrom),
      nodeRuntime,
    );
    expect(boundaries).toEqual([3000, 3000, 3000, 3000, 1000]);
  } finally {
    fixture.dispose();
  }
});

it("rereads only the changed member of an already built session-with-subagents unit", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-parent");
  writer.session("ses-child", "ses-parent");
  writer.message({ id: "msg-parent", session: "ses-parent", seq: 0, start: 1000 });
  writer.message({
    id: "msg-child",
    session: "ses-child",
    seq: 0,
    start: 2000,
    tokens: { output: 1 },
  });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        writer.rewriteWithoutCounter(
          "msg-parent",
          "SYNTHETIC INVALID JSON: unchanged parent must not be reread",
        );
        writer.message({
          id: "msg-child",
          session: "ses-child",
          seq: 0,
          start: 2000,
          tokens: { output: 9 },
        });
        yield* time.tick;
        expect(
          (yield* store.read()).facts.map((fact) => [fact.id, fact.output, fact.revision]),
        ).toEqual([
          ["msg-child", 9, 2],
          ["msg-parent", null, 1],
        ]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("orders negative instants newest first and advances the complete boundary after each of three units", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  for (const [id, start] of [
    ["a", -3000],
    ["b", -2000],
    ["c", -1000],
  ] as const) {
    writer.session(id);
    writer.message({ id: `msg-${id}`, session: id, seq: 0, start });
  }
  const progress: Array<[number[], number]> = [];
  try {
    await readBuilt(
      { source, cacheHome: folder },
      (copy) => progress.push([copy.steps.map((step) => step.start), copy.historyCompleteFrom]),
      nodeRuntime,
    );
    expect(progress).toEqual([
      [[-1000], -2000],
      [[-2000, -1000], -3000],
      [[-3000, -2000, -1000], -3000],
    ]);
  } finally {
    fixture.dispose();
  }
});

it("announces the pending history boundary even when vanished sessions are removed before new units", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("old");
  writer.message({ id: "msg-old", session: "old", seq: 0, start: 1000 });
  try {
    await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    writer.deleteSession("old");
    writer.session("new");
    writer.message({ id: "msg-new", session: "new", seq: 0, start: 3000 });
    const progress: Array<[number, number]> = [];
    await readBuilt(
      { source, cacheHome: folder },
      (copy) => progress.push([copy.steps.length, copy.historyCompleteFrom]),
      nodeRuntime,
    );
    expect(progress).toEqual([
      [1, 1000],
      [0, 0],
      [1, 3000],
    ]);
  } finally {
    fixture.dispose();
  }
});

it("resnapshots a write racing the deletion commit before reading older pending units", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  const options = { source, cacheHome: folder };
  try {
    writer.session("removed");
    writer.message({ id: "removed-step", session: "removed", seq: 0, start: 1000 });
    const before = await readBuilt(options);
    writer.deleteSession("removed");
    writer.session("older");
    writer.message({ id: "older-step", session: "older", seq: 0, start: 2000 });
    const published: string[][] = [];
    const after = await readBuilt(
      options,
      (copy) => {
        published.push(copy.facts.map((fact) => fact.id).toSorted());
        if (copy.facts.length === 0) {
          writer.session("newer");
          writer.message({ id: "newer-step", session: "newer", seq: 0, start: 3000 });
        }
      },
      nodeRuntime,
    );
    expect(after.generation).toBe(before.generation);
    expect(after.historyComplete).toBe(true);
    expect(published).toEqual([["removed-step"], [], ["newer-step"], ["newer-step", "older-step"]]);
  } finally {
    fixture.dispose();
  }
});

it.each(["count", "position"])(
  "startup reconciles a missed %s change without waiting for the first poll",
  async (change) => {
    const fixture = syntheticFixture();
    const { writer, source, folder } = fixture;
    writer.session("ses-startup");
    writer.message({ id: "msg-existing", session: "ses-startup", seq: 1, start: 1 });
    try {
      const first = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
      if (change === "count")
        writer.message({ id: "msg-extra", session: "ses-startup", seq: 0, start: 0 }, false);
      else writer.positionWithoutCounter("msg-existing", 3);
      const current = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
      expect(current.generation).toBe(first.generation);
      expect(current.revision).toBe(first.revision + 1);
      expect(current.facts.map((fact) => fact.position)).toEqual(change === "count" ? [0, 1] : [3]);
    } finally {
      fixture.dispose();
    }
  },
);
