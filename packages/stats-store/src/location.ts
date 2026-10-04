import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StorePaths } from "./database.ts";

export type StoreOptions = { readonly source: string; readonly cacheHome?: string };

export function storePaths(options: StoreOptions): StorePaths {
  const source = realpathSync(options.source);
  if (!statSync(source).isFile()) throw new Error();
  const folder = join(
    options.cacheHome ?? (process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache")),
    "opencode-stats",
  );
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const store = join(folder, `${createHash("sha256").update(source).digest("hex")}.db`);
  closeSync(openSync(store, "a", 0o600));
  chmodSync(store, 0o600);
  for (const suffix of ["-wal", "-shm"])
    if (existsSync(`${store}${suffix}`)) chmodSync(`${store}${suffix}`, 0o600);
  return { source, store };
}
