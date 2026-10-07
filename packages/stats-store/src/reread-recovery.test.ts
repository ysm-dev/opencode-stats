import { renameSync } from "node:fs";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { stayInSync, sqlFailure, type StoreEvent, type StoreCopy } from "./store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { readBuilt, syntheticFixture, syntheticDatabase } from "./testing/index.ts";
import { sourceFaultRuntime } from "./testing/worker.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";

const future = "20261007120000_future";
const first = { id: "first-step", session: "first", seq: 0, start: 2 };
const last = { id: "last-step", session: "last", seq: 0, start: 1 };

it.each([
  ["migration", "schema"],
  ["migration", "damaged"],
  ["migration", "replacement"],
  ["import", "schema"],
  ["import", "damaged"],
  ["import", "replacement"],
] as const)(
  "an interrupted %s reread includes already-read sessions after %s recovery",
  async (reason, recovery) => {
    const f = syntheticFixture("2.0.0");
    const options = { source: f.source, cacheHome: f.folder };
    const events: StoreEvent[] = [];
    let fault: string | undefined;
    let armed = false;
    let interrupted = false;
    let recovered!: StoreCopy;
    let replacement: ReturnType<typeof syntheticDatabase> | undefined;
    const runtime = sourceFaultRuntime(() =>
      fault ? sqlFailure({ code: fault }, "readSource") : undefined,
    );
    try {
      f.writer.session("first");
      f.writer.session("last");
      f.writer.message({ ...first, tokens: { output: 1 } });
      f.writer.message({ ...last, tokens: { output: 2 } });
      if (reason === "import") f.writer.importMarker("sessions");
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            options,
            runtime,
            (copy) => {
              if (
                !armed ||
                interrupted ||
                copy.facts.find((step) => step.id === first.id)?.output !== 7
              )
                return;
              interrupted = true;
              if (recovery === "schema") f.writer.migration(future);
              else fault = recovery === "damaged" ? "SQLITE_CORRUPT" : "SQLITE_IOERR";
            },
            (event) => events.push(event),
          );
          const before = yield* store.read();
          f.writer.message({ ...first, tokens: { output: 7 } }, false);
          f.writer.message({ ...last, tokens: { output: 8 } }, false);
          if (reason === "migration") f.writer.migrate();
          else f.writer.importMarker("completed");
          armed = true;
          yield* time.tick;
          expect(interrupted).toBe(true);
          expect(events.some((event) => event.kind === "reread.end")).toBe(false);
          const stopped = yield* store.read();
          expect(stopped.facts.find((step) => step.id === first.id)?.output).toBe(7);
          expect(stopped.facts.find((step) => step.id === last.id)?.output).toBe(2);
          if (recovery === "replacement") {
            f.writer.close();
            renameSync(f.source, `${f.source}.replaced`);
            replacement = syntheticDatabase(f.source, reason === "migration" ? "2.0.15" : "2.0.0");
            replacement.session("first");
            replacement.session("last");
            replacement.message({ ...first, tokens: { output: 9 } });
            replacement.message({ ...last, tokens: { output: 8 } });
            if (reason === "import") replacement.importMarker("completed");
          } else {
            // Repair changes usage only: counter, message count and highest position still match.
            f.writer.message({ ...first, tokens: { output: 9 } }, false);
            if (recovery === "schema") f.writer.migration(future, false);
          }
          fault = undefined;
          yield* time.tick;
          recovered = yield* store.read();
          expect(recovered.generation).toBe(before.generation);
          expect(recovered.facts.find((step) => step.id === first.id)?.output).toBe(9);
          expect(recovered.facts.find((step) => step.id === last.id)?.output).toBe(8);
          expect(events.filter((event) => event.kind === "reread.start")).toHaveLength(1);
          expect(events.filter((event) => event.kind === "reread.end")).toEqual([
            expect.objectContaining({ reason, sessions: 2, changed: 2 }),
          ]);
          expect(events.filter((event) => event.kind === "sync.resumed")).toHaveLength(1);
        }),
      );
      // A completed durable receipt must not certify stale facts after restart either.
      const restarted = await readBuilt(options, () => {}, nodeRuntime);
      const fresh = await readBuilt(
        { ...options, cacheHome: `${f.folder}/fresh` },
        () => {},
        nodeRuntime,
      );
      expect(canonicalCopy(recovered)).toEqual(canonicalCopy(fresh));
      expect(canonicalCopy(restarted)).toEqual(canonicalCopy(fresh));
      expect(restarted.generation).toBe(recovered.generation);
      expect(restarted.revision).toBe(recovered.revision);
    } finally {
      replacement?.close();
      f.dispose();
    }
  },
);
