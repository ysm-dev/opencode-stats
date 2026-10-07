import type { CompleteState } from "./range-fixture.ts";
import type { metricSteps } from "./metrics-fixture.ts";

// Intentionally direct, UTC-only reference. It neither calls the calendar nor
// shares the engine's token accumulator, grouping or distribution algorithms.
export function referenceTokens(steps: typeof metricSteps, state: CompleteState) {
  return state.chart.buckets.map((bucket) =>
    steps
      .filter((step) => step.start >= bucket.start && step.start < bucket.end)
      .reduce(
        (sum, step) =>
          sum +
          [step.input, step.cacheRead, step.cacheWrite, step.output, step.reasoning].reduce<number>(
            (amount, value) => amount + (value ?? 0),
            0,
          ),
        0,
      ),
  );
}
