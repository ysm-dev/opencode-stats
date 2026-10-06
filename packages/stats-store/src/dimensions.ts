import { basename, dirname } from "node:path";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { dimensionNames, sessionFacts, projectFacts, tombstones, steps } from "./schema.ts";
import type { SourceSession, SourceProject, SourceFact } from "./source-reader.ts";

export function owningSession(
  session: SourceSession,
  byId: ReadonlyMap<string, SourceSession>,
): string {
  let root = session;
  const visited = new Set<string>();
  while (root.parent && !visited.has(root.id)) {
    visited.add(root.id);
    const parent = byId.get(root.parent);
    if (!parent) break;
    root = parent;
  }
  return root.id;
}

export const sessionDetails = (row: SourceSession, byId: ReadonlyMap<string, SourceSession>) => ({
  id: row.id,
  parent: row.parent,
  session: owningSession(row, byId),
  project: row.project,
  title: row.title || "Untitled",
  fork: row.fork,
});

function projectName(project: SourceProject, inventory: ReadonlyArray<SourceProject>): string {
  if (project.id === "global") return "Global";
  if (project.name) return project.name;
  const folder = basename(project.worktree);
  return inventory.some(
    (other) => other.id !== project.id && !other.name && basename(other.worktree) === folder,
  )
    ? `${basename(dirname(project.worktree))}/${folder}`
    : folder;
}

export const makeDimensions = Effect.fnUntraced(function* () {
  const db = yield* Database;
  const names = yield* db.select().from(dimensionNames);
  const byId = new Map(names.map((row) => [`${row.dimension}\0${row.id}`, row]));
  return (revision: number) =>
    Effect.fnUntraced(function* (dimension: string, id: string | null, name?: string) {
      if (id === null) return null;
      const key = `${dimension}\0${id}`;
      const old = byId.get(key);
      if (old) {
        if (name !== undefined && name !== old.name) {
          yield* db
            .update(dimensionNames)
            .set({ name, revision })
            .where(eq(dimensionNames.code, old.code));
          byId.set(key, { ...old, name, revision });
        }
        return old.code;
      }
      const row = (yield* db
        .insert(dimensionNames)
        .values({ dimension, id, name: name ?? id, revision })
        .returning())[0]!;
      byId.set(key, row);
      return row.code;
    });
});
type DimensionWriter = ReturnType<Effect.Success<ReturnType<typeof makeDimensions>>>;
export const stepAttribution = Effect.fnUntraced(function* (
  step: SourceFact | undefined,
  code: DimensionWriter,
) {
  const provider = step?.provider ?? null;
  const model = step?.model ?? null;
  return {
    provider: yield* code("provider", provider),
    model: yield* code(
      "model",
      provider !== null && model !== null ? `${provider}/${model}` : null,
    ),
    variant: yield* code("variant", step?.variant ?? null),
    agent: yield* code("agent", step?.agent ?? null),
  };
});
export const detailKeys = ["id", "parent", "session", "project", "title", "fork"] as const;

const saveSessions = Effect.fnUntraced(function* (
  inventory: ReadonlyArray<SourceSession>,
  code: DimensionWriter,
  revision: number,
) {
  const db = yield* Database;
  const previousSessions = yield* db.select().from(sessionFacts);
  const savedById = new Map(previousSessions.map((row) => [row.id, row]));
  const byId = new Map(inventory.map((row) => [row.id, row]));
  for (const row of inventory) {
    const detail = sessionDetails(row, byId);
    const old = savedById.get(row.id);
    if (old && detailKeys.every((key) => old[key] === detail[key])) continue;
    yield* code("session", row.id, detail.title);
    yield* code("session", row.parent);
    yield* code("session", row.fork);
    yield* db
      .insert(sessionFacts)
      .values({ ...detail, revision })
      .onConflictDoUpdate({ target: sessionFacts.id, set: { ...detail, revision } });
    if (old && (old.project !== detail.project || old.session !== detail.session)) {
      // Details can change without a transcript counter. Reattribute already
      // read steps in this same commit, before announcing the new relationships.
      yield* db
        .update(steps)
        .set({
          project: (yield* code("project", detail.project))!,
          sessionCode: (yield* code("session", detail.session))!,
          subagent: yield* code("session", detail.session === row.id ? null : row.id),
          revision,
        })
        .where(eq(steps.session, row.id));
    }
    yield* db.delete(tombstones).where(eq(tombstones.id, `session:${row.id}`));
  }
  return previousSessions;
});
const saveProjects = Effect.fnUntraced(function* (
  projects: ReadonlyArray<SourceProject>,
  code: DimensionWriter,
  revision: number,
) {
  const db = yield* Database;
  const previousProjects = yield* db.select().from(projectFacts);
  const savedById = new Map(previousProjects.map((row) => [row.id, row]));
  for (const row of projects) {
    yield* code("project", row.id, projectName(row, projects));
    const old = savedById.get(row.id);
    if (old && old.name === row.name && old.worktree === row.worktree) continue;
    yield* db
      .insert(projectFacts)
      .values({ ...row, revision })
      .onConflictDoUpdate({ target: projectFacts.id, set: { ...row, revision } });
    yield* db.delete(tombstones).where(eq(tombstones.id, `project:${row.id}`));
  }
  return previousProjects;
});
export const saveDetails = Effect.fnUntraced(function* (
  inventory: ReadonlyArray<SourceSession>,
  projects: ReadonlyArray<SourceProject>,
  code: DimensionWriter,
  revision: number,
  now: number,
) {
  const db = yield* Database;
  const previousSessions = yield* saveSessions(inventory, code, revision);
  const previousProjects = yield* saveProjects(projects, code, revision);
  for (const [kind, table, saved, current] of [
    ["session", sessionFacts, previousSessions, inventory],
    ["project", projectFacts, previousProjects, projects],
  ] as const) {
    for (const row of saved.filter((old) => !current.some((item) => item.id === old.id))) {
      yield* db.delete(table).where(eq(table.id, row.id));
      yield* db
        .insert(tombstones)
        .values({ id: `${kind}:${row.id}`, revision, deletedAt: now })
        .onConflictDoUpdate({ target: tombstones.id, set: { revision, deletedAt: now } });
    }
  }
});
