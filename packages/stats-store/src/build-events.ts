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
export type BuildReport = (event: BuildEvent) => import("effect/Effect").Effect<void, Error>;
