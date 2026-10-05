import { runtimeProblem } from "./runtime.ts";
import { help, parseArguments } from "./arguments.ts";
import { version } from "./paths.ts";
import { foreground } from "./foreground.ts";
import { databasePath } from "@opencode-stats/launcher";
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
  const db = databasePath({ db: flags.db ?? options.db, env: options.env ?? process.env });
  const file = await stat(db).catch(() => undefined);
  if (!file?.isFile()) {
    process.stderr.write(
      `Can't find the OpenCode database: ${db}\nRun OpenCode once, or pass \`--db <path>\`\n`,
    );
    return 1;
  }
  return foreground(flags.port, flags.open, { ...options, db });
};
