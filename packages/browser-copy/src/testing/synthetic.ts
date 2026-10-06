import { type BrowserCopy, type Step, type TokenKind } from "../facts.ts";

export function syntheticCopy(
  steps: readonly Step[],
  header: Partial<Omit<BrowserCopy, "steps">> = {},
): BrowserCopy {
  const tokens = (kind: TokenKind): Float64Array =>
    Float64Array.from(steps, (step) => step[kind] ?? NaN);
  return {
    kind: header.fromRevision ? "changes" : "whole",
    generation: "01234567-89ab-cdef-0123-456789abcdef",
    fromRevision: 0,
    revision: 1,
    historyCompleteFrom: 0,
    ids: steps.map((_, index) => `step-${index}`),
    tombstones: [],
    names: [],
    ...header,
    steps: {
      start: Float64Array.from(steps, (step) => step.start),
      input: tokens("input"),
      cacheRead: tokens("cacheRead"),
      cacheWrite: tokens("cacheWrite"),
      output: tokens("output"),
      reasoning: tokens("reasoning"),
    },
  };
}
