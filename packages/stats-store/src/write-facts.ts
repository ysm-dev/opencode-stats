import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import {
  metadata,
  steps,
  prompts,
  sessions,
  sessionFacts,
  dimensionNames,
  projectFacts,
  tombstones,
} from "./schema.ts";
import type { SourceFact, SourceReader, SourceSession, SourceProject } from "./source-reader.ts";
import { makeDimensions, owningSession, saveDetails, stepAttribution } from "./dimensions.ts";
import { replacePrompts } from "./write-prompts.ts";
import { replaceTools } from "./write-tools.ts";
import type { StepPricer } from "./pricing.ts";
import { mapTokenFields } from "@opencode-stats/browser-copy";

type Snapshot = Effect.Success<ReturnType<SourceReader["read"]>>;
const keys = [
  "position",
  "start",
  "streamEnd",
  "completed",
  "error",
  "failed",
  "interrupted",
  "input",
  "cacheRead",
  "cacheWrite",
  "output",
  "reasoning",
  "recordedCost",
  "estimatedCost",
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
  pricer: StepPricer,
) {
  const db = yield* Database;
  const old = yield* db.select().from(steps).where(eq(steps.session, id));
  const previousById = new Map(old.map((row) => [row.id, row]));
  let changed = false;
  const session = byId.get(id);
  const owner = session ? owningSession(session, byId) : id;
  for (const fact of facts) {
    const priced = yield* pricer(
      fact.provider,
      fact.model,
      mapTokenFields((kind) => fact[kind]),
    );
    const attributed = yield* stepAttribution(fact, code, priced.name);
    const row = {
      ...fact,
      ...attributed,
      estimatedCost: priced.estimatedCost,
      error: yield* code("error", fact.error),
      failed: Number(fact.error !== null && fact.error !== "aborted"),
      interrupted: Number(fact.error === "aborted"),
      variant: attributed.variant!,
      project: (yield* code("project", session!.project))!,
      sessionCode: (yield* code("session", owner))!,
      subagent: yield* code("session", owner === id ? null : id),
    };
    const previous = previousById.get(row.id);
    if (previous && keys.every((key) => previous[key] === row[key])) continue;
    changed = true;
    yield* db
      .insert(steps)
      .values({ ...row, revision })
      .onConflictDoUpdate({ target: steps.id, set: { ...row, revision } });
    yield* db.delete(tombstones).where(eq(tombstones.id, row.id));
  }
  for (const row of old.filter((step) => !facts.some((fact) => fact.id === step.id))) {
    changed = true;
    yield* db.delete(steps).where(eq(steps.id, row.id));
    yield* db
      .insert(tombstones)
      .values({ id: row.id, revision, deletedAt: now })
      .onConflictDoUpdate({ target: tombstones.id, set: { revision, deletedAt: now } });
  }
  return changed;
});

const replaceSnapshot = Effect.fnUntraced(function* (
  snapshot: Snapshot,
  revision: number,
  now: number,
  inventory: Map<string, SourceSession>,
  code: ReturnType<Effect.Success<ReturnType<typeof makeDimensions>>>,
  pricer: StepPricer,
) {
  const db = yield* Database;
  const facts = snapshot.session ? snapshot.facts : [];
  const changed = yield* replaceFacts(snapshot.id, facts, revision, now, inventory, code, pricer);
  const calls = yield* replaceTools(
    snapshot.id,
    snapshot.session ? snapshot.tools : [],
    revision,
    now,
    code,
  );
  const delivered = yield* replacePrompts(
    snapshot.id,
    snapshot.session ? snapshot.prompts : [],
    facts,
    revision,
    now,
    inventory,
    code,
  );
  if (snapshot.session)
    yield* db
      .insert(sessions)
      .values(snapshot.session)
      .onConflictDoUpdate({ target: sessions.id, set: snapshot.session });
  else yield* db.delete(sessions).where(eq(sessions.id, snapshot.id));
  return changed || calls || delivered || !snapshot.session;
});

const exposedChanges = Effect.fnUntraced(function* (revision: number) {
  const db = yield* Database;
  const names = yield* db
    .select()
    .from(dimensionNames)
    .where(eq(dimensionNames.revision, revision));
  const projects = yield* db.select().from(projectFacts).where(eq(projectFacts.revision, revision));
  const deleted = yield* db.select().from(tombstones).where(eq(tombstones.revision, revision));
  return names.length > 0 || projects.length > 0 || deleted.length > 0;
});

export const commitUnit = Effect.fnUntraced(function* (
  snapshots: ReadonlyArray<Snapshot> | undefined,
  removed: ReadonlyArray<string> | undefined,
  now: number,
  unreadLatest: number | null,
  inventory: Map<string, SourceSession>,
  projects: ReadonlyArray<SourceProject>,
  registry: Effect.Success<ReturnType<typeof makeDimensions>>,
  refreshDetails: boolean,
  pricer: StepPricer,
  suppressNoop = false,
) {
  const db = yield* Database;
  return yield* db.$client.withTransaction(
    Effect.gen(function* () {
      const changed = new Set<string>();
      const header = (yield* db.select().from(metadata))[0]!;
      const revision = header.revision + 1;
      const code = registry(revision);
      const vanished = new Set(
        snapshots?.filter((snapshot) => !snapshot.session).map((snapshot) => snapshot.id),
      );
      // This inventory belongs to the pass; later units must retain discovered deletions.
      for (const id of vanished) inventory.delete(id);
      if (refreshDetails || vanished.size > 0)
        yield* saveDetails([...inventory.values()], projects, code, revision, now);
      if (snapshots)
        for (const snapshot of snapshots) {
          if (yield* replaceSnapshot(snapshot, revision, now, inventory, code, pricer))
            changed.add(snapshot.id);
        }
      if (removed)
        for (const id of removed) {
          yield* replaceFacts(id, [], revision, now, inventory, code, pricer);
          yield* replaceTools(id, [], revision, now, code);
          yield* replacePrompts(id, [], [], revision, now, inventory, code);
          yield* db.delete(sessions).where(eq(sessions.id, id));
        }
      const facts = yield* db.select({ start: steps.start }).from(steps);
      const delivered = yield* db.select({ start: prompts.start }).from(prompts);
      const starts = [...facts, ...delivered];
      const earliest = starts.reduce(
        (value, row) => Math.min(value, row.start),
        starts[0]?.start ?? 0,
      );
      const completeFrom = header.historyComplete ? earliest : (unreadLatest ?? earliest);
      const complete = header.historyComplete || unreadLatest === null;
      for (const row of yield* db
        .select()
        .from(sessionFacts)
        .where(eq(sessionFacts.revision, revision)))
        changed.add(row.id);
      if (
        suppressNoop &&
        changed.size === 0 &&
        header.historyCompleteFrom === completeFrom &&
        header.historyComplete === complete &&
        !(yield* exposedChanges(revision))
      )
        return { changed, committed: false };
      yield* db
        .update(metadata)
        .set({
          revision,
          historyCompleteFrom: completeFrom,
          historyComplete: complete,
        })
        .where(eq(metadata.id, 1));
      return { changed, committed: true };
    }),
  );
});
