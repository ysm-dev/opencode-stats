import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { stayInSync, type StoreEvent } from "./store.ts";
import { syntheticFixture, inThreadRuntime } from "./testing/index.ts";
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
