import { readFileSync } from "node:fs";
import root from "../package.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

function* nativeTourChecks(): Generator<Check> {
  for (const browser of ["chromium", "webkit"])
    for (const mode of ["whole-paint", "change-time"])
      for (const width of [360, 1280]) {
        const file = `packages/e2e/tests/${mode}-${browser}-${width}.test.ts`;
        yield {
          gate: `native tour registration cannot omit ${mode}/${browser}/${width}`,
          files: { [file]: readFileSync(file, "utf8").replace(`, ${width});`, ", 0);") },
          command: ["scripts/testing/e2e-plan.ts"],
          expect: ["Each mode/engine/viewport must register its complete tour"],
        };
      }
}

export function* budgetChecks(): Generator<Check> {
  yield* nativeTourChecks();
  yield {
    gate: "e2e workload plan is exhaustive and shared with preparation",
    files: {},
    command: ["scripts/testing/e2e-plan.ts"],
    expect: ["E2e shards are balanced, exhaustive and share preparation requirements."],
    accepts: true,
  };
  yield {
    gate: "e2e execution cannot silently use a different shard plan",
    files: {
      "packages/e2e/vitest.config.ts": readFileSync(
        "packages/e2e/vitest.config.ts",
        "utf8",
      ).replace("sequencer: BalancedE2eSequencer", "sequencer: undefined"),
    },
    command: ["scripts/testing/e2e-plan.ts"],
    expect: ["E2e must use the shared workload plan"],
  };
  yield {
    gate: "e2e execution cannot leave costly files until last",
    files: {
      "scripts/e2e-sequencer.ts": readFileSync("scripts/e2e-sequencer.ts", "utf8").replace(
        "compareE2e(left.moduleId, right.moduleId)",
        "left.moduleId.localeCompare(right.moduleId)",
      ),
    },
    command: ["scripts/testing/e2e-plan.ts"],
    expect: ["E2e execution must use workload order"],
  };
  yield {
    gate: "public e2e prepares native source assets before its runtimes",
    files: {
      "scripts/e2e.ts": readFileSync("scripts/e2e.ts", "utf8").replace(
        'await run(["bun", "run", "native:prepare"]);',
        "",
      ),
    },
    command: ["scripts/testing/e2e-preparation.ts"],
    expect: ["Native preparation must precede runtimes and tests"],
  };
  yield {
    gate: "platform proofs cannot omit an operating system",
    files: {
      ".github/workflows/ci.yml": readFileSync(".github/workflows/ci.yml", "utf8").replace(
        "${{ !matrix.shard || startsWith(matrix.shard, '1/') }}",
        "false",
      ),
    },
    command: ["scripts/testing/shards.ts"],
    expect: ["Platform proofs must run on every platform's first shard"],
  };
  yield {
    gate: "local verification shards own fixtures and cancel failed siblings",
    files: {},
    command: ["scripts/testing/verification.ts"],
    expect: ["Verification shards are exhaustive, isolated and cancel failed siblings."],
    accepts: true,
  };
  yield {
    gate: "local verification cannot silently omit its last shard",
    files: {
      "scripts/verification-shards.ts": readFileSync(
        "scripts/verification-shards.ts",
        "utf8",
      ).replace("next <= VERIFICATION_SHARDS", "next < VERIFICATION_SHARDS"),
    },
    command: ["scripts/testing/verification.ts"],
    expect: ["Missing verification shards"],
  };
  yield {
    gate: "public local CI has one aggregate deadline and fail-closed status",
    files: {},
    command: ["scripts/testing/ci.ts"],
    expect: ["Public CI shares one deadline, runs all gates in order and fails closed."],
    accepts: true,
  };
  yield {
    gate: "local CI cannot silently omit its final gate",
    files: {
      "scripts/ci.ts": readFileSync("scripts/ci.ts", "utf8").replace('["verify-gates"]', ""),
    },
    command: ["scripts/testing/ci.ts"],
    expect: ["AssertionError"],
  };
  yield {
    gate: "verification command families cannot silently cluster",
    files: {
      "scripts/gate-checks.ts": readFileSync("scripts/gate-checks.ts", "utf8").replace(
        "group.commands.set(command, minimum + 1);",
        "",
      ),
    },
    command: ["scripts/testing/shards.ts"],
    expect: ["Unbalanced verification command"],
  };
  yield {
    gate: "verification costly controls cannot share full coverage runs",
    files: {
      "scripts/gate-checks.ts": readFileSync("scripts/gate-checks.ts", "utf8").replace(
        "check.command.length === 1 ? 50 : 4",
        "check.command.length === 1 ? 0 : 4",
      ),
    },
    command: ["scripts/testing/shards.ts"],
    expect: ["Expensive cleanup controls must not share full coverage runs"],
  };
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
      '      - run: test "$CHECKS"',
      '      - uses: actions/checkout@v7\n      - run: test "$CHECKS"',
      "Quality gates must not have post-job actions after its deadline check",
    ],
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
  for (const name of ["ci", "ci:checks", "test", "release", "verify-gates"] as const) {
    yield {
      gate: `${name} command must retain its watchdog`,
      files: {
        "package.json": JSON.stringify({
          ...root,
          scripts: {
            ...root.scripts,
            [name]: root.scripts[name].replace("scripts/time-budget.ts ", ""),
          },
        }),
      },
      command: ["budgets"],
      expect: [`${name} needs a whole-run watchdog`],
    };
  }
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
      files:
        command === "e2e"
          ? {}
          : {
              "scripts/time-budget.ts": readFileSync("scripts/time-budget.ts", "utf8").replace(
                "300_000",
                "500",
              ),
              [`scripts/${preparation}-prepare.ts`]:
                'process.stdout.write("Preparation started\\n");\nsetInterval(() => {}, 1000);\n',
            },
      command: command === "e2e" ? ["scripts/testing/e2e-preparation.ts"] : [command],
      expect:
        command === "e2e"
          ? ["Public e2e preparation and tests share one deadline and clean up cold workloads."]
          : ["Preparation started", "exceeded its time budget"],
      ...(command === "e2e" ? { accepts: true } : {}),
    };
  }
  yield {
    gate: "public e2e cannot silently omit browser and OS preparation",
    files: {
      "scripts/e2e.ts": readFileSync("scripts/e2e.ts", "utf8").replace(
        "plan.browsers.length",
        "false",
      ),
    },
    command: ["scripts/testing/e2e-preparation.ts"],
    expect: ["Parallel e2e preparation did not complete"],
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
