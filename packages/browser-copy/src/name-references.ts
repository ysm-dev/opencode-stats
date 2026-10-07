import type { BrowserCopy, DimensionName } from "./facts.ts";

// Changes can refer to names from an earlier revision. Their consumer supplies
// the accumulated registry; a whole copy supplies only its own names.
export function validateFactNames(copy: BrowserCopy, names: Iterable<DimensionName>): void {
  const known = new Set([...names].map((name) => `${name.dimension}\0${name.code}`));
  for (const code of copy.tools.tool) requireName(known, "tool", code);
  for (const [index, code] of copy.steps.error.entries()) {
    if (!Number.isNaN(code) || copy.steps.failed[index] === 1) requireName(known, "error", code);
  }
}

function requireName(known: ReadonlySet<string>, dimension: "tool" | "error", code: number): void {
  if (!known.has(`${dimension}\0${code}`))
    throw new Error(`Invalid browser copy ${dimension} name reference`);
}
