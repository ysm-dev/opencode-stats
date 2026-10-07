import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  realpathSync,
  statSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { StorePaths } from "./database.ts";

export type StoreOptions = {
  readonly source: string;
  readonly cacheHome?: string;
  readonly resolvedSource?: string;
};

function cachedSource(file: string) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function identity(file: string) {
  try {
    const stat = statSync(file);
    return `${stat.dev}:${stat.ino}`;
  } catch {
    return undefined;
  }
}

export function storePaths(options: StoreOptions): StorePaths {
  const source = options.resolvedSource ?? realpathSync(options.source);
  if (options.resolvedSource === undefined && !statSync(source).isFile()) throw new Error();
  const folder = join(
    options.cacheHome ?? (process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache")),
    "opencode-stats",
  );
  const store = join(folder, `${createHash("sha256").update(source).digest("hex")}.db`);
  return { source, store, ...(options.source === source ? {} : { sourceAlias: options.source }) };
}

function protectedSource(paths: StorePaths) {
  const source = paths.source;
  const protectedPaths = [source, ...(paths.sourceAlias ? [paths.sourceAlias] : [])].flatMap(
    (file) => [file, `${file}-wal`, `${file}-shm`],
  );
  const protectedIdentities = new Set(
    protectedPaths.map(identity).filter((value) => value !== undefined),
  );
  return (file: string) =>
    protectedPaths.includes(file) || protectedIdentities.has(identity(file) ?? "");
}

export function assertStoreDestination(paths: StorePaths): void {
  const protectedFile = protectedSource(paths);
  const store = paths.store;
  // A symlink/hardlink at a derived destination must never turn cache writes into source writes.
  if (["", "-wal", "-shm", ".source", ".sync"].some((suffix) => protectedFile(`${store}${suffix}`)))
    throw Object.assign(new Error("Unsafe derived destination."), { code: "EACCES" });
}

export function prepareStorePaths(paths: StorePaths): void {
  const { source, store } = paths;
  const folder = dirname(store);
  assertStoreDestination(paths);
  const protectedFile = protectedSource(paths);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  for (const entry of readdirSync(folder)) {
    if (!/^[0-9a-f]{64}\.db\.source$/.test(entry)) continue;
    const files = ["", "-wal", "-shm", ".source", ".sync"].map((suffix) =>
      join(folder, `${entry.slice(0, -7)}${suffix}`),
    );
    // Do not even open a marker if it aliases the served database or its WAL companions.
    if (files.includes(store) || files.some(protectedFile)) continue;
    const saved = cachedSource(join(folder, entry));
    if (saved === undefined) continue;
    const name = `${createHash("sha256").update(saved).digest("hex")}.db`;
    if (`${name}.source` !== entry) continue;
    if (existsSync(saved)) continue;
    for (const file of files) rmSync(file, { force: true });
  }
  closeSync(openSync(store, "a", 0o600));
  chmodSync(store, 0o600);
  writeFileSync(`${store}.source`, source, { mode: 0o600 });
  chmodSync(`${store}.source`, 0o600);
  for (const suffix of ["-wal", "-shm"])
    if (existsSync(`${store}${suffix}`)) chmodSync(`${store}${suffix}`, 0o600);
}
