import { globSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { shard } from "./shard.ts";

type Browser = "chromium" | "webkit";
type Work = readonly [seconds: number, browsers: readonly Browser[], opencode?: true];
// Rounded passing-file durations from hosted run 37546332444, using the
// slowest required platform. Unknown files still get conservative preparation.
const work: Readonly<Record<string, Work>> = {
  "preferences-webkit.test.ts": [53, ["webkit"]],
  "plugin.test.ts": [46, [], true],
  "smoke.test.ts": [25, ["chromium"], true],
  "preferences.test.ts": [39, ["chromium", "webkit"]],
  // Its first full hosted sample is pending; keep the conservative file cost.
  "ranges.test.ts": [30, ["chromium", "webkit"]],
  "filters.test.ts": [23, ["chromium", "webkit"]],
  // Synthetic whole-paint tours retain the native per-test/job budgets. Split
  // engines at the existing file/shard seam; refine these estimates on hosted CI.
  "whole-paint-chromium.test.ts": [35, ["chromium"]],
  "whole-paint-webkit.test.ts": [35, ["webkit"]],
  // Independent uninstrumented clocks and post-rAF phase canaries: conservative
  // costs until hosted samples exist; all original test/job deadlines remain.
  "change-time-chromium.test.ts": [35, ["chromium"]],
  "change-time-webkit.test.ts": [35, ["webkit"]],
  "whole-load-chromium.test.ts": [15, ["chromium"]],
  "whole-load-webkit.test.ts": [15, ["webkit"]],
  "whole-paint-canaries.test.ts": [25, ["chromium", "webkit"]],
  "chart-paint-canaries.test.ts": [30, ["chromium", "webkit"]],
  "tour-owner.test.ts": [1, []],
  "preference-evidence.test.ts": [8, ["chromium"]],
  "preferences-chromium.test.ts": [17, ["chromium"]],
  "source.test.ts": [19, ["chromium"]],
  "lifecycle.test.ts": [16, []],
  "preferences-setup.test.ts": [13, []],
  "live.test.ts": [7, ["chromium"]],
  "recovery.test.ts": [14, ["chromium"]],
  "versions.test.ts": [7, ["chromium"]],
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
