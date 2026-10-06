import { expect, it } from "vitest";
import * as fc from "fast-check";
import { createHash } from "node:crypto";
import { decode, encode, formatVersion } from "./index.ts";
import { propertyParameters, syntheticCopies, syntheticCopy } from "./testing/index.ts";
import { formatFixture } from "./testing/format-fixture.ts";

it("round-trips step facts with all five token kinds without copying columns", () => {
  const copy = syntheticCopy([
    { start: 123, input: 1, cacheRead: 2, cacheWrite: 3, output: 4, reasoning: 5 },
  ]);
  const bytes = encode(copy);
  const decoded = decode(bytes);
  expect(decoded).toEqual(copy);
  expect(decoded.steps.input.buffer).toBe(bytes);
});

it("round-trips every synthetic copy exactly", () => {
  fc.assert(
    fc.property(syntheticCopies, (copy) => {
      expect(decode(encode(copy))).toEqual(copy);
    }),
    propertyParameters,
  );
});

it("rejects every truncation and extra bytes before constructing a column", () => {
  const bytes = encode(
    syntheticCopy([
      { start: 0, input: null, cacheRead: 0, cacheWrite: 3, output: 4, reasoning: 5 },
    ]),
  );
  for (let length = 0; length < bytes.byteLength; length++)
    expect(() => decode(bytes.slice(0, length))).toThrow(/header|lengths/);
  expect(() => decode(new ArrayBuffer(bytes.byteLength + 8))).toThrow("magic");
  const extra = new Uint8Array(bytes.byteLength + 8);
  extra.set(new Uint8Array(bytes));
  expect(() => decode(extra.buffer)).toThrow("lengths");
});

it.each([
  [0, 0, "magic"],
  [4, 4, "format version"],
  [44, 2, "reserved"],
  [72, 0xffffffff, "lengths"],
  [76, 0, "lengths"],
  [80, 1, "lengths"],
  [84, 1, "lengths"],
  [88, 1, "lengths"],
  [92, 1, "reserved"],
  [96, 1, "lengths"],
  [100, 1, "lengths"],
  [104, 1, "lengths"],
  [108, 1, "lengths"],
])("rejects malformed header at byte %i", (offset, value, message) => {
  const bytes = encode(syntheticCopy([]));
  new DataView(bytes).setUint32(offset, value, true);
  expect(() => decode(bytes)).toThrow(message);
});

it("rejects nonbinary input", () => {
  expect(() => decode("not binary")).toThrow("header");
});

it("pins the format version to a fixed synthetic encoding", () => {
  const bytes = encode(formatFixture());
  const fingerprints: Readonly<Record<number, string>> = {
    1: "df5cbbf9f8b1502a42950ad07c1b24e75ff8efd80041b1f789a8a6ad3240a025",
    2: "72f359659e1d6c1b6b75cceb3c247e8c8b6e56676519c9707b69bdb11185878e",
    3: "88d2bb6ab7a87f4efb60978228b9b607c3958ac8eb3fdfea6ab6e274a26ae6d6",
  };
  expect(
    createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    "change the format version",
  ).toBe(fingerprints[formatVersion]);
});

it.each([
  [48, -1, "revision range"],
  [48, 1.5, "revision range"],
  [48, Infinity, "revision range"],
  [56, -1, "revision range"],
  [56, 0.5, "revision range"],
  [56, Infinity, "revision range"],
  [64, NaN, "history-complete"],
  [64, 0.5, "history-complete"],
])("rejects invalid metadata at byte %i with %s", (offset, value, message) => {
  const bytes = encode(syntheticCopy([]));
  new DataView(bytes).setFloat64(offset, value, true);
  expect(() => decode(bytes)).toThrow(message);
});

it("rejects corrupted generation bytes", () => {
  const bytes = encode(syntheticCopy([]));
  new Uint8Array(bytes)[8] = 0xff;
  expect(() => decode(bytes)).toThrow("generation");
});

it.each([
  "short",
  "z1234567-89ab-cdef-0123-456789abcdef",
  "İ1234567-89ab-cdef-0123-456789abcdef",
  "x01234567-89ab-cdef-0123-456789abcdef",
  "01234567-89ab-cdef-0123-456789abcdefx",
])("refuses an invalid generation %s without truncating it", (generation) => {
  expect(() => encode(syntheticCopy([], { generation }))).toThrow("generation");
});

it.each([NaN, Infinity, 0.5])("refuses invalid step instant %s", (start) => {
  expect(() =>
    encode(
      syntheticCopy([{ start, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }]),
    ),
  ).toThrow("instant");
});

it.each([-1, Infinity, 0.5])("refuses invalid tokens %s", (input) => {
  expect(() =>
    encode(
      syntheticCopy([{ start: 0, input, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }]),
    ),
  ).toThrow("tokens");
});

it("refuses inconsistent columns", () => {
  const copy = syntheticCopy([]);
  expect(() =>
    encode({ ...copy, steps: { ...copy.steps, reasoning: new Float64Array([1]) } }),
  ).toThrow("columns");
});

it("refuses a copy whose columns exceed the format's byte limit before allocating", () => {
  const copy = syntheticCopy([]);
  Object.defineProperty(copy.steps.start, "length", { value: 0xffffffff });
  expect(() => encode(copy)).toThrow("format length");
});
