import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: service config JSON is narrowed to string environment entries
export const parseServiceEnvironment = (input: unknown): NodeJS.ProcessEnv => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Invalid OpenCode service config.");
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: untrusted service config env is validated before overlay
  const env: unknown = Reflect.get(input, "env");
  if (env === undefined) return {};
  if (typeof env !== "object" || env === null || Array.isArray(env))
    throw new Error("Invalid OpenCode service environment.");
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: each parsed JSON environment value must be a string
    const value: unknown = Reflect.get(env, key);
    if (typeof value !== "string") throw new Error("Invalid OpenCode service environment value.");
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return result;
};

export type DatabaseOptions = {
  db?: string | undefined;
  env: NodeJS.ProcessEnv;
  channel?: string;
  overrideSource?: "flag" | "plugin";
};

export function selectDatabase(options: DatabaseOptions): { path: string; source: string } {
  if (options.db !== undefined)
    return {
      path: resolve(options.db),
      source: options.overrideSource === "plugin" ? "(the plugin's `db` option)" : "(from `--db`)",
    };
  const home = options.env["HOME"] || homedir();
  const config =
    options.env["OPENCODE_CONFIG_DIR"] ||
    join(options.env["XDG_CONFIG_HOME"] || join(home, ".config"), "opencode");
  let overlay: NodeJS.ProcessEnv = {};
  try {
    overlay = parseServiceEnvironment(
      JSON.parse(readFileSync(join(config, "service.json")).toString()),
    );
  } catch {
    /* Like OpenCode, an absent, unreadable or invalid service config contributes no env. */
  }
  const env = { ...options.env, ...overlay };
  const data = join(
    env["XDG_DATA_HOME"] || join(env["HOME"] || home, ".local", "share"),
    "opencode",
  );
  const channel = options.channel ?? "latest";
  const official =
    ["latest", "dev", "beta", "next", "prod"].includes(channel) ||
    env["OPENCODE_DISABLE_CHANNEL_DB"] === "1" ||
    env["OPENCODE_DISABLE_CHANNEL_DB"] === "true";
  const filename =
    env["OPENCODE_DB"] ??
    (official ? "opencode.db" : `opencode-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`);
  return {
    path: filename === ":memory:" ? filename : resolve(data, filename),
    source:
      env["OPENCODE_DB"] !== undefined
        ? overlay["OPENCODE_DB"] !== undefined
          ? "(`OPENCODE_DB` in OpenCode's service config)"
          : "(`OPENCODE_DB`)"
        : "(OpenCode's data folder)",
  };
}

export const databasePath = (options: DatabaseOptions): string => selectDatabase(options).path;
