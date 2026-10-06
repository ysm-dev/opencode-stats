import { expect, it } from "vitest";
import { decode, encode } from "./index.ts";
import { syntheticCopy } from "./testing/index.ts";

const base = { start: 0, input: 1, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
it("round-trips fractional recorded cost, explicit free prices and unpriced steps separately", () => {
  const copy = syntheticCopy([
    { ...base, recordedCost: 1.25, estimatedCost: 0 },
    { ...base, recordedCost: 0, estimatedCost: null },
    { ...base, recordedCost: null, estimatedCost: 0.0000001 },
  ]);
  expect(decode(encode(copy))).toEqual(copy);
});
it.each(["recordedCost", "estimatedCost"] as const)(
  "rejects negative or non-finite %s at the binary trust boundary",
  (field) => {
    for (const value of [-1, Infinity, -Infinity])
      expect(() => encode(syntheticCopy([{ ...base, [field]: value }]))).toThrow("cost");
  },
);
