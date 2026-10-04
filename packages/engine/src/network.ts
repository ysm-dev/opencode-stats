import * as Effect from "effect/Effect";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { BrowserCopyApi } from "@opencode-stats/browser-copy/api";
import { decode } from "@opencode-stats/browser-copy";

export type EngineNetwork = { readonly baseUrl: string; readonly fetch: typeof globalThis.fetch };

const fetchCopy = Effect.fnUntraced(function* (baseUrl: string) {
  const client = yield* HttpApiClient.make(BrowserCopyApi, { baseUrl });
  const bytes = yield* client.browserCopy.whole();
  // HttpApi's buffered binary codec returns a full ArrayBuffer, not a subview.
  return decode(bytes.buffer);
});

export function loadCopy(network: EngineNetwork) {
  return Effect.runPromise(
    fetchCopy(network.baseUrl).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, network.fetch),
    ),
  );
}
