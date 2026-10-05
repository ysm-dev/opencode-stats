import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Deferred from "effect/Deferred";
import { sync } from "./sync.ts";
import type { SourceAdapter } from "./source-reader.ts";
import type { DatabaseAdapter, StorePaths } from "./database.ts";
import * as Cause from "effect/Cause";
import { SqlFailure } from "./errors.ts";

type WorkerFailure = {
  readonly kind: "sqlite";
  readonly code: string;
  readonly statement: "readSource" | "writeSteps" | "readStore";
};
export type WorkerPort = {
  postMessage(value: boolean | "stop" | "stopped" | StorePaths | WorkerFailure): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
const request = Schema.decodeUnknownSync(
  Schema.Union([
    Schema.Literal("stop"),
    Schema.Struct({ source: Schema.String, store: Schema.String }),
  ]),
);

export const workerProgram = Effect.fnUntraced(function* (
  port: WorkerPort,
  adapter: DatabaseAdapter,
  source: SourceAdapter,
) {
  const paths = yield* Deferred.make<StorePaths, Error>();
  const stopped = yield* Deferred.make<void>();
  const receive = (event: MessageEvent) => {
    try {
      const message = request(event.data);
      if (message === "stop") Deferred.doneUnsafe(stopped, Effect.void);
      else Deferred.doneUnsafe(paths, Effect.succeed(message));
    } catch {
      Deferred.doneUnsafe(paths, Effect.fail(new Error()));
    }
  };
  yield* Effect.acquireRelease(
    Effect.sync(() => port.addEventListener("message", receive)),
    () => Effect.sync(() => port.removeEventListener("message", receive)),
  );
  const run = Effect.scoped(
    Effect.gen(function* () {
      yield* sync(yield* Deferred.await(paths), adapter, source, () =>
        Effect.sync(() => port.postMessage(true)),
      );
      port.postMessage(true);
      yield* Effect.never;
    }),
  );
  yield* Effect.raceFirst(run, Deferred.await(stopped)).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        const failure = Cause.squash(cause);
        port.postMessage(
          failure instanceof SqlFailure
            ? { kind: "sqlite", code: failure.code, statement: failure.statement }
            : false,
        );
      }),
    ),
  );
  // Acknowledged only after both native resources and polling fibers have closed.
  port.postMessage("stopped");
});
