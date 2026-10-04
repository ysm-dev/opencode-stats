import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Database } from "./database.ts";

// Partial storage definitions, not OpenCode's bootstrap or a JSON message decoder.
const messages = sqliteTable("session_message", {
  id: text().notNull(),
  session: text("session_id").notNull(),
  position: integer("seq").notNull(),
  type: text().notNull(),
  data: text().notNull(),
});

const instant = Schema.Number.check(Schema.isInt());
const usage = Schema.NullOr(instant.check(Schema.isGreaterThanOrEqualTo(0)));
const fact = Schema.Struct({
  id: Schema.String,
  session: Schema.String,
  position: instant,
  start: instant,
  input: usage,
  cacheRead: usage,
  cacheWrite: usage,
  output: usage,
  reasoning: usage,
});
const decode = Schema.decodeUnknownSync(Schema.Array(fact));

export const readSource = Effect.gen(function* () {
  const db = yield* Database;
  // One fully consumed native query; no explicit source transaction or asynchronous read span.
  const rows = yield* db
    .select({
      id: messages.id,
      session: messages.session,
      position: messages.position,
      start: sql<number>`json_extract(${messages.data}, '$.time.created')`,
      input: sql<number | null>`json_extract(${messages.data}, '$.tokens.input')`,
      cacheRead: sql<number | null>`json_extract(${messages.data}, '$.tokens.cache.read')`,
      cacheWrite: sql<number | null>`json_extract(${messages.data}, '$.tokens.cache.write')`,
      output: sql<number | null>`json_extract(${messages.data}, '$.tokens.output')`,
      reasoning: sql<number | null>`json_extract(${messages.data}, '$.tokens.reasoning')`,
    })
    .from(messages)
    .where(eq(messages.type, "assistant"))
    .orderBy(messages.session, messages.position)
    .pipe(Effect.retry({ schedule: Schedule.exponential("20 millis"), times: 3 }));
  return decode(rows).filter((row) => !/^msg_.{26}_[0-9]+$/u.test(row.id));
});
