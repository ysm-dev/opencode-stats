import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { SyncWorker } from "./database.ts";
import type { WorkerPort } from "./worker-program.ts";
import { sqlFailure } from "./errors.ts";

export type WorkerHandle = WorkerPort & {
  terminate(): void;
  addEventListener(type: "error", listener: () => void): void;
  removeEventListener(type: "error", listener: () => void): void;
};
const response = Schema.decodeUnknownSync(
  Schema.Union([
    Schema.Boolean,
    Schema.Struct({
      kind: Schema.Literal("sqlite"),
      code: Schema.String,
      statement: Schema.Literals(["readSource", "writeSteps", "readStore"]),
    }),
  ]),
);

export const workerClient = (create: () => WorkerHandle): SyncWorker =>
  Effect.fnUntraced(function* (paths) {
    const worker = yield* Effect.acquireRelease(
      Effect.try({ try: create, catch: () => new Error("Sync worker couldn't start.") }),
      (handle) => Effect.sync(() => handle.terminate()),
    );
    let cleanup = Effect.void;
    yield* Effect.callback<void, Error>((resume) => {
      const fail = () => resume(Effect.fail(new Error("Stats store build failed.")));
      const receive = (event: MessageEvent) =>
        resume(
          Effect.try({
            try: () => response(event.data),
            catch: () => new Error("Invalid sync worker response."),
          }).pipe(
            Effect.flatMap((ok) =>
              typeof ok === "object"
                ? Effect.fail(sqlFailure({ code: ok.code }, ok.statement))
                : ok
                  ? Effect.void
                  : Effect.fail(new Error("Stats store build failed.")),
            ),
          ),
        );
      worker.addEventListener("message", receive);
      worker.addEventListener("error", fail);
      cleanup = Effect.sync(() => {
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", fail);
      });
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- dedicated Worker IPC has no target origin
      worker.postMessage(paths);
    }).pipe(Effect.ensuring(Effect.suspend(() => cleanup)));
  });
