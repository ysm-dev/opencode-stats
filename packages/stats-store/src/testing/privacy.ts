import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import { sql } from "drizzle-orm";
import { Database } from "../database.ts";
import { nodeDatabase } from "../runtime.node.ts";
import { sqlFailure } from "../errors.ts";

export const failingTitle = (title: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.run(sql`INSERT INTO absent_session (title) VALUES (${title})`).pipe(
        Effect.andThen(Effect.die(new Error("Synthetic query unexpectedly succeeded."))),
        Effect.catchCause((cause) => {
          const raw = Cause.squash(cause);
          return Effect.succeed({
            failure: sqlFailure(raw, "writeSteps"),
            boundValueInLibraryMessage: String(raw).includes(title),
          });
        }),
      );
    }).pipe(
      Effect.provide(
        nodeDatabase({
          filename: ":memory:",
          readonly: false,
          disableWAL: true,
          busyTimeout: "20 millis",
        }),
      ),
    ),
  );
