import * as Schema from "effect/Schema";
import type { DimensionName, toolFields } from "@opencode-stats/browser-copy";
import type { Period } from "./ranges.ts";

const measured = Schema.NullOr(Schema.Number);
const amounts = {
  calls: Schema.Number,
  succeeded: Schema.Number,
  failed: Schema.Number,
  stopped: Schema.Number,
  pending: Schema.Number,
  failureRate: measured,
  runTime: Schema.Struct({ p50: measured, p95: measured, timedShare: measured }),
};
export const ToolMetrics = Schema.Struct({
  ...amounts,
  rows: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, ...amounts })),
});
export type ToolFact = Readonly<Record<(typeof toolFields)[number], number>>;

function summarize(calls: readonly ToolFact[]) {
  const succeeded = calls.filter((call) => call.outcome === 1).length;
  const failed = calls.filter((call) => call.outcome === 2).length;
  const stopped = calls.filter((call) => call.outcome === 3).length;
  // An in-flight call has no finished run time, even when its start is recorded.
  const timed = calls
    .filter((call) => Number.isFinite(call.runStart) && Number.isFinite(call.completed))
    .map((call) => call.completed - call.runStart)
    .sort((a, b) => a - b);
  return {
    calls: calls.length,
    succeeded,
    failed,
    stopped,
    pending: calls.length - succeeded - failed - stopped,
    failureRate: succeeded + failed === 0 ? null : failed / (succeeded + failed),
    runTime: {
      p50: timed[Math.ceil(timed.length * 0.5) - 1] ?? null,
      p95: timed[Math.ceil(timed.length * 0.95) - 1] ?? null,
      timedShare: calls.length === 0 ? null : timed.length / calls.length,
    },
  };
}

export function toolMetrics(
  facts: Iterable<ToolFact>,
  names: readonly DimensionName[],
  period: Period,
): typeof ToolMetrics.Type {
  const calls = [...facts].filter((call) => call.start >= period.start && call.start < period.end);
  const groups = new Map<number, ToolFact[]>();
  for (const call of calls) {
    const rows = groups.get(call.tool) ?? [];
    rows.push(call);
    groups.set(call.tool, rows);
  }
  return {
    ...summarize(calls),
    rows: [...groups]
      .map(([code, rows]) => {
        const name = names.find((name) => name.dimension === "tool" && name.code === code)!;
        return { id: name.id, name: name.name, ...summarize(rows) };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
