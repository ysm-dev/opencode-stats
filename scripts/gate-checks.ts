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
import { budgetChecks } from "./gate-budget-checks.ts";
import { shard } from "./shard.ts";

const repeat = (count: number, make: (index: number) => string): string =>
  `${Array.from({ length: count }, (_, index) => make(index)).join("\n")}\n`;

const source = "packages/dashboard/src/gate-canary";
const uncovered = "export const increase = (n: number): number => n + 1;\n";

const duplicate = (name: string): string =>
  `const compute = (n: number): number => n * 2;\nexport const ${name} = (): void => {\n${repeat(30, (i) => `  const value${i} = compute(${i}) + compute(${i + 1});`)}};\n`;

const lintCheck = (extension: string, gate: string, content: string, rule: string): Check => ({
  gate: `${gate} (${extension})`,
  files: { [`${source}.${extension}`]: content },
  command: ["lint", `${source}.${extension}`],
  expect: [rule],
});

function* allChecks(): Generator<Check> {
  yield* budgetChecks();
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
      files: { [file]: uncovered },
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
  }
}

export function* checks(): Generator<Check> {
  // Stable command/name order makes equal-cost partition ties reproducible.
  yield* [...allChecks()].toSorted(
    (left, right) =>
      left.command.join(" ").localeCompare(right.command.join(" ")) ||
      left.gate.localeCompare(right.gate),
  );
}

// Hosted run 37528952961: full coverage canaries cost 36–49s; the real
// process-cleanup control costs 17.4s. Keep those apart, without adding runners.
const costs: Readonly<Record<string, number>> = {
  "scripts/testing/time-budgets.ts": 18,
  "scripts/testing/verification.ts": 3,
  "scripts/testing/e2e-preparation.ts": 3,
  "scripts/testing/ci.ts": 2,
  typecheck: 5,
  contracts: 3,
  knip: 2,
  "format:check": 1.5,
  lint: 1,
};
const cost = (check: Check): number => {
  if (check.command[0] === "test") return check.command.length === 1 ? 50 : 4;
  return costs[check.command.join(" ")] ?? costs[check.command[0] ?? ""] ?? 0.1;
};

export function verificationShard(value: string | undefined): readonly Check[] {
  const items = [...checks()];
  shard([], value);
  if (value === undefined) return items;
  const [index = 0, count = 0] = value.split("/").map(Number);
  const groups = Array.from(
    { length: count },
    (): { items: Check[]; seconds: number; commands: Map<string, number> } => ({
      items: [],
      seconds: 0,
      commands: new Map(),
    }),
  );
  for (const check of items.toSorted((left, right) => cost(right) - cost(left))) {
    const command = check.command[0] ?? "";
    const minimum = Math.min(...groups.map((group) => group.commands.get(command) ?? 0));
    const candidates = groups.filter((group) => (group.commands.get(command) ?? 0) === minimum);
    const group = candidates.reduce((least, next) => (next.seconds < least.seconds ? next : least));
    group.items.push(check);
    group.seconds += cost(check);
    group.commands.set(command, minimum + 1);
  }
  return groups[index - 1]!.items;
}
