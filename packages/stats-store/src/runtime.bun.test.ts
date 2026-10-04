import * as Sqlite from "@effect/sql-sqlite-bun/SqliteClient";
import { realpathSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { bunDatabase, bunRuntime } from "./runtime.bun.ts";
import * as Exit from "effect/Exit";
import { attemptSourceWrite } from "./testing/store.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { busy, connections } from "./testing/bun-sqlite.ts";
import { InThreadWorker } from "./testing/worker.ts";

vi.mock("bun:sqlite", async () => ({
  Database: (await import("./testing/bun-sqlite.ts")).NodeBunDatabase,
}));

it("runs the real Bun SQLite layer on Node, consumes only scalar projections without read transactions, and releases both databases", async () => {
  const fixture = syntheticFixture();
  connections.length = 0;
  const layer = vi.spyOn(Sqlite, "layer");
  vi.stubGlobal("Worker", function () {
    return new InThreadWorker(bunDatabase);
  });
  try {
    fixture.writer.session("ses-native");
    fixture.writer.message({
      id: "msg-native",
      session: "ses-native",
      seq: 0,
      start: 123,
      tokens: { input: 8 },
    });
    expect(
      (await readBuilt({ source: fixture.source, cacheHome: fixture.folder }, () => {}, bunRuntime))
        .steps,
    ).toEqual([
      { start: 123, input: 8, cacheRead: null, cacheWrite: null, output: null, reasoning: null },
    ]);
    const source = connections.find(
      (connection) => connection.filename === realpathSync(fixture.source),
    )!;
    expect(source).toMatchObject({ readonly: true, readwrite: false, create: false, closed: true });
    expect(source.queries[0]).toBe("PRAGMA busy_timeout = 20;");
    expect(source.queries.join("\n")).not.toMatch(
      /journal_mode|checkpoint|BEGIN|SELECT \*|SELECT "data"/iu,
    );
    expect(source.queries.join("\n")).toContain("json_extract");
    expect(source.inTransaction.every((value) => !value)).toBe(true);
    expect(connections.every((connection) => connection.closed)).toBe(true);
    expect(
      layer.mock.calls.map(([config]) => ({
        readonly: config.readonly,
        disableWAL: config.disableWAL,
        busyTimeout: config.busyTimeout,
      })),
    ).toEqual([
      { readonly: true, disableWAL: true, busyTimeout: "20 millis" },
      { readonly: false, disableWAL: false, busyTimeout: "20 millis" },
      { readonly: true, disableWAL: true, busyTimeout: "20 millis" },
    ]);
    const writable = connections.find((connection) => !connection.readonly)!;
    expect(writable.queries).toContain("PRAGMA journal_mode = WAL;");
    expect(writable.queries).toContain("PRAGMA synchronous=NORMAL");
    expect(Exit.isFailure(await attemptSourceWrite(fixture.source, bunDatabase))).toBe(true);
  } finally {
    layer.mockRestore();
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});

it("backs off short busy source reads, releases the connection, and never holds a read transaction during waits", async () => {
  const fixture = syntheticFixture();
  vi.useFakeTimers();
  vi.stubGlobal("Worker", function () {
    return new InThreadWorker(bunDatabase);
  });
  busy.remaining = 3;
  connections.length = 0;
  try {
    const building = readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      bunRuntime,
    );
    await vi.advanceTimersByTimeAsync(139);
    expect(busy.remaining).toBe(0);
    const reads = connections[0]!.queries.filter((query) =>
      query.includes('from "session_message"'),
    );
    expect(reads).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect((await building).steps).toEqual([]);
    expect(
      connections[0]!.queries.filter((query) => query.includes('from "session_message"')),
    ).toHaveLength(4);
    expect(connections[0]!.closed).toBe(true);
    expect(connections[0]!.inTransaction).toEqual([false]);
  } finally {
    busy.remaining = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fixture.dispose();
  }
});
