import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function opencodeExecutable(version: string, architecture: string = process.arch): string {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const folder = resolve(".dev/opencode-test", version, architecture);
  return resolve(
    folder,
    `node_modules/@opencode/cli-${platform}-${architecture}/bin/opencode${process.platform === "win32" ? ".exe" : ""}`,
  );
}

export function prepareOpenCode(version: string, architecture: string = process.arch): string {
  const executable = opencodeExecutable(version, architecture);
  if (existsSync(executable)) return executable;
  const folder = resolve(dirname(executable), "../../../..");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(folder, "package.json"), JSON.stringify({ private: true }));
  const platform = process.platform === "win32" ? "windows" : process.platform;
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "install",
      "--force",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      `@opencode/cli-${platform}-${architecture}@${version}`,
    ],
    { cwd: folder, stdio: "inherit", timeout: 60000, shell: process.platform === "win32" },
  );
  return executable;
}
