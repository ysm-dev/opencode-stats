import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { TOML, YAML } from "bun";
import root from "../package.json" with { type: "json" };
import mutation from "../stryker.config.js";
import { narrowJson, object } from "./json.ts";
import { testTimeouts } from "./test-timeouts.ts";
import { TIME_BUDGET_MS } from "./time-budget.ts";

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: dynamically loaded Vitest configuration
const checkTestConfig = (value: unknown): void => {
  if (typeof value !== "object" || value === null || !("default" in value))
    throw new Error("Missing test config");
  const config = value.default;
  if (typeof config !== "object" || config === null || !("test" in config))
    throw new Error("Missing test time budgets");
  const settings = config.test;
  if (typeof settings !== "object" || settings === null)
    throw new Error("Missing test time budgets");
  for (const key of ["testTimeout", "hookTimeout", "teardownTimeout"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(settings, key);
    if (!descriptor) throw new Error(`Missing ${key} time budget`);
    const timeout = narrowJson(descriptor.value);
    if (typeof timeout !== "number" || !(timeout > 0 && timeout <= TIME_BUDGET_MS))
      throw new Error(`Invalid ${key} time budget`);
  }
  if (
    !("globalSetup" in settings) ||
    !Array.isArray(settings.globalSetup) ||
    !settings.globalSetup.includes(testTimeouts.globalSetup[0])
  )
    throw new Error("Missing whole-run test time budget");
};

assert.equal(TIME_BUDGET_MS, 300_000, "The time budget must be five minutes");
const workflow = object(narrowJson(YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8"))));
for (const [name, job] of Object.entries(object(workflow["jobs"])))
  assert.equal(object(job)["timeout-minutes"], 5, `CI job ${name} needs a five-minute timeout`);
const steps = object(object(workflow["jobs"])["gates"])["steps"];
assert.ok(Array.isArray(steps), "Quality gates must enforce the end-to-end time budget");
assert.ok(
  steps.some((step) => {
    const command = object(step)["run"];
    return (
      typeof command === "string" &&
      command.includes("scripts/ci-duration.ts") &&
      command.includes("attempts/$GITHUB_RUN_ATTEMPT")
    );
  }),
  "Quality gates must enforce the end-to-end time budget",
);
const bun = object(narrowJson(TOML.parse(readFileSync("bunfig.toml", "utf8"))));
assert.equal(object(bun["test"])["timeout"], 5000, "Bun test timeout must stay at five seconds");
for (const name of ["test", "mutate", "contracts", "e2e"] as const)
  assert.ok(
    root.scripts[name].includes("scripts/time-budget.ts"),
    `${name} needs a whole-run watchdog`,
  );
assert.equal(mutation.dryRunTimeoutMinutes, 1, "Mutation dry run must finish within one minute");
assert.equal(mutation.timeoutMS, 5000, "Mutation test timeout must stay at five seconds");
for (const file of globSync(["vitest.config.ts", "packages/*/vitest.config.ts"])) {
  checkTestConfig(await import(pathToFileURL(resolve(file)).href));
}
process.stdout.write("Five-minute time budgets are enforced.\n");
