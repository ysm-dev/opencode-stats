import {
  mapTokenFields,
  mapStepDimensions,
  mapSessionFields,
  mapPromptFields,
  type Step,
} from "@opencode-stats/browser-copy";
import type { StoreCopy } from "../store.ts";

export const tokenFacts = (steps: readonly Step[]) =>
  steps.map((step) => ({ start: step.start, ...mapTokenFields((kind) => step[kind]) }));

// Codes are permanent within a generation, not across fresh builds. Compare
// every fact using its permanent IDs and printed names, never allocation order.
export function canonicalCopy(copy: StoreCopy) {
  const names = new Map(copy.names.map((name) => [name.code, name]));
  const identity = (code: number | null) => (code === null ? null : names.get(code)!.id);
  return {
    steps: copy.steps.map((step, index) => ({
      id: copy.facts[index]!.id,
      ...tokenFacts([step])[0],
      streamEnd: step.streamEnd,
      completed: step.completed,
      error: identity(step.error ?? null),
      failed: step.failed,
      interrupted: step.interrupted,
      recordedCost: step.recordedCost,
      estimatedCost: step.estimatedCost,
      ...mapStepDimensions((dimension) => identity(step[dimension])),
    })),
    prompts: copy.prompts.map((prompt) => ({
      id: prompt.id,
      ...mapPromptFields((field) => (field === "start" ? prompt.start : identity(prompt[field]))),
    })),
    tools: copy.tools.map((call) => ({
      id: call.id,
      start: call.start,
      runStart: call.runStart,
      completed: call.completed,
      outcome: call.outcome,
      tool: identity(call.tool),
      ...mapStepDimensions((dimension) => identity(call[dimension])),
    })),
    sessions: copy.sessions
      .map((session) => ({
        ...mapSessionFields((field) => identity(session[field])),
        title: names.get(session.code)!.name,
      }))
      .toSorted((a, b) => a.code!.localeCompare(b.code!)),
    projects: copy.projects
      .map((code) => ({ id: identity(code), name: names.get(code)!.name }))
      .toSorted((a, b) => a.id!.localeCompare(b.id!)),
  };
}
