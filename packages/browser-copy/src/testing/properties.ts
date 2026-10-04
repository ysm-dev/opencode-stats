import * as fc from "fast-check";
import { randomBytes } from "node:crypto";
import { syntheticCopy } from "./synthetic.ts";

const amount = fc.option(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), { nil: null });
export const syntheticSteps = fc.array(
  fc.record({
    start: fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
    input: amount,
    cacheRead: amount,
    cacheWrite: amount,
    output: amount,
    reasoning: amount,
  }),
  { maxLength: 100 },
);

export const syntheticCopies = fc
  .tuple(
    syntheticSteps,
    fc.uuid(),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: -8_640_000_000_000_000, max: 8_640_000_000_000_000 }),
  )
  .map(([steps, generation, fromRevision, increment, historyCompleteFrom]) =>
    syntheticCopy(steps, {
      generation,
      fromRevision,
      revision: fromRevision + increment,
      historyCompleteFrom,
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
