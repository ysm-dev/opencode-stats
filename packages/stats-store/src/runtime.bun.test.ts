import { readFileSync, realpathSync, renameSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Queue from "effect/Queue";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import { bunDatabase, bunSource, bunRuntime } from "./runtime.bun.ts";
import * as Exit from "effect/Exit";
import { attemptSourceWrite } from "./testing/store.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { busy, connections } from "./testing/bun-sqlite.ts";
import { sync } from "./sync.ts";
import { stayInSync } from "./store.ts";
import type { StoreRuntime } from "./database.ts";
import { runWithClock } from "./testing/clock.ts";
import { observedStore } from "./testing/store.ts";
import { InThreadWorker } from "./testing/worker.ts";
import { tokenFacts } from "./testing/canonical.ts";

vi.mock("bun:sqlite", async () => ({
  Database: (await import("./testing/bun-sqlite.ts")).NodeBunDatabase,
}));
const runtime: StoreRuntime = {
  database: bunDatabase,
  worker: (paths, announce = () => Effect.void) => sync(paths, bunDatabase, bunSource, announce),
};

it("the public Bun runtime connects its real SQLite adapters to the in-thread worker", async () => {
  const fixture = syntheticFixture();
  vi.stubGlobal("Worker", function () {
    return new InThreadWorker(bunDatabase, bunSource);
  });
  try {
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      bunRuntime,
    );
    expect(copy.steps).toEqual([]);
    expect(copy.revision).toBe(1);
  } finally {
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it("the Bun adapter uses one native readonly source, scalar synchronous session snapshots and released resources", async () => {
  const fixture = syntheticFixture();
  connections.length = 0;
  try {
    fixture.writer.session("ses-native");
    fixture.writer.message({
      id: "msg-native",
      session: "ses-native",
      seq: 0,
      start: 123,
      tokens: { input: 8 },
    });
    const before = readFileSync(fixture.source);
    const wal = readFileSync(`${fixture.source}-wal`);
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      runtime,
    );
    expect(tokenFacts(copy.steps)).toEqual([
      { start: 123, input: 8, cacheRead: null, cacheWrite: null, output: null, reasoning: null },
    ]);
    const sources = connections.filter(
      (connection) => connection.filename === realpathSync(fixture.source),
    );
    expect(sources).toHaveLength(1);
    const source = sources[0]!;
    expect(source).toMatchObject({ readonly: true, readwrite: false, create: false, closed: true });
    expect(source.queries[0]).toBe("PRAGMA busy_timeout=20");
    expect(source.queries.join("\n")).not.toMatch(
      /journal_mode|checkpoint|SELECT \*|SELECT "data"|immutable|nolock/iu,
    );
    expect(source.queries).toContain("BEGIN");
    expect(source.queries).toContain("ROLLBACK");
    expect(source.inTransaction).toContain(true);
    expect(source.asyncTransactions.every((value) => !value)).toBe(true);
    expect(connections.every((connection) => connection.closed)).toBe(true);
    const writers = connections.filter((connection) => !connection.readonly);
    expect(writers).toHaveLength(2);
    expect(
      writers.every((connection) => connection.queries.includes("PRAGMA journal_mode = WAL;")),
    ).toBe(true);
    expect(readFileSync(fixture.source).equals(before)).toBe(true);
    expect(readFileSync(`${fixture.source}-wal`).equals(wal)).toBe(true);
    expect(Exit.isFailure(await attemptSourceWrite(fixture.source, bunDatabase))).toBe(true);
    fixture.writer.message({
      id: "msg-native",
      session: "ses-native",
      seq: 0,
      start: 123,
      tokens: { input: 9 },
    });
    expect(readFileSync(`${fixture.source}-wal`).equals(wal)).toBe(false);
  } finally {
    fixture.dispose();
  }
});

it("the native Bun source refuses an open failure after path resolution without a writable fallback", async () => {
  const fixture = syntheticFixture();
  try {
    await expect(
      readBuilt({ source: fixture.source, cacheHome: fixture.folder }, () => {}, {
        ...runtime,
        worker: (paths, announce = () => Effect.void) =>
          sync(
            paths,
            bunDatabase,
            (filename) => {
              renameSync(fixture.source, `${fixture.source}.away`);
              return bunSource(filename);
            },
            announce,
          ),
      }),
    ).rejects.toMatchObject({ code: "SQLITE_ERROR", statement: "readSource" });
  } finally {
    renameSync(`${fixture.source}.away`, fixture.source);
    fixture.dispose();
  }
});

it("busy session snapshots rollback before clock-driven retry waits", async () => {
  const fixture = syntheticFixture();
  fixture.writer.session("ses-busy");
  fixture.writer.message({ id: "msg-busy", session: "ses-busy", seq: 0, start: 1 });
  busy.remaining = 3;
  connections.length = 0;
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const attempts = yield* Queue.unbounded<void>();
          busy.attempted = () => {
            Queue.offerUnsafe(attempts, undefined);
          };
          const fiber = yield* Effect.forkScoped(
            stayInSync({ source: fixture.source, cacheHome: fixture.folder }, runtime, () => {}),
          );
          for (const delay of [20, 40, 80]) {
            yield* Queue.take(attempts);
            yield* TestClock.adjust(delay);
          }
          const store = yield* Fiber.join(fiber);
          expect((yield* store.read()).steps[0]!.start).toBe(1);
          const source = connections.find(
            (connection) => connection.filename === realpathSync(fixture.source),
          )!;
          expect(source.queries.filter((query) => query === "BEGIN")).toHaveLength(4);
          expect(source.queries.filter((query) => query === "ROLLBACK")).toHaveLength(4);
          expect(source.asyncTransactions.every((value) => !value)).toBe(true);
        }).pipe(Effect.provide(TestClock.layer())),
      ),
    );
    expect(connections.every((connection) => connection.closed)).toBe(true);
  } finally {
    busy.remaining = 0;
    busy.attempted = () => {};
    fixture.dispose();
  }
});

it("an unchanged native source poll only reads data_version on its persistent connection", async () => {
  const fixture = syntheticFixture();
  connections.length = 0;
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        yield* observedStore({ source: fixture.source, cacheHome: fixture.folder }, runtime);
        const source = connections.find(
          (connection) => connection.filename === realpathSync(fixture.source),
        )!;
        const baseline = source.queries.length;
        yield* time.tick;
        expect(source.queries.slice(baseline)).toEqual(["PRAGMA main.data_version"]);
        expect(
          connections.filter((connection) => connection.filename === source.filename),
        ).toHaveLength(1);
      }),
    );
  } finally {
    fixture.dispose();
  }
});
