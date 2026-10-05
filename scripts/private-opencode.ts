import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export function privateOpenCode(options: {
  executable: string;
  home: string;
  plugin: string;
  port: number;
  db?: string;
  state?: string;
  cache?: string;
}) {
  const config = join(options.home, "config/opencode");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString("hex");
  const env: NodeJS.ProcessEnv = {
    HOME: options.home,
    USERPROFILE: options.home,
    XDG_CONFIG_HOME: join(options.home, "config"),
    XDG_DATA_HOME: join(options.home, "data"),
    XDG_STATE_HOME: options.state ?? join(options.home, "state"),
    XDG_CACHE_HOME: options.cache ?? join(options.home, "cache"),
    OPENCODE_CONFIG_DIR: config,
    OPENCODE_DB: join(options.home, "opencode.db"),
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    SystemRoot: process.env["SystemRoot"],
    WINDIR: process.env["WINDIR"],
    TMPDIR: options.home,
    TMP: options.home,
    TEMP: options.home,
  };
  writeFileSync(
    join(config, "opencode.json"),
    JSON.stringify({
      plugins: [
        {
          package: options.plugin,
          options: { port: options.port, ...(options.db === undefined ? {} : { db: options.db }) },
        },
      ],
    }),
    { mode: 0o600 },
  );
  const child = spawn(options.executable, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: options.home,
    env,
  });
  let output = "";
  let error = "";
  child.stderr.on("data", (chunk: Buffer) => {
    error += chunk.toString();
  });
  const address = new Promise<string>((done, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = /server listening on (http:\/\/127\.0\.0\.1:\d+)/u.exec(output);
      if (match?.[1]) done(match[1]);
    });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(`Private OpenCode stopped: ${error}`)));
  });
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  return {
    child,
    address,
    closed,
    env,
    headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` },
    transcript: () => ({ output, error }),
  };
}
