import { join } from "node:path";
import { readFileSync, writeFileSync, rmSync, symlinkSync, linkSync, realpathSync } from "node:fs";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { stayInSync, type StoreCopy, type StoreEvent } from "./store.ts";
import { syntheticFixture, readBuilt, inThreadRuntime } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { runWithClock } from "./testing/clock.ts";
import { storePaths } from "./location.ts";

const denied = vi.hoisted(() => ({ folder: "", operation: "", active: false }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const reject = (path: string, operation: string) => {
    if (denied.active && denied.operation === operation && path.startsWith(denied.folder))
      throw Object.assign(new Error("Failed query: SYNTHETIC PRIVATE TITLE params: SECRET"), {
        code: operation === "marker" ? "ENOSPC" : "EACCES",
      });
  };
  return {
    ...fs,
    mkdirSync: vi.fn<typeof fs.mkdirSync>((path, options) => {
      reject(String(path), "mkdir");
      return fs.mkdirSync(path, options);
    }),
    chmodSync: vi.fn<typeof fs.chmodSync>((path, mode) => {
      reject(String(path), "chmod");
      fs.chmodSync(path, mode);
    }),
    openSync: vi.fn<typeof fs.openSync>((path, flags, mode) => {
      reject(String(path), "open");
      return fs.openSync(path, flags, mode);
    }),
    writeFileSync: vi.fn<typeof fs.writeFileSync>((path, data, options) => {
      if (String(path).endsWith(".source")) reject(String(path), "marker");
      fs.writeFileSync(path, data, options);
    }),
  };
});

it.each(
  ["mkdir", "chmod", "open", "marker"].flatMap((operation) => [
    { operation, cached: true },
    { operation, cached: false },
  ]),
)(
  "a $operation cache preparation failure retains available statistics and retries through worker IPC (cached=$cached)",
  async ({ operation, cached }) => {
    const f = syntheticFixture();
    const options = { source: f.source, cacheHome: join(f.folder, "cache") };
    const reports: StoreEvent[] = [];
    const copies: StoreCopy[] = [];
    try {
      f.writer.session("cached");
      const message = { id: "cached", session: "cached", seq: 0, start: 1 };
      f.writer.message({ ...message, tokens: { output: 7 } });
      const before = cached ? await readBuilt(options, () => {}, nodeRuntime) : undefined;
      Object.assign(denied, {
        folder: join(options.cacheHome, "opencode-stats"),
        operation,
        active: true,
      });
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            options,
            inThreadRuntime,
            (copy) => copies.push(copy),
            (event) => reports.push(event),
          );
          if (before) {
            expect(copies[0]!.facts).toEqual(before.facts);
            expect((yield* store.read()).generation).toBe(before.generation);
          } else
            expect(copies[0]).toMatchObject({ revision: 0, historyComplete: false, facts: [] });
          f.writer.message({ ...message, tokens: { output: 9 } });
          yield* time.tick;
          if (before) expect((yield* store.read()).steps[0]!.output).toBe(7);
          else expect(copies).toHaveLength(1);
          expect(reports.filter((event) => event.kind === "sync.stopped")).toEqual([
            expect.objectContaining({
              reason: "store.unwritable",
              code: operation === "marker" ? "full" : "permission",
            }),
          ]);
          denied.active = false;
          yield* time.tick;
          const restored = yield* store.read();
          if (before) expect(restored.generation).toBe(before.generation);
          else expect(restored.generation).not.toBe(copies[0]!.generation);
          expect(restored.steps[0]!.output).toBe(9);
          expect(reports).toContainEqual(
            expect.objectContaining({ kind: "sync.resumed", reason: "store.unwritable" }),
          );
          expect(JSON.stringify(reports)).not.toMatch(
            /SYNTHETIC PRIVATE|SECRET|Failed query|params:/u,
          );
        }),
      );
    } finally {
      denied.active = false;
      f.dispose();
    }
  },
);

it("a blocked cache path publishes an unbuilt copy and typed problem, then creates the cache when the owned path is repaired", async () => {
  const f = syntheticFixture();
  const cacheHome = join(f.folder, "blocked-cache");
  const copies: StoreCopy[] = [];
  const reports: StoreEvent[] = [];
  try {
    f.writer.session("root");
    f.writer.message({ id: "first", session: "root", seq: 0, start: 1, tokens: { input: 3 } });
    writeFileSync(cacheHome, "owned synthetic blocker");
    const source = readFileSync(f.source);
    const wal = readFileSync(`${f.source}-wal`);
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          { source: f.source, cacheHome },
          inThreadRuntime,
          (copy) => copies.push(copy),
          (event) => reports.push(event),
        );
        expect(copies).toHaveLength(1);
        expect(copies[0]).toMatchObject({
          revision: 0,
          historyComplete: false,
          facts: [],
          names: [],
          pricing: { catalog: { source: "unavailable" } },
        });
        expect(reports).toContainEqual(
          expect.objectContaining({
            kind: "sync.stopped",
            reason: "store.unwritable",
            code: "unavailable",
          }),
        );
        yield* Effect.promise(async () => {
          await expect(Effect.runPromise(store.read())).rejects.toMatchObject({
            kind: "sqlite",
            statement: "readStore",
          });
        });
        rmSync(cacheHome);
        yield* time.tick;
        const current = yield* store.read();
        expect(current.historyComplete).toBe(true);
        expect(current.steps[0]!.input).toBe(3);
        expect(current.generation).not.toBe(copies[0]!.generation);
        expect(reports).toContainEqual(
          expect.objectContaining({ kind: "sync.resumed", reason: "store.unwritable" }),
        );
        expect(readFileSync(f.source).equals(source)).toBe(true);
        expect(readFileSync(`${f.source}-wal`).equals(wal)).toBe(true);
      }),
    );
  } finally {
    f.dispose();
  }
});

it.each(["", "-wal", "-shm", ".source", ".sync"])(
  "never writes through a derived %s destination alias to the served source or companions",
  async (suffix) => {
    const f = syntheticFixture();
    const options = { source: f.source, cacheHome: join(f.folder, "aliases") };
    const reports: StoreEvent[] = [];
    try {
      const paths = storePaths(options);
      // Native writer owns its database and both existing WAL companions.
      const source =
        suffix === "-wal"
          ? `${realpathSync(f.source)}-wal`
          : suffix === "-shm"
            ? `${realpathSync(f.source)}-shm`
            : realpathSync(f.source);
      const before = readFileSync(source);
      const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
      fs.mkdirSync(join(options.cacheHome, "opencode-stats"), { recursive: true });
      const alias = `${paths.store}${suffix}`;
      if (suffix === ".source") symlinkSync(source, alias);
      else linkSync(source, alias);
      await runWithClock((time) =>
        Effect.gen(function* () {
          yield* stayInSync(
            options,
            inThreadRuntime,
            () => {},
            (event) => reports.push(event),
          );
          expect(readFileSync(source).equals(before)).toBe(true);
          expect(reports).toContainEqual(
            expect.objectContaining({
              kind: "sync.stopped",
              reason: "store.unwritable",
              code: "permission",
            }),
          );
          rmSync(alias);
          yield* time.tick;
          expect(reports).toContainEqual(
            expect.objectContaining({ kind: "sync.resumed", reason: "store.unwritable" }),
          );
        }),
      );
    } finally {
      f.dispose();
    }
  },
);
