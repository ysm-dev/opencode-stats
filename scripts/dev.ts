import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const folder = resolve(".dev");
for (const name of ["state", "cache", "data"])
  mkdirSync(resolve(folder, name), { recursive: true, mode: 0o700 });
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { db: { type: "string" } },
});
const databasePath = resolve(values.db ?? resolve(folder, "synthetic-opencode-v1.db"));
if (values.db === undefined) {
  const synthetic = spawnSync(
    process.execPath,
    ["--no-install", "packages/stats-store/src/testing/dev.ts", "--db", databasePath],
    { stdio: "inherit" },
  );
  if (synthetic.status !== 0) throw new Error("Synthetic OpenCode database creation failed.");
}
const vite = await createServer({
  root: "packages/dashboard",
  configFile: "packages/dashboard/vite.config.ts",
});
const dashboardServer = spawn(
  process.execPath,
  [
    "--no-env-file",
    "--no-install",
    "packages/dashboard-server/src/process.ts",
    "--port",
    "22440",
    "--db",
    databasePath,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_STATE_HOME: resolve(folder, "state"),
      XDG_CACHE_HOME: resolve(folder, "cache"),
      XDG_DATA_HOME: resolve(folder, "data"),
      OPENCODE_DB: databasePath,
    },
  },
);
let stopping = false;
const stop = async (): Promise<void> => {
  stopping = true;
  dashboardServer.kill();
  await vite.close();
};
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
dashboardServer.once("exit", (code) => {
  if (!stopping) process.exitCode = code ?? 1;
  void vite.close();
});
dashboardServer.once("error", () => {
  process.exitCode = 1;
  void vite.close();
});
try {
  await vite.listen();
} catch (error) {
  await stop();
  throw error;
}
vite.printUrls();
