import { randomUUID } from "node:crypto";
import { closeSync, openSync, rmSync } from "node:fs";
import { eq, lte } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import { sqlFailure } from "./errors.ts";
import { Database, type DatabaseAdapter, type StorePaths } from "./database.ts";
import { metadata, sessions, tombstones } from "./schema.ts";
import type { SourceReader, SourceSession } from "./source-reader.ts";
import statements from "./statements.json" with { type: "json" };
import { commitUnit } from "./write-facts.ts";

function units(inventory: ReadonlyArray<SourceSession>) {
  const byId = new Map(inventory.map((row) => [row.id, row]));
  const grouped = new Map<string, SourceSession[]>();
  for (const session of inventory) {
    let root = session;
    const visited = new Set<string>();
    while (root.parent && !visited.has(root.id)) {
      visited.add(root.id);
      const parent = byId.get(root.parent);
      if (!parent) break;
      root = parent;
    }
    const group = grouped.get(root.id);
    if (group) group.push(session);
    else grouped.set(root.id, [session]);
  }
  return [...grouped.values()]
    .map((group) => ({ sessions: group, latest: Math.max(...group.map((row) => row.latest ?? 0)) }))
    .toSorted((a, b) => b.latest - a.latest);
}

export const statsStoreVersion = 2;
export const initializeStore = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
) {
  const initialize = Effect.gen(function* () {
    const db = yield* Database;
    for (const statement of statements)
      yield* db.$client.unsafe(statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
    yield* db.$client.unsafe("PRAGMA synchronous=NORMAL");
    const old = (yield* db.select().from(metadata))[0];
    if (old && old.version !== statsStoreVersion) yield* Effect.fail(new Error());
    if (!old)
      yield* db.insert(metadata).values({
        id: 1,
        version: statsStoreVersion,
        generation: randomUUID(),
        revision: 0,
        historyCompleteFrom: 0,
        expiredRevision: 0,
      });
  }).pipe(
    Effect.provide(
      adapter({
        filename: paths.store,
        readonly: false,
        disableWAL: false,
        busyTimeout: "20 millis",
      }),
    ),
  );
  yield* initialize.pipe(
    Effect.catchCause(() =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          for (const suffix of ["", "-wal", "-shm"])
            rmSync(`${paths.store}${suffix}`, { force: true });
          closeSync(openSync(paths.store, "a", 0o600));
        });
        yield* initialize;
      }),
    ),
    Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "writeSteps"))),
  );
});

export const reconcile = Effect.fnUntraced(
  function* (
    reader: SourceReader,
    inventory: ReadonlyArray<SourceSession>,
    now: number,
    announce: () => Effect.Effect<void, Error>,
    checkBounds: boolean,
  ) {
    const db = yield* Database;
    const saved = yield* db.select().from(sessions);
    const savedById = new Map(saved.map((row) => [row.id, row]));
    const pending = inventory.filter((session) => {
      const old = savedById.get(session.id);
      return (
        !old ||
        old.counter !== session.counter ||
        (checkBounds &&
          (old.messageCount !== session.messageCount ||
            old.highestPosition !== session.highestPosition))
      );
    });
    const removed = saved.filter((session) => !inventory.some((row) => row.id === session.id));
    const header = (yield* db.select().from(metadata))[0]!;
    const ordered = units(inventory).filter((unit) =>
      unit.sessions.some((session) => pending.some((row) => row.id === session.id)),
    );
    if (removed.length || (!ordered.length && header.revision === 0)) {
      yield* commitUnit(
        undefined,
        removed.map((row) => row.id),
        now,
        ordered[0]?.latest ?? null,
      );
      yield* announce();
    }
    for (const [index, unit] of ordered.entries()) {
      const snapshots = yield* Effect.forEach(
        unit.sessions.filter((row) => pending.some((changed) => changed.id === row.id)),
        (session) => reader.read(session.id),
      );
      const next = ordered
        .slice(index + 1)
        .find((remaining) =>
          remaining.sessions.some((session) => !saved.some((row) => row.id === session.id)),
        );
      yield* commitUnit(snapshots, undefined, now, next?.latest ?? null);
      yield* announce();
    }
  },
  Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "writeSteps"))),
);

export const collectTombstones = Effect.fnUntraced(
  function* (now: number, announce: () => Effect.Effect<void, Error>) {
    const db = yield* Database;
    const cutoff = lte(tombstones.deletedAt, now - 30 * 86400000);
    const expired = yield* db.select().from(tombstones).where(cutoff);
    if (!expired.length) return;
    yield* db.$client.withTransaction(
      Effect.gen(function* () {
        const header = (yield* db.select().from(metadata))[0]!;
        yield* db.delete(tombstones).where(cutoff);
        yield* db
          .update(metadata)
          .set({
            revision: header.revision + 1,
            expiredRevision: Math.max(
              header.expiredRevision,
              ...expired.map((row) => row.revision),
            ),
          })
          .where(eq(metadata.id, 1));
      }),
    );
    yield* announce();
  },
  Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "writeSteps"))),
);
