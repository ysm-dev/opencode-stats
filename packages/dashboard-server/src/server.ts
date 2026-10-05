import { join } from "node:path";
import { setPriority } from "node:os";
import * as Effect from "effect/Effect";
import * as HttpServer from "effect/http/HttpServer";
import * as Response from "effect/http/HttpServerResponse";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import { dashboardFiles } from "./paths.ts";
import { copyApi } from "./copy-api.ts";
import { controlResponse, type Lifecycle } from "./lifecycle.ts";

export const startServer = Effect.fnUntraced(function* (
  files: string = dashboardFiles,
  copy?: () => Uint8Array,
  control?: Lifecycle,
) {
  const server = yield* HttpServer.HttpServer;
  const origin = HttpServer.formatAddress(server.address);
  const api = copy ? yield* copyApi(copy) : undefined;
  const app = Effect.gen(function* () {
    const request = yield* HttpServerRequest;
    const host = new URL(origin).host;
    const localHost = host.replace("127.0.0.1", "localhost");
    if (request.headers["host"] !== host && request.headers["host"] !== localHost) {
      return Response.empty({ status: 403 });
    }
    const read = request.method === "GET" || request.method === "HEAD";
    if (!read && request.headers["origin"] !== origin) return Response.empty({ status: 403 });
    if (request.headers["host"] === localHost) {
      return Response.empty({ status: 308, headers: { location: `${origin}${request.url}` } });
    }
    const path = new URL(request.url, origin).pathname;
    if (control && ["/api/server", "/api/hold", "/api/stop", "/api/conflict"].includes(path)) {
      return yield* controlResponse(control, path, request);
    }
    if (!read) return Response.empty({ status: 405 });
    if (path === "/api/browser-copy" && copy) {
      if (copy().byteLength === 0) return Response.empty({ status: 503 });
      return yield* api!;
    }
    if (
      path.startsWith("/api/") ||
      (path.startsWith("/assets/") && !/^\/assets\/[\w.-]+$/u.test(path))
    ) {
      return Response.empty({ status: 404 });
    }
    return yield* Response.file(
      join(files, path.startsWith("/assets/") ? path : "index.html"),
    ).pipe(Effect.catch(() => Effect.succeed(Response.empty({ status: 404 }))));
  });
  yield* server.serve(
    app.pipe(
      Effect.map(
        Response.setHeaders({
          "cross-origin-resource-policy": "same-origin",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
          "content-security-policy": "frame-ancestors 'none'",
        }),
      ),
    ),
  );
  yield* Effect.sync(() => setPriority(0, 10));
  return origin;
});
