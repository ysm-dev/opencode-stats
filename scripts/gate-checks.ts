import type { Check } from "./verify-gates.ts";
import { manifestChecks } from "./gate-manifest-checks.ts";
import { lintChecks } from "./gate-lint-checks.ts";
import { exceptionChecks } from "./gate-exception-checks.ts";
import { shapeChecks } from "./gate-shape-checks.ts";
import { scopeChecks } from "./gate-scope-checks.ts";
import { hookChecks } from "./gate-hook-checks.ts";
import { runtimeChecks } from "./gate-runtime-checks.ts";
import { contractChecks } from "./gate-contract-checks.ts";
import { countingChecks } from "./gate-counting-checks.ts";
import { nativeChecks } from "./gate-native-checks.ts";

const repeat = (count: number, make: (index: number) => string): string =>
  `${Array.from({ length: count }, (_, index) => make(index)).join("\n")}\n`;

const source = "packages/dashboard/src/gate-canary";
const mutation = "export const increase = (n: number): number => n + 1;\n";

const mutationTest = (extension: string, assertion: string): string =>
  `import { describe, expect, it } from "vitest";\nimport { increase } from "./gate-canary.${extension}";\ndescribe("gate mutant", () => { it("increments", () => { expect(increase(1)).${assertion}; }); });\n`;

const duplicate = (name: string): string =>
  `const compute = (n: number): number => n * 2;\nexport const ${name} = (): void => {\n${repeat(30, (i) => `  const value${i} = compute(${i}) + compute(${i + 1});`)}};\n`;

const lintCheck = (extension: string, gate: string, content: string, rule: string): Check => ({
  gate: `${gate} (${extension})`,
  files: { [`${source}.${extension}`]: content },
  command: ["lint", `${source}.${extension}`],
  expect: [rule],
});

function* allChecks(): Generator<Check> {
  yield {
    gate: "CI shards are exhaustive and disjoint",
    files: {},
    command: ["scripts/testing/shards.ts"],
    expect: ["Shards are exhaustive, disjoint and reject invalid input."],
    accepts: true,
  };
  yield* contractChecks();
  yield* hookChecks();
  yield* shapeChecks();
  for (const extension of ["ts", "tsx"]) {
    yield* nativeChecks(extension);
    yield* countingChecks(extension);
    yield* runtimeChecks(extension);
    yield* scopeChecks(extension);
    yield* exceptionChecks(extension);
    yield* lintChecks(extension);
    yield* manifestChecks(extension);
    const file = `${source}.${extension}`;
    yield lintCheck(
      extension,
      "cyclomatic complexity",
      `export const tangled = (n: number): number => {\n${repeat(21, (i) => `  if (n === ${i}) { return ${i}; }`)}  return -1;\n};\n`,
      "cyclomatic complexity",
    );
    yield lintCheck(
      extension,
      "cognitive complexity",
      `export const nested = (n: number): number => {\n${"if (n > 0) {\n".repeat(7)} return 1;\n${"}\n".repeat(7)} return 0;\n};\n`,
      "Cognitive Complexity",
    );
    yield lintCheck(
      extension,
      "file length",
      repeat(520, (i) => `export const v${i} = ${i};`),
      "max-lines",
    );
    yield lintCheck(
      extension,
      "any ban",
      "export const loose = (v: any): any => v;\n",
      "no-explicit-any",
    );
    yield lintCheck(
      extension,
      "unknown boundary",
      "export const wide = (v: unknown): number => Number(v);\n",
      "no-restricted-types",
    );
    yield {
      gate: `coverage (${extension})`,
      files: { [file]: mutation },
      command: ["test"],
      expect: ["does not meet", `gate-canary.${extension}`],
    };
    yield {
      gate: `dead code (${extension})`,
      files: { [file]: "export const orphan = 1;\n" },
      command: ["knip"],
      expect: ["Unused files", `gate-canary.${extension}`],
    };
    yield {
      gate: `duplication (${extension})`,
      files: { [file]: duplicate("a"), [`${source}-b.${extension}`]: duplicate("b") },
      command: ["dup"],
      expect: ["Clone found"],
    };
    yield {
      gate: `surviving describe-nested mutant (${extension})`,
      files: {
        [file]: mutation,
        [`${source}.test.${extension}`]: mutationTest(extension, 'toBeTypeOf("number")'),
      },
      command: ["mutate"],
      expect: ["Survived", `gate-canary.${extension}`, "under breaking threshold"],
    };
    yield {
      gate: `killed describe-nested mutant (${extension})`,
      files: {
        [file]: mutation,
        [`${source}.test.${extension}`]: mutationTest(extension, "toBe(2)"),
      },
      command: ["mutate"],
      expect: ["100.00"],
      accepts: true,
    };
  }
}

export function* checks(): Generator<Check> {
  for (const check of allChecks()) {
    if (check.command[0] !== "mutate") {
      yield check;
      continue;
    }
    // A killed positive control prevents excluded/waived canaries passing with no mutants.
    const control = `${source}-control`;
    yield {
      ...check,
      files: {
        ...check.files,
        [`${control}.ts`]: mutation,
        [`${control}.test.ts`]: mutationTest("ts", "toBe(2)").replace(
          '"./gate-canary.ts"',
          '"./gate-canary-control.ts"',
        ),
      },
      command: ["mutate", "stryker.canary.config.js"],
      expect: [...check.expect, "gate-canary-control.ts"],
    };
  }
}
