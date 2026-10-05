import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

execFileSync("bun", ["run", "native:prepare"], { stdio: "inherit" });
const exclude = ["**/node_modules/**", "**/dist/**", "**/.release/**", "**/.dev/**"];
const adapters = globSync("packages/*/src/**/*.bun.{ts,tsx}", { exclude });
const contracts = globSync("packages/*/src/**/*.contract.test.{ts,tsx}", { exclude });
if (!adapters.length) throw new Error("Contracts: no Bun adapters found");
for (const adapter of adapters) {
  const contract = adapter.replace(/\.(ts|tsx)$/u, ".contract.test.$1");
  if (!existsSync(contract)) throw new Error(`Contracts: missing contract for ${adapter}`);
}
for (const contract of contracts) {
  const folder = mkdtempSync(join(tmpdir(), "opencode-stats-contracts-"));
  const report = join(folder, "result.xml");
  try {
    const result = spawnSync(
      "bun",
      ["test", `./${contract}`, "--reporter", "junit", "--reporter-outfile", report],
      { encoding: "utf8" },
    );
    process.stdout.write(result.stdout + result.stderr);
    if (result.status !== 0) throw new Error(`Contracts: failing contract ${contract}`);
    const xml = existsSync(report) ? readFileSync(report, "utf8") : "";
    const root = /<testsuites\b[^>]*>/u.exec(xml)?.[0] ?? "";
    const tests = Number(/\btests="(\d+)"/u.exec(root)?.[1]);
    const skipped = Number(/\bskipped="(\d+)"/u.exec(root)?.[1]);
    if (!(tests > skipped)) throw new Error(`Contracts: empty contract ${contract}`);
  } finally {
    rmSync(folder, { recursive: true });
  }
}
