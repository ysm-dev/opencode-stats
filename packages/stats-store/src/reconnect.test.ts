import { renameSync, existsSync, copyFileSync, rmSync } from "node:fs";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { observedStore } from "./testing/store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { syntheticFixture } from "./testing/index.ts";
import { runWithClock } from "./testing/clock.ts";

it.each(["missing", "replaced"])(
  "keeps serving the existing facts while the source is %s and reconciles on reconnect",
  async (change) => {
    const fixture = syntheticFixture();
    const replacement = syntheticFixture();
    const { source, folder, writer } = fixture;
    writer.session("ses-return");
    writer.message({
      id: "msg-return",
      session: "ses-return",
      seq: 0,
      start: 1,
      tokens: { output: 1 },
    });
    writer.close();
    replacement.writer.session("ses-return");
    replacement.writer.message({
      id: "msg-return",
      session: "ses-return",
      seq: 0,
      start: 1,
      tokens: { output: 7 },
    });
    replacement.writer.message({
      id: "msg-return",
      session: "ses-return",
      seq: 0,
      start: 1,
      tokens: { output: 7 },
    });
    replacement.writer.close();
    try {
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
          yield* store.committed;
          const initial = yield* store.read();
          renameSync(source, `${source}.away`);
          if (change === "replaced") copyFileSync(replacement.source, source);
          yield* time.tick;
          expect(existsSync(source)).toBe(change === "replaced");
          expect((yield* store.read()).steps).toEqual(initial.steps);
          // Synthetic writer replacement owns its files; the product reader never removes them.
          for (const suffix of ["-wal", "-shm"]) rmSync(`${source}${suffix}`, { force: true });
          if (change === "missing") copyFileSync(replacement.source, source);
          yield* time.tick;
          yield* store.committed;
          const restored = yield* store.read();
          expect(restored.steps[0]!.output).toBe(7);
          expect(restored.generation).toBe(initial.generation);
          expect(restored.revision).toBe(initial.revision + 1);
        }),
      );
    } finally {
      if (!existsSync(source) && existsSync(`${source}.away`)) renameSync(`${source}.away`, source);
      fixture.dispose();
      replacement.dispose();
    }
  },
);
