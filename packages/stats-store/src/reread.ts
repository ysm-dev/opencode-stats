import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import type { SourceReader, SourceSession } from "./source-reader.ts";
import type { metadata } from "./schema.ts";
import type { BuildReport } from "./build-events.ts";
import { readReceipt, saveReceipt, type Receipt } from "./sync-state.ts";

type SourceSchema = Effect.Success<SourceReader["schema"]>;
type Reread = {
  reason: "migration" | "import";
  target: string;
  started: number;
  forced: Set<string>;
  read: Set<string>;
  changed: Set<string>;
};
function reason(previous: Receipt | undefined, schema: SourceSchema, migrations: string) {
  return previous && previous.migrations !== migrations
    ? "migration"
    : previous && !previous.completed && schema.completed
      ? "import"
      : undefined;
}

export function rereadState(store: string, report: BuildReport) {
  let receipt = readReceipt(store);
  let accepted = receipt;
  let sourceFile = receipt?.sourceFile;
  let verified = false;
  let repaired = false;
  let reading: Reread | undefined;
  const recovery = new Set<string>();
  return {
    repair: () => {
      repaired = true;
    },
    forced: () => reading?.forced ?? recovery,
    read: () => reading?.read,
    changed: () => reading?.changed,
    prepare: (
      schema: SourceSchema,
      inventory: readonly SourceSession[],
      header: typeof metadata.$inferSelect,
      file: string,
    ) =>
      Effect.gen(function* () {
        const previous = accepted?.generation === header.generation ? accepted : undefined;
        const needsVerification = !verified && !previous && header.revision > 0;
        verified = true;
        const changedFile = sourceFile !== undefined && sourceFile !== file;
        sourceFile = file;
        if (changedFile || repaired || needsVerification) {
          // Recovery invalidates even sessions already read by an unfinished reread.
          const forced = reading?.forced ?? recovery;
          for (const session of inventory) forced.add(session.id);
          repaired = false;
        }
        const migrations = JSON.stringify(schema.migrations);
        const trigger = reason(previous, schema, migrations);
        // The accepted signal advances even during an unfinished build. The durable
        // receipt advances only when every required reread has completed successfully.
        accepted = {
          generation: header.generation,
          migrations,
          completed: schema.completed,
          currentAt: yield* Clock.currentTimeMillis,
          sourceFile: file,
        };
        const target = JSON.stringify([migrations, schema.completed]);
        if (trigger && reading?.target !== target) {
          reading = {
            reason: trigger,
            target,
            started: yield* Clock.currentTimeMillis,
            forced: new Set(inventory.map((session) => session.id)),
            read: new Set(),
            changed: new Set(),
          };
          yield* report({
            kind: "reread.start",
            reason: trigger,
            sessions: 0,
            changed: 0,
            milliseconds: 0,
          });
        }
      }),
    complete: () =>
      Effect.gen(function* () {
        const next = { ...accepted!, currentAt: yield* Clock.currentTimeMillis };
        if (JSON.stringify(next) !== JSON.stringify(receipt)) yield* saveReceipt(store, next);
        receipt = next;
        recovery.clear();
        if (reading) {
          yield* report({
            kind: "reread.end",
            reason: reading.reason,
            sessions: reading.read.size,
            changed: reading.changed.size,
            milliseconds: (yield* Clock.currentTimeMillis) - reading.started,
          });
          reading = undefined;
        }
      }),
  };
}
