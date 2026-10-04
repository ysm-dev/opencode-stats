import { createInterface } from "node:readline";
import { start } from "@opencode-stats/launcher";
import { serverScript, version } from "./paths.ts";
import { openBrowser } from "./browser.ts";

export const foreground = (
  port: number,
  open: boolean,
  options: {
    executable?: string;
    script?: string;
    env?: NodeJS.ProcessEnv;
    startupTimeout?: number;
    db?: string | undefined;
  },
) =>
  new Promise<number>((resolve) => {
    const child = start({
      executable: options.executable ?? process.execPath,
      script: options.script ?? serverScript,
      port,
      env: options.env ?? process.env,
      db: options.db,
    });
    const lines = createInterface({ input: child.stdout });
    let stopping = false;
    let ready = false;
    const stop = (): void => {
      stopping = true;
      child.kill("SIGINT");
    };
    const timeout = setTimeout(() => {
      child.kill();
    }, options.startupTimeout ?? 10000);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.stderr.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });
    child.on("error", () => {
      /* close follows spawn errors */
    });
    lines.on("line", (line) => {
      if (line !== "opencode-stats-ready") {
        process.stdout.write(`${line}\n`);
        return;
      }
      if (ready || stopping) return;
      ready = true;
      clearTimeout(timeout);
      process.stdout.write(
        `opencode-stats ${version} · http://127.0.0.1:${port}\nPress Ctrl+C to stop.\n`,
      );
      if (open)
        void openBrowser(
          `http://127.0.0.1:${port}`,
          process.platform,
          options.env ?? process.env,
        ).catch(() => {
          process.stderr.write(
            `Couldn't open the browser. Open http://127.0.0.1:${port} instead.\n`,
          );
        });
    });
    child.once("close", () => {
      clearTimeout(timeout);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      if (stopping) {
        process.stdout.write("Stopped.\n");
        resolve(0);
      } else {
        process.stderr.write("Can't start: dashboard server stopped.\n");
        resolve(1);
      }
    });
  });
