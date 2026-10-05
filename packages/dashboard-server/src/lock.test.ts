import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { bunLock } from "./lock.bun.ts";

const native = vi.hoisted(() => ({
  initialized: false,
  closed: 0,
  statements: [] as string[],
  fail: () => {},
}));
vi.mock("bun:sqlite", () => ({
  Database: class extends DatabaseSync {
    constructor(file: string) {
      if (!native.initialized) throw new Error("SQLite initialization must precede every open.");
      native.initialized = false;
      native.fail();
      super(file);
      super.exec("PRAGMA busy_timeout=10000");
    }
    override close() {
      native.closed += 1;
      super.close();
    }
    override exec(statement: string) {
      native.statements.push(statement);
      super.exec(statement);
    }
  },
}));
vi.mock("@opencode-stats/stats-store/bun", () => ({
  initializeSQLite: () => {
    native.initialized = true;
  },
}));

it("holds the exclusive lock until its scope ends, then permits a new owner", async () => {
  const folder = mkdtempSync(join(tmpdir(), "server-lock-"));
  const file = join(folder, "server.lock");
  const previousCloses = native.closed;
  native.statements.length = 0;
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* bunLock(file);
          expect(native.statements).toEqual([
            "PRAGMA busy_timeout=0",
            "PRAGMA locking_mode=EXCLUSIVE",
            "BEGIN EXCLUSIVE",
          ]);
          yield* Effect.promise(async () => {
            const started = Date.now();
            await expect(Effect.runPromise(Effect.scoped(bunLock(file)))).rejects.toThrow(
              "Dashboard server already running.",
            );
            expect(Date.now() - started).toBeLessThan(1000);
            expect(native.closed - previousCloses).toBe(1);
          });
        }),
      ),
    );
    expect(native.closed - previousCloses).toBe(2);
    await Effect.runPromise(Effect.scoped(bunLock(file)));
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it.each([
  { fault: { code: "SQLITE_BUSY" }, busy: true },
  { fault: { code: "SQLITE_LOCKED" }, busy: true },
  { fault: { errcode: 6 }, busy: true },
  { fault: { errcode: 1 }, busy: false },
  { fault: { code: "EACCES", message: "SYNTHETIC_PRIVATE_NATIVE_MESSAGE" }, busy: false },
  { fault: null, busy: false },
  { fault: "SYNTHETIC_PRIVATE_NATIVE_MESSAGE", busy: false },
])(
  "narrows native lock failure $fault without retaining library words",
  async ({ fault, busy }) => {
    const folder = mkdtempSync(join(tmpdir(), "failed-server-lock-"));
    native.fail = () => {
      throw fault;
    };
    try {
      await expect(
        Effect.runPromise(Effect.scoped(bunLock(join(folder, "server.lock")))),
      ).rejects.toThrow(
        busy
          ? "Dashboard server already running."
          : "Can't start: couldn't acquire the dashboard server lock.",
      );
    } finally {
      native.fail = () => {};
      rmSync(folder, { recursive: true });
    }
  },
);
