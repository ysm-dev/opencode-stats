import type { Check } from "./verify-gates.ts";

export function* runtimeChecks(extension: string): Generator<Check> {
  for (const [runtime, global] of [
    ["engine", "document"],
    ["browser-copy", "Bun"],
    ["browser-copy", "process"],
    ["browser-copy", "document"],
    ["engine", "Bun"],
    ["engine", "process"],
  ] as const) {
    const file = `packages/${runtime}/src/gate-canary.${extension}`;
    yield {
      gate: `${runtime} cannot use ${global} (${extension})`,
      files: { [file]: `export const forbiddenGlobal = ${global};\n` },
      command: ["typecheck"],
      expect: ["Cannot find name", global, `gate-canary.${extension}`],
    };
  }
}
