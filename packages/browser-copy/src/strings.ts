import type { BrowserCopy, DimensionName } from "./facts.ts";

export const checkedLength = (length: number): number => {
  if (length !== length >>> 0) throw new Error("Browser copy exceeds format length");
  return length;
};

export function encodeStrings(copy: BrowserCopy): Uint8Array {
  const parts: Uint8Array[] = [];
  const integer = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
      throw new Error("Invalid browser copy name code");
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    parts.push(bytes);
  };
  const string = (value: string) => {
    const bytes = new Uint8Array(checkedLength(value.length * 2));
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < value.length; index++)
      view.setUint16(index * 2, value.charCodeAt(index), true);
    integer(value.length);
    parts.push(bytes);
  };
  for (const id of [...copy.ids, ...copy.tombstones]) string(id);
  for (const value of copy.names) {
    string(value.dimension);
    integer(value.code);
    string(value.id);
    string(value.name);
  }
  const bytes = new Uint8Array(
    checkedLength(parts.reduce((length, part) => length + part.length, 0)),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function decodeStrings(
  input: ArrayBuffer,
  offset: number,
  rows: number,
  deleted: number,
  named: number,
) {
  const view = new DataView(input);
  const integer = () => {
    if (offset + 4 > input.byteLength) throw new Error("Invalid browser copy string lengths");
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const string = () => {
    const length = integer() * 2;
    if (offset + length > input.byteLength) throw new Error("Invalid browser copy string lengths");
    let value = "";
    for (let index = 0; index < length; index += 2)
      value += String.fromCharCode(view.getUint16(offset + index, true));
    offset += length;
    return value;
  };
  const ids: string[] = [];
  const tombstones: string[] = [];
  const names: DimensionName[] = [];
  for (let row = 0; row < rows; row++) ids.push(string());
  for (let row = 0; row < deleted; row++) tombstones.push(string());
  for (let row = 0; row < named; row++) {
    const dimension = string();
    const code = integer();
    const id = string();
    const name = string();
    if (!dimension || !id) throw new Error("Invalid browser copy dimension name");
    names.push({ dimension, code, id, name });
  }
  if (offset !== input.byteLength) throw new Error("Invalid browser copy string lengths");
  const identities = [...ids, ...tombstones];
  if (identities.some((id) => !id) || new Set(identities).size !== identities.length)
    throw new Error("Invalid browser copy fact IDs");
  const codes = names.map((value) => `${value.dimension}\0${value.code}`);
  if (new Set(codes).size !== codes.length)
    throw new Error("Duplicate browser copy dimension code");
  return { ids, tombstones, names };
}
