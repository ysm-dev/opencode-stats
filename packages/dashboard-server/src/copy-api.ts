import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import { BrowserCopyApi } from "@opencode-stats/browser-copy/api";

export const copyApi = Effect.fnUntraced(function* (read: () => Uint8Array) {
  const handlers = HttpApiBuilder.group(BrowserCopyApi, "browserCopy", (h) =>
    h.handle("whole", () => Effect.sync(read)),
  );
  const routes = HttpApiBuilder.layer(BrowserCopyApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
  );
  return yield* HttpRouter.toHttpEffect(routes);
});
