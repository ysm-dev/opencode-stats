import { expect, it } from "vitest";
import { encode, decode } from "./index.ts";
import { formatFixture, syntheticCopy } from "./testing/index.ts";

it("keeps recorded instants, missing timings, error codes and unassigned prompts distinct in the binary copy", () => {
  const copy = formatFixture();
  const bytes = encode(copy);
  const decoded = decode(bytes);
  expect(decoded).toEqual(copy);
  expect([...decoded.steps.streamEnd]).toEqual([234, NaN, 789]);
  expect([...decoded.steps.completed]).toEqual([345, 567, NaN]);
  expect([...decoded.steps.error]).toEqual([10, 11, NaN]);
  expect([...decoded.steps.failed]).toEqual([1, 0, 0]);
  expect([...decoded.steps.interrupted]).toEqual([0, 1, 0]);
  expect([...decoded.prompts.model]).toEqual([2, NaN]);
  expect(decoded.prompts.start.buffer).toBe(bytes);
});

it.each(["failed", "interrupted"] as const)("rejects an invalid counted %s flag", (field) => {
  const copy = formatFixture();
  for (const value of [-1, 2, NaN])
    expect(() =>
      encode({
        ...copy,
        steps: { ...copy.steps, [field]: Float64Array.from(copy.steps[field], () => value) },
      }),
    ).toThrow("outcome");
});

it.each(["streamEnd", "completed"] as const)(
  "rejects malformed %s instants while allowing missing and zero",
  (field) => {
    const base = {
      start: 0,
      input: null,
      cacheRead: null,
      cacheWrite: null,
      output: null,
      reasoning: null,
    };
    for (const value of [null, 0, -100])
      expect(decode(encode(syntheticCopy([{ ...base, [field]: value }]))).steps[field][0]).toBe(
        value ?? NaN,
      );
    for (const value of [Infinity, 0.5])
      expect(() => encode(syntheticCopy([{ ...base, [field]: value }]))).toThrow("instant");
  },
);

it("validates prompt identities, columns and scalar metadata at the decoder boundary", () => {
  const copy = formatFixture();
  expect(() => encode({ ...copy, promptIds: [] })).toThrow("prompt IDs");
  expect(() =>
    encode({ ...copy, prompts: { ...copy.prompts, model: new Float64Array() } }),
  ).toThrow("prompt columns");
  expect(() => encode({ ...copy, promptIds: [copy.ids[0], "other"] })).toThrow("fact IDs");
  expect(() =>
    encode({ ...copy, prompts: { ...copy.prompts, start: new Float64Array([NaN, 1]) } }),
  ).toThrow("instant");
  expect(() =>
    encode({ ...copy, prompts: { ...copy.prompts, model: new Float64Array([-1, NaN]) } }),
  ).toThrow("dimension code");
  expect(() =>
    encode({
      ...syntheticCopy([]),
      steps: { ...syntheticCopy([]).steps, error: new Float64Array([-1]) },
    }),
  ).toThrow("columns");
});
