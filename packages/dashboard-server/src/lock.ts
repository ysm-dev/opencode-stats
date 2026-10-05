import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import { chmodSync } from "node:fs";
import { ServerProblem } from "./errors.ts";

export class LockHeld extends Error {
  constructor() {
    super("Dashboard server already running.");
  }
}
export type ServerLock = (file: string) => Effect.Effect<void, Error, Scope.Scope>;

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: native lock errors are narrowed without retaining native messages or causes
const lockFailure = (input: unknown): Error => {
  if (
    typeof input === "object" &&
    input !== null &&
    "errcode" in input &&
    (input.errcode === 5 || input.errcode === 6)
  )
    return new LockHeld();
  if (
    typeof input === "object" &&
    input !== null &&
    "code" in input &&
    (input.code === "SQLITE_BUSY" || input.code === "SQLITE_LOCKED")
  )
    return new LockHeld();
  return new ServerProblem("Can't start: couldn't acquire the dashboard server lock.");
};
export const lock =
  (open: (file: string) => { exec: (sql: string) => void; close: () => void }): ServerLock =>
  (file) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => {
          const connection = open(file);
          try {
            chmodSync(file, 0o600);
            connection.exec("PRAGMA busy_timeout=0");
            connection.exec("PRAGMA locking_mode=EXCLUSIVE");
            // Keep the transaction open for the scoped lifetime; close releases it without a commit.
            connection.exec("BEGIN EXCLUSIVE");
            return connection;
          } catch (error) {
            connection.close();
            throw error;
          }
        },
        catch: lockFailure,
      }),
      (connection) => Effect.sync(() => connection.close()),
    ).pipe(Effect.asVoid);
