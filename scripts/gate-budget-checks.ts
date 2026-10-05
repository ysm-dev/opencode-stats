import { readFileSync } from "node:fs";
import root from "../package.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export function* budgetChecks(): Generator<Check> {
  yield {
    gate: "time budgets terminate overdue commands",
    files: {},
    command: ["scripts/testing/time-budgets.ts"],
    expect: ["Time budgets reject overdue runs and terminate test workers."],
    accepts: true,
  };
  for (const [file, from, to, expect] of [
    [
      ".github/workflows/ci.yml",
      "scripts/ci-duration.ts",
      "scripts/not-a-duration-check.ts",
      "Quality gates must enforce the end-to-end time budget",
    ],
    [
      ".github/workflows/ci.yml",
      "timeout-minutes: 5",
      "timeout-minutes: 6",
      "needs a five-minute timeout",
    ],
    [".github/workflows/ci.yml", "timeout-minutes: 5", "", "needs a five-minute timeout"],
    ["bunfig.toml", "timeout = 5000", "timeout = 0", "Bun test timeout"],
    ["stryker.config.js", "dryRunTimeoutMinutes: 1", "dryRunTimeoutMinutes: 6", "Mutation dry run"],
    ["scripts/time-budget.ts", "300_000", "300_001", "The time budget must be five minutes"],
    [
      "packages/e2e/vitest.config.ts",
      "testTimeout: 30000",
      "testTimeout: 300001",
      "Invalid testTimeout time budget",
    ],
    [
      "packages/launcher/vitest.config.ts",
      "...testTimeouts,",
      "",
      "Missing testTimeout time budget",
    ],
  ] as const) {
    yield {
      gate: `time budget configuration: ${file} (${to || "removed"})`,
      files: { [file]: readFileSync(file, "utf8").replace(from, to) },
      command: ["budgets"],
      expect: [expect],
    };
  }
  yield {
    gate: "test command must retain its watchdog",
    files: {
      "package.json": JSON.stringify({
        ...root,
        scripts: { ...root.scripts, test: "vitest run --coverage" },
      }),
    },
    command: ["budgets"],
    expect: ["test needs a whole-run watchdog"],
  };
  for (const extension of ["ts", "tsx"]) {
    yield {
      gate: `direct Vitest invocation enforces its whole-run budget (${extension})`,
      files: {
        "scripts/time-budget.ts": readFileSync("scripts/time-budget.ts", "utf8").replace(
          "300_000",
          "50",
        ),
        "gate-canary.vitest.config.ts": `import { defineConfig } from "vitest/config";\nimport { testTimeouts } from "./scripts/test-timeouts.ts";\nexport default defineConfig({test: {...testTimeouts, include: ["scripts/testing/gate-canary.test.${extension}"]}});\n`,
        [`scripts/testing/gate-canary.test.${extension}`]:
          'import { it } from "vitest";\nit("exceeds the whole-run budget", () => new Promise(resolve => setTimeout(resolve, 2000)));\n',
      },
      command: ["vitest", "run", "--config", "gate-canary.vitest.config.ts"],
      expect: ["Five-minute test-run time budget exceeded"],
    };
  }
}
