import { existsSync, globSync, readFileSync } from "node:fs";
import process from "node:process";
import { validRange } from "semver";
import { parseSync } from "oxc-parser";
import lintConfig from "../.oxlintrc.ts";
import holds from "../dependency-holds.json" with { type: "json" };
import exceptions from "../quality-exceptions.json" with { type: "json" };

const failures: string[] = [];
const owners = readFileSync(".github/CODEOWNERS", "utf8");
const paths = new Set<string>();
for (const entry of exceptions) {
  if (paths.has(entry.path)) failures.push(`${entry.path}: duplicate manifest entry`);
  paths.add(entry.path);
  if (!existsSync(entry.path)) failures.push(`${entry.path}: file no longer exists`);
  if (!entry.reason.trim()) failures.push(`${entry.path}: missing reason`);
  if (/[?*{}[\]!]/u.test(entry.path)) failures.push(`${entry.path}: waiver must name one file`);
  if (!entry.gates.length || entry.gates.some((gate) => gate !== "coverage")) {
    failures.push(`${entry.path}: forbidden gate`);
  }
  const owned = owners.split("\n").some((line) => {
    const [pattern, ...accounts] = line.trim().split(/\s+/u);
    return pattern === `/${entry.path}` && accounts.some((account) => account.startsWith("@"));
  });
  if (!owned) failures.push(`${entry.path}: missing CODEOWNERS`);
  process.stdout.write(`  [${entry.gates.join(", ")}] ${entry.path} — ${entry.reason}\n`);
}

const expectedEdges = exceptions
  .filter((entry) => entry.gates.includes("coverage"))
  .map((entry) => entry.path)
  .toSorted();
const edgeOverrides = lintConfig.overrides.filter(
  (override) => "complexity/complexity" in override.rules,
);
const actualEdges = edgeOverrides.flatMap((override) => override.files).toSorted();
if (JSON.stringify(expectedEdges) !== JSON.stringify(actualEdges))
  failures.push("edge override differs from manifest");

const forbidden =
  /(?:eslint-disable|@ts-ignore|@ts-nocheck|@ts-check|(?:v8|c8|istanbul)\s+ignore|jscpd:ignore)/u;
const directive = /oxlint-disable(?:-next-line|-line)?/u;
const forbiddenRule = /(?:no-explicit-any|no-unsafe-[\w-]+)/u;

const inspectComment = (
  file: string,
  comment: { readonly type: string; readonly value: string },
): void => {
  const text = comment.value.trim();
  if (forbidden.test(text)) failures.push(`${file}: forbidden suppression`);
  if (/@ts-expect-error/u.test(text) && !/@ts-expect-error\s+(?:--\s*)?\S.{2,}/u.test(text)) {
    failures.push(`${file}: TypeScript directive needs a description`);
  }
  if (/@ts-expect-error/u.test(text)) process.stdout.write(`  [inline] ${file} ${text}\n`);
  const match = directive.exec(text);
  if (!match) return;
  process.stdout.write(`  [inline] ${file} ${text}\n`);
  const [rules, reason] = text.slice(match.index + match[0].length).split(/\s+--\s*/u);
  const singleLine = match[0].endsWith("-line") || match[0].endsWith("next-line");
  if (comment.type !== "Line" || !singleLine || !rules?.trim() || rules.trim() === "all") {
    failures.push(`${file}: block, whole-file or blanket disable`);
  }
  if (!reason?.trim()) failures.push(`${file}: inline suppression needs -- reason`);
  if (forbiddenRule.test(rules ?? "")) failures.push(`${file}: forbidden rule suppression`);
  if (rules?.includes("no-restricted-types") && !reason?.includes("trust boundary:"))
    failures.push(`${file}: unknown suppression must name a trust boundary`);
};

for (const file of globSync("{packages/*,scripts}/**/*.{ts,tsx}", {
  exclude: ["**/node_modules/**", "**/dist/**", "**/.release/**", "**/.dev/**"],
})) {
  const parsed = parseSync(file, readFileSync(file, "utf8"));
  if (parsed.errors.length) failures.push(`${file}: cannot scan invalid source`);
  for (const comment of parsed.comments) inspectComment(file, comment);
}

process.stdout.write(`Dependency holds: ${holds.length}\n`);
for (const hold of holds) {
  if (!hold.package.trim() || !validRange(hold.allowedVersions) || !hold.reason.trim())
    failures.push("invalid dependency hold");
  process.stdout.write(`  [hold] ${hold.package} ${hold.allowedVersions} — ${hold.reason}\n`);
}
for (const failure of failures) process.stderr.write(`ERROR ${failure}\n`);
if (failures.length) process.exitCode = 1;
