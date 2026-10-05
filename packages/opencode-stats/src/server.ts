import type { Plugin } from "@opencode/plugin";
import { statSync } from "node:fs";
import { holdServer, selectDatabase, displayPath } from "@opencode-stats/launcher";
import { pluginOptions } from "./options.ts";
import { serverScript, version } from "./paths.ts";

declare const Bun: { readonly version: string };

const setup = (
  context: Pick<Plugin.Context, "options" | "app">,
  runtime: { env?: NodeJS.ProcessEnv; executable?: string; script?: string } = {},
): (() => void) => {
  const options = pluginOptions(context.options);
  if (typeof Bun === "undefined")
    throw new Error("opencode-stats needs OpenCode's standard (Bun) build");
  const env = runtime.env ?? process.env;
  const database = selectDatabase({
    ...options,
    env,
    channel: context.app.channel,
    overrideSource: "plugin",
  });
  let exists = false;
  try {
    exists = statSync(database.path).isFile();
  } catch {
    /* Preflight never creates a missing source or exposes filesystem error text. */
  }
  if (!exists)
    throw new Error(
      `Can't find the OpenCode database: ${displayPath(database.path)} ${database.source}\nRun OpenCode once, or set the plugin's \`db\` option.`,
    );
  return holdServer({
    executable: runtime.executable ?? process.execPath,
    script: runtime.script ?? serverScript,
    port: options.port,
    db: database.path,
    env,
    version,
  }).release;
};

export default { id: "opencode-stats", setup } satisfies Plugin.Plugin;
