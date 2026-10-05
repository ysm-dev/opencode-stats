import { runtimeProblem } from "./runtime.ts";
import { help, parseArguments } from "./arguments.ts";
import { version } from "./paths.ts";
import { foreground } from "./foreground.ts";
import { joinRunning } from "./join.ts";
import { selectDatabase, joinMessage, displayPath } from "@opencode-stats/launcher";
import { stat } from "node:fs/promises";

export const run = async (
  args: string[],
  options: Parameters<typeof foreground>[2] = {},
): Promise<number> => {
  const problem = runtimeProblem();
  if (problem) {
    process.stderr.write(`${problem}\n`);
    return 1;
  }
  let flags;
  try {
    flags = parseArguments(args);
  } catch {
    process.stderr.write("Bad flags. Use `opencode-stats --help`.\n");
    return 2;
  }
  if (flags.help) {
    process.stdout.write(help);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`opencode-stats ${version}\n`);
    return 0;
  }
  let database;
  try {
    database = selectDatabase({ db: flags.db ?? options.db, env: options.env ?? process.env });
  } catch (error) {
    process.stderr.write(`${joinMessage(error)}\n`);
    return 1;
  }
  const db = database.path;
  const settings = { ...options, db };
  let interrupted = false;
  const stop = (): void => {
    interrupted = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const joined = await joinRunning(flags.open, settings);
    if (interrupted) {
      process.stdout.write("Stopped.\n");
      return 0;
    }
    if (joined !== undefined) return joined;
    const file = await stat(db).catch(() => undefined);
    if (!file?.isFile()) {
      process.stderr.write(
        `Can't find the OpenCode database: ${displayPath(db)} ${database.source}\nRun OpenCode once, or pass \`--db <path>\`\n`,
      );
      return 1;
    }
  } catch (error) {
    process.stderr.write(`${joinMessage(error)}\n`);
    return 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
  return foreground(flags.port, flags.open, settings);
};
