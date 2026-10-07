import * as Schema from "effect/Schema";
import { tokenKinds } from "@opencode-stats/browser-copy";
import type { Fact } from "./amounts.ts";

export const Cost = Schema.Struct({
  estimated: Schema.NullOr(Schema.Number),
  recorded: Schema.Number,
  pricedShare: Schema.NullOr(Schema.Number),
});
export const emptyCost = () => ({
  estimated: 0,
  recorded: 0,
  pricedSteps: 0,
  paidSteps: 0,
  tokens: 0n,
  pricedTokens: 0n,
});
export function addCost(total: ReturnType<typeof emptyCost>, fact: Fact, direction = 1): void {
  const tokens = tokenKinds.reduce(
    (sum, kind) => sum + (Number.isNaN(fact[kind]) ? 0n : BigInt(fact[kind])),
    0n,
  );
  total.tokens += tokens * BigInt(direction);
  if (!Number.isNaN(fact.recordedCost)) total.recorded += fact.recordedCost * direction;
  if (!Number.isNaN(fact.estimatedCost)) {
    total.estimated += fact.estimatedCost * direction;
    total.pricedSteps += direction;
    if (fact.estimatedCost !== 0) total.paidSteps += direction;
    // Reversible floating sums can leave residue after removing paid steps.
    // With no paid steps left, every available price is genuinely free.
    if (total.paidSteps === 0) total.estimated = 0;
    total.pricedTokens += tokens * BigInt(direction);
  }
}
export const costTotals = (cost: ReturnType<typeof emptyCost>): typeof Cost.Type => ({
  estimated: cost.pricedSteps === 0 ? null : cost.estimated,
  recorded: cost.recorded,
  pricedShare: cost.tokens === 0n ? null : Number(cost.pricedTokens) / Number(cost.tokens),
});
export const combineCost = (
  total: ReturnType<typeof emptyCost>,
  part: ReturnType<typeof emptyCost>,
) => {
  for (const key of ["estimated", "recorded", "pricedSteps", "paidSteps"] as const)
    total[key] += part[key];
  total.tokens += part.tokens;
  total.pricedTokens += part.pricedTokens;
};
