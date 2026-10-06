import { tokenKinds, type StepDimension } from "@opencode-stats/browser-copy";

export type Amounts = Record<(typeof tokenKinds)[number], bigint>;
export type Fact = { start: number } & Readonly<
  Record<(typeof tokenKinds)[number] | StepDimension, number>
>;
export const emptyAmounts = (): Amounts => ({
  input: 0n,
  cacheRead: 0n,
  cacheWrite: 0n,
  output: 0n,
  reasoning: 0n,
});
export const adjust = (amounts: Amounts, fact: Fact, direction: bigint) => {
  for (const kind of tokenKinds) {
    if (!Number.isNaN(fact[kind])) amounts[kind] += BigInt(fact[kind]) * direction;
  }
};
export const addAmounts = (amounts: Amounts, other: Amounts) => {
  for (const kind of tokenKinds) amounts[kind] += other[kind];
};
export const totals = (amounts: Amounts) => ({
  total: Number(tokenKinds.reduce((sum, kind) => sum + amounts[kind], 0n)),
  input: Number(amounts.input),
  cacheRead: Number(amounts.cacheRead),
  cacheWrite: Number(amounts.cacheWrite),
  output: Number(amounts.output),
  reasoning: Number(amounts.reasoning),
});
