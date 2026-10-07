import { renameSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { stayInSync, sqlFailure, type StoreEvent } from "./store.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import type { StoreRuntime } from "./database.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { runWithClock } from "./testing/clock.ts";
import { sourceFaultRuntime } from "./testing/worker.ts";
import { storePaths } from "./location.ts";

it.each([
  {
    code: "EACCES",
    statement: "readSource" as const,
    reason: "source.unreadable",
    detail: "permission",
  },
  {
    code: "EPERM",
    statement: "readSource" as const,
    reason: "source.unreadable",
    detail: "permission",
  },
  {
    code: "SQLITE_CORRUPT",
    statement: "readSource" as const,
    reason: "source.unreadable",
    detail: "damaged",
  },
  {
    code: "SQLITE_NOTADB",
    statement: "readSource" as const,
    reason: "source.unreadable",
    detail: "damaged",
  },
  {
    code: "SQLITE_IOERR",
    statement: "readSource" as const,
    reason: "source.unreadable",
    detail: "unavailable",
  },
  {
    code: "SQLITE_FULL",
    statement: "writeSteps" as const,
    reason: "store.unwritable",
    detail: "full",
  },
  { code: "ENOSPC", statement: "writeSteps" as const, reason: "store.unwritable", detail: "full" },
  {
    code: "SQLITE_READONLY",
    statement: "writeSteps" as const,
    reason: "store.unwritable",
    detail: "permission",
  },
  {
    code: "SQLITE_PERM",
    statement: "writeSteps" as const,
    reason: "store.unwritable",
    detail: "permission",
  },
  {
    code: "SQLITE_CONSTRAINT",
    statement: "writeSteps" as const,
    reason: "store.unwritable",
    detail: "unavailable",
  },
])(
  "retains the generation and last facts for $code, reports once, and recovers automatically",
  async ({ code, statement, reason, detail }) => {
    const f = syntheticFixture();
    const events: StoreEvent[] = [];
    let failing = false;
    const runtime = sourceFaultRuntime(() =>
      failing
        ? sqlFailure(
            {
              cause: {
                code,
                message: "Failed query: SYNTHETIC PRIVATE TITLE params: SECRET",
                stack: "SECRET",
              },
            },
            statement,
          )
        : undefined,
    );
    try {
      f.writer.session("ses-recovery");
      const message = { id: "msg-recovery", session: "ses-recovery", seq: 0, start: 1 };
      f.writer.message({ ...message, tokens: { output: 7 } });
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source: f.source, cacheHome: f.folder },
            runtime,
            () => {},
            (event) => events.push(event),
          );
          const before = yield* store.read();
          yield* time.tick;
          failing = true;
          f.writer.message({ ...message, tokens: { output: 9 } });
          yield* time.tick;
          yield* time.tick;
          expect(events.filter((event) => event.kind === "sync.stopped")).toEqual([
            { kind: "sync.stopped", reason, code: detail, since: 500, lockedSince: 0 },
          ]);
          expect((yield* store.read()).steps).toEqual(before.steps);
          failing = false;
          yield* time.tick;
          const after = yield* store.read();
          expect(after.generation).toBe(before.generation);
          expect(after.steps[0]!.output).toBe(9);
          expect(events.filter((event) => event.kind === "sync.resumed")).toHaveLength(1);
          expect(JSON.stringify(events)).not.toContain("SECRET");
          expect(JSON.stringify(events)).not.toContain("SYNTHETIC PRIVATE");
          yield* time.tick;
          expect(events.filter((event) => event.kind === "sync.resumed")).toHaveLength(1);
        }),
      );
    } finally {
      f.dispose();
    }
  },
);

it.each(["SQLITE_BUSY", "SQLITE_LOCKED"])(
  "announces %s only after thirty seconds, changes reason once, and resumes",
  async (code) => {
    const f = syntheticFixture();
    const events: StoreEvent[] = [];
    let failure: string | undefined;
    const runtime = sourceFaultRuntime(() =>
      failure ? sqlFailure({ code: failure }, "readSource") : undefined,
    );
    try {
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source: f.source, cacheHome: f.folder },
            runtime,
            () => {},
            (event) => events.push(event),
          );
          const generation = (yield* store.read()).generation;
          failure = code;
          yield* time.tick;
          time.setTime(30000);
          yield* time.tick;
          expect(events.some((event) => event.kind === "sync.stopped")).toBe(false);
          yield* time.tick;
          expect(events).toContainEqual({
            kind: "sync.stopped",
            reason: "source.locked",
            since: 0,
            lockedSince: 500,
            code: "locked",
          });
          yield* time.tick;
          expect(events.filter((event) => event.kind === "sync.stopped")).toHaveLength(1);
          failure = "SQLITE_CORRUPT";
          yield* time.tick;
          expect(events.filter((event) => event.kind === "sync.stopped")).toHaveLength(2);
          failure = undefined;
          yield* time.tick;
          expect((yield* store.read()).generation).toBe(generation);
          expect(events).toContainEqual(
            expect.objectContaining({ kind: "sync.resumed", reason: "source.unreadable" }),
          );
        }),
      );
    } finally {
      f.dispose();
    }
  },
);

