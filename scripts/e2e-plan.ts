import { globSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { shard } from "./shard.ts";

type Browser = "chromium" | "webkit";
type Work = readonly [seconds: number, browsers: readonly Browser[], opencode?: true];
// Median passing Intel file durations from hosted runs 37580146079 through
// 37582743143, with independently scheduled viewports and the lighter graph probe.
const work: Readonly<Record<string, Work>> = {
  "preferences-webkit.test.ts": [39, ["webkit"]],
  "plugin.test.ts": [36, [], true],
  "smoke.test.ts": [25, ["chromium"], true],
  "preferences.test.ts": [34, ["chromium", "webkit"]],
  "ranges.test.ts": [21, ["chromium", "webkit"]],
  "contributions.test.ts": [24, ["chromium", "webkit"]],
  "contribution-canaries.test.ts": [22, ["chromium", "webkit"]],
  "contribution-contrast.test.ts": [13, ["chromium", "webkit"]],
  "filters.test.ts": [19, ["chromium", "webkit"]],
  "whole-paint-chromium-360.test.ts": [62, ["chromium"]],
  "whole-paint-chromium-1280.test.ts": [45, ["chromium"]],
  "whole-paint-webkit-360.test.ts": [42, ["webkit"]],
  "whole-paint-webkit-1280.test.ts": [36, ["webkit"]],
  "change-time-chromium-360.test.ts": [40, ["chromium"]],
  "change-time-chromium-1280.test.ts": [35, ["chromium"]],
  "change-time-webkit-360.test.ts": [33, ["webkit"]],
  "change-time-webkit-1280.test.ts": [34, ["webkit"]],
  "whole-load-chromium.test.ts": [8, ["chromium"]],
  "whole-load-webkit.test.ts": [12, ["webkit"]],
  "whole-paint-canaries.test.ts": [20, ["chromium", "webkit"]],
  "chart-paint-canaries.test.ts": [26, ["chromium", "webkit"]],
  "tour-owner.test.ts": [1, []],
  "preference-evidence.test.ts": [10, ["chromium"]],
  "preferences-chromium.test.ts": [28, ["chromium"]],
  "source.test.ts": [27, ["chromium"]],
  "lifecycle.test.ts": [20, []],
  "preferences-setup.test.ts": [12, []],
  "live.test.ts": [14, ["chromium"]],
  "recovery.test.ts": [13, ["chromium"]],
  "versions.test.ts": [10, ["chromium"]],
  "native.test.ts": [1, []],
  "notices.test.ts": [1, []],
};
const profile = (file: string): Work => work[basename(file)] ?? [30, ["chromium", "webkit"], true];

export const compareE2e = (left: string, right: string): number =>
  profile(right)[0] - profile(left)[0] ||
  left.replaceAll("\\", "/").localeCompare(right.replaceAll("\\", "/"));

export const e2ePattern = "packages/e2e/tests/**/*.test.{ts,tsx}";
export const e2eExcludes = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/.release/**",
  "**/.dev/**",
];
export const e2eFiles = () => globSync(e2ePattern, { exclude: e2eExcludes });

export function partitionE2e(files: readonly string[], count: number): string[][] {
  if (!Number.isSafeInteger(count) || count < 1 || count > Math.max(1, files.length))
    throw new Error("Invalid e2e shard count");
  const groups = Array.from({ length: count }, (): { files: string[]; seconds: number } => ({
    files: [],
    seconds: 0,
  }));
  const ordered = files.toSorted(compareE2e);
  for (const file of ordered) {
    const group = groups.reduce((least, next) => (next.seconds < least.seconds ? next : least));
    group.files.push(file);
    group.seconds += profile(file)[0];
  }
  return groups.map((group) => group.files);
}

export function selectE2e(args: readonly string[]): string[] {
  const { values } = parseArgs({
    args: [...args],
    strict: false,
    allowPositionals: true,
    options: { shard: { type: "string" } },
  });
  const files = e2eFiles();
  if (values.shard === undefined) return files;
  if (typeof values.shard !== "string") throw new Error("Invalid shard: expected index/count");
  shard([], values.shard);
  const [index, count] = values.shard.split("/").map(Number);
  return partitionE2e(files, count!)[index! - 1]!;
}

export const prepareE2e = (files: readonly string[]) => ({
  browsers: [...new Set(files.flatMap((file) => profile(file)[1]))].toSorted(),
  opencode: files.some((file) => profile(file)[2] === true),
});
