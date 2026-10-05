import { renameSync } from "node:fs";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { observedStore } from "./testing/store.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import { readBuilt, syntheticFixture } from "./testing/index.ts";
import { runWithClock } from "./testing/clock.ts";

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
  writer.message({ id: "msg-orphan", session: "ses-orphan", seq: 0, start: 500 });
  const commits: number[][] = [];
  try {
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      (value) => commits.push(value.steps.map((step) => step.start)),
      nodeRuntime,
    );
    expect(commits).toEqual([
      [2000, 3000, 1000],
      [2000, 3000, 500, 1000],
      [2000, 3000, 500, 1000],
    ]);
    expect(copy.historyCompleteFrom).toBe(500);
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
        expect(built.steps.map((step) => step.output)).toEqual([1]);
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
  const runtime = {
    ...nodeRuntime,
    worker: (paths: Parameters<typeof nodeRuntime.worker>[0]) =>
      sync(
        paths,
        nodeDatabase,
        (filename) => {
          renameSync(fixture.source, `${fixture.source}.away`);
          return nodeSource(filename);
        },
        () => Effect.void,
      ),
  };
  try {
    await expect(
      readBuilt({ source: fixture.source, cacheHome: fixture.folder }, () => {}, runtime),
    ).rejects.toMatchObject({ code: "SQLITE_ERROR", statement: "readSource" });
  } finally {
    renameSync(`${fixture.source}.away`, fixture.source);
    fixture.dispose();
  }
});

it("reconciles count and highest-position changes even when a source writer missed its session counter", async () => {
  const fixture = syntheticFixture();
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
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
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
        expect((yield* store.read()).facts.map((fact) => [fact.id, fact.revision])).toEqual([
          ["msg-unsignalled", 2],
          ["msg-existing", 1],
        ]);
        writer.positionWithoutCounter("msg-existing", 3);
        yield* time.tick;
        expect((yield* store.read()).facts.map((fact) => [fact.position, fact.revision])).toEqual([
          [0, 2],
          [3, 3],
        ]);
      }),
    );
  } finally {
    fixture.dispose();
  }
});

it("a genuine failed fact write retains the previous copy and reports the decided statement", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-write-error");
  writer.message({ id: "msg-write-error", session: "ses-write-error", seq: 0, start: 1 });
  try {
    const initial = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    writer.message({
      id: "msg-write-error",
      session: "ses-write-error",
      seq: 0,
      start: 1,
      tokens: { output: 9 },
    });
    await expect(
      readBuilt({ source, cacheHome: folder }, () => {}, {
        ...nodeRuntime,
        worker: (paths, announce = () => Effect.void) =>
          sync(
            paths,
            (config) => nodeDatabase({ ...config, readonly: true }),
            nodeSource,
            announce,
          ),
      }),
    ).rejects.toMatchObject({ statement: "writeSteps", code: "SQLITE_ERROR" });
    expect((await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime)).generation).toBe(
      initial.generation,
    );
  } finally {
    fixture.dispose();
  }
});
