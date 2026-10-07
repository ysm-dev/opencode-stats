import * as Effect from "effect/Effect";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { stayInSync, type StoreEvent, type StoreCopy } from "./store.ts";
import { nodeRuntime, nodeSource, nodeDatabase } from "./runtime.node.ts";
import type { StoreRuntime } from "./database.ts";
import { sourceReader, type SourceAdapter } from "./source-reader.ts";
import { sync } from "./sync.ts";
import { syntheticFixture } from "./testing/index.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import { runWithClock } from "./testing/clock.ts";
import { cachedCatalog, priceCatalog, pricedTokens } from "./testing/pricing.ts";

type Slice = "inventory" | "catalogStamp" | "catalog" | "session";
// A real read-only source, with a writer hook immediately before each native read snapshot.
function snapshotRuntime(
  before: (slice: Slice, id?: string) => void,
  native: SourceAdapter = nodeSource,
): StoreRuntime {
  const source: SourceAdapter = (filename) =>
    native(filename).pipe(
      Effect.map((reader) => ({
        ...reader,
        inventory: Effect.suspend(() => {
          before("inventory");
          return reader.inventory;
        }),
        catalogStamp: Effect.suspend(() => {
          before("catalogStamp");
          return reader.catalogStamp;
        }),
        catalog: Effect.suspend(() => {
          before("catalog");
          return reader.catalog;
        }),
        read: (id: string) =>
          Effect.suspend(() => {
            before("session", id);
            return reader.read(id);
          }),
      })),
    );
  return {
    ...nodeRuntime,
    worker: (paths, announce = () => Effect.void, report) =>
      sync(paths, nodeDatabase, source, announce, report),
  };
}

const future = "20261007120000_future";
const message = {
  id: "first-step",
  session: "first",
  seq: 0,
  start: 2,
  provider: "p",
  model: "m",
  tokens: pricedTokens,
};
const child = { id: "child-step", session: "child", seq: 0, start: 0, tokens: { output: 3 } };

it.each([
  ["inventory", "migration"],
  ["catalogStamp", "migration"],
  ["catalog", "migration"],
  ["session", "migration"],
  ["subagent", "migration"],
  ["inventory", "layout"],
  ["catalogStamp", "layout"],
  ["catalog", "layout"],
  ["session", "layout"],
  ["subagent", "layout"],
] as const)(
  "never publishes an unknown %s snapshot after a concurrent %s change",
  async (slice, change) => {
    const f = syntheticFixture();
    const events: StoreEvent[] = [];
    const published: StoreCopy[] = [];
    let armed = false;
    let injected = false;
    const runtime = snapshotRuntime((reading, id) => {
      if (!armed || injected) return;
      const target =
        slice === "subagent" ? reading === "session" && id === "child" : reading === slice;
      if (!target) return;
      injected = true;
      f.writer.schema("BEGIN IMMEDIATE");
      // Unknown-schema writes include facts, removals, dimensions and catalog prices.
      f.writer.message({ ...message, tokens: { ...pricedTokens, output: 999 } }, false);
      f.writer.schema(
        "UPDATE project SET name='Changed during migration' WHERE id='synthetic-project'; DELETE FROM session_v2 WHERE id='last'; DELETE FROM event_sequence WHERE aggregate_id='last'",
      );
      f.writer.catalog(cachedCatalog(priceCatalog(20, "Unknown model"), 2), 2);
      if (change === "migration") f.writer.migration(future);
      else f.writer.schema("ALTER TABLE event_sequence ADD private_data text");
      f.writer.schema("COMMIT");
    });

    try {
      f.writer.session("first");
      f.writer.session("last");
      f.writer.session("child", "first");
      f.writer.message(message);
      f.writer.message({
        id: "last-step",
        session: "last",
        seq: 0,
        start: 1,
        tokens: { output: 2 },
      });
      f.writer.message(child);
      f.writer.catalog(cachedCatalog(priceCatalog()));
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source: f.source, cacheHome: f.folder },
            runtime,
            (copy) => published.push(copy),
            (event) => events.push(event),
          );
          const before = yield* store.read();
          published.length = 0;
          f.writer.message(message);
          f.writer.message(child);
          if (slice === "catalog" || slice === "catalogStamp")
            f.writer.catalog(cachedCatalog(priceCatalog()), 2);
          armed = true;
          yield* time.tick;
          yield* time.tick;
          expect(injected).toBe(true);
          const stopped = yield* store.read();
          expect(stopped.generation).toBe(before.generation);
          expect(stopped.revision).toBe(before.revision);
          expect(canonicalCopy(stopped)).toEqual(canonicalCopy(before));
          expect(stopped.pricing).toEqual(before.pricing);
          expect(published).toEqual([]);
          expect(events.filter((event) => event.kind === "sync.stopped")).toEqual([
            expect.objectContaining({
              reason: change === "migration" ? "schema.newer" : "schema.other",
            }),
          ]);
          if (change === "migration") f.writer.migration(future, false);
          else f.writer.schema("ALTER TABLE event_sequence DROP COLUMN private_data");
          yield* time.tick;
          const after = yield* store.read();
          expect(after.generation).toBe(before.generation);
          expect(after.facts.find((step) => step.id === message.id)?.output).toBe(999);
          expect(after.facts.some((step) => step.id === "last-step")).toBe(false);
          expect(events.filter((event) => event.kind === "sync.resumed")).toHaveLength(1);
          const fresh = yield* stayInSync(
            { source: f.source, cacheHome: `${f.folder}/fresh` },
            nodeRuntime,
            () => {},
          );
          expect(canonicalCopy(after)).toEqual(canonicalCopy(yield* fresh.read()));
        }),
      );
    } finally {
      f.dispose();
    }
  },
);

