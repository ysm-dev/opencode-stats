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

// Independently select each known session's rows, rather than updating the
// engine's per-step maps. Ownership is already counted into the facts (#13).
export function referenceSessionPlacements(
  steps: readonly (Step & Partial<StepDimensions>)[],
  sessions: readonly SessionFact[],
) {
  return sessions.flatMap((session) => {
    const field = session.session === session.code ? "session" : "subagent";
    const starts = steps.filter((step) => step[field] === session.code).map((step) => step.start);
    return starts.length ? [{ session, start: Math.min(...starts) }] : [];
  });
}

export function referenceSessions(
  steps: readonly (Step & Partial<StepDimensions>)[],
  sessions: readonly SessionFact[],
) {
  const placed = referenceSessionPlacements(steps, sessions).map((placement) => placement.session);
  return {
    total: placed.filter((session) => session.session === session.code).length,
    subagents: placed.filter((session) => session.session !== session.code).length,
  };
}
