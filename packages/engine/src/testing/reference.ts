import type { Step, StepDimensions, SessionFact } from "@opencode-stats/browser-copy";

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

// Descendant search, rather than the engine's per-step ancestor walk.
export function referenceSessions(
  steps: readonly (Step & Partial<StepDimensions>)[],
  sessions: readonly SessionFact[],
) {
  const placement = (session: SessionFact) => {
    const descendants = new Set([session.code]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const child of sessions) {
        if (
          child.parent !== null &&
          descendants.has(child.parent) &&
          !descendants.has(child.code)
        ) {
          descendants.add(child.code);
          changed = true;
        }
      }
    }
    const matching = steps.filter(
      (step) =>
        step.session === session.code ||
        (step.subagent !== null && step.subagent !== undefined && descendants.has(step.subagent)),
    );
    return matching.length ? Math.min(...matching.map((step) => step.start)) : null;
  };
  const placed = sessions.filter((session) => placement(session) !== null);
  return {
    total: placed.filter((session) => session.session === session.code).length,
    subagents: placed.filter((session) => session.session !== session.code).length,
  };
}
