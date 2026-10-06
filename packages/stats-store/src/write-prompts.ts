import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { prompts, tombstones } from "./schema.ts";
import type { SourcePrompt, SourceFact, SourceSession } from "./source-reader.ts";
import type { makeDimensions } from "./dimensions.ts";
import { stepAttribution } from "./dimensions.ts";

export const replacePrompts = Effect.fnUntraced(function* (
  sessionId: string,
  delivered: readonly SourcePrompt[],
  steps: readonly SourceFact[],
  revision: number,
  now: number,
  inventory: ReadonlyMap<string, SourceSession>,
  code: ReturnType<Effect.Success<ReturnType<typeof makeDimensions>>>,
) {
  const db = yield* Database;
  const previous = yield* db.select().from(prompts).where(eq(prompts.session, sessionId));
  for (const prompt of delivered) {
    const next = steps.find((step) => step.position > prompt.position);
    const row = {
      ...prompt,
      ...(yield* stepAttribution(next, code)),
      project: (yield* code("project", inventory.get(sessionId)!.project))!,
      sessionCode: (yield* code("session", sessionId))!,
    };
    const old = previous.find((value) => value.id === prompt.id);
    const keys = [
      "position",
      "start",
      "provider",
      "model",
      "variant",
      "agent",
      "project",
      "sessionCode",
    ] as const;
    if (old && keys.every((key) => old[key] === row[key])) continue;
    yield* db
      .insert(prompts)
      .values({ ...row, revision })
      .onConflictDoUpdate({ target: prompts.id, set: { ...row, revision } });
    yield* db.delete(tombstones).where(eq(tombstones.id, prompt.id));
  }
  for (const old of previous) {
    if (delivered.some((prompt) => prompt.id === old.id)) continue;
    yield* db.delete(prompts).where(eq(prompts.id, old.id));
    yield* db
      .insert(tombstones)
      .values({ id: old.id, revision, deletedAt: now })
      .onConflictDoUpdate({ target: tombstones.id, set: { revision, deletedAt: now } });
  }
});
