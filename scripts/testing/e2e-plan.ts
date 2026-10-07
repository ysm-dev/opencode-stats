import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { compareE2e, e2eFiles, partitionE2e, prepareE2e, selectE2e } from "../e2e-plan.ts";
import {
  tourRounds,
  tourWidths,
  tourStages,
  tourCases,
} from "../../packages/e2e/tests/testing/tour-plan.ts";

assert.deepEqual(tourRounds, [0, 1], "No repetition may be dropped or duplicated");
assert.deepEqual(tourWidths, [360, 1280], "Both native-input widths remain required");
assert.deepEqual(
  tourStages,
  ["data", "appearance", "live"],
  "Every ordered native phase remains required",
);
assert.deepEqual(
  tourCases.map(({ round, stage, index }) => [round, stage, index]),
  [
    [0, "data", 0],
    [0, "appearance", 1],
    [0, "live", 2],
    [1, "data", 3],
    [1, "appearance", 4],
    [1, "live", 5],
  ],
);
const registered = ["chromium", "webkit"].flatMap((browser) =>
  ["whole-paint", "change-time"].flatMap((mode) =>
    tourWidths.flatMap((width) =>
      tourCases.map(({ round, stage }) => `${browser}/${mode}/${width}/${round}/${stage}`),
    ),
  ),
);
assert.equal(registered.length, 48);
assert.equal(
  new Set(registered).size,
  48,
  "Native tour round partition must be exhaustive and disjoint",
);
const tourHarness = readFileSync("packages/e2e/tests/testing/whole-tour-tests.ts", "utf8");
for (const registration of [
  "describe.each(tourWidths)",
  "{ concurrent: false }",
  "it.each(tourCases)",
  "expect(completed).toEqual(tourCases)",
  "await f.tour[part.stage](part.round)",
])
  assert.ok(
    tourHarness.includes(registration),
    "Registered native tour must use and verify the proven axes",
  );
for (const browser of ["chromium", "webkit"])
  for (const [file, entry] of [
    ["whole-paint", "testWholePaintTour"],
    ["change-time", "testCleanChangeTimeTour"],
  ])
    assert.ok(
      readFileSync(`packages/e2e/tests/${file}-${browser}.test.ts`, "utf8").includes(
        `${entry}(${browser},`,
      ),
      "Each mode/engine must register its complete tour",
    );

const files = e2eFiles();
assert.ok(files.length > 0, "No e2e files discovered");
for (const count of [1, 2, 3, 4, 6]) {
  const groups = partitionE2e(files, count);
  assert.deepEqual(groups.flat().toSorted(), files.toSorted(), "E2e shards must be exhaustive");
  assert.equal(new Set(groups.flat()).size, files.length, "E2e shards must be disjoint");
  assert.deepEqual(
    partitionE2e(files.toReversed(), count),
    groups,
    "Discovery order changed shards",
  );
  assert.deepEqual(
    partitionE2e(
      files.map((file) => resolve(file)),
      count,
    ).map((group) => group.map((file) => basename(file))),
    groups.map((group) => group.map((file) => basename(file))),
    "Preparation and Vitest must select identical files",
  );
  for (let index = 0; index < count; index++)
    assert.deepEqual(selectE2e([`--shard=${index + 1}/${count}`]), groups[index]);
}
assert.deepEqual(selectE2e([]).toSorted(), files.toSorted());
assert.deepEqual(
  partitionE2e(
    [
      "preferences-webkit.test.ts",
      "plugin.test.ts",
      "smoke.test.ts",
      "preferences.test.ts",
      "preferences-chromium.test.ts",
    ],
    2,
  ),
  [
    ["preferences-webkit.test.ts", "smoke.test.ts"],
    ["plugin.test.ts", "preferences.test.ts", "preferences-chromium.test.ts"],
  ],
);
assert.deepEqual(
  ["native.test.ts", "plugin.test.ts", "preferences-webkit.test.ts"].toSorted(compareE2e),
  ["preferences-webkit.test.ts", "plugin.test.ts", "native.test.ts"],
  "Long e2e files must run first, including without sharding",
);
assert.deepEqual(prepareE2e(["plugin.test.ts"]), { browsers: [], opencode: true });
assert.deepEqual(prepareE2e(["tour-owner.test.ts"]), { browsers: [], opencode: false });
assert.deepEqual(prepareE2e(["preferences-webkit.test.ts"]), {
  browsers: ["webkit"],
  opencode: false,
});
assert.deepEqual(prepareE2e(["smoke.test.ts"]), { browsers: ["chromium"], opencode: true });
for (const file of [
  "ranges.test.ts",
  "filters.test.ts",
  "whole-paint-canaries.test.ts",
  "chart-paint-canaries.test.ts",
  "contribution-canaries.test.ts",
  "contribution-contrast.test.ts",
  "contributions.test.ts",
])
  assert.deepEqual(prepareE2e([file]), {
    browsers: ["chromium", "webkit"],
    opencode: false,
  });
for (const browser of ["chromium", "webkit"])
  for (const kind of ["whole-paint", "change-time", "whole-load"])
    assert.deepEqual(prepareE2e([`${kind}-${browser}.test.ts`]), {
      browsers: [browser],
      opencode: false,
    });
assert.deepEqual(prepareE2e(["future.test.tsx"]), {
  browsers: ["chromium", "webkit"],
  opencode: true,
});
for (const count of [0, -1, 0.5, Infinity, files.length + 1])
  assert.throws(() => partitionE2e(files, count), /Invalid e2e shard count/u);
for (const selector of ["0/4", "5/4", "1/0", "bad"])
  assert.throws(() => selectE2e([`--shard=${selector}`]), /Invalid shard/u);
const config = readFileSync("packages/e2e/vitest.config.ts", "utf8");
for (const setting of [
  "include: [e2ePattern]",
  "exclude: e2eExcludes",
  "sequencer: BalancedE2eSequencer",
])
  assert.ok(config.includes(setting), "E2e must use the shared workload plan");
assert.ok(
  readFileSync("scripts/e2e-sequencer.ts", "utf8").includes(
    "compareE2e(left.moduleId, right.moduleId)",
  ),
  "E2e execution must use workload order",
);
process.stdout.write("E2e shards are balanced, exhaustive and share preparation requirements.\n");
