import { renameSync, existsSync } from "node:fs";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { observedStore } from "./testing/store.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import { storePaths } from "./location.ts";
import { readBuilt, syntheticFixture } from "./testing/index.ts";
import { runWithClock } from "./testing/clock.ts";
import type { StoreEvent } from "./store.ts";
import type { StoreRuntime } from "./database.ts";

it("builds a session and its nested subagents as one unit, and keeps orphan history", async () => {
  const fixture = syntheticFixture();
  const { writer } = fixture;
  writer.session("ses-root");
  writer.session("ses-child", "ses-root");
  writer.session("ses-grandchild", "ses-child");
  writer.session("ses-orphan", "ses-vanished");
  writer.session("ses-cycle", "ses-cycle");
  writer.message({ id: "msg-root", session: "ses-root", seq: 0, start: 1000 });
  writer.message({ id: "msg-child", session: "ses-child", seq: 0, start: 2000 });
  writer.message({ id: "msg-grandchild", session: "ses-grandchild", seq: 0, start: 3000 });
  writer.message({ id: "msg-orphan", session: "ses-orphan", seq: 0, start: 2500 });
  const commits: number[][] = [];
  try {
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      (value) => commits.push(value.steps.map((step) => step.start)),
      nodeRuntime,
    );
    expect(commits).toEqual([
      [2000, 3000, 1000],
      [2000, 3000, 2500, 1000],
      [2000, 3000, 2500, 1000],
    ]);
    expect(copy.historyCompleteFrom).toBe(1000);
  } finally {
    fixture.dispose();
  }
});

it("retains writes racing a build and tolerates a pending session vanishing before its snapshot", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-new");
  writer.session("ses-doomed");
  writer.message({ id: "msg-new", session: "ses-new", seq: 0, start: 2000, tokens: { output: 1 } });
  writer.message({ id: "msg-doomed", session: "ses-doomed", seq: 0, start: 1000 });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime, (copy) => {
          if (copy.revision === 1) {
            writer.deleteSession("ses-doomed");
            writer.message({
              id: "msg-new",
              session: "ses-new",
              seq: 0,
              start: 2000,
              tokens: { output: 5 },
            });
          }
        });
        const built = yield* store.read();
        expect(built.steps.map((step) => step.output)).toEqual([5]);
        yield* time.tick;
        expect((yield* store.read()).steps.map((step) => step.output)).toEqual([5]);
        const current = yield* store.read();
        time.setTime(600000);
        yield* time.tick;
        expect((yield* store.read()).revision).toBe(current.revision);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("normalizes a source open failure after path resolution without creating a replacement", async () => {
  const fixture = syntheticFixture();
  const events: StoreEvent[] = [];
  const runtime: StoreRuntime = {
    ...nodeRuntime,
    worker: (
      paths: Parameters<typeof nodeRuntime.worker>[0],
      announce = () => Effect.void,
      report = () => Effect.void,
    ) =>
      sync(
        paths,
        nodeDatabase,
        (filename) => {
          renameSync(fixture.source, `${fixture.source}.away`);
          return nodeSource(filename);
        },
        announce,
        report,
      ),
  };
  try {
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      runtime,
      (event) => events.push(event),
    );
    expect(copy.steps).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "sync.stopped", reason: "source.unreadable" }),
    );
    expect(existsSync(fixture.source)).toBe(false);
  } finally {
    renameSync(`${fixture.source}.away`, fixture.source);
    fixture.dispose();
  }
});

