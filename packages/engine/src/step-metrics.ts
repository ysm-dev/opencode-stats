import * as Schema from "effect/Schema";
import type { DimensionName, promptFields } from "@opencode-stats/browser-copy";
import type { Fact } from "./amounts.ts";
import type { Period } from "./ranges.ts";

const measured = Schema.NullOr(Schema.Number);
export const StepMetrics = Schema.Struct({
  steps: Schema.Number,
  prompts: Schema.Number,
  stepsPerPrompt: measured,
  failed: Schema.Number,
  interrupted: Schema.Number,
  failureRate: measured,
  errors: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      failed: Schema.Number,
      rate: measured,
    }),
  ),
  response: Schema.Struct({
    p50: measured,
    p95: measured,
    timedShare: measured,
    recordedFrom: measured,
  }),
  context: Schema.Struct({ median: measured, p95: measured, max: measured }),
  cacheHitRate: measured,
});
export type PromptFact = Readonly<Record<(typeof promptFields)[number], number>>;
const rank = (sorted: readonly number[], percentile: number): number | null =>
  sorted.length === 0 ? null : sorted[Math.ceil(percentile * sorted.length) - 1]!;
const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;
const inPeriod = (start: number, period: Period) => start >= period.start && start < period.end;

export function stepMetrics(
  facts: Iterable<Fact>,
  prompts: Iterable<PromptFact>,
  names: readonly DimensionName[],
  period: Period,
): typeof StepMetrics.Type {
  const errors = new Map<number, number>();
  const response: number[] = [];
  const context: number[] = [];
  let steps = 0;
  let interrupted = 0;
  let recordedFrom: number | null = null;
  let cacheRead = 0n;
  let contextTotal = 0n;
  for (const fact of facts) {
    if (!Number.isNaN(fact.streamEnd))
      recordedFrom = Math.min(recordedFrom ?? fact.start, fact.start);
    if (!inPeriod(fact.start, period)) continue;
    steps++;
    interrupted += fact.interrupted;
    if (fact.failed === 1) errors.set(fact.error, (errors.get(fact.error) ?? 0) + 1);
    if (!Number.isNaN(fact.streamEnd)) response.push(fact.streamEnd - fact.start);
    if ([fact.input, fact.cacheRead, fact.cacheWrite].every(Number.isFinite)) {
      const size = BigInt(fact.input) + BigInt(fact.cacheRead) + BigInt(fact.cacheWrite);
      context.push(Number(size));
      contextTotal += size;
      cacheRead += BigInt(fact.cacheRead);
    }
  }
  response.sort((a, b) => a - b);
  context.sort((a, b) => a - b);
  const delivered = [...prompts].filter((prompt) => inPeriod(prompt.start, period)).length;
  const failed = [...errors.values()].reduce((sum, count) => sum + count, 0);
  return {
    steps,
    prompts: delivered,
    stepsPerPrompt: ratio(steps, delivered),
    failed,
    interrupted,
    failureRate: ratio(failed, steps),
    errors: [...errors]
      .map(([code, count]) => {
        const name = names.find((value) => value.dimension === "error" && value.code === code)!;
        return { id: name.id, name: name.name, failed: count, rate: ratio(count, steps) };
      })
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    response: {
      p50: rank(response, 0.5),
      p95: rank(response, 0.95),
      timedShare: ratio(response.length, steps),
      recordedFrom,
    },
    context: { median: rank(context, 0.5), p95: rank(context, 0.95), max: context.at(-1) ?? null },
    cacheHitRate: ratio(Number(cacheRead), Number(contextTotal)),
  };
}
