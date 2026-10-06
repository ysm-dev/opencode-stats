import { expect, it } from "vitest";
import { encode, decode } from "./index.ts";
import { formatFixture } from "./testing/index.ts";

it("round-trips calls and NULL timing/outcome fields as zero-copy columns", () => {
  const copy = formatFixture();
  const bytes = encode(copy);
  const result = decode(bytes);
  expect(result).toEqual(copy);
  expect(result.tools.start.buffer).toBe(bytes);
  expect(result.tools.runStart[0]).toBe(200);
  expect(result.tools.runStart[1]).toBeNaN();
  expect(result.tools.outcome[2]).toBeNaN();
});

it("rejects inconsistent call columns and identities before accepting a copy", () => {
  const copy = formatFixture();
  expect(() => encode({ ...copy, toolIds: [] })).toThrow("tool IDs");
  expect(() => encode({ ...copy, tools: { ...copy.tools, outcome: new Float64Array() } })).toThrow(
    "tool columns",
  );
  expect(() => encode({ ...copy, toolIds: [copy.ids[0]!, ...copy.toolIds.slice(1)] })).toThrow(
    "fact IDs",
  );
});

it.each([0, 4, -1, Infinity, 1.5])("rejects invalid tool outcome %s", (outcome) => {
  const copy = formatFixture();
  copy.tools.outcome[0] = outcome;
  expect(() => encode(copy)).toThrow("tool outcome");
});

it.each(["start", "runStart", "completed"] as const)("rejects invalid tool %s", (field) => {
  const copy = formatFixture();
  copy.tools[field][0] = Infinity;
  expect(() => encode(copy)).toThrow("instant");
});

it("rejects invalid tool dimension codes", () => {
  const copy = formatFixture();
  copy.tools.tool[0] = -1;
  expect(() => encode(copy)).toThrow("dimension code");
  copy.tools.tool[0] = NaN;
  expect(() => encode(copy)).toThrow("required code");
});
