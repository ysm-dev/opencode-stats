import { spawn } from "node:child_process";
import { emptyConfig } from "./paths.ts";

export const start = (options: {
  executable: string;
  script: string;
  port: number;
  env: NodeJS.ProcessEnv;
}) => {
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
  ]) {
    env[key] = options.env[key];
  }
  return spawn(
    options.executable,
    [
      "--no-env-file",
      `--config=${emptyConfig}`,
      "--no-install",
      options.script,
      "--port",
      String(options.port),
    ],
    { env },
  );
};
