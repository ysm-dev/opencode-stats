import { expect, it } from "vitest";
import { decode, encode } from "./index.ts";
import { syntheticCopy } from "./testing/index.ts";

const step = { start: 1, input: 2, cacheRead: null, cacheWrite: 0, output: 3, reasoning: null };
const name = { dimension: "model", code: 7, id: "provider/model", name: "A model 🌍" };

it("carries stable IDs, new names and tombstones in the same zero-copy format as whole facts", () => {
  const copy = syntheticCopy([step], {
    kind: "changes",
    fromRevision: 3,
    revision: 5,
    ids: ["msg-rewritten"],
    tombstones: ["msg-deleted"],
    names: [name],
  });
  const bytes = encode(copy);
  expect(decode(bytes)).toEqual(copy);
  expect(decode(bytes).steps.input.buffer).toBe(bytes);
});

it("represents changes since revision zero distinctly from a whole copy", () => {
  const copy = syntheticCopy([], { kind: "changes", fromRevision: 0, tombstones: ["deleted"] });
  expect(decode(encode(copy))).toEqual(copy);
});

it.each([
  { ids: [] },
  { ids: [""] },
  { kind: "changes" as const, tombstones: ["step-0"] },
  { kind: "whole" as const, fromRevision: 1 },
  { tombstones: ["deleted"] },
])("rejects inconsistent fact identity or whole-copy metadata: %j", (header) => {
  expect(() => encode(syntheticCopy([step], header))).toThrow(/ID|revision/);
});

it.each(
  [
    [{ ...name, dimension: "" }],
    [{ ...name, id: "" }],
    [name, name],
    [{ ...name, code: -1 }],
    [{ ...name, code: 0.5 }],
    [{ ...name, code: 0x100000000 }],
  ].map((names) => ({ names })),
)("rejects malformed or duplicate name codes: %j", ({ names }) => {
  expect(() => encode(syntheticCopy([], { names }))).toThrow(/name|dimension/);
});

it("rejects duplicate row IDs", () => {
  expect(() => encode(syntheticCopy([step, step], { ids: ["same", "same"] }))).toThrow("IDs");
});

it("validates every variable-length field before exposing columns", () => {
  const bytes = encode(syntheticCopy([step]));
  new DataView(bytes).setUint32(144, 0xffffffff, true);
  expect(() => decode(bytes)).toThrow("string lengths");
  const malformed = encode(syntheticCopy([step])).slice(0, -1);
  new DataView(malformed).setUint32(76, malformed.byteLength, true);
  new DataView(malformed).setUint32(80, malformed.byteLength - 144, true);
  expect(() => decode(malformed)).toThrow("string lengths");
  const trailing = encode(syntheticCopy([], { names: [name] }));
  new DataView(trailing).setUint32(88, 0, true);
  expect(() => decode(trailing)).toThrow("string lengths");
});
