import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { checks } from "./gate-checks.ts";
import { freshnessChecks } from "./gate-freshness-checks.ts";

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
    const result = spawn("bun", ["run", ...check.command], {
      env: { ...process.env, FORCE_COLOR: "0", ...check.env },
    });
    let output = "";
    result.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    result.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    const status = await new Promise<number | null>((resolve, reject) => {
      result.once("error", reject);
      result.once("close", resolve);
    });
    const matches = check.expect.every((text) => output.includes(text));
    if ((status === 0) !== (check.accepts === true) || !matches) {
      throw new Error(`${check.gate}: wrong result (exit ${status})\n${output}`);
    }
    process.stdout.write(`  ${check.gate}\n`);
  } finally {
    for (const [path, original] of originals) {
      if (original === undefined) rmSync(path, { force: true });
      else writeFileSync(path, original);
    }
  }
};

for (const check of checks()) await verify(check);
for await (const check of freshnessChecks()) await verify(check);
