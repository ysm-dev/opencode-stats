import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname } from "node:path";
import { selectDatabase } from "./database.ts";
import { emptyConfig } from "./paths.ts";

export type StartOptions = {
  executable: string;
  script: string;
  port: number;
  env: NodeJS.ProcessEnv;
  db?: string | undefined;
  detached?: boolean;
  databaseSource?: string;
};
export function start(options: StartOptions & { detached: true }): ChildProcess;
export function start(options: StartOptions): ChildProcessWithoutNullStreams;
export function start(options: StartOptions): ChildProcess {
  const database = selectDatabase(options);
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
    "OPENCODE_STATS_COLOR",
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
      "--db-source",
      options.databaseSource ?? database.source,
      "--db",
      database.path,
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