it("reconciles count and highest-position changes even when a source writer missed its session counter", async () => {
  const fixture = syntheticFixture();
  const reports: StoreEvent[] = [];
  const { writer, source, folder } = fixture;
  writer.session("ses-counter");
  writer.message({
    id: "msg-existing",
    session: "ses-counter",
    seq: 1,
    start: 1,
    tokens: { output: 1 },
  });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        time.setTime(100000);
        const store = yield* observedStore(
          { source, cacheHome: folder },
          nodeRuntime,
          () => {},
          (event) => reports.push(event),
        );
        writer.message(
          {
            id: "msg-unsignalled",
            session: "ses-counter",
            seq: 0,
            start: 0,
            tokens: { output: 2 },
          },
          false,
        );
        yield* time.tick;
        expect((yield* store.read()).revision).toBe(1);
        time.setTime(699499);
        yield* time.tick;
        expect((yield* store.read()).revision).toBe(1);
        time.setTime(699500);
        yield* time.tick;
        expect((yield* store.read()).facts.map((fact) => [fact.id, fact.revision])).toEqual([
          ["msg-unsignalled", 2],
          ["msg-existing", 1],
        ]);
        writer.positionWithoutCounter("msg-existing", 3);
        yield* time.tick;
        expect((yield* store.read()).revision).toBe(2);
        time.setTime(1299500);
        yield* time.tick;
        expect((yield* store.read()).facts.map((fact) => [fact.position, fact.revision])).toEqual([
          [0, 2],
          [3, 3],
        ]);
        expect(reports.filter((event) => event.kind === "consistency.difference")).toEqual([
          {
            kind: "consistency.difference",
            session: "ses-counter",
            expectedCount: 1,
            actualCount: 2,
            expectedPosition: 1,
            actualPosition: 1,
          },
          {
            kind: "consistency.difference",
            session: "ses-counter",
            expectedCount: 2,
            actualCount: 2,
            expectedPosition: 1,
            actualPosition: 3,
          },
        ]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("a source disappearing before the worker opens is a safe readSource failure", async () => {
  const fixture = syntheticFixture();
  const events: StoreEvent[] = [];
  try {
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      {
        ...nodeRuntime,
        worker: (paths, announce = () => Effect.void, report) => {
          renameSync(fixture.source, `${fixture.source}.away`);
          return nodeRuntime.worker(paths, announce, report);
        },
      },
      (event) => events.push(event),
    );
    expect(copy.steps).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "sync.stopped", reason: "source.missing" }),
    );
  } finally {
    renameSync(`${fixture.source}.away`, fixture.source);
    fixture.dispose();
  }
});

it("the Node worker adapter also builds when its caller needs no commit callback", async () => {
  const fixture = syntheticFixture();
  try {
    const paths = storePaths({ source: fixture.source, cacheHome: fixture.folder });
    await Effect.runPromise(Effect.scoped(nodeRuntime.worker(paths)));
    expect(
      (
        await readBuilt(
          { source: fixture.source, cacheHome: fixture.folder },
          () => {},
          nodeRuntime,
        )
      ).revision,
    ).toBe(1);
    fixture.writer.close();
    expect(existsSync(`${fixture.source}-wal`)).toBe(false);
    expect(existsSync(`${fixture.source}-shm`)).toBe(false);
  } finally {
    fixture.dispose();
  }
});

it.each(["counter", "usage"])(
  "stops for unsafe %s scalars immediately, never backing off a non-busy failure",
  async (scalar) => {
    const fixture = syntheticFixture();
    const { writer, source, folder } = fixture;
    writer.session("ses-invalid");
    writer.message({
      id: "msg-invalid",
      session: "ses-invalid",
      seq: 0,
      start: 1,
      tokens: { output: scalar === "usage" ? -1 : 1 },
    });
    if (scalar === "counter") writer.sequence("ses-invalid", "SYNTHETIC PRIVATE COUNTER");
    const events: StoreEvent[] = [];
    try {
      const copy = await readBuilt(
        { source, cacheHome: folder },
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(copy.steps).toEqual([]);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "sync.stopped", reason: "source.unreadable" }),
      );
      expect(JSON.stringify(events)).not.toContain("SYNTHETIC PRIVATE");
      writer.sequence("ses-invalid", 0);
      writer.message({
        id: "msg-invalid",
        session: "ses-invalid",
        seq: 0,
        start: 1,
        tokens: { output: 2 },
      });
      const revisions: number[] = [];
      const recovered = await readBuilt(
        { source, cacheHome: folder },
        (updated) => revisions.push(updated.revision),
        nodeRuntime,
      );
      expect(revisions).toEqual([1]);
      expect(recovered.steps[0]!.output).toBe(2);
    } finally {
      fixture.dispose();
    }
  },
);

it("a genuine failed fact write retains the previous copy and reports the decided statement", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-write-error");
  writer.message({ id: "msg-write-error", session: "ses-write-error", seq: 0, start: 1 });
  try {
    const initial = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    const events: StoreEvent[] = [];
    writer.message({
      id: "msg-write-error",
      session: "ses-write-error",
      seq: 0,
      start: 1,
      tokens: { output: 9 },
    });
    const held = await readBuilt(
      { source, cacheHome: folder },
      () => {},
      {
        ...nodeRuntime,
        worker: (paths, announce = () => Effect.void, report) =>
          sync(
            paths,
            (config) => nodeDatabase({ ...config, readonly: true }),
            nodeSource,
            announce,
            report,
          ),
      },
      (event) => events.push(event),
    );
    expect(held.steps).toEqual(initial.steps);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "sync.stopped", reason: "store.unwritable" }),
    );
    expect((await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime)).generation).toBe(
      initial.generation,
    );
  } finally {
    fixture.dispose();
  }
});
