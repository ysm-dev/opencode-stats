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
  tokens: 0n,
  pricedTokens: 0n,
});
export function addCost(total: ReturnType<typeof emptyCost>, fact: Fact): void {
  const tokens = tokenKinds.reduce(
    (sum, kind) => sum + (Number.isNaN(fact[kind]) ? 0n : BigInt(fact[kind])),
    0n,
  );
  total.tokens += tokens;
  if (!Number.isNaN(fact.recordedCost)) total.recorded += fact.recordedCost;
  if (!Number.isNaN(fact.estimatedCost)) {
    total.estimated += fact.estimatedCost;
    total.pricedSteps++;
    total.pricedTokens += tokens;
  }
}
export const costTotals = (cost: ReturnType<typeof emptyCost>): typeof Cost.Type => ({
  estimated: cost.pricedSteps === 0 ? null : cost.estimated,
  recorded: cost.recorded,
  pricedShare: cost.tokens === 0n ? null : Number(cost.pricedTokens) / Number(cost.tokens),
});