it("removes all facts and details when a pending session vanishes just before its read snapshot", async () => {
  const f = syntheticFixture();
  let armed = false;
  let removed = false;
  const runtime = snapshotRuntime((slice, id) => {
    if (!armed || removed || slice !== "session" || id !== "doomed") return;
    removed = true;
    f.writer.deleteSession("doomed");
  });
  try {
    f.writer.session("doomed");
    f.writer.session("survivor");
    f.writer.message({ id: "prompt", session: "doomed", seq: 0, start: 1, type: "user" });
    const step = { id: "doomed-step", session: "doomed", seq: 1, start: 2 };
    f.writer.message({
      ...step,
      tools: [{ id: "call", name: "read", status: "completed", ran: 2, completed: 3 }],
    });
    f.writer.message({ id: "kept", session: "survivor", seq: 0, start: 0 });
    await runWithClock((time) =>
      Effect.gen(function* () {
        const options = { source: f.source, cacheHome: f.folder };
        const store = yield* stayInSync(options, runtime, () => {});
        const before = yield* store.read();
        f.writer.message(step);
        armed = true;
        yield* time.tick;
        expect(removed).toBe(true);
        const after = yield* store.read();
        expect(after.generation).toBe(before.generation);
        expect(after.facts.map((fact) => fact.id)).toEqual(["kept"]);
        expect(after.prompts).toEqual([]);
        expect(after.tools).toEqual([]);
        expect(after.sessions).toHaveLength(1);
        const delta = yield* store.read(before);
        expect(delta.tombstones.map((row) => row.id).toSorted()).toEqual([
          "doomed-step",
          "prompt",
          "tool:doomed-step:call",
        ]);
        expect(delta.sessionTombstones).toHaveLength(1);
        const fresh = yield* stayInSync(
          { ...options, cacheHome: `${f.folder}/fresh` },
          nodeRuntime,
          () => {},
        );
        expect(canonicalCopy(after)).toEqual(canonicalCopy(yield* fresh.read()));
      }),
    );
  } finally {
    f.dispose();
  }
});

