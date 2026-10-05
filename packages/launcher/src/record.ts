import { randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type ServerRecord = {
  readonly address: string;
  readonly pid: number;
  readonly version: string;
  readonly database: string;
  readonly starter: "plugin" | "terminal";
  readonly protocol: 1;
  readonly secret: string;
};
export const stateFolder = (env: NodeJS.ProcessEnv): string =>
  join(
    env["XDG_STATE_HOME"] || join(env["HOME"] || homedir(), ".local", "state"),
    "opencode-stats",
  );

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: record address is restricted to an IPv4 loopback HTTP origin
const recordAddress = (input: unknown): string => {
  if (
    typeof input !== "string" ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(input) ||
    Number(input.slice(input.lastIndexOf(":") + 1)) > 65535
  )
    throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: record process identity must be a positive safe integer
const recordPid = (input: unknown): number => {
  if (!Number.isSafeInteger(input) || Number(input) <= 0)
    throw new Error("Invalid dashboard server record.");
  return Number(input);
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: disk version must be a release identity, not a coerced value
const recordVersion = (input: unknown): string => {
  if (typeof input !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(input))
    throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: disk database must be an absolute path
const recordDatabase = (input: unknown): string => {
  if (typeof input !== "string" || !isAbsolute(input))
    throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: only the two decided starters are accepted
const recordStarter = (input: unknown): ServerRecord["starter"] => {
  if (input !== "plugin" && input !== "terminal")
    throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: protocol 1 is stable across releases
const recordProtocol = (input: unknown): 1 => {
  if (input !== 1) throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: the authentication secret is 256 random bits encoded as hex
const recordSecret = (input: unknown): string => {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input))
    throw new Error("Invalid dashboard server record.");
  return input;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: disk JSON is narrowed before making network requests
export function parseRecord(input: unknown): ServerRecord {
  if (typeof input !== "object" || input === null)
    throw new Error("Invalid dashboard server record.");
  return {
    address: recordAddress(Object.getOwnPropertyDescriptor(input, "address")?.value),
    pid: recordPid(Object.getOwnPropertyDescriptor(input, "pid")?.value),
    version: recordVersion(Object.getOwnPropertyDescriptor(input, "version")?.value),
    database: recordDatabase(Object.getOwnPropertyDescriptor(input, "database")?.value),
    starter: recordStarter(Object.getOwnPropertyDescriptor(input, "starter")?.value),
    protocol: recordProtocol(Object.getOwnPropertyDescriptor(input, "protocol")?.value),
    secret: recordSecret(Object.getOwnPropertyDescriptor(input, "secret")?.value),
  };
}

export function readRecord(folder: string): ServerRecord | undefined {
  let record: ServerRecord | undefined;
  try {
    record = parseRecord(JSON.parse(readFileSync(join(folder, "server.json")).toString()));
  } catch {
    /* A missing or invalid record is not a running dashboard server. */
  }
  return record;
}

export function publishRecord(folder: string, record: ServerRecord): void {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const temporary = join(folder, `server.${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, JSON.stringify(record));
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, join(folder, "server.json"));
  } finally {
    rmSync(temporary, { force: true });
  }
}

export const displayPath = (path: string, home: string = homedir()): string => {
  let canonical = home;
  try {
    canonical = realpathSync(home);
  } catch {
    /* Nonexistent supplied homes still have a useful display spelling. */
  }
  return path === canonical
    ? "~"
    : path.startsWith(`${canonical}/`)
      ? `~${path.slice(canonical.length)}`
      : path;
};
