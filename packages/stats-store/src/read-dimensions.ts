import { gt } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { mapFields, tokenKinds } from "@opencode-stats/browser-copy";
import { Database } from "./database.ts";
import { dimensionNames, sessionFacts, projectFacts, steps } from "./schema.ts";

export const countedSteps = (facts: ReadonlyArray<typeof steps.$inferSelect>) =>
  facts.map((row) => ({
    start: row.start,
    ...mapFields(tokenKinds, (kind) => row[kind]),
    provider: row.provider,
    model: row.model,
    variant: row.variant,
    agent: row.agent,
    project: row.project,
    session: row.sessionCode,
    subagent: row.subagent,
  }));

export const readDimensions = Effect.fnUntraced(function* (
  since: number | undefined,
  deleted: ReadonlyArray<{ id: string }>,
) {
  const db = yield* Database;
  const names = yield* db.select().from(dimensionNames).orderBy(dimensionNames.code);
  const codes = new Map(names.map((name) => [`${name.dimension}\0${name.id}`, name.code]));
  const code = (dimension: string, id: string | null) =>
    id === null ? null : codes.get(`${dimension}\0${id}`)!;
  const sessionRows = yield* db
    .select()
    .from(sessionFacts)
    .where(since === undefined ? undefined : gt(sessionFacts.revision, since))
    .orderBy(sessionFacts.id);
  const projectRows = yield* db
    .select()
    .from(projectFacts)
    .where(since === undefined ? undefined : gt(projectFacts.revision, since))
    .orderBy(projectFacts.id);
  const removed = (dimension: string) =>
    deleted
      .filter((row) => row.id.startsWith(`${dimension}:`))
      .map((row) => code(dimension, row.id.slice(dimension.length + 1))!);
  return {
    names: names
      .filter((name) => since === undefined || name.revision > since)
      .map(({ dimension, code, id, name }) => ({ dimension, code, id, name })),
    sessions: sessionRows.map((row) => ({
      code: code("session", row.id)!,
      parent: code("session", row.parent),
      session: code("session", row.session)!,
      project: code("project", row.project)!,
      fork: code("session", row.fork),
    })),
    projects: projectRows.map((row) => code("project", row.id)!),
    sessionTombstones: removed("session"),
    projectTombstones: removed("project"),
  };
});
