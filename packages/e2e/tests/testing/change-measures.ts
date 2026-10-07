import type { Page } from "playwright";
import { expect } from "vitest";

export async function readChangeEvidence(page: Page, kind = "", since = 0) {
  return page.evaluate(
    ({ name, skip }) => {
      const prefix = "opencode-stats:change:";
      // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: browser User Timing detail is untrusted and must narrow to four numbers.
      const parts = (input: unknown) => {
        if (
          typeof input !== "object" ||
          input === null ||
          !("input" in input) ||
          typeof input.input !== "number" ||
          !("compute" in input) ||
          typeof input.compute !== "number" ||
          !("page" in input) ||
          typeof input.page !== "number" ||
          !("paint" in input) ||
          typeof input.paint !== "number"
        )
          throw new Error(`whole-paint:invalid-clock:${name}`);
        return [input.input, input.compute, input.page, input.paint];
      };
      const measures = performance
        .getEntriesByType("measure")
        .filter((entry) => (name ? entry.name === prefix + name : entry.name.startsWith(prefix)))
        .slice(skip)
        .map((entry) => {
          if (!(entry instanceof PerformanceMeasure))
            throw new Error("whole-paint:missing-measure");
          return {
            kind: entry.name.slice(prefix.length),
            duration: entry.duration,
            parts: parts(entry.detail),
          };
        });
      const probe = window.wholePaint;
      return {
        measures,
        observing: probe?.observing ?? false,
        evidence: probe?.evidence,
        probeEntries: performance.getEntriesByName("opencode-stats:whole-paint-probe").length,
        completedAddress:
          document.querySelector(".range-control")?.getAttribute("data-range") ===
          location.pathname + location.search,
      };
    },
    { name: kind, skip: since },
  );
}

export type ChangeEvidence = Awaited<ReturnType<typeof readChangeEvidence>>;
type Measures = ChangeEvidence["measures"];
export function assertSummedMeasures(measures: Measures) {
  for (const { duration, parts } of measures) {
    expect(
      parts.every((part) => Number.isFinite(part) && part >= 0),
      "whole-paint:invalid-clock",
    ).toBe(true);
    expect(duration, "whole-paint:unsummed-clock").toBeCloseTo(
      parts.reduce((sum, part) => sum + part, 0),
      5,
    );
  }
}

// Reference/CI timing consumers must use this boundary. Raw measures from an
// observed page include real probe work in rAF-to-task and are not own-work data.
export function assertCleanChangeEvidence(data: ChangeEvidence) {
  if (data.observing || (data.evidence?.samples ?? 0) !== 0 || data.probeEntries !== 0)
    throw new Error("change-clock:probe-contaminated");
  assertSummedMeasures(data.measures);
}

export async function readCleanChangeMeasures(page: Page) {
  const data = await readChangeEvidence(page);
  assertCleanChangeEvidence(data);
  return data.measures;
}
