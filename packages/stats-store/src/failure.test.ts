import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { stayInSync } from "./store.ts";
import { syntheticFixture, inThreadRuntime } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";

it("worker IPC forwards only normalized SQL diagnostics from a genuine unsupported source", async () => {
  const folder = mkdtempSync(join(tmpdir(), "unsupported-source-"));
  const source = join(folder, "source.db");
  writeFileSync(source, "");
  try {
    await expect(
      Effect.runPromise(
        Effect.scoped(stayInSync({ source, cacheHome: folder }, inThreadRuntime, () => {})),
      ),
    ).rejects.toMatchObject({
      message: "Stats store build failed.",
      kind: "sqlite",
      code: "SQLITE_ERROR",
      statement: "readSource",
    });
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
