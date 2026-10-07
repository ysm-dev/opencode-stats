import { mapPromptFields } from "@opencode-stats/browser-copy";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { filterSteps, filterMetadata } from "./filter-fixture.ts";

export const metricNames = [
  ...filterMetadata.names,
  { dimension: "error", code: 500, id: "aborted", name: "aborted" },
  { dimension: "error", code: 501, id: "api", name: "api" },
  { dimension: "error", code: 502, id: "crashed", name: "crashed" },
];
export const metricStep = (
  date: string,
  duration: number | null,
  context = 100,
  error: number | null = null,
) => {
  const start = Date.parse(date);
  return {
    ...filterSteps[0]!,
    start,
    streamEnd: duration === null ? null : start + duration,
    completed: null,
    error,
    failed: Number(error !== null && error !== 500),
    interrupted: Number(error === 500),
    input: context / 2,
    cacheRead: context / 2,
    cacheWrite: 0,
  };
};
export const metricSteps = [
  metricStep("2026-10-01T12:00Z", null, 100),
  metricStep("2026-10-06T12:00Z", 1000, 100, 501),
  metricStep("2026-10-07T12:00Z", 2000, 200, 501),
  metricStep("2026-10-07T12:01Z", 8000, 800, 502),
  {
    ...metricStep("2026-10-07T12:02Z", null, 100, 500),
    input: null,
    cacheRead: null,
    cacheWrite: null,
  },
  { ...metricStep("2026-10-07T12:03Z", 0, 0), subagent: 202 },
];
export const metricPrompts = [
  { ...metricSteps[0]!, start: Date.parse("2026-10-06T11:59Z") },
  { ...metricSteps[0]!, start: Date.parse("2026-10-07T11:59Z") },
  {
    ...metricSteps[0]!,
    start: Date.parse("2026-10-07T12:05Z"),
    provider: null,
    model: null,
    variant: null,
    agent: null,
  },
];
export const metricCopy = () =>
  syntheticCopy(metricSteps, {
    ...filterMetadata,
    names: metricNames,
    promptIds: metricPrompts.map((_, i) => `prompt-${i}`),
    prompts: mapPromptFields((field) =>
      Float64Array.from(metricPrompts, (prompt) => prompt[field] ?? NaN),
    ),
  });
