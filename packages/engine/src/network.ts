import * as Effect from "effect/Effect";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import {
  BrowserCopyApi,
  type CopyCursor,
  type LiveAnnouncement,
} from "@opencode-stats/browser-copy/api";
import { decode } from "@opencode-stats/browser-copy";
import type { EngineClock } from "./clock.ts";

export type EngineNetwork = {
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
  readonly release: string;
};

const fetchCopy = Effect.fnUntraced(function* (
  baseUrl: string,
  clock: EngineClock,
  addWork: (work: number, started: number) => void,
  cursor?: CopyCursor,
) {
  const client = yield* HttpApiClient.make(BrowserCopyApi, { baseUrl });
  const bytes = yield* cursor
    ? client.browserCopy.changes({
        query: { generation: cursor.generation, revision: cursor.revision },
      })
    : client.browserCopy.whole();
  // HttpApi's buffered binary codec returns a full ArrayBuffer, not a subview.
  const started = clock.workNow();
  const copy = decode(bytes.buffer);
  addWork(clock.workNow() - started, started);
  return copy;
});

export function loadCopy(
  network: EngineNetwork,
  clock: EngineClock,
  addWork: (work: number, started: number) => void,
  cursor?: CopyCursor,
  signal?: AbortSignal,
) {
  return Effect.runPromise(
    fetchCopy(network.baseUrl, clock, addWork, cursor).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, network.fetch),
    ),
    { signal },
  );
}

export function followCopy(
  network: EngineNetwork,
  announce: (event: LiveAnnouncement) => void,
  disconnected: () => void,
) {
  let stopped = false;
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(BrowserCopyApi, { baseUrl: network.baseUrl });
      const stream = yield* client.browserCopy.live();
      yield* Stream.runForEach(stream, (event) => Effect.sync(() => announce(event)));
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, network.fetch),
      Effect.catch(() => Effect.void),
      Effect.ensuring(
        Effect.sync(() => {
          if (!stopped) disconnected();
        }),
      ),
    ),
  );
  return () => {
    stopped = true;
    return Effect.runPromise(Fiber.interrupt(fiber));
  };
}
