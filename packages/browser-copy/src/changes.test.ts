import { expect, it } from "vitest";
import { decode, encode } from "./index.ts";
import { syntheticCopy } from "./testing/index.ts";
import { formatFixture } from "./testing/format-fixture.ts";

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

it("round-trips session/project facts and their deletions as zero-copy columns", () => {
  const copy = formatFixture();
  const bytes = encode(copy);
  const decoded = decode(bytes);
  expect(decoded).toEqual(copy);
  expect(decoded.sessions.parent.buffer).toBe(bytes);
  expect(decoded.projects.buffer).toBe(bytes);
  expect(decoded.sessionTombstones.buffer).toBe(bytes);
});

it.each([-1, Infinity, 0.5, 0x100000000])("rejects invalid dimension codes %s", (code) => {
  const copy = formatFixture();
  expect(() =>
    encode({ ...copy, steps: { ...copy.steps, project: new Float64Array([code]) } }),
  ).toThrow("dimension code");
});

it.each(["code", "session", "project"] as const)("requires the session %s code", (field) => {
  const copy = formatFixture();
  expect(() =>
    encode({ ...copy, sessions: { ...copy.sessions, [field]: new Float64Array([NaN]) } }),
  ).toThrow("required code");
});

it("rejects inconsistent session columns, duplicate codes, overlaps and whole-copy dimension tombstones", () => {
  const copy = formatFixture();
  expect(() =>
    encode({ ...copy, sessions: { ...copy.sessions, fork: new Float64Array() } }),
  ).toThrow("session columns");
  expect(() => encode({ ...copy, projects: new Float64Array([6, 6]) })).toThrow("fact code");
  expect(() => encode({ ...copy, sessionTombstones: new Float64Array([5]) })).toThrow("fact code");
  expect(() => encode({ ...copy, projectTombstones: new Float64Array([NaN]) })).toThrow(
    "required code",
  );
  expect(() => encode({ ...copy, kind: "whole", fromRevision: 0 })).toThrow("revision range");
  expect(() =>
    encode({ ...copy, kind: "whole", fromRevision: 0, sessionTombstones: new Float64Array() }),
  ).toThrow("revision range");
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
  new DataView(bytes).setUint32(216, 0xffffffff, true);
  expect(() => decode(bytes)).toThrow("string lengths");
  const malformed = encode(syntheticCopy([step])).slice(0, -1);
  new DataView(malformed).setUint32(76, malformed.byteLength, true);
  new DataView(malformed).setUint32(80, malformed.byteLength - 216, true);
  expect(() => decode(malformed)).toThrow("string lengths");
  const trailing = encode(syntheticCopy([], { names: [name] }));
  new DataView(trailing).setUint32(88, 0, true);
  expect(() => decode(trailing)).toThrow("string lengths");
});
