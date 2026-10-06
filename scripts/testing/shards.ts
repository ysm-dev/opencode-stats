import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { YAML } from "bun";
import { shard } from "../shard.ts";
import { checks } from "../gate-checks.ts";
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
verifyMatrix("verification", "Gate verification", "VERIFICATION_SHARD", 16);

const canaries = [...checks()];
verifyPartition(
  canaries.map((check) => check.gate),
  16,
);
for (const command of new Set(canaries.map((check) => check.command[0]))) {
  const amounts = Array.from(
    { length: 16 },
    (_, index) =>
      shard(canaries, `${index + 1}/16`).filter((check) => check.command[0] === command).length,
  );
  assert.ok(
    Math.max(...amounts) - Math.min(...amounts) <= 1,
    `Unbalanced verification command ${command}`,
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
])
  assert.throws(() => shard(items, invalid), /Invalid shard/u);
process.stdout.write("Shards are exhaustive, disjoint and reject invalid input.\n");
