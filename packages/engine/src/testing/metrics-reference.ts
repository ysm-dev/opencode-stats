import type { Step, StepDimensions, Prompt, DimensionName } from "@opencode-stats/browser-copy";
import type { Filter } from "../filters.ts";
import type { Period } from "../ranges.ts";

type Row = Step & Partial<StepDimensions>;
export function referenceMetrics(
  rows: readonly Row[],
  delivered: readonly Prompt[],
  names: readonly DimensionName[],
  filters: readonly Filter[],
  period: Period,
) {
  const dimensions = [...new Set(filters.map((filter) => filter.dimension))];
  const matches = (row: Readonly<Partial<Record<Filter["dimension"], number | null>>>) =>
    dimensions.every((dimension) =>
      filters
        .filter((filter) => filter.dimension === dimension)
        .some((filter) =>
          names.some(
            (name) =>
              name.dimension === dimension && name.id === filter.id && name.code === row[dimension],
          ),
        ),
    );
  const all = rows.filter(matches);
  const facts = all.filter((row) => row.start >= period.start && row.start < period.end);
  const prompts = delivered
    .filter(matches)
    .filter((row) => row.start >= period.start && row.start < period.end).length;
  const steps = facts.length;
  const share = (count: number, total: number) => (total === 0 ? null : count / total);
  const quantile = (values: readonly number[], percentile: number) =>
    values.length
      ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentile) - 1]!
      : null;
  const timed = facts
    .filter((row) => row.streamEnd != null)
    .map((row) => row.streamEnd! - row.start);
  const recorded = all.filter((row) => row.streamEnd != null).map((row) => row.start);
  const contexts = facts.filter(
    (row) => row.input !== null && row.cacheRead !== null && row.cacheWrite !== null,
  );
  const sizes = contexts.map((row) => row.input! + row.cacheRead! + row.cacheWrite!);
  const errors = names
    .filter((name) => name.dimension === "error" && name.id !== "aborted")
    .map((name) => {
      const failed = facts.filter((row) => row.error === name.code).length;
      return { id: name.id, name: name.name, failed, rate: share(failed, steps) };
    })
    .filter((error) => error.failed > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const failed = errors.reduce((sum, error) => sum + error.failed, 0);
  const aborted = names.find((name) => name.dimension === "error" && name.id === "aborted")?.code;
  return {
    steps,
    prompts,
    stepsPerPrompt: share(steps, prompts),
    failed,
    interrupted: facts.filter((row) => row.error === aborted).length,
    failureRate: share(failed, steps),
    errors,
    response: {
      p50: quantile(timed, 0.5),
      p95: quantile(timed, 0.95),
      timedShare: share(timed.length, steps),
      recordedFrom: recorded.length ? Math.min(...recorded) : null,
    },
    context: {
      median: quantile(sizes, 0.5),
      p95: quantile(sizes, 0.95),
      max: sizes.length ? Math.max(...sizes) : null,
    },
    cacheHitRate: share(
      contexts.reduce((sum, row) => sum + row.cacheRead!, 0),
      sizes.reduce((sum, size) => sum + size, 0),
    ),
  };
}
