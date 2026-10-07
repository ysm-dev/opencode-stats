import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import type { SyncStop } from "@opencode-stats/browser-copy/api";
import { SchemaFailure, SqlFailure, sqlFailure } from "./errors.ts";
import type { StoreEvent, BuildReport } from "./build-events.ts";
import type { StorePaths } from "./database.ts";
import { assertStoreDestination } from "./location.ts";

const Receipt = Schema.Struct({
  generation: Schema.String,
  migrations: Schema.String,
  completed: Schema.Boolean,
  currentAt: Schema.Int,
  sourceFile: Schema.String,
});
export type Receipt = typeof Receipt.Type;
export function readReceipt(store: string, paths?: StorePaths): Receipt | undefined {
  try {
    if (paths) assertStoreDestination(paths);
    return Schema.decodeUnknownSync(Receipt)(JSON.parse(readFileSync(`${store}.sync`, "utf8")));
  } catch {
    return undefined;
  }
}
export const saveReceipt = (store: string, receipt: Receipt) =>
  Effect.try({
    try: () => {
      const temporary = `${store}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(receipt), { mode: 0o600 });
        renameSync(temporary, `${store}.sync`);
      } finally {
        rmSync(temporary, { force: true });
      }
    },
    catch: (error) => sqlFailure(error, "writeSteps"),
  });

type Stopped = Extract<StoreEvent, { kind: "sync.stopped" | "sync.resumed" }>;
function unlockedFailure(failure: SqlFailure): Pick<Stopped, "reason" | "code"> {
  return {
    reason:
      failure.statement !== "readSource"
        ? "store.unwritable"
        : failure.code === "ENOENT"
          ? "source.missing"
          : "source.unreadable",
    code: ["EACCES", "EPERM", "SQLITE_READONLY", "SQLITE_PERM"].includes(failure.code)
      ? "permission"
      : ["SQLITE_CORRUPT", "SQLITE_NOTADB"].includes(failure.code)
        ? "damaged"
        : failure.code === "SQLITE_FULL" || failure.code === "ENOSPC"
          ? "full"
          : "unavailable",
  };
}

export function syncState(report: BuildReport, started: number) {
  let current: Stopped | undefined;
  let lastCurrent = started;
  let lockedSince: number | undefined;
  const failed = (error: Error, now: number) =>
    Effect.gen(function* () {
      let reason: SyncStop["reason"];
      let code: SyncStop["params"]["code"] = "unavailable";
      if (error instanceof SchemaFailure) reason = `schema.${error.schema}`;
      else {
        const failure = error instanceof SqlFailure ? error : sqlFailure(error, "readSource");
        const locked =
          failure.statement === "readSource" &&
          (failure.code === "SQLITE_BUSY" || failure.code === "SQLITE_LOCKED");
        if (locked) {
          lockedSince ??= now;
          if (now - lockedSince <= 30000) return;
          reason = "source.locked";
          code = "locked";
        } else {
          lockedSince = undefined;
          ({ reason, code } = unlockedFailure(failure));
        }
      }
      if (current?.reason === reason && current.code === code) return;
      current = {
        kind: "sync.stopped",
        reason,
        code,
        since: lastCurrent,
        lockedSince: lockedSince ?? 0,
      };
      yield* report(current);
    });
  return {
    failed,
    recovered: (now: number) =>
      Effect.gen(function* () {
        lastCurrent = now;
        lockedSince = undefined;
        if (current) {
          const event = { ...current, kind: "sync.resumed" as const };
          current = undefined;
          yield* report(event);
        }
      }),
  };
}
