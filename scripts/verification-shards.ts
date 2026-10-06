import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { remainingBudget, runTimed } from "./time-budget.ts";
import { VERIFICATION_SHARDS } from "./shard.ts";

export async function verifyShards(): Promise<void> {
  const started = performance.now();
  const temporary = join(tmpdir(), "opencode");
  mkdirSync(temporary, { recursive: true });
  const folder = mkdtempSync(join(temporary, "verification-"));
  const controller = new AbortController();
  let next = 1;
  const worker = async (): Promise<void> => {
    while (next <= VERIFICATION_SHARDS && !controller.signal.aborted) {
      const index = next++;
      const cwd = join(folder, String(index));
      try {
        // Each shard owns its files and workspace links. Never share mutable
        // fixtures or symlink a checkout's workspace packages into another.
        cpSync(process.cwd(), cwd, {
          recursive: true,
          filter: (path) =>
            ![
              ".git",
              "node_modules",
              ".dev",
              ".release",
              "dist",
              "coverage",
              ".turbo",
              ".vitest",
            ].includes(basename(path)),
        });
        const options = { cwd, capture: true, signal: controller.signal };
        for (const command of [
          ["git", "init", "--quiet"],
          ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
        ]) {
          const result = await runTimed(command, remainingBudget(started), options);
          if (result.status !== 0)
            throw new Error(`Verification preparation failed\n${result.output}`);
        }
        const result = await runTimed(["bun", "run", "verify-gates"], remainingBudget(started), {
          ...options,
          env: { ...process.env, VERIFICATION_SHARD: `${index}/${VERIFICATION_SHARDS}` },
        });
        if (result.status !== 0)
          throw new Error(
            `Verification shard ${index}/${VERIFICATION_SHARDS} failed\n${result.output}`,
          );
        process.stdout.write(
          `Verification shard ${index}/${VERIFICATION_SHARDS} passed\n${result.output}`,
        );
      } catch (error) {
        controller.abort();
        throw error;
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  };
  try {
    const results = await Promise.allSettled([worker(), worker()]);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new Error(failures.map((failure) => String(failure.reason)).join("\n"));
    remainingBudget(started);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