it("a vanished served file never gets recreated, and resumes when the same database returns", async () => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  try {
    f.writer.session("root");
    f.writer.message({ id: "one", session: "root", seq: 0, start: 1, tokens: { input: 7 } });
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          { source: f.source, cacheHome: f.folder },
          nodeRuntime,
          () => {},
          (event) => events.push(event),
        );
        const before = yield* store.read();
        renameSync(f.source, `${f.source}.away`);
        yield* time.tick;
        yield* time.tick;
        expect(existsSync(f.source)).toBe(false);
        expect((yield* store.read()).steps).toEqual(before.steps);
        expect(events.filter((event) => event.kind === "sync.stopped")).toEqual([
          {
            kind: "sync.stopped",
            reason: "source.missing",
            code: "unavailable",
            since: 0,
            lockedSince: 0,
          },
        ]);
        renameSync(`${f.source}.away`, f.source);
        yield* time.tick;
        expect((yield* store.read()).generation).toBe(before.generation);
        expect(events).toContainEqual(
          expect.objectContaining({ kind: "sync.resumed", reason: "source.missing" }),
        );
      }),
    );
  } finally {
    if (existsSync(`${f.source}.away`)) renameSync(`${f.source}.away`, f.source);
    f.dispose();
  }
});

it("an initial writable-store open failure retains readable cached facts and retries without exiting", async () => {
  const f = syntheticFixture();
  let failing = true;
  const reports: StoreEvent[] = [];
  const runtime: StoreRuntime = {
    ...nodeRuntime,
    worker: (paths, announce = () => Effect.void, report) =>
      sync(
        paths,
        (config) => nodeDatabase({ ...config, filename: failing ? f.folder : config.filename }),
        nodeSource,
        announce,
        report,
      ),
  };
  try {
    f.writer.session("cached");
    const message = { id: "cached-message", session: "cached", seq: 0, start: 1 };
    f.writer.message({ ...message, tokens: { output: 7 } });
    const options = { source: f.source, cacheHome: f.folder };
    const old = await readBuilt(options, () => {}, nodeRuntime);
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          options,
          runtime,
          () => {},
          (event) => reports.push(event),
        );
        expect((yield* store.read()).steps).toEqual(old.steps);
        expect(reports).toContainEqual(
          expect.objectContaining({ kind: "sync.stopped", reason: "store.unwritable" }),
        );
        f.writer.message({ ...message, tokens: { output: 9 } });
        failing = false;
        yield* time.tick;
        const current = yield* store.read();
        expect(current.generation).toBe(old.generation);
        expect(current.steps[0]!.output).toBe(9);
        expect(reports).toContainEqual(
          expect.objectContaining({ kind: "sync.resumed", reason: "store.unwritable" }),
        );
      }),
    );
  } finally {
    f.dispose();
  }
});

it("a failed atomic sync receipt leaves no temporary file and retries without rebuilding facts", async () => {
  const f = syntheticFixture();
  const reports: StoreEvent[] = [];
  const options = { source: f.source, cacheHome: f.folder };
  try {
    f.writer.session("cached");
    f.writer.message({ id: "cached", session: "cached", seq: 0, start: 1, tokens: { output: 7 } });
    const before = await readBuilt(options);
    const paths = storePaths(options);
    rmSync(`${paths.store}.sync`);
    mkdirSync(`${paths.store}.sync`);
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          options,
          nodeRuntime,
          () => {},
          (event) => reports.push(event),
        );
        yield* time.tick;
        expect((yield* store.read()).steps).toEqual(before.steps);
        expect(reports.filter((event) => event.kind === "sync.stopped")).toEqual([
          expect.objectContaining({ reason: "store.unwritable", code: "unavailable" }),
        ]);
        expect(readdirSync(dirname(paths.store)).filter((file) => file.endsWith(".tmp"))).toEqual(
          [],
        );
        rmSync(`${paths.store}.sync`, { recursive: true });
        yield* time.tick;
        const after = yield* store.read();
        expect(after.generation).toBe(before.generation);
        expect(after.steps).toEqual(before.steps);
        expect(reports.filter((event) => event.kind === "sync.resumed")).toEqual([
          expect.objectContaining({ reason: "store.unwritable" }),
        ]);
      }),
    );
  } finally {
    f.dispose();
  }
});
