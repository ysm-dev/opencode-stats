import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { metadata, steps, sessions, tombstones } from "./schema.ts";
import type { SourceFact, SourceReader, SourceSession, SourceProject } from "./source-reader.ts";
import { makeDimensions, owningSession, saveDetails } from "./dimensions.ts";

type Snapshot = Effect.Success<ReturnType<SourceReader["read"]>>;
const keys = [
  "position",
  "start",
  "input",
  "cacheRead",
  "cacheWrite",
  "output",
  "reasoning",
  "provider",
  "model",
  "variant",
  "agent",
  "project",
  "sessionCode",
  "subagent",
] as const;
const replaceFacts = Effect.fnUntraced(function* (
  id: string,
  facts: ReadonlyArray<SourceFact>,
  revision: number,
  now: number,
  byId: ReadonlyMap<string, SourceSession>,
  code: ReturnType<Effect.Success<ReturnType<typeof makeDimensions>>>,
) {
  const db = yield* Database;
  const old = yield* db.select().from(steps).where(eq(steps.session, id));
  const previousById = new Map(old.map((row) => [row.id, row]));
  const session = byId.get(id);
  const owner = session ? owningSession(session, byId) : id;
  for (const fact of facts) {
    const row = {
      ...fact,
      provider: yield* code("provider", fact.provider),
      model: yield* code(
        "model",
        fact.provider !== null && fact.model !== null ? `${fact.provider}/${fact.model}` : null,
      ),
      variant: (yield* code("variant", fact.variant))!,
      agent: yield* code("agent", fact.agent),
      project: (yield* code("project", session!.project))!,
      sessionCode: (yield* code("session", owner))!,
      subagent: yield* code("session", owner === id ? null : id),
    };
    const previous = previousById.get(row.id);
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
  inventory: ReadonlyMap<string, SourceSession>,
  projects: ReadonlyArray<SourceProject>,
  registry: Effect.Success<ReturnType<typeof makeDimensions>>,
  refreshDetails: boolean,
) {
  const db = yield* Database;
  yield* db.$client.withTransaction(
    Effect.gen(function* () {
      const header = (yield* db.select().from(metadata))[0]!;
      const revision = header.revision + 1;
      const code = registry(revision);
      const vanished = new Set(
        snapshots?.filter((snapshot) => !snapshot.session).map((snapshot) => snapshot.id),
      );
      const byId = vanished.size
        ? new Map([...inventory].filter(([id]) => !vanished.has(id)))
        : inventory;
      if (refreshDetails || vanished.size > 0)
        yield* saveDetails([...byId.values()], projects, code, revision, now);
      if (snapshots)
        for (const snapshot of snapshots) {
          if (!snapshot.session) {
            yield* replaceFacts(snapshot.id, [], revision, now, byId, code);
            yield* db.delete(sessions).where(eq(sessions.id, snapshot.id));
            continue;
          }
          const session = snapshot.session;
          yield* replaceFacts(session.id, snapshot.facts, revision, now, byId, code);
          yield* db
            .insert(sessions)
            .values(session)
            .onConflictDoUpdate({ target: sessions.id, set: session });
        }
      if (removed)
        for (const id of removed) {
          yield* replaceFacts(id, [], revision, now, byId, code);
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
