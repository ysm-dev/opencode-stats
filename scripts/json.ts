import { readFileSync } from "node:fs";

export type Json = null | boolean | number | string | Json[] | { readonly [key: string]: Json };

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: parsed JSON from manifests and registry responses
export const narrowJson = (value: unknown): Json => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  if (Array.isArray(value)) return value.map(narrowJson);
  if (typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, narrowJson(item)]));
  throw new Error("Invalid JSON value");
};

export const readJson = (file: string): Json => narrowJson(JSON.parse(readFileSync(file, "utf8")));

export const object = (value: Json | undefined): { readonly [key: string]: Json } => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected JSON object");
  return value;
};

export const text = (value: Json | undefined): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected nonempty JSON string");
  return value;
};
