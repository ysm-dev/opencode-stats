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
      "testTimeout: 30001",
      "Invalid testTimeout time budget",
    ],
    [
      "scripts/test-timeouts.ts",
      "testTimeout: 5_000",
      "testTimeout: 5_001",
      "Invalid testTimeout time budget",
    ],
    [
      "scripts/test-timeouts.ts",
      "hookTimeout: 10_000",
      "hookTimeout: 10_001",
      "Invalid hookTimeout time budget",
    ],
    [
      "scripts/test-timeouts.ts",
      "teardownTimeout: 10_000",
      "teardownTimeout: 10_001",
      "Invalid teardownTimeout time budget",
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
  for (const [command, preparation] of [
    ["e2e", "opencode"],
    ["contracts", "native"],
  ] as const) {
    yield {
      gate: `${command} preparation must be inside its watchdog`,
      files: {
        "package.json": JSON.stringify({
          ...root,
          scripts: {
            ...root.scripts,
            [command]: `bun run ${preparation}:prepare && ${root.scripts[command]}`,
          },
        }),
      },
      command: ["budgets"],
      expect: [`${command} needs a whole-run watchdog`],
    };
    yield {
      gate: `${command} preparation shares the test-run deadline`,
      files: {
        "scripts/time-budget.ts": readFileSync("scripts/time-budget.ts", "utf8").replace(
          "300_000",
          "500",
        ),
        [`scripts/${preparation}-prepare.ts`]:
          'process.stdout.write("Preparation started\\n");\nsetInterval(() => {}, 1000);\n',
      },
      command: [command],
      expect: ["Preparation started", "exceeded its time budget"],
    };
  }
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
