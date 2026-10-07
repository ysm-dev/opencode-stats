import { randomUUID } from "node:crypto";
import { closeSync, openSync, rmSync } from "node:fs";
import { eq, lte } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import { sqlFailure, syncFailure } from "./errors.ts";
import { Database, type DatabaseAdapter, type StorePaths } from "./database.ts";
import * as schema from "./schema.ts";
import type { SourceReader, SourceSession, SourceProject } from "./source-reader.ts";
import { owningSession, sessionDetails, detailKeys, makeDimensions } from "./dimensions.ts";
import statements from "./statements.json" with { type: "json" };
import { commitUnit } from "./write-facts.ts";
import type { StepPricer } from "./pricing.ts";
import type { BuildReport } from "./build-events.ts";

const { metadata, sessions, sessionFacts, projectFacts, tombstones } = schema;

class RebuildNeeded extends Error {
  readonly reason: "version" | "damaged";
  constructor(reason: "version" | "damaged") {
    super();
    this.reason = reason;
  }
}

function units(inventory: ReadonlyArray<SourceSession>) {
  const byId = new Map(inventory.map((row) => [row.id, row]));
  const grouped = new Map<string, SourceSession[]>();
  for (const session of inventory) {
    const owner = owningSession(session, byId);
    const group = grouped.get(owner);
    if (group) group.push(session);
    else grouped.set(owner, [session]);
  }
  return [...grouped.values()]
    .map((group) => ({
      sessions: group,
      latest: Math.max(...group.flatMap((row) => (row.latest === null ? [] : [row.latest]))),
    }))
    .toSorted((a, b) => b.latest - a.latest);
}

export const statsStoreVersion = 8;
export const initializeStore = Effect.fnUntraced(function* (
  paths: StorePaths,
  adapter: DatabaseAdapter,
) {
  const initialize = Effect.gen(function* () {
    const db = yield* Database;
    const tables = yield* db.$client.unsafe<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table'",
    );
    if (tables.length === 0)
      for (const statement of statements) yield* db.$client.unsafe(statement);
    yield* db.$client.unsafe("PRAGMA synchronous=NORMAL");
    const old = yield* Effect.gen(function* () {
      const versions = yield* db.$client.unsafe<{ version: number }>(
        "SELECT version FROM metadata",
      );
      if (versions[0] && versions[0].version !== statsStoreVersion)
        yield* Effect.fail(new RebuildNeeded("version"));
      // Probe every required column from the generated schema before changing an
      // existing layout. Recreating a missing table would conceal lost facts.
      for (const table of Object.values(schema)) {
        const { name, columns } = getTableConfig(table);
        if (tables.length > 0 && !tables.some((stored) => stored.name === name))
          yield* Effect.fail(new RebuildNeeded("damaged"));
        const selection = columns.map((column) => `\`${name}\`.\`${column.name}\``);
        yield* db.$client.unsafe(`SELECT ${selection.join(",")} FROM \`${name}\` LIMIT 1`);
      }
      const header = (yield* db.select().from(metadata))[0];
      if (tables.length > 0 && !header) yield* Effect.fail(new RebuildNeeded("damaged"));
      return header;
    }).pipe(
      Effect.catchCause((cause) => {
        const error = Cause.squash(cause);
        return Effect.fail(
          sqlFailure(error, "readStore").code === "SQLITE_ERROR"
            ? new RebuildNeeded("damaged")
            : error,
        );
      }),
    );
    const integrity = yield* db.$client.unsafe<{ quick_check: string }>("PRAGMA quick_check");
    if (integrity.some((row) => row.quick_check !== "ok"))
      yield* Effect.fail(new RebuildNeeded("damaged"));
    if (!old)
      yield* db.insert(metadata).values({
        id: 1,
        version: statsStoreVersion,
        generation: randomUUID(),
        revision: 0,
        historyCompleteFrom: 0,
        historyComplete: false,
        expiredRevision: 0,
      });
    return !old ? ("first" as const) : !old.historyComplete ? ("resume" as const) : undefined;
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
  return yield* initialize.pipe(
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause);
      const failure = sqlFailure(error, "writeSteps");
      if (
        !(error instanceof RebuildNeeded) &&
        failure.code !== "SQLITE_CORRUPT" &&
        failure.code !== "SQLITE_NOTADB"
      )
        return Effect.fail(failure);
      return Effect.gen(function* () {
        yield* Effect.sync(() => {
          for (const suffix of ["", "-wal", "-shm"])
            rmSync(`${paths.store}${suffix}`, { force: true });
          closeSync(openSync(paths.store, "a", 0o600));
        });
        yield* initialize;
        return error instanceof RebuildNeeded ? error.reason : ("damaged" as const);
      });
    }),
    Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "writeSteps"))),
  );
});

