import {
  mapStepFields,
  mapSessionFields,
  type BrowserCopy,
  type Step,
  type StepDimensions,
} from "../facts.ts";

export function syntheticCopy(
  steps: readonly (Step & Partial<StepDimensions>)[],
  header: Partial<Omit<BrowserCopy, "steps">> = {},
): BrowserCopy {
  return {
    kind: header.fromRevision ? "changes" : "whole",
    generation: "01234567-89ab-cdef-0123-456789abcdef",
    fromRevision: 0,
    revision: 1,
    historyCompleteFrom: 0,
    ids: steps.map((_, index) => `step-${index}`),
    tombstones: [],
    names: [],
    sessions: mapSessionFields(() => new Float64Array()),
    projects: new Float64Array(),
    sessionTombstones: new Float64Array(),
    projectTombstones: new Float64Array(),
    ...header,
    steps: mapStepFields((field) => Float64Array.from(steps, (step) => step[field] ?? NaN)),
  };
}
