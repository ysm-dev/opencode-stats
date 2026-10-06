import { tokenKinds, type BrowserCopy, type StepColumns } from "./facts.ts";
import { checkedLength, decodeStrings, encodeStrings } from "./strings.ts";

export const formatVersion = 2;
const headerLength = 96;
const columns = ["start", ...tokenKinds] as const;
const magic = 0x5354434f;

// Format 2: little endian, 96-byte header, then six Float64 columns and strings.
// Header: magic/u32, version/u32, generation/36 ASCII bytes, kind/u32,
// fromRevision/f64, revision/f64, historyCompleteFrom/f64, rows/u32, bytes/u32.
// Then strings bytes/u32, tombstone count/u32, name count/u32, reserved/u32.
// Length-prefixed UTF-16LE strings carry row IDs, tombstones and dimension names.
// Each column has exactly `rows` entries. NaN means an unrecorded token kind.
// All column lengths are checked before any column view is constructed.
// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: untrusted HTTP binary body
export function decode(input: unknown): BrowserCopy {
  if (!(input instanceof ArrayBuffer) || input.byteLength < headerLength) {
    throw new Error("Truncated browser copy header");
  }
  const header = new DataView(input);
  if (header.getUint32(0, true) !== magic) throw new Error("Invalid browser copy magic");
  if (header.getUint32(4, true) !== formatVersion)
    throw new Error("Unsupported browser copy format version");
  const kind = header.getUint32(44, true);
  if (kind > 1 || header.getUint32(92) !== 0) throw new Error("Invalid reserved header");
  const rows = header.getUint32(72, true);
  const stringOffset = headerLength + rows * columns.length * Float64Array.BYTES_PER_ELEMENT;
  const length = stringOffset + header.getUint32(80, true);
  if (length !== input.byteLength || header.getUint32(76, true) !== length) {
    throw new Error("Invalid browser copy lengths");
  }
  const generation = String.fromCharCode(...new Uint8Array(input, 8, 36));
  validateGeneration(generation);
  const fromRevision = header.getFloat64(48, true);
  const revision = header.getFloat64(56, true);
  if (
    !Number.isSafeInteger(fromRevision) ||
    fromRevision < 0 ||
    !Number.isSafeInteger(revision) ||
    revision < fromRevision
  ) {
    throw new Error("Invalid browser copy revision range");
  }
  const historyCompleteFrom = header.getFloat64(64, true);
  if (!Number.isSafeInteger(historyCompleteFrom))
    throw new Error("Invalid history-complete instant");
  const strings = decodeStrings(
    input,
    stringOffset,
    rows,
    header.getUint32(84, true),
    header.getUint32(88, true),
  );
  if (kind === 0 && (fromRevision !== 0 || strings.tombstones.length > 0))
    throw new Error("Invalid whole browser copy revision range");
  const column = (index: number): Float64Array =>
    new Float64Array(input, headerLength + index * rows * 8, rows);
  const steps: StepColumns = {
    start: column(0),
    input: column(1),
    cacheRead: column(2),
    cacheWrite: column(3),
    output: column(4),
    reasoning: column(5),
  };
  validateColumns(steps);
  return {
    kind: kind === 0 ? "whole" : "changes",
    generation,
    fromRevision,
    revision,
    historyCompleteFrom,
    steps,
    ...strings,
  };
}

function validateGeneration(generation: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(generation)) {
    throw new Error("Invalid browser copy generation");
  }
}

function validateColumns(steps: StepColumns): void {
  for (const start of steps.start) {
    if (!Number.isSafeInteger(start)) throw new Error("Invalid step instant");
  }
  for (const kind of tokenKinds) {
    for (const amount of steps[kind]) {
      if (!Number.isNaN(amount) && (!Number.isSafeInteger(amount) || amount < 0)) {
        throw new Error("Invalid step tokens");
      }
    }
  }
}

export function encode(copy: BrowserCopy): ArrayBuffer {
  const rows = copy.steps.start.length;
  const stringOffset = checkedLength(headerLength + rows * columns.length * 8);
  if (copy.ids.length !== rows) throw new Error("Inconsistent browser copy ID columns");
  const strings = encodeStrings(copy);
  const length = checkedLength(stringOffset + strings.length);
  validateGeneration(copy.generation);
  const buffer = new ArrayBuffer(length);
  const header = new DataView(buffer);
  header.setUint32(0, magic, true);
  header.setUint32(4, formatVersion, true);
  for (const [i, char] of copy.generation.split("").entries())
    header.setUint8(8 + i, char.charCodeAt(0));
  header.setUint32(44, copy.kind === "whole" ? 0 : 1, true);
  header.setFloat64(48, copy.fromRevision, true);
  header.setFloat64(56, copy.revision, true);
  header.setFloat64(64, copy.historyCompleteFrom, true);
  header.setUint32(72, rows, true);
  header.setUint32(76, length, true);
  header.setUint32(80, strings.length, true);
  header.setUint32(84, copy.tombstones.length, true);
  header.setUint32(88, copy.names.length, true);
  for (const [index, name] of columns.entries()) {
    const values = copy.steps[name];
    if (values.length !== rows) throw new Error("Inconsistent browser copy columns");
    for (const [row, value] of values.entries())
      header.setFloat64(headerLength + (index * rows + row) * 8, value, true);
  }
  new Uint8Array(buffer, stringOffset).set(strings);
  decode(buffer);
  return buffer;
}
