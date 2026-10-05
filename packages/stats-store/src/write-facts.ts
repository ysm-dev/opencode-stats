import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { metadata, steps, sessions, tombstones } from "./schema.ts";
import type { SourceFact, SourceReader } from "./source-reader.ts";

type Snapshot = Effect.Success<ReturnType<SourceReader["read"]>>;
const keys = [
  "position",
  "start",
  "input",
  "cacheRead",
  "cacheWrite",
  "output",
  "reasoning",
] as const;
const replaceFacts = Effect.fnUntraced(function* (
  id: string,
  facts: ReadonlyArray<SourceFact>,
  revision: number,
  now: number,
) {
  const db = yield* Database;
  const old = yield* db.select().from(steps).where(eq(steps.session, id));
  for (const row of facts) {
    const previous = old.find((step) => step.id === row.id);
    if (previous && keys.every((key) => previous[key] === row[key])) continue;
    yield* db
      .insert(steps)
      .values({ ...row, revision })
      .onConflictDoUpdate({ target: steps.id, set: { ...row, revision } });
    yield* db.delete(tombstones).where(eq(tombstones.id, row.id));
  }
  for (const row of old.filter((step) => !facts.some((fact) => fact.id === step.id))) {
    yield* db.delete(steps).where(eq(steps.id, row.id));
    yield* db
      .insert(tombstones)
      .values({ id: row.id, revision, deletedAt: now })
      .onConflictDoUpdate({ target: tombstones.id, set: { revision, deletedAt: now } });
  }
});

export const commitUnit = Effect.fnUntraced(function* (
  snapshots: ReadonlyArray<Snapshot> | undefined,
  removed: ReadonlyArray<string> | undefined,
  now: number,
  unreadLatest: number | null,
) {
  const db = yield* Database;
  yield* db.$client.withTransaction(
    Effect.gen(function* () {
      const header = (yield* db.select().from(metadata))[0]!;
      const revision = header.revision + 1;
      if (snapshots)
        for (const snapshot of snapshots) {
          if (!snapshot.session) continue;
          const session = snapshot.session;
          yield* replaceFacts(session.id, snapshot.facts, revision, now);
          yield* db
            .insert(sessions)
            .values(session)
            .onConflictDoUpdate({ target: sessions.id, set: session });
        }
      if (removed)
        for (const id of removed) {
          yield* replaceFacts(id, [], revision, now);
          yield* db.delete(sessions).where(eq(sessions.id, id));
        }
      const facts = yield* db.select({ start: steps.start }).from(steps);
      const earliest = facts.reduce(
        (value, row) => Math.min(value, row.start),
        facts[0]?.start ?? 0,
      );
      yield* db
        .update(metadata)
        .set({ revision, historyCompleteFrom: unreadLatest ?? earliest })
        .where(eq(metadata.id, 1));
    }),
  );
});