const reportConsistency = Effect.fnUntraced(function* (
  inventory: ReadonlyArray<SourceSession>,
  saved: ReadonlyMap<string, typeof sessions.$inferSelect>,
  report: BuildReport,
) {
  for (const session of inventory) {
    const old = saved.get(session.id);
    if (
      old &&
      (old.messageCount !== session.messageCount || old.highestPosition !== session.highestPosition)
    )
      yield* report({
        kind: "consistency.difference",
        session: session.id,
        expectedCount: old.messageCount,
        actualCount: session.messageCount,
        expectedPosition: old.highestPosition,
        actualPosition: session.highestPosition,
      });
  }
});

const reconciliationPlan = Effect.fnUntraced(function* (
  inventory: ReadonlyArray<SourceSession>,
  projects: ReadonlyArray<SourceProject>,
  checkBounds: boolean,
  forced: Set<string>,
  report: BuildReport,
) {
  const db = yield* Database;
  const saved = yield* db.select().from(sessions);
  const savedById = new Map(saved.map((row) => [row.id, row]));
  if (checkBounds) yield* reportConsistency(inventory, savedById, report);
  const details = yield* db.select().from(sessionFacts);
  const savedProjects = yield* db.select().from(projectFacts);
  const detailsById = new Map(details.map((row) => [row.id, row]));
  const byId = new Map(inventory.map((row) => [row.id, row]));
  const projectsChanged =
    projects.length !== savedProjects.length ||
    projects.some(
      (row) =>
        !savedProjects.some(
          (old) => old.id === row.id && old.name === row.name && old.worktree === row.worktree,
        ),
    );
  const pending = new Set(
    inventory
      .filter((session) => {
        const old = savedById.get(session.id);
        const detail = sessionDetails(session, byId);
        const before = detailsById.get(session.id);
        return (
          !old ||
          forced.has(session.id) ||
          detailKeys.some((key) => before![key] !== detail[key]) ||
          old.counter !== session.counter ||
          (checkBounds &&
            (old.messageCount !== session.messageCount ||
              old.highestPosition !== session.highestPosition))
        );
      })
      .map((session) => session.id),
  );
  const removed = saved.filter((session) => !byId.has(session.id)).map((session) => session.id);
  const header = (yield* db.select().from(metadata))[0]!;
  const ordered = units(inventory).filter((unit) =>
    unit.sessions.some((session) => pending.has(session.id)),
  );
  const vanishedDetails = details.some((row) => !byId.has(row.id));
  return {
    byId,
    pending,
    removed,
    ordered,
    saved: new Set(savedById.keys()),
    initialCommit:
      removed.length > 0 ||
      (!ordered.length && (!header.historyComplete || projectsChanged || vanishedDetails)),
  };
});

export const reconcile = Effect.fnUntraced(
  function* (
    reader: SourceReader,
    inventory: ReadonlyArray<SourceSession>,
    projects: ReadonlyArray<SourceProject>,
    now: number,
    announce: () => Effect.Effect<void, Error>,
    checkBounds: boolean,
    pricer: StepPricer,
    sourceVersion: number,
    forced: Set<string> = new Set(),
    reread: Set<string> = new Set(),
    differing: Set<string> = new Set(),
    report: BuildReport = () => Effect.void,
  ) {
    const { byId, pending, removed, ordered, saved, initialCommit } = yield* reconciliationPlan(
      inventory,
      projects,
      checkBounds,
      forced,
      report,
    );
    const registry = yield* makeDimensions();
    if (initialCommit) {
      yield* commitUnit(
        undefined,
        removed,
        now,
        ordered.find((unit) => Number.isFinite(unit.latest))?.latest ?? null,
        byId,
        projects,
        registry,
        true,
        pricer,
      );
      yield* announce();
      yield* Effect.yieldNow;
      if ((yield* reader.version) !== sourceVersion) return true;
    }
    for (const [index, unit] of ordered.entries()) {
      const snapshots = yield* Effect.forEach(
        unit.sessions.filter((row) => pending.has(row.id)),
        (session) => reader.read(session.id),
      );
      const next = ordered
        .slice(index + 1)
        .find(
          (remaining) =>
            Number.isFinite(remaining.latest) &&
            remaining.sessions.some((session) => !saved.has(session.id)),
        );
      const result = yield* commitUnit(
        snapshots,
        undefined,
        now,
        next?.latest ?? null,
        byId,
        projects,
        registry,
        !initialCommit && index === 0,
        pricer,
        snapshots.some((snapshot) => forced.has(snapshot.id)),
      );
      for (const snapshot of snapshots) if (forced.delete(snapshot.id)) reread.add(snapshot.id);
      for (const id of result.changed) differing.add(id);
      if (result.committed) yield* announce();
      yield* Effect.yieldNow;
      if ((yield* reader.version) !== sourceVersion) return true;
    }
    return (yield* reader.version) !== sourceVersion;
  },
  Effect.catchCause((cause) => Effect.fail(syncFailure(cause, "writeSteps"))),
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
