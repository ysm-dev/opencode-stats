import assert from "node:assert/strict";
import { runShards } from "../ci-shards.ts";

const original = {
  MUTATION_SHARD: process.env["MUTATION_SHARD"],
  VERIFICATION_SHARD: process.env["VERIFICATION_SHARD"],
};
process.env["MUTATION_SHARD"] = "inherited-canary-selection";
process.env["VERIFICATION_SHARD"] = "inherited-canary-selection";
try {
  for (const [mode, variable, count] of [
    ["mutate", "MUTATION_SHARD", 12],
    ["verify-gates", "VERIFICATION_SHARD", 16],
  ] as const) {
    const observed: string[] = [];
    await runShards(mode, async (command, milliseconds, options) => {
      assert.deepEqual(command, ["bun", "run", mode]);
      assert.equal(milliseconds, undefined);
      assert.equal(
        options?.env?.[variable === "MUTATION_SHARD" ? "VERIFICATION_SHARD" : "MUTATION_SHARD"],
        undefined,
      );
      observed.push(String(options?.env?.[variable]));
      return { status: 0, output: "" };
    });
    assert.deepEqual(
      observed,
      Array.from({ length: count }, (_, index) => `${index + 1}/${count}`),
      "Missing CI shards",
    );
    let calls = 0;
    await assert.rejects(
      runShards(mode, async () => {
        calls += 1;
        return { status: 1, output: "" };
      }),
      /shard 1\//u,
    );
    assert.equal(calls, 1);
  }
} finally {
  for (const variable of ["MUTATION_SHARD", "VERIFICATION_SHARD"] as const) {
    if (original[variable] === undefined) delete process.env[variable];
    else process.env[variable] = original[variable];
  }
}
process.stdout.write("Local CI shards are exhaustive, isolated and fail closed.\n");
