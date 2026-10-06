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
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  variant: Schema.String,
  agent: Schema.NullOr(Schema.String),
});
const session = Schema.Struct({
  id: Schema.String,
  counter: nullable,
  messageCount: instant,
  highestPosition: nullable,
  latest: nullable,
  parent: Schema.NullOr(Schema.String),
  project: Schema.String,
  title: Schema.NullOr(Schema.String),
  fork: Schema.NullOr(Schema.String),
});
const project = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  worktree: Schema.String,
});
export type SourceFact = typeof fact.Type;
export type SourceSession = typeof session.Type;
export type SourceProject = typeof project.Type;
type NativeRow = Record<string, string | number | bigint | null | Uint8Array>;
export type NativeReader = {
  all(sql: string, ...params: string[]): ReadonlyArray<NativeRow>;
  exec(sql: string): void;
};
const inventorySql = `SELECT s.id, s.parent_id AS parent, s.project_id AS project, s.title, s.fork_session_id AS fork, e.seq AS counter,
  count(m.id) AS messageCount, max(m.seq) AS highestPosition, max(m.time_created) AS latest
  FROM session_v2 s LEFT JOIN event_sequence e ON e.aggregate_id=s.id
  LEFT JOIN session_message m ON m.session_id=s.id GROUP BY s.id`;
// Exclude copy-shaped IDs before evaluating their JSON, even after a bad rewrite.
const factsSql = `SELECT id, session_id AS session, seq AS position,
  json_extract(data,'$.time.created') AS start,
  json_extract(data,'$.tokens.input') AS input,
  json_extract(data,'$.tokens.cache.read') AS cacheRead,
  json_extract(data,'$.tokens.cache.write') AS cacheWrite,
  json_extract(data,'$.tokens.output') AS output,
   json_extract(data,'$.tokens.reasoning') AS reasoning,
   json_extract(data,'$.providerID') AS provider,
   json_extract(data,'$.modelID') AS model,
   coalesce(json_extract(data,'$.variant'),'default') AS variant,
   json_extract(data,'$.agent') AS agent
  FROM session_message WHERE session_id=? AND type='assistant'
  AND NOT (id GLOB 'msg_${"?".repeat(26)}_[0-9]*' AND substr(id,32) NOT GLOB '*[^0-9]*')
  ORDER BY seq`;

function attempt<A>(read: () => A) {
  return Effect.try({ try: read, catch: (error) => sqlFailure(error, "readSource") });
}
function readTransaction<A>(db: NativeReader, read: () => A): A {
  db.exec("BEGIN");
  try {
    return read();
  } finally {
    db.exec("ROLLBACK");
  }
}
export function sourceReader(db: NativeReader) {
  db.exec("PRAGMA busy_timeout=20");
  return {
    version: attempt(() =>
      Schema.decodeUnknownSync(instant)(db.all("PRAGMA main.data_version")[0]!["data_version"]),
    ),
    inventory: attempt(() => {
      const rows = readTransaction(db, () => ({
        sessions: db.all(inventorySql),
        projects: db.all("SELECT id,name,worktree FROM project"),
      }));
      return {
        sessions: Schema.decodeUnknownSync(Schema.Array(session))(rows.sessions),
        projects: Schema.decodeUnknownSync(Schema.Array(project))(rows.projects),
      };
    }),
    read: (id: string) =>
      attempt(() => {
        // Native synchronous calls: the snapshot ends before decoding, retries, store writes or IPC.
        const { rows, headers } = readTransaction(db, () => ({
          headers: db.all(inventorySql.replace("GROUP BY s.id", "WHERE s.id=? GROUP BY s.id"), id),
          rows: db.all(factsSql, id),
        }));
        return {
          id,
          session: Schema.decodeUnknownSync(Schema.Array(session))(headers)[0],
          facts: Schema.decodeUnknownSync(Schema.Array(fact))(rows),
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
