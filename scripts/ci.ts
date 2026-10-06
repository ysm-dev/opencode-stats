import process from "node:process";
import { fileURLToPath } from "node:url";
import { remainingBudget, runTimed } from "./time-budget.ts";

const started = performance.now();
const stages: Readonly<Record<string, readonly (readonly string[])[]>> = {
  ci: [["ci:checks"], ["contracts"], ["release"], ["e2e"], ["verify-gates"]],
  checks: [
    ["native:prepare"],
    ["format:check"],
    ["lint"],
    ["typecheck"],
    ["budgets"],
    ["test"],
    ["knip"],
    ["dup"],
    ["exceptions"],
    ["shape"],
    ["outdated"],
  ],
  typecheck: [
    ["turbo", "run", "typecheck"],
    ["tsc", "--noEmit", "-p", "tsconfig.json"],
  ],
  knip: [["./node_modules/.bin/knip"], ["./node_modules/.bin/knip", "--production", "--strict"]],
  outdated: [["scripts/outdated.ts"], ["scripts/native-outdated.ts"]],
  dup: [["jscpd"]],
};
const mode = process.argv[2] ?? "ci";
const commands = stages[mode];
if (!commands) throw new Error("Unknown CI stage");
const env = { ...process.env };
// Full local CI always verifies every canary, independent of hosted selectors.
if (mode === "ci") delete env["VERIFICATION_SHARD"];
for (const command of commands) {
  // Resolve the pinned tools, not a global PATH executable. Static package
  // references also keep dependency analysis accurate through this watchdog.
  const [name, ...args] = command;
  const entry =
    name === "turbo"
      ? fileURLToPath(import.meta.resolve("turbo"))
      : name === "jscpd"
        ? fileURLToPath(import.meta.resolve("jscpd/run-jscpd.js"))
        : name!;
  const result = await runTimed(["bun", "run", entry, ...args], remainingBudget(started), { env });
  if (result.status !== 0)
    throw new Error(`CI ${command.join(" ")} failed (exit ${result.status})`);
}
remainingBudget(started);
