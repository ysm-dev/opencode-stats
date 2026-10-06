import * as Schema from "effect/Schema";

// Only kinds and elapsed work cross the worker boundary. Never addresses,
// dimensions, identifiers, names or metric values.
export const ChangeKind = Schema.Literals([
  "address",
  "all-time",
  "preset",
  "remove-fixed",
  "shift",
  "filter",
  "remove-filter",
  "clear-filters",
  "pause",
  "resume",
  "live",
  "build",
  "visible",
  "minute",
  "day",
  "focus",
]);
export type ChangeKind = typeof ChangeKind.Type;
const Work = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
export const ComputeTime = Schema.Struct({
  kind: ChangeKind,
  compute: Work,
  elapsed: Work,
});
export type ChangeTime = typeof ComputeTime.Type & { input: number; started: number; page: number };
