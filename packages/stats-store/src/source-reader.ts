import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import { sqlFailure } from "./errors.ts";

const instant = Schema.Number.check(Schema.isInt());
const nullable = Schema.NullOr(instant);
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
const session = Schema.Struct({
  id: Schema.String,
  counter: nullable,
  messageCount: instant,
  highestPosition: nullable,
  latest: nullable,
  parent: Schema.NullOr(Schema.String),
});
export type SourceFact = typeof fact.Type;
export type SourceSession = typeof session.Type;
type NativeRow = Record<string, string | number | bigint | null | Uint8Array>;
export type NativeReader = {
  all(sql: string, ...params: string[]): ReadonlyArray<NativeRow>;
  exec(sql: string): void;
};
const inventorySql = `SELECT s.id, s.parent_id AS parent, e.seq AS counter,
  count(m.id) AS messageCount, max(m.seq) AS highestPosition, max(m.time_created) AS latest
  FROM session_v2 s LEFT JOIN event_sequence e ON e.aggregate_id=s.id
  LEFT JOIN session_message m ON m.session_id=s.id GROUP BY s.id`;
const factsSql = `SELECT id, session_id AS session, seq AS position,
  json_extract(data,'$.time.created') AS start,
  json_extract(data,'$.tokens.input') AS input,
  json_extract(data,'$.tokens.cache.read') AS cacheRead,
  json_extract(data,'$.tokens.cache.write') AS cacheWrite,
  json_extract(data,'$.tokens.output') AS output,
  json_extract(data,'$.tokens.reasoning') AS reasoning
  FROM session_message WHERE session_id=? AND type='assistant' ORDER BY seq`;

const attempt = <A>(read: () => A) =>
  Effect.try({ try: read, catch: (error) => sqlFailure(error, "readSource") });
export function sourceReader(db: NativeReader) {
  return {
    version: attempt(
      () =>
        Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ data_version: instant })))(
          db.all("PRAGMA main.data_version"),
        )[0]!.data_version,
    ),
    inventory: attempt(() => Schema.decodeUnknownSync(Schema.Array(session))(db.all(inventorySql))),
    read: (id: string) =>
      attempt(() => {
        // Native synchronous calls: the snapshot ends before decoding, retries, store writes or IPC.
        db.exec("BEGIN");
        let rows: ReadonlyArray<NativeRow>;
        let headers: ReadonlyArray<NativeRow>;
        try {
          headers = db.all(inventorySql.replace("GROUP BY s.id", "WHERE s.id=? GROUP BY s.id"), id);
          rows = db.all(factsSql, id);
        } finally {
          db.exec("ROLLBACK");
        }
        return {
          session: Schema.decodeUnknownSync(Schema.Array(session))(headers)[0],
          facts: Schema.decodeUnknownSync(Schema.Array(fact))(rows).filter(
            (row) => !/^msg_.{26}_[0-9]+$/u.test(row.id),
          ),
        };
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential("20 millis"),
          times: 3,
          while: (error) => error.code === "SQLITE_BUSY",
        }),
      ),
  };
}
export type SourceReader = ReturnType<typeof sourceReader>;
export type SourceAdapter = (
  filename: string,
) => Effect.Effect<SourceReader, Error, import("effect/Scope").Scope>;
