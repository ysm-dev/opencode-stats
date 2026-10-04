import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { BrowserCopyApi } from "../api.ts";
import { encode } from "../binary.ts";
import type { BrowserCopy } from "../facts.ts";

export function inMemoryDashboardServer(
  copy: BrowserCopy,
  beforeCopy: () => Promise<void> = () => Promise.resolve(),
) {
  let online = true;
  let requests = 0;
  const addresses: string[] = [];
  const handlers = HttpApiBuilder.group(BrowserCopyApi, "browserCopy", (h) =>
    h.handle("whole", () =>
      Effect.promise(async () => {
        await beforeCopy();
        return new Uint8Array(encode(copy));
      }),
    ),
  );
  const routes = HttpApiBuilder.layer(BrowserCopyApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
  );
  const server = HttpRouter.toWebHandler(routes, { disableLogger: true });
  const fetch: typeof globalThis.fetch = (input, init) => {
    requests++;
    const request = new Request(input, init);
    addresses.push(request.url);
    if (!online) return Promise.resolve(new Response(null, { status: 503 }));
    return server.handler(request);
  };
  return {
    fetch,
    addresses,
    dispose: server.dispose,
    get requests() {
      return requests;
    },
    drop: () => {
      online = false;
    },
    resume: () => {
      online = true;
    },
  };
}
