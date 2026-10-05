import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { bunLock } from "./lock.bun.ts";

test("real Bun retains the lifetime lock and releases it on scope close", async () => {
  const folder = mkdtempSync(join(tmpdir(), "bun-server-lock-"));
  const file = join(folder, "server.lock");
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* bunLock(file);
          yield* Effect.sync(() => Bun.gc(true));
          yield* Effect.promise(async () => {
            expect(Exit.isFailure(await Effect.runPromiseExit(Effect.scoped(bunLock(file))))).toBe(
              true,
            );
          });
        }),
      ),
    );
    await Effect.runPromise(Effect.scoped(bunLock(file)));
  } finally {
    rmSync(folder, { recursive: true });
  }
});
