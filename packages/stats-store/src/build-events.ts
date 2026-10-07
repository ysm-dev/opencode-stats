import * as Schema from "effect/Schema";

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const BuildEvent = Schema.Struct({
  kind: Schema.Literals(["build.start", "build.end"]),
  reason: Schema.Literals(["first", "version", "damaged", "resume"]),
  sessions: Count,
  steps: Count,
  milliseconds: Count,
});
export type BuildEvent = typeof BuildEvent.Type;
export const StoreEvent = Schema.Union([
  BuildEvent,
  Schema.Struct({
    kind: Schema.Literals(["reread.start", "reread.end"]),
    reason: Schema.Literals(["migration", "import"]),
    sessions: Count,
    changed: Count,
    milliseconds: Count,
  }),
  Schema.Struct({
    kind: Schema.Literals(["sync.stopped", "sync.resumed"]),
    reason: Schema.Literals([
      "schema.newer",
      "schema.v1",
      "schema.other",
      "source.missing",
      "source.unreadable",
      "source.locked",
      "store.unwritable",
    ]),
    since: Count,
    lockedSince: Count,
    code: Schema.Literals(["permission", "damaged", "full", "unavailable", "locked"]),
  }),
  Schema.Struct({
    kind: Schema.Literal("schema.checked"),
    result: Schema.Literals(["recognized", "newer", "v1", "other"]),
    fingerprint: Schema.String,
    migrations: Count,
  }),
  Schema.Struct({
    kind: Schema.Literal("consistency.difference"),
    session: Schema.String,
    expectedCount: Count,
    actualCount: Count,
    expectedPosition: Schema.NullOr(Schema.Int),
    actualPosition: Schema.NullOr(Schema.Int),
  }),
]);
export type StoreEvent = typeof StoreEvent.Type;
export type BuildReport = (event: StoreEvent) => import("effect/Effect").Effect<void, Error>;
