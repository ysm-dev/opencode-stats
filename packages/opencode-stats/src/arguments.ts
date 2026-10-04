import { parseArgs } from "node:util";

export const help = "Usage: opencode-stats [--port <n>] [--no-open] [--help] [--version]\n";

export const parseArguments = (args: string[]) => {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      port: { type: "string", default: "22439" },
      "no-open": { type: "boolean" },
      help: { type: "boolean" },
      version: { type: "boolean" },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  return { port, open: !values["no-open"], help: values.help, version: values.version };
};
