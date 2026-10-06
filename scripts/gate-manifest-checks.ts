import exceptions from "../quality-exceptions.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export const withWaiver = (path: string, gates = ["coverage"]): string =>
  JSON.stringify([...exceptions, { path, gates, reason: "Temporary verifier canary" }]);

export function* manifestChecks(extension: string): Generator<Check> {
  const listed = `packages/dashboard/src/gate-canary-waived.${extension}`;
  const unlisted = `packages/dashboard/src/gate-canary-neighbour.${extension}`;
  const content = "export const increase = (n: number): number => n + 1;\n";
  const manifest = withWaiver(listed);
  for (const command of ["test"]) {
    yield {
      gate: `manifest waives ${command} (${extension})`,
      files: { "quality-exceptions.json": manifest, [listed]: content },
      command: [command],
      expect: [],
      accepts: true,
    };
    yield {
      gate: `manifest does not waive neighbour ${command} (${extension})`,
      files: { "quality-exceptions.json": manifest, [listed]: content, [unlisted]: content },
      command: [command],
      expect: ["does not meet", `gate-canary-neighbour.${extension}`],
    };
  }
}
