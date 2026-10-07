import { expect, it, vi, afterEach } from "vitest";
import plugin from "../server.ts";
import { mkdtempSync, rmSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRecord, stateFolder, holdServer } from "@opencode-stats/launcher";
import { version, serverScript } from "./paths.ts";
import { standIn, stopProcess, temporaryPort } from "@opencode-stats/launcher/testing";
import { installOpener } from "../testing/server.ts";

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => "/synthetic/private-home",
}));

afterEach(() => vi.unstubAllGlobals());

it("fails setup on OpenCode's Node build before starting a dashboard server", () => {
  vi.stubGlobal("Bun", undefined);
  expect(plugin.id).toBe("opencode-stats");
  expect(() =>
    plugin.setup({ options: {}, app: { name: "opencode", version: "2.0.22", channel: "latest" } }),
  ).toThrow("opencode-stats needs OpenCode's standard (Bun) build");
});

it("uses the current host executable, source paths and private process environment when no runtime is supplied", async () => {
  const home = mkdtempSync(join(tmpdir(), "stats-plugin-defaults-"));
  const db = join(home, "opencode.db");
  writeFileSync(db, "synthetic");
  vi.stubGlobal("Bun", { version: "1.4.2" });
  for (const key of [
    "HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
    "XDG_CACHE_HOME",
    "OPENCODE_CONFIG_DIR",
  ])
    vi.stubEnv(key, home);
  vi.stubEnv("OPENCODE_DB", db);
  const cleanup = plugin.setup({
    options: {},
    app: { name: "opencode", version: "2.0.22", channel: "latest" },
  });
  const shared = holdServer({
    env: process.env,
    executable: process.execPath,
    script: serverScript,
    port: 22439,
    db,
    version,
  });
  try {
    cleanup();
    shared.release();
    await shared.closed;
    expect(readRecord(stateFolder(process.env))).toBeUndefined();
  } finally {
    cleanup();
    shared.release();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true });
  }
});

it.each([
  { port: 0 },
  { port: 65536 },
  { port: 1.5 },
  { port: "22439" },
  { port: null },
  { port: false },
  { db: "" },
  { db: 1 },
  { db: null },
  { db: false },
  { db: "bad\0path" },
])("rejects a bad option without starting anything: %j", (options) => {
  vi.stubGlobal("Bun", { version: "1.4.2" });
  expect(() =>
    plugin.setup({ options, app: { name: "opencode", version: "2.0.22", channel: "latest" } }),
  ).toThrow("Invalid opencode-stats");
});

it.each(["missing", "directory", "memory"])(
  "fails setup for a %s database with its provenance",
  (kind) => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const home = mkdtempSync(join(tmpdir(), "stats-plugin-preflight-"));
    const db =
      kind === "directory" ? home : kind === "memory" ? ":memory:" : join(home, "missing.db");
    try {
      expect(() =>
        plugin.setup(
          { options: { db }, app: { name: "opencode", version: "2.0.22", channel: "latest" } },
          { env: { HOME: home } },
        ),
      ).toThrow(
        `Can't find the OpenCode database: ${kind === "memory" ? join(process.cwd(), ":memory:") : db} (the plugin's \`db\` option)`,
      );
      expect(readRecord(stateFolder({ HOME: home }))).toBeUndefined();
    } finally {
      rmSync(home, { recursive: true });
    }
  },
);

it("returns synchronously, starts through the host executable, and shares a hold across setup and cleanup", async () => {
  vi.stubGlobal("Bun", { version: "1.4.2" });
  const fixture = standIn();
  const port = await temporaryPort();
  const opener = await installOpener(fixture.folder);
  const env = { ...fixture.env, HOME: fixture.folder, PATH: fixture.folder };
  const context = {
    options: { db: fixture.db, port },
    app: { name: "opencode", version: "2.0.22", channel: "latest" },
  };
  const runtime = { env, executable: fixture.executable, script: fixture.script };
  const first = plugin.setup(context, runtime);
  const second = plugin.setup(context, runtime);
  const observer = holdServer({ ...runtime, port, db: fixture.db, version });
  let pid: number | undefined;
  try {
    expect(typeof first).toBe("function");
    const record = await observer.ready;
    observer.release();
    pid = record.pid;
    expect(record).toMatchObject({
      database: realpathSync(fixture.db),
      starter: "plugin",
      address: `http://127.0.0.1:${port}`,
    });
    const trace = readFileSync(join(stateFolder(env), "trace.json"), "utf8");
    expect(trace).toContain('"BUN_BE_BUN":"1"');
    expect(trace).toContain(JSON.stringify(fixture.script));
    expect(trace).not.toContain("synthetic-secret");
    expect(() => readFileSync(opener.record)).toThrow("ENOENT");
    first();
    expect(
      (
        await fetch(`${record.address}/api/server`, {
          headers: { Authorization: `Bearer ${record.secret}` },
        })
      ).status,
    ).toBe(200);
  } finally {
    first();
    second();
    observer.release();
    await observer.closed;
    if (pid) await stopProcess(pid);
    opener.close();
    fixture.clean();
  }
});
