import { expect, it } from "vitest";
import { encode, decode } from "./index.ts";
import { formatFixture, syntheticCopy } from "./testing/index.ts";

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
  expect(() => encode({ ...copy, toolIds: [copy.ids[0], ...copy.toolIds.slice(1)] })).toThrow(
    "fact IDs",
  );
});

it("rejects whole copies with dangling tool names instead of passing an unsafe code to the engine", () => {
  const fixture = formatFixture();
  const whole = syntheticCopy([], {
    tools: fixture.tools,
    toolIds: fixture.toolIds,
    names: fixture.names,
  });
  expect(() =>
    encode({ ...whole, names: whole.names.filter((name) => name.dimension !== "tool") }),
  ).toThrow("tool name reference");
  const bytes = encode(whole);
  decode(bytes).tools.tool[0] = 999;
  expect(() => decode(bytes)).toThrow("tool name reference");
});

it("rejects dangling recorded step-error names at the same whole-copy boundary", () => {
  const fixture = formatFixture();
  const whole = {
    ...fixture,
    kind: "whole" as const,
    fromRevision: 0,
    sessionTombstones: new Float64Array(),
    projectTombstones: new Float64Array(),
  };
  expect(() =>
    encode({ ...whole, names: whole.names.filter((name) => name.dimension !== "error") }),
  ).toThrow("error name reference");
  const bytes = encode(whole);
  decode(bytes).steps.error[0] = 999;
  expect(() => decode(bytes)).toThrow("error name reference");
  const missing = encode(whole);
  const columns = decode(missing).steps;
  columns.error[0] = NaN;
  expect(() => decode(missing)).toThrow("error name reference");
  columns.failed[0] = 0;
  expect(decode(missing).steps.error[0]).toBeNaN();
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
