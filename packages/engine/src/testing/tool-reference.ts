import type { ToolCall, DimensionName } from "@opencode-stats/browser-copy";
import type { CompleteState } from "./range-fixture.ts";
import type { Filter } from "../filters.ts";

function summary(rows: readonly ToolCall[]) {
  const durations = rows
    .filter((row) => row.runStart !== null && row.completed !== null)
    .map((row) => row.completed! - row.runStart!)
    .toSorted((a, b) => a - b);
  const succeeded = rows.filter((row) => row.outcome === 1).length;
  const failed = rows.filter((row) => row.outcome === 2).length;
  const stopped = rows.filter((row) => row.outcome === 3).length;
  const nearest = (p: number) =>
    durations.length === 0 ? null : durations[Math.ceil(p * durations.length) - 1]!;
  return {
    calls: rows.length,
    succeeded,
    failed,
    stopped,
    pending: rows.filter((row) => row.outcome === null).length,
    failureRate: succeeded + failed > 0 ? failed / (succeeded + failed) : null,
    runTime: {
      p50: nearest(0.5),
      p95: nearest(0.95),
      timedShare: rows.length > 0 ? durations.length / rows.length : null,
    },
  };
}

export function referenceTools(
  calls: readonly ToolCall[],
  names: readonly DimensionName[],
  filters: readonly Filter[],
  period: CompleteState["period"],
) {
  const selected = calls.filter((call) => {
    if (call.start < period.start || call.start >= period.end) return false;
    return [...new Set(filters.map((filter) => filter.dimension))].every((dimension) =>
      filters.some(
        (filter) =>
          filter.dimension === dimension &&
          names.some(
            (name) =>
              name.dimension === dimension &&
              name.id === filter.id &&
              call[dimension] === name.code,
          ),
      ),
    );
  });
  return {
    ...summary(selected),
    rows: names
      .filter(
        (name) => name.dimension === "tool" && selected.some((call) => call.tool === name.code),
      )
      .map((name) => ({
        id: name.id,
        name: name.name,
        ...summary(selected.filter((call) => call.tool === name.code)),
      }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}
