import { globSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { shard } from "./shard.ts";

type Browser = "chromium" | "webkit";
type Work = readonly [seconds: number, browsers: readonly Browser[], opencode?: true];
// Relative costs from hosted runs. Unknown files get conservative preparation.
const work: Readonly<Record<string, Work>> = {
  "preferences-webkit.test.ts": [30, ["webkit"]],
  "plugin.test.ts": [38, [], true],
  "smoke.test.ts": [22, ["chromium"], true],
  "preferences.test.ts": [34, ["chromium", "webkit"]],
  "preference-evidence.test.ts": [9, ["chromium"]],
  "preferences-chromium.test.ts": [22, ["chromium"]],
  "source.test.ts": [17, ["chromium"]],
  "lifecycle.test.ts": [20, []],
  "preferences-setup.test.ts": [12, []],
  "live.test.ts": [4, ["chromium"]],
  "recovery.test.ts": [15, ["chromium"]],
  "versions.test.ts": [5, ["chromium"]],
  "native.test.ts": [1, []],
  "notices.test.ts": [1, []],
};
const profile = (file: string): Work => work[basename(file)] ?? [30, ["chromium", "webkit"], true];

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
  const ordered = files.toSorted(
    (left, right) =>
      profile(right)[0] - profile(left)[0] ||
      left.replaceAll("\\", "/").localeCompare(right.replaceAll("\\", "/")),
  );
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
