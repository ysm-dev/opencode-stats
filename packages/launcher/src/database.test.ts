import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { selectDatabase, parseServiceEnvironment } from "./database.ts";
import { stateFolder } from "./record.ts";

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => "/synthetic/private-home",
}));

it("selects a relative OpenCode database over the read-only service environment", () => {
  const home = mkdtempSync(join(tmpdir(), "stats-database-"));
  const config = join(home, "config");
  mkdirSync(config);
  const file = join(config, "service.json");
  const content = JSON.stringify({
    env: { OPENCODE_DB: "service.db", XDG_DATA_HOME: join(home, "service-data") },
  });
  writeFileSync(file, content);
  try {
    expect(
      selectDatabase({
        env: { HOME: home, OPENCODE_CONFIG_DIR: config, OPENCODE_DB: "caller.db" },
      }),
    ).toMatchObject({
      path: join(home, "service-data/opencode/service.db"),
      source: "(`OPENCODE_DB` in OpenCode's service config)",
    });
    expect(readFileSync(file, "utf8")).toBe(content);
  } finally {
    rmSync(home, { recursive: true });
  }
});

it.each([
  null,
  false,
  [],
  "config",
  {},
  { env: null },
  { env: [] },
  { env: 1 },
  { env: { OPENCODE_DB: 1 } },
  { env: { OPENCODE_DB: "discard.db", BAD: false } },
])("ignores an invalid service environment without writing it: %j", (input) => {
  const home = mkdtempSync(join(tmpdir(), "stats-service-invalid-"));
  const file = join(home, "service.json");
  const content = JSON.stringify(input);
  writeFileSync(file, content);
  try {
    expect(
      selectDatabase({ env: { HOME: home, OPENCODE_CONFIG_DIR: home, OPENCODE_DB: "caller.db" } }),
    ).toEqual({ path: join(home, ".local/share/opencode/caller.db"), source: "(`OPENCODE_DB`)" });
    expect(readFileSync(file, "utf8")).toBe(content);
  } finally {
    rmSync(home, { recursive: true });
  }
});

it.each(["latest", "dev", "beta", "next", "prod", "feature/channel", "local"])(
  "uses OpenCode's default database filename for channel %s",
  (channel) => {
    const custom = channel === "local" || channel === "feature/channel";
    expect(selectDatabase({ env: { HOME: "/synthetic/home" }, channel })).toEqual({
      path: `/synthetic/home/.local/share/opencode/${custom ? `opencode-${channel.replace("/", "-")}.db` : "opencode.db"}`,
      source: "(OpenCode's data folder)",
    });
  },
);

it.each(["1", "true", "false", "0"])(
  "honours the channel database opt-out exactly: %s",
  (disabled) => {
    expect(
      selectDatabase({
        channel: "custom #!",
        env: { HOME: "/synthetic/home", OPENCODE_DISABLE_CHANNEL_DB: disabled },
      }).path,
    ).toBe(
      `/synthetic/home/.local/share/opencode/${disabled === "1" || disabled === "true" ? "opencode.db" : "opencode-custom---.db"}`,
    );
  },
);

it("matches OpenCode's UTF-16 channel sanitization and preserves permitted filename characters", () => {
  expect(selectDatabase({ env: { HOME: "/synthetic/home" }, channel: "x😎" }).path).toBe(
    "/synthetic/home/.local/share/opencode/opencode-x--.db",
  );
  expect(selectDatabase({ env: { HOME: "/synthetic/home" }, channel: "Az09._-" }).path).toBe(
    "/synthetic/home/.local/share/opencode/opencode-Az09._-.db",
  );
});

it("keeps memory and empty environment filenames distinct, and records absolute overrides", () => {
  expect(selectDatabase({ env: { OPENCODE_DB: ":memory:" } })).toEqual({
    path: ":memory:",
    source: "(`OPENCODE_DB`)",
  });
  expect(selectDatabase({ env: { HOME: "/synthetic/home", OPENCODE_DB: "" } }).path).toBe(
    "/synthetic/home/.local/share/opencode",
  );
  expect(selectDatabase({ env: {}, db: "./chosen.db" })).toEqual({
    path: join(process.cwd(), "chosen.db"),
    source: "(from `--db`)",
  });
  expect(selectDatabase({ env: {}, db: "/synthetic/chosen.db", overrideSource: "plugin" })).toEqual(
    { path: "/synthetic/chosen.db", source: "(the plugin's `db` option)" },
  );
  expect(selectDatabase({ env: {} })).toEqual({
    path: "/synthetic/private-home/.local/share/opencode/opencode.db",
    source: "(OpenCode's data folder)",
  });
  expect(stateFolder({})).toBe("/synthetic/private-home/.local/state/opencode-stats");
});

it.each(["xdg", "home"])(
  "locates service.json in the %s config folder and overlays HOME",
  (kind) => {
    const home = mkdtempSync(join(tmpdir(), "stats-service-folder-"));
    const config = kind === "xdg" ? join(home, "xdg/opencode") : join(home, ".config/opencode");
    mkdirSync(config, { recursive: true });
    writeFileSync(
      join(config, "service.json"),
      JSON.stringify({
        env: { HOME: join(home, "overlay-home"), OPENCODE_DB: "/synthetic/absolute.db" },
      }),
    );
    const env = { HOME: home, ...(kind === "xdg" ? { XDG_CONFIG_HOME: join(home, "xdg") } : {}) };
    try {
      expect(selectDatabase({ env })).toEqual({
        path: "/synthetic/absolute.db",
        source: "(`OPENCODE_DB` in OpenCode's service config)",
      });
      writeFileSync(
        join(config, "service.json"),
        JSON.stringify({ env: { HOME: join(home, "overlay-home") } }),
      );
      expect(selectDatabase({ env }).path).toBe(
        join(home, "overlay-home/.local/share/opencode/opencode.db"),
      );
      writeFileSync(join(config, "service.json"), "not json");
      expect(selectDatabase({ env }).path).toBe(join(home, ".local/share/opencode/opencode.db"));
    } finally {
      rmSync(home, { recursive: true });
    }
  },
);

it.each([
  undefined,
  null,
  false,
  "config",
  [],
  Object.assign([], { env: { OPENCODE_DB: "evil.db" } }),
])("rejects malformed service config at the public trust boundary: %j", (input) => {
  expect(() => parseServiceEnvironment(input)).toThrow("Invalid OpenCode service config.");
});

it.each([null, false, "env", [], Object.assign([], { OPENCODE_DB: "evil.db" })])(
  "rejects malformed service environment: %j",
  (env) => {
    expect(() => parseServiceEnvironment({ env })).toThrow("Invalid OpenCode service environment.");
  },
);

it("accepts string-only environment entries, including an absent environment", () => {
  expect(parseServiceEnvironment({})).toEqual({});
  expect(
    parseServiceEnvironment({ env: { OPENCODE_DB: "relative.db", API_KEY: "not-forwarded" } }),
  ).toEqual({ OPENCODE_DB: "relative.db", API_KEY: "not-forwarded" });
  expect(() => parseServiceEnvironment({ env: { OPENCODE_DB: 1 } })).toThrow(
    "Invalid OpenCode service environment value.",
  );
});
