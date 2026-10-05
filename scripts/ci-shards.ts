import process from "node:process";
import { runTimed } from "./time-budget.ts";

export async function runShards(
  mode: "mutate" | "verify-gates",
  run: typeof runTimed = runTimed,
): Promise<void> {
  const variable = mode === "mutate" ? "MUTATION_SHARD" : "VERIFICATION_SHARD";
  const count = mode === "mutate" ? 6 : 4;
  for (let index = 1; index <= count; index += 1) {
    const env = { ...process.env };
    delete env["MUTATION_SHARD"];
    delete env["VERIFICATION_SHARD"];
    env[variable] = `${index}/${count}`;
    const result = await run(["bun", "run", mode], undefined, { env });
    if (result.status !== 0) throw new Error(`CI ${mode} shard ${index}/${count} failed`);
  }
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== "mutate" && mode !== "verify-gates")
    throw new Error("Expected mutate or verify-gates");
  await runShards(mode);
}
