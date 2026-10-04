import type { Step } from "@opencode-stats/browser-copy";

// Row-oriented, integer arithmetic reference, independent of the engine's
// column-oriented accumulation and the binary codec.
export function referenceTokens(steps: readonly Step[]) {
  const sum = (read: (step: Step) => number | null): number =>
    Number(steps.reduce((total, step) => total + BigInt(read(step) ?? 0), 0n));
  return {
    total: Number(
      steps
        .flatMap((step) => [
          step.input,
          step.cacheRead,
          step.cacheWrite,
          step.output,
          step.reasoning,
        ])
        .reduce((total, amount) => total + BigInt(amount ?? 0), 0n),
    ),
    input: sum((step) => step.input),
    cacheRead: sum((step) => step.cacheRead),
    cacheWrite: sum((step) => step.cacheWrite),
    output: sum((step) => step.output),
    reasoning: sum((step) => step.reasoning),
  };
}
