import { readFileSync, realpathSync, renameSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Queue from "effect/Queue";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import { bunDatabase, bunSource } from "./runtime.bun.ts";
import * as Exit from "effect/Exit";
import { attemptSourceWrite } from "./testing/store.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { busy, connections } from "./testing/bun-sqlite.ts";
import { sync } from "./sync.ts";
import { stayInSync } from "./store.ts";
import type { StoreRuntime } from "./database.ts";

vi.mock("bun:sqlite", async () => ({
  Database: (await import("./testing/bun-sqlite.ts")).NodeBunDatabase,
}));
const runtime: StoreRuntime = {
  database: bunDatabase,
  worker: (paths, announce = () => Effect.void) => sync(paths, bunDatabase, bunSource, announce),
};

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
    expect(copy.steps).toEqual([
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
    expect(readFileSync(fixture.source)).toEqual(before);
    expect(readFileSync(`${fixture.source}-wal`)).toEqual(wal);
    expect(Exit.isFailure(await attemptSourceWrite(fixture.source, bunDatabase))).toBe(true);
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