function observedSource(before: (sql: string, params: readonly string[]) => void): SourceAdapter {
  return Effect.fnUntraced(function* (filename: string) {
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new DatabaseSync(filename, { readOnly: true })),
      (connection) => Effect.sync(() => connection.close()),
    );
    return sourceReader({
      all: (sql, ...params) => {
        before(sql, params);
        return db.prepare(sql).all(...params);
      },
      exec: (sql) => db.exec(sql),
    });
  });
}

it("an approved read snapshot stays coherent when a migration commits before its transcript SELECT", async () => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  const outputs: Array<number | null | undefined> = [];
  let armed = false;
  let injected = false;
  const native = observedSource((sql, params) => {
    if (!armed || injected || !sql.startsWith("SELECT s.id,") || params[0] !== "first") return;
    injected = true;
    // In WAL mode the writer can commit, but the already-approved snapshot must stay old.
    f.writer.schema("BEGIN IMMEDIATE");
    f.writer.message({ ...message, tokens: { ...pricedTokens, output: 999 } }, false);
    f.writer.migration(future);
    f.writer.schema("COMMIT");
  });
  try {
    f.writer.session("first");
    f.writer.message(message);
    await runWithClock((time) =>
      Effect.gen(function* () {
        const runtime = snapshotRuntime(() => {}, native);
        const store = yield* stayInSync(
          { source: f.source, cacheHome: f.folder },
          runtime,
          (copy) => outputs.push(copy.facts[0]?.output),
          (event) => events.push(event),
        );
        const before = yield* store.read();
        f.writer.message({ ...message, tokens: { ...pricedTokens, output: 500 } });
        armed = true;
        yield* time.tick;
        expect(injected).toBe(true);
        expect((yield* store.read()).facts[0]!.output).toBe(500);
        expect(outputs).not.toContain(999);
        expect(events).toContainEqual(
          expect.objectContaining({ kind: "sync.stopped", reason: "schema.newer" }),
        );
        f.writer.migration(future, false);
        yield* time.tick;
        const after = yield* store.read();
        expect(after.generation).toBe(before.generation);
        expect(after.facts[0]!.output).toBe(999);
        const fresh = yield* stayInSync(
          { source: f.source, cacheHome: `${f.folder}/coherent` },
          nodeRuntime,
          () => {},
        );
        expect(canonicalCopy(after)).toEqual(canonicalCopy(yield* fresh.read()));
      }),
    );
  } finally {
    f.dispose();
  }
});

it("a busy schema-manifest read never caches the previous approval for its retry", async () => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  let armed = false;
  let changed = false;
  let busy = false;
  const native = observedSource((sql) => {
    if (!changed || busy || !sql.startsWith("PRAGMA table_xinfo")) return;
    busy = true;
    throw Object.assign(new Error("Synthetic busy schema manifest"), { code: "SQLITE_BUSY" });
  });
  const runtime = snapshotRuntime((slice) => {
    if (!armed || changed || slice !== "session") return;
    changed = true;
    f.writer.schema("ALTER TABLE event_sequence ADD private_data text");
    f.writer.message({ ...message, tokens: { ...pricedTokens, output: 999 } }, false);
  }, native);
  try {
    f.writer.session("first");
    f.writer.message(message);
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          { source: f.source, cacheHome: f.folder },
          runtime,
          () => {},
          (event) => events.push(event),
        );
        const before = yield* store.read();
        f.writer.message(message);
        armed = true;
        yield* time.tick;
        expect(busy).toBe(true);
        expect(yield* time.nextDelay).toBe(20);
        yield* time.tick;
        expect((yield* store.read()).facts).toEqual(before.facts);
        expect(events).toContainEqual(
          expect.objectContaining({ kind: "sync.stopped", reason: "schema.other" }),
        );
        f.writer.schema("ALTER TABLE event_sequence DROP COLUMN private_data");
        yield* time.tick;
        expect((yield* store.read()).facts[0]!.output).toBe(999);
      }),
    );
  } finally {
    f.dispose();
  }
});
