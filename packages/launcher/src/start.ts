import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { emptyConfig } from "./paths.ts";

export type StartOptions = {
  executable: string;
  script: string;
  port: number;
  env: NodeJS.ProcessEnv;
  db?: string | undefined;
  detached?: boolean;
};
export function start(options: StartOptions & { detached: true }): ChildProcess;
export function start(options: StartOptions): ChildProcessWithoutNullStreams;
export function start(options: StartOptions): ChildProcess {
  const db = databasePath(options);
  const env: NodeJS.ProcessEnv = { BUN_BE_BUN: "1" };
  for (const key of [
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "WINDIR",
    "TMPDIR",
    "TMP",
    "TEMP",
    "XDG_STATE_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "OPENCODE_DB",
    "NO_COLOR",
  ])
    env[key] = options.env[key];
  return spawn(
    options.executable,
    [
      "--no-env-file",
      `--config=${emptyConfig}`,
      "--no-install",
      options.script,
      "--port",
      String(options.port),
      "--db",
      db,
      ...(options.detached ? ["--starter", "plugin"] : []),
    ],
    {
      env,
      cwd: dirname(options.script),
      detached: options.detached,
      ...(options.detached ? { stdio: "ignore" as const } : {}),
    },
  );
}

export const databasePath = (options: {
  db?: string | undefined;
  env: NodeJS.ProcessEnv;
}): string =>
  resolve(
    options.db ??
      (options.env["OPENCODE_DB"] ||
        join(
          options.env["XDG_DATA_HOME"] || join(options.env["HOME"] || homedir(), ".local", "share"),
          "opencode",
          "opencode.db",
        )),
  );
