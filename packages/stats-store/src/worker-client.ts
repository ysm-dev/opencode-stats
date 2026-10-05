import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Deferred from "effect/Deferred";
import * as Queue from "effect/Queue";
import * as Clock from "effect/Clock";
import type { SyncWorker } from "./database.ts";
import type { WorkerPort } from "./worker-program.ts";
import { sqlFailure } from "./errors.ts";

export type WorkerHandle = WorkerPort & {
  terminate(): void | Promise<void>;
  addEventListener(type: "error", listener: () => void): void;
  removeEventListener(type: "error", listener: () => void): void;
};
const response = Schema.decodeUnknownSync(
  Schema.Union([
    Schema.Boolean,
    Schema.Literal("stopped"),
    Schema.Struct({
      kind: Schema.Literal("sqlite"),
      code: Schema.String,
      statement: Schema.Literals(["readSource", "writeSteps", "readStore"]),
    }),
  ]),
);

export const workerClient = (create: (clock: Clock.Clock) => WorkerHandle): SyncWorker =>
  Effect.fnUntraced(function* (paths, announce = () => Effect.void) {
    const clock = yield* Clock.Clock;
    const ready = yield* Deferred.make<void, Error>();
    const stopped = yield* Deferred.make<void>();
    const messages = yield* Queue.unbounded<Effect.Effect<void, Error>>();
    let cleanup = Effect.void;
    let initialized = false;
    let lateError: Error | undefined;
    const worker = yield* Effect.acquireRelease(
      Effect.try({
        try: () => create(clock),
        catch: () => new Error("Sync worker couldn't start."),
      }),
      (handle) =>
        Effect.gen(function* () {
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- dedicated Worker IPC has no target origin
          handle.postMessage("stop");
          yield* Deferred.await(stopped).pipe(Effect.timeout("2 seconds"), Effect.ignore);
          yield* Effect.promise(async () => {
            await handle.terminate();
          });
          yield* cleanup;
          if (lateError) yield* Effect.die(lateError);
        }),
    );
    const fail = () => {
      Deferred.doneUnsafe(stopped, Effect.void);
      Queue.offerUnsafe(messages, Effect.fail(new Error("Stats store build failed.")));
    };
    const receive = (event: MessageEvent) => {
      try {
        const message = response(event.data);
        if (message === "stopped") {
          Deferred.doneUnsafe(stopped, Effect.void);
          return;
        }
        if (typeof message === "object") {
          Deferred.doneUnsafe(stopped, Effect.void);
          Queue.offerUnsafe(
            messages,
            Effect.fail(sqlFailure({ code: message.code }, message.statement)),
          );
        } else if (message) Queue.offerUnsafe(messages, announce());
        else {
          Deferred.doneUnsafe(stopped, Effect.void);
          Queue.offerUnsafe(messages, Effect.fail(new Error("Stats store build failed.")));
        }
      } catch {
        Deferred.doneUnsafe(stopped, Effect.void);
        const error = new Error("Invalid sync worker response.");
        if (initialized) lateError = error;
        else Queue.offerUnsafe(messages, Effect.fail(error));
      }
    };
    worker.addEventListener("message", receive);
    worker.addEventListener("error", fail);
    cleanup = Effect.sync(() => {
      worker.removeEventListener("message", receive);
      worker.removeEventListener("error", fail);
    });
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          const result = yield* Queue.take(messages);
          yield* result.pipe(
            Effect.matchEffect({
              onSuccess: () => Deferred.succeed(ready, undefined),
              onFailure: (error) => Deferred.fail(ready, error),
            }),
          );
        }),
      ),
    );
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- dedicated Worker IPC has no target origin
    worker.postMessage(paths);
    yield* Deferred.await(ready);
    initialized = true;
  });
