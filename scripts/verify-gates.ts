import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { checks } from "./gate-checks.ts";
import { freshnessChecks } from "./gate-freshness-checks.ts";
import { shard } from "./shard.ts";
import { remainingBudget, runTimed } from "./time-budget.ts";
import { verifyShards } from "./verification-shards.ts";

const verificationStarted = performance.now();

export type Check = {
  readonly gate: string;
  readonly files: Readonly<Record<string, string>>;
  readonly command: readonly string[];
  readonly expect: readonly string[];
  readonly accepts?: boolean;
  readonly env?: Readonly<Record<string, string>>;
};

// Each canary runs the public command. Back up changed configs, never overwrite
// a contributor's source, and restore even when the command or assertion fails.
const verify = async (check: Check): Promise<void> => {
  const started = performance.now();
  const originals = new Map<string, string | undefined>();
  for (const path of Object.keys(check.files)) {
    if (existsSync(path) && path.includes("gate-canary")) {
      throw new Error(`Refusing to overwrite ${path}`);
    }
    originals.set(path, existsSync(path) ? readFileSync(path, "utf8") : undefined);
  }
  try {
    for (const [path, content] of Object.entries(check.files)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    const result = await runTimed(
      // GitHub annotations omit rule help; verification needs the full diagnostic.
      [
        "bun",
        "run",
        ...check.command,
        ...(check.command[0] === "lint" ? ["--format=default"] : []),
      ],
      remainingBudget(verificationStarted),
      {
        capture: true,
        env: { ...process.env, FORCE_COLOR: "0", ...check.env },
      },
    );
    const { status, output } = result;
    const matches = check.expect.every((text) => output.includes(text));
    if ((status === 0) !== (check.accepts === true) || !matches) {
      throw new Error(`${check.gate}: wrong result (exit ${status})\n${output}`);
    }
    process.stdout.write(
      `  ${check.gate} (${((performance.now() - started) / 1000).toFixed(1)}s)\n`,
    );
  } finally {
    for (const [path, original] of originals) {
      if (original === undefined) rmSync(path, { force: true });
      else writeFileSync(path, original);
    }
  }
};

if (process.env["VERIFICATION_SHARD"] === undefined) await verifyShards();
else {
  for (const check of shard([...checks()], process.env["VERIFICATION_SHARD"])) await verify(check);
  for await (const check of freshnessChecks()) await verify(check);
}
remainingBudget(verificationStarted);
