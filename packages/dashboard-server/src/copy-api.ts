import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import * as Response from "effect/http/HttpServerResponse";
import type * as Stream from "effect/Stream";
import {
  BrowserCopyApi,
  type CopyCursor,
  type LiveAnnouncement,
} from "@opencode-stats/browser-copy/api";

export type CopySource = {
  whole: () => Uint8Array;
  changes: (cursor: CopyCursor) => Effect.Effect<Uint8Array, Error>;
  live: Stream.Stream<LiveAnnouncement>;
};

export const copyApi = Effect.fnUntraced(function* (source: CopySource) {
  const handlers = HttpApiBuilder.group(BrowserCopyApi, "browserCopy", (h) =>
    h
      .handle("whole", () => Effect.sync(source.whole))
      .handle("changes", ({ query }) =>
        source
          .changes(query)
          .pipe(Effect.catch(() => Effect.succeed(Response.empty({ status: 503 })))),
      )
      .handle("live", () => Effect.succeed(source.live)),
  );
  const routes = HttpApiBuilder.layer(BrowserCopyApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
  );
  return (yield* HttpRouter.toHttpEffect(routes)).pipe(
    Effect.map(Response.setHeader("cache-control", "no-store")),
  );
});
