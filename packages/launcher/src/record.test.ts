import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("node:fs", { spy: true });
vi.mock("node:crypto", { spy: true });
import { displayPath, parseRecord, publishRecord, readRecord, stateFolder } from "./record.ts";

export const record = {
  address: "http://127.0.0.1:22439",
  pid: 123,
  version: "1.3.0",
  database: "/synthetic/a.db",
  starter: "plugin",
  protocol: 1,
  secret: "a".repeat(64),
} as const;

it("publishes a validated private record atomically in the private XDG state folder", () => {
  const root = mkdtempSync(join(tmpdir(), "record-"));
  try {
    const folder = stateFolder({ XDG_STATE_HOME: root });
    mkdirSync(folder, { mode: 0o777 });
    chmodSync(folder, 0o777);
    publishRecord(folder, record);
    expect(parseRecord(JSON.parse(readFileSync(join(folder, "server.json"), "utf8")))).toEqual(
      record,
    );
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    expect(statSync(join(folder, "server.json")).mode & 0o777).toBe(0o600);
    expect(stateFolder({ HOME: "/synthetic" })).toBe("/synthetic/.local/state/opencode-stats");
  } finally {
    rmSync(root, { recursive: true });
  }
});

it("requires every own record field and validates primitive types and numeric/address boundaries", () => {
  for (const key of Object.keys(record)) {
    const missing = { ...record };
    Reflect.deleteProperty(missing, key);
    expect(() => parseRecord(missing)).toThrow("Invalid dashboard server record.");
  }
  for (const input of [1, false, "record", [], () => {}, Object.assign(() => {}, record)])
    expect(() => parseRecord(input)).toThrow("Invalid dashboard server record.");
  for (const address of [
    null,
    22439,
    {},
    "xhttp://127.0.0.1:1",
    "http://127.0.0.1:1/",
    "http://127.0.0.1:0",
    "http://127.0.0.1:01",
    "http://127.0.0.1:65536",
    "http://127.0.0.1:999999",
    { toString: () => record.address },
  ])
    expect(() => parseRecord({ ...record, address })).toThrow("Invalid dashboard server record.");
  for (const pid of [null, "123", 1.5, -1, Number.MAX_SAFE_INTEGER + 1])
    expect(() => parseRecord({ ...record, pid })).toThrow("Invalid dashboard server record.");
  for (const version of [null, 123, "x1.3.0", "1.3.0 ", { toString: () => "1.3.0" }])
    expect(() => parseRecord({ ...record, version })).toThrow("Invalid dashboard server record.");
  for (const database of [null, 1, {}, ""])
    expect(() => parseRecord({ ...record, database })).toThrow("Invalid dashboard server record.");
  for (const secret of [
    null,
    1,
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    { toString: () => record.secret },
  ])
    expect(() => parseRecord({ ...record, secret })).toThrow("Invalid dashboard server record.");
  for (const address of ["http://127.0.0.1:1", "http://127.0.0.1:80", "http://127.0.0.1:65535"])
    expect(parseRecord({ ...record, address })).toMatchObject({ address });
  expect(
    parseRecord({
      ...record,
      pid: Number.MAX_SAFE_INTEGER,
      version: "12.34.56-dev.1",
      starter: "terminal",
      secret: "0123456789abcdef".repeat(4),
    }),
  ).toMatchObject({ pid: Number.MAX_SAFE_INTEGER, version: "12.34.56-dev.1", starter: "terminal" });
});

it("only reads valid private records and abbreviates home without changing neighbouring paths", () => {
  const root = mkdtempSync(join(tmpdir(), "read-record-"));
  try {
    expect(readRecord(root)).toBeUndefined();
    publishRecord(root, record);
    expect(readRecord(root)).toEqual(record);
    expect(displayPath("/home/synthetic", "/home/synthetic")).toBe("~");
    expect(displayPath("/home/synthetic/a.db", "/home/synthetic")).toBe("~/a.db");
    expect(displayPath("/home/synthetic-other/a.db", "/home/synthetic")).toBe(
      "/home/synthetic-other/a.db",
    );
    expect(displayPath(realpathSync(root), root)).toBe("~");
  } finally {
    rmSync(root, { recursive: true });
  }
});

it("abbreviates an explicitly symlinked home on platforms without implicit home aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "home-alias-"));
  const home = join(realpathSync(root), "actual-home");
  const alias = join(root, "home-alias");
  mkdirSync(home);
  symlinkSync(home, alias, "dir");
  try {
    expect(realpathSync(alias)).not.toBe(alias);
    expect(displayPath(home, alias)).toBe("~");
    expect(displayPath(join(home, "statistics.db"), alias)).toBe("~/statistics.db");
    expect(displayPath(`${home}-neighbour/statistics.db`, alias)).toBe(
      `${home}-neighbour/statistics.db`,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

it("owns and closes its temporary descriptor and removes a file left by a failed rename", () => {
  const folder = mkdtempSync(join(tmpdir(), "failed-record-rename-"));
  mkdirSync(join(folder, "server.json"));
  let descriptor: number | undefined;
  try {
    expect(() => publishRecord(folder, record)).toThrow(/EISDIR|EEXIST|EPERM/u);
    expect(readdirSync(folder)).toEqual(["server.json"]);
    const opened = vi.mocked(fs.openSync).mock.results.at(-1)!;
    if (opened.type !== "return") throw new Error("No temporary descriptor");
    descriptor = opened.value;
    expect(() => fs.fstatSync(descriptor!)).toThrow("EBADF");
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        /* Already closed is the expected state. */
      }
    }
    rmSync(folder, { recursive: true });
  }
});

it("never overwrites or removes a temporary file it did not create", () => {
  const folder = mkdtempSync(join(tmpdir(), "record-collision-"));
  const uuid = "00000000-0000-0000-0000-000000000000";
  const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
  const temporary = join(folder, `server.${uuid}.tmp`);
  fs.writeFileSync(temporary, "other synthetic owner");
  try {
    expect(() => publishRecord(folder, record)).toThrow("EEXIST");
    expect(readFileSync(temporary, "utf8")).toBe("other synthetic owner");
  } finally {
    random.mockRestore();
    rmSync(folder, { recursive: true });
  }
});

it("refuses records that could target foreign services or malformed identities", () => {
  for (const input of [
    null,
    {},
    { ...record, address: "http://foreign.test:22439" },
    { ...record, pid: 0 },
    { ...record, protocol: 2 },
    { ...record, secret: "short" },
    { ...record, database: "relative.db" },
    { ...record, starter: "other" },
    { ...record, version: "x" },
  ]) {
    expect(() => parseRecord(input)).toThrow("Invalid dashboard server record.");
  }
});
