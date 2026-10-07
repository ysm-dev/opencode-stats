import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { YAML } from "bun";
import { shard, VERIFICATION_SHARDS } from "../shard.ts";
import { checks, verificationShard } from "../gate-checks.ts";
import { narrowJson, object } from "../json.ts";

const verifyPartition = (items: readonly string[], count: number): void => {
  const partitions = Array.from({ length: count }, (_, index) =>
    shard(items, `${index + 1}/${count}`),
  );
  const flat = partitions.flat();
  assert.equal(flat.length, items.length);
  assert.equal(new Set(flat).size, items.length);
  assert.deepEqual(new Set(flat), new Set(items));
};

const workflow = object(narrowJson(YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8"))));
const verifyMatrix = (name: string, label: string, variable: string, count: number): void => {
  const job = object(object(workflow["jobs"])[name]);
  const matrix = object(object(job["strategy"])["matrix"]);
  const selector = `\${{ matrix.shard }}/${count}`;
  assert.deepEqual(
    matrix["shard"],
    Array.from({ length: count }, (_, index) => index + 1),
  );
  assert.equal(job["name"], `${label} (${selector})`);
  const steps = job["steps"];
  assert.ok(Array.isArray(steps));
  assert.ok(steps.some((step) => object(object(step)["env"] ?? {})[variable] === selector));
};
verifyMatrix("verification", "Gate verification", "VERIFICATION_SHARD", VERIFICATION_SHARDS);

const jobs = object(workflow["jobs"]);
const packed = object(jobs["packed"]);
const packedMatrix = object(object(packed["strategy"])["matrix"]);
assert.deepEqual(packedMatrix["os"], ["windows-latest"]);
assert.deepEqual(packedMatrix["include"], [
  ...["ubuntu-latest", "macos-15-intel"].flatMap((os) =>
    Array.from({ length: 6 }, (_, index) => ({ os, shard: `${index + 1}/6` })),
  ),
  ...["1/4", "2/4", "3/4", "4/4"].map((selector) => ({
    os: "macos-latest",
    shard: selector,
  })),
]);
const rawPackedSteps = packed["steps"];
assert.ok(Array.isArray(rawPackedSteps));
const packedSteps = Array.from(rawPackedSteps, object);
for (const command of [
  "bun run scripts/testing/time-budgets.ts",
  "bun run contracts",
  "bun run bundle:check",
]) {
  const proofs = packedSteps.filter((step) => step["run"] === command);
  assert.equal(proofs.length, 1, `Missing platform proof: ${command}`);
  assert.equal(
    object(proofs[0])["if"],
    "${{ !matrix.shard || startsWith(matrix.shard, '1/') }}",
    "Platform proofs must run on every platform's first shard",
  );
}
assert.ok(
  packedSteps.some(
    (step) =>
      object(step)["run"] ===
      "bun run e2e ${{ matrix.shard && format('--shard={0} --maxWorkers=1', matrix.shard) || '' }}",
  ),
);
for (const [name, os] of [
  ["intel", "macos-15-intel"],
  ["linux", "ubuntu-latest"],
  ["arm", "macos-latest"],
] as const) {
  const aggregate = object(jobs[name]);
  assert.equal(aggregate["name"], `Packed tarball (${os})`);
  assert.deepEqual(aggregate["needs"], ["packed"]);
  assert.equal(aggregate["if"], "always()");
  assert.deepEqual(aggregate["steps"], [
    { run: 'test "$PACKED" = success', env: { PACKED: "${{ needs.packed.result }}" } },
  ]);
}
assert.deepEqual(object(jobs["verification"])["needs"], ["checks", "contracts", "packed"]);
const gateNeeds = object(jobs["gates"])["needs"];
assert.ok(
  Array.isArray(gateNeeds) &&
    ["packed", "intel", "linux", "arm"].every((name) => gateNeeds.includes(name)),
);

const canaries = [...checks()];
const partitions = Array.from({ length: VERIFICATION_SHARDS }, (_, index) =>
  verificationShard(`${index + 1}/${VERIFICATION_SHARDS}`),
);
assert.deepEqual(
  partitions
    .flat()
    .map((check) => check.gate)
    .toSorted(),
  canaries.map((check) => check.gate).toSorted(),
  "Missing or repeated verification canaries",
);
assert.deepEqual(verificationShard(undefined), canaries);
for (const command of new Set(canaries.map((check) => check.command[0]))) {
  const amounts = partitions.map(
    (partition) => partition.filter((check) => check.command[0] === command).length,
  );
  assert.ok(
    Math.max(...amounts) - Math.min(...amounts) <= 1,
    `Unbalanced verification command ${command}`,
  );
}
const completeRuns = partitions.map(
  (partition) =>
    partition.filter((check) => check.command.length === 1 && check.command[0] === "test").length,
);
assert.ok(Math.max(...completeRuns) <= 1, "Unbalanced verification command: full test suites");
for (const partition of partitions) {
  if (partition.some((check) => check.command[0] === "scripts/testing/time-budgets.ts"))
    assert.ok(
      !partition.some((check) => check.command.length === 1 && check.command[0] === "test"),
      "Expensive cleanup controls must not share full coverage runs",
    );
}

const items = Array.from({ length: 227 }, (_, index) => String(index));
assert.deepEqual(shard(items, undefined), items);
assert.deepEqual(shard(items, "1/1"), items);
verifyPartition(items, 16);
assert.deepEqual(shard(["only"], "2/4"), []);
for (const invalid of [
  "",
  "0/4",
  "5/4",
  "17/16",
  "1/0",
  "1/2/3",
  "1.5/4",
  "x/4",
  "1/1e2",
  "1/9007199254740992",
]) {
  assert.throws(() => shard(items, invalid), /Invalid shard/u);
  assert.throws(() => verificationShard(invalid), /Invalid shard/u);
}
process.stdout.write("Shards are exhaustive, disjoint and reject invalid input.\n");
