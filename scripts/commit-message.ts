import { readFileSync } from "node:fs";
import process from "node:process";

const file = process.argv[2];
if (!file) throw new Error("Missing commit-message file");
const header = readFileSync(file, "utf8").split("\n")[0] ?? "";
const conventional =
  /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^()\r\n]+\))?!?: \S.*$/u;
if (!conventional.test(header)) {
  process.stderr.write("Use a Conventional Commit: type(scope): description\n");
  process.exitCode = 1;
}
