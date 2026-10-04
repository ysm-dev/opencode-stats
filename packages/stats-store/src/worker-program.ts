import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { build } from "./build.ts";
import type { DatabaseAdapter, StorePaths } from "./database.ts";

export type WorkerPort = {
  postMessage(value: boolean | StorePaths): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
const request = Schema.decodeUnknownEffect(
  Schema.Struct({ source: Schema.String, store: Schema.String }),
);

export const workerProgram = Effect.fnUntraced(
  function* (port: WorkerPort, adapter: DatabaseAdapter) {
    let cleanup = Effect.void;
    const paths = yield* Effect.callback<StorePaths, Schema.SchemaError>((resume) => {
      const receive = (event: MessageEvent) => resume(request(event.data));
      port.addEventListener("message", receive);
      cleanup = Effect.sync(() => port.removeEventListener("message", receive));
    }).pipe(Effect.ensuring(Effect.suspend(() => cleanup)));
    yield* Effect.scoped(build(paths, adapter));
  },
  (effect, port) =>
    effect.pipe(
      Effect.matchCauseEffect({
        onFailure: () => Effect.sync(() => port.postMessage(false)),
        onSuccess: () => Effect.sync(() => port.postMessage(true)),
      }),
    ),
);
