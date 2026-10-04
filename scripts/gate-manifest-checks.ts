import exceptions from "../quality-exceptions.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export const withWaiver = (path: string, gates = ["coverage", "mutation"]): string =>
  JSON.stringify([...exceptions, { path, gates, reason: "Temporary verifier canary" }]);

export function* manifestChecks(extension: string): Generator<Check> {
  const listed = `packages/duration/src/gate-canary-waived.${extension}`;
  const unlisted = `packages/duration/src/gate-canary-neighbour.${extension}`;
  const content = "export const increase = (n: number): number => n + 1;\n";
  const manifest = withWaiver(listed);
  for (const command of ["test", "mutate"]) {
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
      expect: [
        command === "test" ? "does not meet" : "NoCoverage",
        `gate-canary-neighbour.${extension}`,
      ],
    };
  }
}
