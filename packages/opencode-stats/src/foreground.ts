import { createInterface } from "node:readline";
import { start, type DatabaseSelection } from "@opencode-stats/launcher";
import { serverScript, version } from "./paths.ts";
import { openBrowser } from "./browser.ts";
import { joinWinner } from "./join.ts";
import { joinMessage } from "@opencode-stats/launcher";

export const foreground = (
  port: number,
  open: boolean,
  options: {
    executable?: string;
    script?: string;
    env?: NodeJS.ProcessEnv;
    startupTimeout?: number;
    retries?: number;
    database: DatabaseSelection;
  },
) =>
  new Promise<number>((resolve) => {
    const child = start({
      executable: options.executable ?? process.execPath,
      script: options.script ?? serverScript,
      port,
      env: options.env ?? process.env,
      db: options.database.path,
    });
    const lines = createInterface({ input: child.stdout });
    const errors = createInterface({ input: child.stderr });
    let reported = false;
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
    errors.on("line", (line) => {
      reported ||= line.startsWith("Can't start:");
      process.stderr.write(`${line}\n`);
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
    child.once("close", (code) => {
      clearTimeout(timeout);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      if (stopping) {
        process.stdout.write("Stopped.\n");
        resolve(0);
      } else if (code === 0 && !ready) {
        void joinWinner(open, options)
          .then((joined) => {
            if (!joined && (options.retries ?? 0) < 2) {
              return foreground(port, open, {
                ...options,
                retries: (options.retries ?? 0) + 1,
              }).then(resolve);
            }
            if (!joined && !reported)
              process.stderr.write("Can't start: dashboard server stopped.\n");
            return resolve(joined ? 0 : 1);
          })
          .catch((error) => {
            process.stderr.write(`${joinMessage(error)}\n`);
            resolve(1);
          });
      } else {
        if (!reported) process.stderr.write("Can't start: dashboard server stopped.\n");
        resolve(1);
      }
    });
  });
