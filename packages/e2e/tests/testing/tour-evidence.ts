import type { Page } from "playwright";
import { onTestFailed, onTestFinished } from "vitest";

type Phase = "setup" | "baseline" | "action" | "paint" | "evidence";
type Entry = { kind: string; phase: Phase; milliseconds: number };

// Host wall time only, never substituted for the dashboard's performance clock.
// Keep bounded counters/timings and named kinds; no URL, text, fact or error data.
export function createTourEvidence(label: string) {
  const totals: Record<Phase, number> = { setup: 0, baseline: 0, action: 0, paint: 0, evidence: 0 };
  let current: { kind: string; phase: Phase; started: number } | undefined;
  let recent: Entry[] = [];
  onTestFinished(() => {
    process.stderr.write(`[DEBUG-tour-duration] ${JSON.stringify({ label, totals, recent })}\n`);
  });
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
const cancellation = new WeakMap<Page, AbortSignal>();
export const trackTourEvidence = (
  page: Page,
  trace: ReturnType<typeof createTourEvidence>,
  signal: AbortSignal,
) => {
  traces.set(page, trace);
  cancellation.set(page, signal);
};
export async function tourWork<T>(page: Page, kind: string, phase: Phase, work: () => Promise<T>) {
  const signal = cancellation.get(page);
  signal?.throwIfAborted();
  const trace = traces.get(page);
  const result = await (trace === undefined ? work() : trace(kind, phase, work));
  signal?.throwIfAborted();
  return result;
}
