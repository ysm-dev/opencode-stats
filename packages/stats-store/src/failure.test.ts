import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { stayInSync, type StoreEvent } from "./store.ts";
import { syntheticFixture, inThreadRuntime, readBuilt } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";

it("worker IPC keeps serving an empty copy and a typed stop reason for a genuine unsupported source", async () => {
  const folder = mkdtempSync(join(tmpdir(), "unsupported-source-"));
  const source = join(folder, "source.db");
  writeFileSync(source, "");
  const events: StoreEvent[] = [];
  try {
    const copy = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source, cacheHome: folder },
            inThreadRuntime,
            () => {},
            (event) => events.push(event),
          );
          return yield* store.read();
        }),
      ),
    );
    expect(copy.revision).toBe(0);
    expect(copy.steps).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "sync.stopped", reason: "schema.other" }),
    );
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it("normalizes a native read failure after the derived store disappears", async () => {
  const fixture = syntheticFixture();
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source: fixture.source, cacheHome: fixture.folder },
            nodeRuntime,
            () => {},
          );
          const folder = join(fixture.folder, "opencode-stats");
          for (const file of readdirSync(folder)) rmSync(join(folder, file));
          yield* Effect.promise(async () => {
            await expect(Effect.runPromise(store.read())).rejects.toMatchObject({
              kind: "sqlite",
              statement: "readStore",
            });
          });
        }),
      ),
    );
  } finally {
    fixture.dispose();
  }
});

it("rejects a vanished cache at worker readiness instead of announcing an unbuilt replacement", async () => {
  const fixture = syntheticFixture();
  const copies: number[] = [];
  try {
    const options = { source: fixture.source, cacheHome: fixture.folder };
    const before = await readBuilt(options);
    await expect(
      readBuilt(options, (copy) => copies.push(copy.revision), {
        ...nodeRuntime,
        worker: (paths, announce, report) =>
          nodeRuntime
            .worker(paths, announce, report)
            .pipe(Effect.andThen(() => rmSync(paths.store))),
      }),
    ).rejects.toMatchObject({ kind: "sqlite", statement: "readStore" });
    expect(copies).toEqual([before.revision]);
  } finally {
    fixture.dispose();
  }
});
