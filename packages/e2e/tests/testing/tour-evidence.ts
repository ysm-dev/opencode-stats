import type { Page } from "playwright";
import { onTestFailed } from "vitest";

type Phase = "setup" | "baseline" | "action" | "paint" | "evidence";
type Entry = { kind: string; phase: Phase; milliseconds: number };

// Host wall time only, never substituted for the dashboard's performance clock.
// Keep bounded counters/timings and named kinds; no URL, text, fact or error data.
export function createTourEvidence(label: string) {
  const totals: Record<Phase, number> = { setup: 0, baseline: 0, action: 0, paint: 0, evidence: 0 };
  let current: { kind: string; phase: Phase; started: number } | undefined;
  let recent: Entry[] = [];
  onTestFailed(() => {
    const pending = current && {
      kind: current.kind,
      phase: current.phase,
      milliseconds: Math.round(performance.now() - current.started),
    };
    process.stderr.write(
      `tour failure timings ${JSON.stringify({ label, totals, recent, pending })}\n`,
    );
  });
  return async <T>(kind: string, phase: Phase, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    current = { kind, phase, started };
    try {
      return await work();
    } finally {
      const milliseconds = Math.round(performance.now() - started);
      totals[phase] += milliseconds;
      recent = [...recent, { kind, phase, milliseconds }].slice(-16);
      current = undefined;
    }
  };
}

const traces = new WeakMap<Page, ReturnType<typeof createTourEvidence>>();
export const trackTourEvidence = (page: Page, trace: ReturnType<typeof createTourEvidence>) => {
  traces.set(page, trace);
};
export function tourWork<T>(page: Page, kind: string, phase: Phase, work: () => Promise<T>) {
  const trace = traces.get(page);
  return trace === undefined ? work() : trace(kind, phase, work);
}
