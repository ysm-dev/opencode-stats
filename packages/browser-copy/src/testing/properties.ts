import * as fc from "fast-check";
import { randomBytes } from "node:crypto";
import { syntheticCopy } from "./synthetic.ts";
import { mapSessionFields, mapPromptFields, mapToolFields } from "../facts.ts";
import { syntheticNames } from "./names.ts";

const amount = fc.option(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), { nil: null });
const code = fc.integer({ min: 0, max: 0xfffffffe });
const optionalCode = fc.option(code, { nil: null });
const tokenStep = fc
  .record({
    start: fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
    input: amount,
    cacheRead: amount,
    cacheWrite: amount,
    output: amount,
    reasoning: amount,
    streamEnd: amount,
    completed: amount,
    error: optionalCode,
    failed: fc.integer({ min: 0, max: 1 }),
    interrupted: fc.integer({ min: 0, max: 1 }),
    recordedCost: fc.option(fc.double({ min: 0, max: 1000000, noNaN: true }), { nil: null }),
    estimatedCost: fc.option(fc.double({ min: 0, max: 1000000, noNaN: true }), { nil: null }),
  })
  .map((step) => ({
    ...step,
    // A counted failure always records an error; a missing error is not a failure.
    failed: step.error === null ? 0 : step.failed,
  }));
export const syntheticSteps = fc.array(tokenStep, { maxLength: 100 });
const dimensionStep = fc.record({
  provider: optionalCode,
  model: optionalCode,
  variant: optionalCode,
  agent: optionalCode,
  project: optionalCode,
  session: optionalCode,
  subagent: optionalCode,
});
const dimensionalSteps = fc.array(
  fc.tuple(tokenStep, dimensionStep).map(([step, dimensions]) => ({ ...step, ...dimensions })),
  { maxLength: 100 },
);
const toolCalls = fc.array(
  fc
    .tuple(
      dimensionStep,
      fc.record({
        start: fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
        runStart: amount,
        completed: amount,
        tool: code,
        outcome: fc.option(fc.constantFrom(1, 2, 3), { nil: null }),
      }),
    )
    .map(([dimensions, call]) => ({ ...dimensions, ...call })),
  { maxLength: 25 },
);

export const syntheticCopies = fc
  .tuple(
    dimensionalSteps,
    fc.uuid(),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
    fc.uniqueArray(
      fc.record({
        dimension: fc.constantFrom(
          "provider",
          "model",
          "variant",
          "agent",
          "session",
          "project",
          "tool",
        ),
        code,
        id: fc.string({ minLength: 1 }),
        name: fc.string(),
      }),
      { selector: (name) => `${name.dimension}\0${name.code}` },
    ),
    fc.uniqueArray(
      fc.record({ code, parent: optionalCode, session: code, project: code, fork: optionalCode }),
      { selector: (session) => session.code },
    ),
    fc.uniqueArray(code),
    toolCalls,
  )
  .map(
    ([
      steps,
      generation,
      fromRevision,
      increment,
      historyCompleteFrom,
      names,
      sessions,
      projects,
      calls,
    ]) =>
      syntheticCopy(steps, {
        generation,
        fromRevision,
        revision: fromRevision + increment,
        historyCompleteFrom,
        names: [
          ...new Map(
            [...syntheticNames(steps, calls), ...names].map((name) => [
              `${name.dimension}\0${name.code}`,
              name,
            ]),
          ).values(),
        ],
        prompts: mapPromptFields((field) =>
          Float64Array.from(steps, (step) =>
            field === "start" ? step.start : (step[field] ?? NaN),
          ),
        ),
        promptIds: steps.map((_, index) => `prompt-${index}`),
        toolIds: calls.map((_, index) => `tool:${index}`),
        tools: mapToolFields((field) => Float64Array.from(calls, (call) => call[field] ?? NaN)),
        sessions: mapSessionFields((field) =>
          Float64Array.from(sessions, (session) => session[field] ?? NaN),
        ),
        projects: Float64Array.from(projects),
        sessionTombstones: Float64Array.from(fromRevision ? [0xffffffff] : []),
        projectTombstones: Float64Array.from(fromRevision ? [0xffffffff] : []),
      }),
  );

// fast-check includes the seed, replay path and shrunk input in its failure.
export const propertyParameters = {
  seed: Number(
    process.env["FC_SEED"] ??
      (process.env["GITHUB_EVENT_NAME"] === "schedule" ? randomBytes(4).readInt32LE() : 20261004),
  ),
  numRuns: 100,
};
process.stdout.write(`fast-check seed: ${propertyParameters.seed}\n`);
