import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { sqliteLibraryFile } from "./paths.ts";

const api = vi.hoisted(() => ({ setCustomSQLite: vi.fn<(file: string) => void>() }));
const environment = vi.hoisted(() => ({ main: false }));
vi.mock("bun:sqlite", () => ({ Database: api }));
vi.mock("node:process", () => ({ platform: "darwin" }));
vi.mock("node:worker_threads", () => ({
  get isMainThread() {
    return environment.main;
  },
}));
beforeEach(() => {
  vi.resetModules();
  api.setCustomSQLite.mockReset();
  environment.main = false;
});

it("selects only the controlled file before SQLite opens, once in the main macOS thread", async () => {
  const { initializeSQLite } = await import("./sqlite-library.bun.ts");
  initializeSQLite("linux", true, "missing");
  initializeSQLite("win32", true, "missing");
  initializeSQLite("darwin", false, "missing");
  expect(api.setCustomSQLite).not.toHaveBeenCalled();
  initializeSQLite("darwin", true);
  expect(api.setCustomSQLite).toHaveBeenCalledExactlyOnceWith(sqliteLibraryFile);
  initializeSQLite("darwin", true, "missing");
  expect(api.setCustomSQLite).toHaveBeenCalledTimes(1);
});

it("initializes from the actual adapter import before any native client is constructed", async () => {
  environment.main = true;
  await import("./sqlite-library.bun.ts");
  expect(api.setCustomSQLite).toHaveBeenCalledExactlyOnceWith(sqliteLibraryFile);
});

it("refuses changed library bytes instead of opening an unverified native dependency", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sqlite-integrity-"));
  const file = join(folder, "library.dylib");
  writeFileSync(file, "synthetic tampered native file");
  try {
    const { initializeSQLite } = await import("./sqlite-library.bun.ts");
    expect(() => initializeSQLite("darwin", true, file)).toThrow(
      "Controlled SQLite library checksum mismatch.",
    );
    expect(api.setCustomSQLite).not.toHaveBeenCalled();
  } finally {
    rmSync(folder, { recursive: true });
  }
});
