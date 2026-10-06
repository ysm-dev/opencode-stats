import * as fc from "fast-check";
import { randomBytes } from "node:crypto";
import { syntheticCopy } from "./synthetic.ts";
import { mapSessionFields } from "../facts.ts";

const amount = fc.option(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), { nil: null });
const code = fc.integer({ min: 0, max: 0xfffffffe });
const optionalCode = fc.option(code, { nil: null });
const tokenStep = fc.record({
  start: fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
  input: amount,
  cacheRead: amount,
  cacheWrite: amount,
  output: amount,
  reasoning: amount,
});
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

export const syntheticCopies = fc
  .tuple(
    dimensionalSteps,
    fc.uuid(),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
    fc.uniqueArray(
      fc.record({
        dimension: fc.constantFrom("provider", "model", "variant", "agent", "session", "project"),
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
    ]) =>
      syntheticCopy(steps, {
        generation,
        fromRevision,
        revision: fromRevision + increment,
        historyCompleteFrom,
        names,
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
