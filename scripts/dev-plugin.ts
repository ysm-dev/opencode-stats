import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { prepareOpenCode } from "./opencode-runtime.ts";
import { privateOpenCode } from "./private-opencode.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { packed: { type: "boolean" }, opencode: { type: "string" } },
});
if (values.opencode !== undefined && !/^\d+\.\d+\.\d+$/u.test(values.opencode))
  throw new Error("--opencode needs an exact release version.");
const executable =
  values.opencode === undefined ? Bun.which("opencode") : prepareOpenCode(values.opencode);
if (!executable)
  throw new Error("Install OpenCode's standard Bun build, or use --opencode <version>.");
const plugin = resolve(values.packed ? ".release/package" : "packages/opencode-stats");
if (!existsSync(resolve(plugin, "package.json")))
  throw new Error("Run `bun run release` before --packed.");
const db = resolve(".dev/synthetic-opencode-v1.db");
execFileSync(
  process.execPath,
  ["--no-install", "packages/stats-store/src/testing/dev.ts", "--db", db],
  { stdio: "inherit", timeout: 10000 },
);
const host = privateOpenCode({
  executable,
  home: resolve(".dev/opencode"),
  plugin,
  port: 22440,
  db,
  state: resolve(".dev/state"),
  cache: resolve(".dev/cache"),
});
const vite = await createServer({
  root: "packages/dashboard",
  configFile: "packages/dashboard/vite.config.ts",
});
const stop = async (): Promise<void> => {
  host.child.kill("SIGTERM");
  await host.closed;
  await vite.close();
};
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
try {
  const address = await host.address;
  const activated = await fetch(
    `${address}/api/plugin?location[directory]=${encodeURIComponent(resolve(".dev/opencode"))}`,
    { headers: host.headers },
  );
  if (!activated.ok) throw new Error("Private OpenCode could not activate its plugins.");
  await vite.listen();
  vite.printUrls();
  process.stdout.write(`Private OpenCode: ${address}\n`);
  await host.closed;
  await vite.close();
} catch (error) {
  await stop();
  throw error;
}
