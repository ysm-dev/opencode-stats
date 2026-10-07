import {
  type DatabaseSelection,
  discover,
  displayPath,
  stateFolder,
  starterLabel,
} from "@opencode-stats/launcher";
import { version } from "./paths.ts";
import { openBrowser } from "./browser.ts";
import { setTimeout } from "node:timers/promises";

export async function joinRunning(
  open: boolean,
  options: { env?: NodeJS.ProcessEnv; database: DatabaseSelection },
): Promise<0 | undefined> {
  const env = options.env ?? process.env;
  const record = await discover(stateFolder(env), options.database.path, version);
  if (!record) return undefined;
  process.stdout.write(
    `opencode-stats ${record.version} · ${record.address} · already running, started ${starterLabel(record)}\nDatabase: ${displayPath(record.database)} ${options.database.source}\n`,
  );
  if (open)
    await openBrowser(record.address, process.platform, env).catch(() => {
      process.stderr.write(`Couldn't open the browser. Open ${record.address} instead.\n`);
    });
  return 0;
}

export async function joinWinner(
  open: boolean,
  options: Parameters<typeof joinRunning>[1],
): Promise<boolean> {
  for (let remaining = 5; remaining !== 0; remaining -= 1) {
    if ((await joinRunning(open, options)) === 0) return true;
    await setTimeout(100);
  }
  return false;
}
