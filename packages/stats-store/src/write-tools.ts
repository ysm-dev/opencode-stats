import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { tools, tombstones } from "./schema.ts";
import type { SourceTool } from "./source-tools.ts";
import type { makeDimensions } from "./dimensions.ts";

export const replaceTools = Effect.fnUntraced(function* (
  session: string,
  calls: readonly (typeof SourceTool.Type)[],
  revision: number,
  now: number,
  code: ReturnType<Effect.Success<ReturnType<typeof makeDimensions>>>,
) {
  const db = yield* Database;
  const previous = yield* db.select().from(tools).where(eq(tools.session, session));
  const keys = ["stepId", "tool", "outcome", "runStart", "completed"] as const;
  for (const call of calls) {
    const row = { ...call, tool: (yield* code("tool", call.tool))! };
    const old = previous.find((value) => value.id === row.id);
    if (old && keys.every((key) => old[key] === row[key])) continue;
    yield* db
      .insert(tools)
      .values({ ...row, revision })
      .onConflictDoUpdate({
        target: tools.id,
        set: { ...row, revision },
      });
    yield* db.delete(tombstones).where(eq(tombstones.id, row.id));
  }
  for (const old of previous) {
    if (calls.some((call) => call.id === old.id)) continue;
    yield* db.delete(tools).where(eq(tools.id, old.id));
    yield* db
      .insert(tombstones)
      .values({ id: old.id, revision, deletedAt: now })
      .onConflictDoUpdate({ target: tombstones.id, set: { revision, deletedAt: now } });
  }
});
