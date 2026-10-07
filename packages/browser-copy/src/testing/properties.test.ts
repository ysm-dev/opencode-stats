import { expect, it } from "vitest";
import { sample } from "fast-check";
import { propertyParameters, propertyPartitions, syntheticSteps } from "./properties.ts";

it("property partitions preserve every original seeded case once with bounded work per test", () => {
  expect(propertyPartitions.reduce((total, part) => total + part.numRuns, 0)).toBe(
    propertyParameters.numRuns,
  );
  expect(propertyPartitions.flatMap((part) => sample(syntheticSteps, part))).toEqual(
    sample(syntheticSteps, propertyParameters),
  );
});
