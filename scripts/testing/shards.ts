import assert from "node:assert/strict";
import { shard } from "../shard.ts";

const items = Array.from({ length: 227 }, (_, index) => index);
assert.deepEqual(shard(items, undefined), items);
assert.deepEqual(shard(items, "1/1"), items);
const partitions = Array.from({ length: 4 }, (_, index) => shard(items, `${index + 1}/4`));
assert.deepEqual(
  partitions.flat().toSorted((a, b) => a - b),
  items,
);
assert.equal(new Set(partitions.flat()).size, items.length);
assert.deepEqual(shard(["only"], "2/4"), []);
for (const invalid of [
  "",
  "0/4",
  "5/4",
  "1/0",
  "1/2/3",
  "1.5/4",
  "x/4",
  "1/1e2",
  "1/9007199254740992",
])
  assert.throws(() => shard(items, invalid), /Invalid shard/u);
process.stdout.write("Shards are exhaustive, disjoint and reject invalid input.\n");
