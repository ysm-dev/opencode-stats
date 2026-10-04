import type { Check } from "./verify-gates.ts";

export function* contractChecks(): Generator<Check> {
  const adapter = "packages/dashboard-server/src/gate-canary.bun.ts";
  const contract = "packages/dashboard-server/src/gate-canary.bun.contract.test.ts";
  const files = { [adapter]: "export const canary = 1;\n" };
  yield {
    gate: "Bun adapter without a contract",
    files,
    command: ["contracts"],
    expect: ["missing contract", adapter],
  };
  yield {
    gate: "empty Bun contract",
    files: { ...files, [contract]: "export const empty = 1;\n" },
    command: ["contracts"],
    expect: ["empty contract", contract],
  };
  yield {
    gate: "printed pass text cannot disguise an empty Bun contract",
    files: { ...files, [contract]: 'process.stderr.write(" 1 pass\\n");\n' },
    command: ["contracts"],
    expect: ["empty contract", contract],
  };
  yield {
    gate: "failing Bun contract",
    files: {
      ...files,
      [contract]:
        'import { it, expect } from "bun:test";\nit("canary", () => { expect(1).toBe(2); });\n',
    },
    command: ["contracts"],
    expect: ["failing contract", contract],
  };
  yield {
    gate: "skipped tests do not make a Bun contract nonempty",
    files: {
      ...files,
      [contract]: 'import { it } from "bun:test";\nit.skip("canary", () => {});\n',
    },
    command: ["contracts"],
    expect: ["empty contract", contract],
  };
}
