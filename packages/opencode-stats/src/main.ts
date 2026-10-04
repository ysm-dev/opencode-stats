import { runtimeProblem } from "./runtime.ts";
import { help, parseArguments } from "./arguments.ts";
import { version } from "./paths.ts";
import { foreground } from "./foreground.ts";

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
  return foreground(flags.port, flags.open, { ...options, db: flags.db ?? options.db });
};
