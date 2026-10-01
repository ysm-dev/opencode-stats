# Effect v4 modules for opencode-stats

## Direct answer: module map

Build on **Effect 4.0.0**, with matching 4.0.0 runtime adapters. Prefer **HttpApi + SSE**, not a second RPC protocol, for the dashboard. Keep the runtime-specific imports at the edges and keep OpenCode's RC runtime outside the dashboard's Effect runtime.

| Need                                              | Module or package                                                                                                                      | Bun                                                             | Node / browser                                                                                                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Services, resource ownership, background work     | `effect/Context`, `Layer`, `Effect`, `Scope`, `ManagedRuntime`, `Schedule`                                                             | Shared application logic; scoped resources                      | Same; plugin mode owns a disposable runtime, not a process runner. [services] [lifecycle]                                                                                                                                                                    |
| HTTP listener and routing                         | `effect/http/HttpServer`, `HttpRouter`; `@effect/platform-bun/BunHttpServer` or `@effect/platform-node/NodeHttpServer`                 | `BunHttpServer.layer({ hostname: "127.0.0.1", port })`          | `NodeHttpServer.layer(createServer, { host: "127.0.0.1", port })`; routes stay unchanged. [http-example] [bun-server] [node-server]                                                                                                                          |
| Static dashboard assets                           | `effect/http/HttpStaticServer`; alternatively `HttpServerResponse.file`                                                                | Platform layer supplies filesystem/path/HTTP services           | Same API; root directory, mount prefix, MIME types, index/SPA fallback, ranges and conditional responses are supported. [static]                                                                                                                             |
| Mount TanStack Start's web-standard fetch handler | `HttpServerRequest.toWeb`, `HttpServerResponse.fromWeb`, `HttpRouter.add`                                                              | Convert request → invoke fetch handler → convert response       | Same. This is an adapter, not an out-of-the-box TanStack integration; preserve URL/body and propagate cancellation. [web-request] [web-response]                                                                                                             |
| Schema-first data API                             | `effect/Schema`; `effect/http-api/{HttpApi,HttpApiGroup,HttpApiEndpoint,HttpApiBuilder,HttpApiClient}`                                 | Define schemas separately from server implementations           | Browser: derived client + `effect/http/FetchHttpClient`; return ordinary Promises/data to TanStack Query at the boundary. Use leaf imports. [http-example] [api-client]                                                                                      |
| Live change notifications                         | `effect/Stream`, `PubSub`; `HttpApiSchema.StreamSse`; optionally `effect/encoding/Sse`                                                 | Typed SSE through HttpApi, or a raw `HttpServerResponse.stream` | Same server API. Browser can use the derived streaming client or native `EventSource`. [api-stream] [sse] [pubsub]                                                                                                                                           |
| WebSocket, if later necessary                     | `effect/socket/Socket`; `HttpServerRequest.upgrade` / `upgradeChannel`                                                                 | Native Bun upgrade                                              | Node adapter uses a WebSocket server; the stable Socket API is pull-based, unlike OpenCode's RC API. Not needed for one-way invalidations. [socket] [node-upgrade]                                                                                           |
| Alternative typed RPC with streaming              | `effect/rpc/{Rpc,RpcGroup,RpcClient,RpcServer,RpcSerialization}`                                                                       | HTTP or WebSocket transport                                     | Same; `stream: true` gives typed streams. `RpcServer.layerHttp` defaults to WebSocket unless `protocol: "http"` is specified. Do not adopt both protocols without a concrete need. [rpc]                                                                     |
| Read OpenCode database / write stats store        | `effect/sql/{SqlClient,SqlSchema,Statement,SqlError}`; `@effect/sql-sqlite-bun/SqliteClient` or `@effect/sql-sqlite-node/SqliteClient` | `bun:sqlite`; single serialized synchronous connection          | `node:sqlite`, **not better-sqlite3**; single serialized synchronous connection, prepared-statement cache. OpenCode database: `readonly: true, disableWAL: true`, finite short `busyTimeout`. Stats store is separately writable. [sqlite-bun] [sqlite-node] |
| Process-local invalidation                        | `effect/reactivity/Reactivity`; `SqlClient.reactive`                                                                                   | Explicit keyed invalidations rerun dependent effects            | Same. Neither an external-database watcher nor a value cache; sync must invalidate after committing the stats store. [reactivity] [sql-client]                                                                                                               |
| Standalone command line                           | `effect/cli/{Command,Flag,Argument}`; platform `BunServices` / `NodeServices` and `BunRuntime` / `NodeRuntime`                         | Command parser and standalone process runner                    | Same command definition. Use `Command.run` or `runWith`; `Flag.Int`, not `Flag.Integer`. [cli]                                                                                                                                                               |
| Testing                                           | `@effect/vitest` 4.0.0; `effect/testing/TestClock`; `effect/http-api/HttpApiTest`                                                      | Separate real-Bun adapter smoke tests                           | Node Vitest 5.x: scoped `it.effect`, virtual clock, shared layers; `it.live` uses real services. HttpApiTest exercises routing and encoding without a listener. [vitest] [api-test]                                                                          |
| Optional DuckDB                                   | An application-owned Effect service, or a custom `SqlConnection` + `SqlClient.make` adapter                                            | Native driver compatibility **unverified**                      | Integration seam exists, but no DuckDB adapter is present in the inspected Effect SQL packages. Do not select DuckDB on the strength of this ticket. [sql-connection] [sql-client] [sql-packages]                                                            |

### Compatibility and operational constraints

- **Two versions can load and run independently in one process; they are not interoperable.** Both runtimes passed concurrent effects and a Promise boundary. An RC runner executing a stable sleeping effect failed with `TypeError: Cannot read properties of undefined (reading 'scheduler')`. Do not pass Effects, Streams, Layers, Contexts, Scopes, schemas or other runtime objects across the version boundary. The spike establishes a narrow working boundary, not universal coexistence safety.
- **Plugin mode must not use `runMain`.** Own a scope / ManagedRuntime and expose a Promise-based stop/dispose operation to the host. `runMain` owns signals and process teardown. If the selected OpenCode plugin interface expects an RC Effect, a host-compatible RC shim must invoke stable code through Promises and attach cleanup using the host's scope; never return a stable Effect to it. Exact plugin wiring remains unverified. [lifecycle] [plugin]
- **Import migration is mandatory, not optional:** `effect/unstable/http` → `effect/http`, `effect/unstable/httpapi` → `effect/http-api`, `effect/unstable/sql` → `effect/sql`, and similarly `reactivity`, `rpc`, `socket`, `cli`. Stable has no old-path compatibility exports. Dropping `unstable` does **not** stabilize these APIs: marked unstable APIs can break in minor releases. Pin the Effect family together and review upgrades. [migration] [exports]
- **API differences exceed renamed paths.** RC Socket has `run` / `runRaw` / `runString` and a function-valued writer; stable Socket has `reader.pull` and `writer.write` / `writeAll`. Copying OpenCode's WebSocket handler unchanged failed the spike. [rc-socket] [socket]
- **Read-only configuration must disable WAL explicitly on both runtimes.** Bun stable skips its WAL pragma when read-only. Node stable does not: its default attempts `PRAGMA journal_mode = WAL`, and opening a read-only DELETE-journal scratch database failed with `attempt to write a readonly database`. `disableWAL: true` removes that attempted journal-mode mutation; do not rely on the OpenCode database already being WAL. [sqlite-bun] [sqlite-node]
- **Shutdown needs a live-stream drain policy.** After SSE cancellation, scope close succeeded on both runtimes and the listener stopped while the host continued. Leaving an infinite SSE stream open with a 100 ms graceful timeout produced a failed/interrupted close on both runtimes and interruption diagnostics on Bun, although the listener stopped. Close notification streams / sockets before disposing the listener; do not treat the adapter's timeout as a proven clean shutdown. [bun-server] [node-server]
- **Runtime and bundle edges matter.** Select only the appropriate adapter via conditional exports or runtime-specific entrypoints; never statically load `bun:sqlite` on Node. Do not assume `@effect/platform-node`'s `node >=18` metadata makes `node:sqlite` available. Node 24.15.0 is verified here; exact Desktop runtime compatibility and compiled OpenCode binary loading are **unverified**. [node-package] [opencode-conditions]

## Evidence and scope

Research date: **2026-10-01**. Read-only source inspection:

- Effect checkout: `~/git/mirror/effect`, commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`; `packages/effect/package.json:1–5` says 4.0.0. Sources below are pinned to this commit.
- OpenCode checkout: `~/git/opencode`, branch `v2`, commit `8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43`; core package version 2.0.21. `package.json:82` pins Effect to 4.0.0-rc.112. Neither checkout was modified or switched. [opencode-pin]
- Published npm installs: `effect`, `@effect/platform-bun`, `@effect/platform-node`, `@effect/sql-sqlite-bun`, `@effect/sql-sqlite-node`, `@effect/vitest`, all **4.0.0**; `effect-rc` was an npm alias for **effect@4.0.0-rc.112**. Registry version and peer metadata were read with `npm view`; experiments used the published distributions, not workspace source aliases. Published adapters require `effect: ^4.0.0`; published `@effect/vitest` additionally requires `vitest: >=5.0.0 <6.0.0`. [npm]
- Spikes ran on **macOS arm64, Bun 1.4.2, Node 24.15.0**, entirely under `scratch-effect-v4-modules/` in the approved temporary directory. No maintainer OpenCode database was opened; SQLite fixtures contained only a synthetic integer 42.

Recommendations in this document do not choose the stats store's engine, package architecture, sync algorithm, plugin lifecycle contract or a browser performance budget. Those are separate map decisions. These tiny fixtures do not prove the map's latency, startup or next-frame targets.

## HTTP, API and live-update details

### HTTP and the fetch boundary

Effect's documented composition is handler layers → `HttpApiBuilder.layer(Api)` → `HttpRouter.serve(routes)` → runtime-specific HTTP layer. The platform HTTP layers also supply services needed for file serving. `HttpStaticServer.layer({ root, prefix })` is the directory-serving helper; use it rather than writing path-to-file routing from scratch. Its prefix is mounted using a prefixed router. Root assets, dashboard navigation and the data API need intentionally separate route ownership so a wildcard handler does not swallow API routes. [http-example] [static]

Mounting a web-standard handler is possible on both adapters. The successful spike used:

```ts
HttpRouter.add(
  "*",
  "/web/*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const response = yield* Effect.promise(() => fetchHandler(webRequest));
    return HttpServerResponse.fromWeb(response);
  }),
);
```

This excerpt demonstrates the conversion seam, not production error handling. `toWeb` returns an existing Web Request unchanged on Bun; on Node it derives an absolute URL and creates a streaming request body with `duplex: "half"`. It accepts an AbortSignal. Production invocation must translate rejected Promises into a typed error and connect Effect cancellation to the fetch request's signal. Node interrupts request fibers when responses close early; Bun listens to request aborts. The actual TanStack Start handler, SSR assets and deployment adapter were **not tested**. [web-request] [web-response] [node-server] [bun-abort]

The reverse operation, `HttpRouter.toWebHandler(routes)`, returns `{ handler, dispose }`. It exposes an Effect router to a Web Request host; it is not what mounts TanStack's handler into an Effect server. [http-example]

### HttpApi versus RPC

HttpApi provides conventional URLs/methods/status codes, schema validation, OpenAPI and a derived typed client. Separate DTO/API definitions from implementations, as Effect's own example explicitly recommends. A small Promise facade around `HttpApiClient.make` lets TanStack Query receive plain data while Effect stays responsible for network decoding and typed failures. [http-example] [api-client]

**HttpApi itself supports streaming:** `HttpApiSchema.StreamSse({ data: schema })` supplies typed SSE data, while `{ events: eventCodec }` preserves the event envelope; `StreamUint8Array` supports byte streaming. Handlers return a Stream and derived clients decode it to a Stream. Typed stream failures use the reserved `effect/http-api/stream/failure` event. This is already present in RC.112 too; it is not a stable-only feature. [api-stream] [api-client] [rc-api-stream]

RPC offers typed request/response and `stream: true` RPCs with transport protocols and serialization layers. It is useful when that protocol's streamed method calls are the product requirement; it is not required merely to stream invalidations. For this dashboard, **recommend HttpApi for reads and SSE for revision/change notifications**. WebSocket's bidirectionality and RPC's framing add no demonstrated v1 need. [rpc]

OpenCode is a useful implementation reference, not a dependency to reuse: its server imports RC HTTP/HttpApi modules, and `handlers/event.ts:19–33` constructs raw SSE from a Stream, adds a 15-second heartbeat, and sets `Cache-Control: no-cache, no-transform`. Its feed bounds each subscriber's queue and fails/removes overflowing subscribers rather than silently allowing unlimited growth. [opencode-sse]

### Fanout and invalidation

Use a process-local PubSub of **stats store revisions / affected query keys**, not OpenCode message events. `Stream.fromPubSub` gives each connection a scoped subscription. `PubSub.bounded` backpressures publishers; a slow dashboard must not stall sync. A small `PubSub.sliding({ capacity, replay })` is appropriate for coalescible “stats changed” hints, provided reconnect/initial subscription always reads the current revision/snapshot. It is not durable event delivery: replay is only an in-memory buffer. Merge a heartbeat Stream for SSE and release subscriptions on disconnect. These are proposed application semantics, not automatic Effect guarantees. [pubsub]

OpenCode's core Bus also uses `PubSub`/`Stream.fromPubSub`, but its payloads and durable-event logic are not suitable dashboard dependencies. Reuse the concurrency pattern, not its private bus or message-bearing events. [opencode-bus]

## Data, CLI and testing details

### SQL adapters and Reactivity

Both SQLite adapters expose the generic `SqlClient` service, parameterized statements, scoped closure and transactions. Both use synchronous database operations and serialize access, so Effect does **not** move long scans or busy waits off the host event loop. Both default to a five-second busy timeout. Use a bounded, substantially shorter timeout for the OpenCode database and retry asynchronously as appropriate; isolate heavy sync/rebuild work in a worker/process if required by the performance design. SQLite query streaming (`executeStream`) and `updateValues` are unsupported in these adapters. [sqlite-bun] [sqlite-node]

`readonly: true` uses native read-only connection flags and makes explicit transactions use `BEGIN`, not writable `BEGIN IMMEDIATE`. The fixture proved that reads and read-only transactions succeed and INSERT fails on both runtimes. `disableWAL` suppresses a journal-mode pragma; it does **not** disable SQLite's ability to read an already-WAL database. Do not execute checkpoints, migrations or journal pragmas against the OpenCode database. Stats store connections and schema migration are separate. [sqlite-bun] [sqlite-node]

Each driver layer provides the same generic `SqlClient` service key. Do not merge an OpenCode database client and a stats store client and assume both can be retrieved under that one key; encapsulate them behind distinct domain services. The supplied SQLite layers internally provide `Reactivity.layer`; applications needing a shared invalidation bus must deliberately share the relevant service instance. [sql-client] [sqlite-layers]

`Reactivity` is explicitly process-local, tracks keys and callbacks, and does not cache values. `mutation(keys, effect)` invalidates after successful completion; `query` immediately runs a dependent effect and reruns on explicit invalidation, coalescing invalidations during a running query. `withBatch` batches notifications. `SqlClient.reactive` delegates to this service. Changes made by OpenCode's separate connections do **not** automatically trigger it. Detect/sync those changes, commit the stats store, then invalidate dashboard reads and publish the new revision. [reactivity] [sql-client]

DuckDB can be wrapped as an Effect service: the service/layer/Promise/resource abstractions do not require SQLite. A deeper `effect/sql` integration must implement the `SqlConnection` execution contract, SQL compiler and scoped acquirer for `SqlClient.make`; DuckDB dialect, parameter encoding, transactions and cancellation must be validated rather than treating it as a drop-in SQLite client. No official DuckDB client appears in the inspected `packages/sql` inventory, and no DuckDB driver was installed/tested. Native Bun/Node compatibility remains **unverified**. [services] [sql-connection] [sql-client] [sql-packages]

OpenCode core supplies custom SQLite connections and delegates to `SqlClient.make`; it selects `bun:sqlite` / `node:sqlite` with package import conditions. This verifies the custom-driver integration seam, but OpenCode's private adapters and their tuning are not a library contract for opencode-stats. [opencode-sql] [opencode-conditions]

### CLI and tests

Use `Command.make`, typed `Flag` / `Argument` values, and `Command.run` (arguments from Stdio) or `runWith` (explicit arguments). Provide the selected runtime's Services layer. Only the standalone executable invokes its runtime's `runMain`. Plugin mode should call shared startup logic directly, not parse or run the host process's argv. [cli] [lifecycle]

`@effect/vitest` 4.0.0 matches the repository's Vitest 5.0.2. `it.effect` supplies TestClock/TestConsole and scopes the test; `it.live` scopes without those test services. Use virtual time for sync schedules, separate real network/SQLite adapter tests, and `HttpApiTest.groups` for in-memory request encoding/routing/response decoding. A Node test with a one-hour virtual sleep and scoped finalizer passed in 4 ms. This does not replace real Bun tests. [vitest] [api-test]

## Throwaway spike results

All dependencies were exact versions above. HTTP listeners bound `127.0.0.1:0`; requests used native fetch and WebSocket. Every listener was scoped and stopped or its process exited; no persistent server was left running.

| Experiment                         | Bun 1.4.2                                                                                   | Node 24.15.0                               | Method / interpretation                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| HttpApi JSON read                  | HTTP 200, `{"count":42}`                                                                    | Same                                       | One schema-first endpoint, handler layer, real TCP listener                                               |
| Fetch-handler mount                | `fetch:/web/test`                                                                           | Same                                       | Web Request passed through a stub Promise handler; not actual TanStack Start                              |
| Single static file                 | `scratch asset`                                                                             | Same                                       | `HttpServerResponse.file`                                                                                 |
| Directory mount + range            | HTTP 206, `scratch`                                                                         | Same                                       | `HttpStaticServer.layer`, `Range: bytes=0-6`, cache-control header verified                               |
| Raw SSE                            | `text/event-stream`; revision 1 + heartbeat                                                 | Same                                       | Infinite Stream response; native fetch reader observed first bytes                                        |
| Derived typed SSE                  | Revisions 1, 2 decoded                                                                      | Same                                       | `HttpApiSchema.StreamSse({ data: Schema.Struct({ revision: Schema.Number }) })` + derived FetchHttpClient |
| WebSocket echo                     | `scratch echo`                                                                              | Same                                       | Stable `socket.reader.pull` → `writer.writeAll`; native WebSocket client                                  |
| Scope close after SSE cancellation | Success; ~1 ms; listener refused new fetch                                                  | Success; ~3 ms; listener refused new fetch | Scope closed without a process runner; host logged afterward                                              |
| Scope close with live infinite SSE | Failure; ~103 ms; listener stopped; interruption diagnostic                                 | Failure; ~102 ms; listener stopped         | 100 ms graceful timeout; requires an application stream-drain policy                                      |
| Read-only SQLite                   | SELECT 42; INSERT failed; transaction SELECT 42                                             | Same                                       | DELETE-journal synthetic database, `readonly: true, disableWAL: true, busyTimeout: "20 millis"`           |
| Node read-only defaults            | Not applicable                                                                              | Opening failed: attempted readonly write   | Same fixture, `disableWAL` omitted; confirms unconditional WAL pragma risk                                |
| Sliding fanout / replay            | Two subscribers saw latest value 2; late subscriber replayed 2                              | Same                                       | Capacity 1, replay 1; published 1 then 2 before consuming                                                 |
| Reactivity query                   | Initial 0, explicit invalidation yielded 1                                                  | Same                                       | Counter query registered under `stats`; no database watcher implied                                       |
| CLI flag/help                      | `--port 1234` parsed                                                                        | Same; generated help printed               | `Command.runWith` + selected platform Services layer                                                      |
| Vitest / virtual clock             | Not run with Bun                                                                            | 1 test passed                              | Vitest 5.0.2 via `node node_modules/vitest/vitest.mjs run`                                                |
| RC/stable coexistence              | Independent concurrent runs + Promise boundary passed; mixed RC runner/stable Effect failed | Same                                       | npm alias keeps both distributions installed; three concurrent repetitions, a sleeping effect in each     |

### Browser bundle measurement

**esbuild 0.25.12**, `--bundle --minify --platform=browser --format=esm`, one GET endpoint returning `{ count: number }`. Node's `zlib.gzipSync` and `brotliCompressSync` with default options measured compression. No server implementation, Solid or TanStack code was imported. These are separate complete bundles, not incremental costs inside an existing dashboard bundle.

| Browser entry                                                                | Minified bytes | Gzip bytes | Brotli bytes |
| ---------------------------------------------------------------------------- | -------------: | ---------: | -----------: |
| Derived HttpApi client, leaf imports throughout                              |        182,188 |     59,013 |       52,287 |
| Same client/schema, broad `effect`, `effect/http`, `effect/http-api` imports |        363,337 |    114,347 |       99,314 |
| Plain fetch + `.json()` baseline, no validation                              |             74 |         89 |           77 |

**Recommendation:** share a small API-definition-only module and use leaf imports on its browser dependency path. The broad-import bundle is nearly twice the gzip size here despite minification/tree-shaking; do not assume barrels are free. Effect is usable in a browser, but this derived client is not zero-cost. Re-measure the actual dashboard bundle and startup time before claiming the one-second or next-frame targets. The baseline has no runtime schema validation and is not feature-equivalent.

## Essential reproduction excerpts

Spikes stayed outside repository packages; the following preserves the critical inputs without committing throwaway dependencies or build output.

```sh
# In a fresh approved scratch directory with {"private":true,"type":"module"}:
bun add --exact effect@4.0.0 @effect/platform-bun@4.0.0 @effect/platform-node@4.0.0 \
  @effect/sql-sqlite-bun@4.0.0 @effect/sql-sqlite-node@4.0.0 \
  @effect/vitest@4.0.0 vitest@5.0.2 esbuild@0.25.12
bun add --exact effect-rc@npm:effect@4.0.0-rc.112
```

Bundle inputs (`api.ts` and `client.ts`):

```ts
// api.ts
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
export const Api = HttpApi.make("stats").add(
  HttpApiGroup.make("stats").add(
    HttpApiEndpoint.get("summary", "/api/summary", {
      success: Schema.Struct({ count: Schema.Number }),
    }),
  ),
);
// client.ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import { Api } from "./api.ts";
export const summary = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      return yield* client.stats.summary();
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
```

```sh
bunx esbuild client.ts --bundle --minify --platform=browser --format=esm --outfile=client.js
node -e 'const fs=require("node:fs"),z=require("node:zlib"); const b=fs.readFileSync("client.js"); console.log(b.length,z.gzipSync(b).length,z.brotliCompressSync(b).length)'
```

For the broad-import comparison use `{ Schema } from "effect"`, `{ HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiClient } from "effect/http-api"`, `{ Effect } from "effect"`, and `{ FetchHttpClient } from "effect/http"` instead. The plain entry is `export const summary = async () => (await fetch('/api/summary')).json()`.

HTTP resource ownership excerpt (imports/route definitions omitted):

```ts
const handlers = HttpApiBuilder.group(Api, "stats", (h) =>
  h.handle("summary", () => Effect.succeed({ count: 42 })),
);
const routes = HttpApiBuilder.layer(Api).pipe(Layer.provide(handlers));
const scope = Effect.runSync(Scope.make());
const context = await Effect.runPromise(
  Layer.buildWithScope(HttpRouter.serve(routes).pipe(Layer.provideMerge(serverLayer)), scope),
);
// serverLayer: BunHttpServer.layer({ hostname: "127.0.0.1", port: 0, ... })
// or NodeHttpServer.layer(createServer, { host: "127.0.0.1", port: 0, ... })
// Read HttpServer.HttpServer from context for the assigned port; exercise routes.
const closeExit = await Effect.runPromiseExit(Scope.close(scope, Exit.void));
// Verify a new fetch to that listener fails, then log from the still-live host.
```

For raw SSE, add `HttpServerResponse.stream(Stream.make('data: {"revision":1}\n\n').pipe(Stream.concat(Stream.tick("10 millis").pipe(Stream.map(() => ": heartbeat\n\n"))), Stream.encodeText), { contentType: "text/event-stream" })`. Read one chunk; either abort/cancel the reader before closing scope, or leave it open to reproduce the graceful-timeout failure. The latter used `gracefulShutdownTimeout: "100 millis"` on each adapter. Handle `reader.closed` rejection in the harness. A production drain strategy was not implemented here.

SQLite reproduction: initialize a fresh file using `node:sqlite` or the writable Effect adapter with `disableWAL: true`; create `fixture(count INTEGER)` and insert 42. Then execute this program once under each runtime with its corresponding SqliteClient import:

```ts
await Effect.runPromise(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    console.log(yield* sql`SELECT count FROM fixture`);
    console.log((yield* Effect.exit(sql`INSERT INTO fixture VALUES (99)`))._tag);
    console.log(yield* sql.withTransaction(sql`SELECT count FROM fixture`));
  }).pipe(
    Effect.provide(
      SqliteClient.layer({
        filename: scratchFilename,
        readonly: true,
        disableWAL: true,
        busyTimeout: "20 millis",
      }),
    ),
  ),
);
```

Coexistence failure reproduction (JavaScript avoids pretending the types interoperate):

```js
import { Effect as Stable } from "effect";
import { Effect as RC } from "effect-rc";
const stable = Stable.sleep("1 millis").pipe(Stable.as("stable"));
const rc = RC.sleep("1 millis").pipe(RC.as("rc"));
console.log(await Promise.all([Stable.runPromise(stable), RC.runPromise(rc)]));
console.log(await Stable.runPromise(Stable.promise(() => RC.runPromise(rc))));
try {
  await RC.runPromise(stable);
} catch (error) {
  console.log(String(error));
}
```

Run under both `bun` and `node`. The failed cross-run does not imply independent runs failed. Internally both versions use a shared current-fiber key and unversioned service/type identifiers; equal markers are not an interoperability promise. Stable and RC Context services made with the same string key compared equal in the spike. Namespace opencode-stats services, keep runtime objects private, avoid bundler alias/deduplication tricks, and retest the installed dependency graph and the actual host. [fiber] [rc-fiber]

## Unverified boundaries to carry into build decisions

- Actual OpenCode compiled binary and Desktop plugin loading, unloading and signal behavior, including the host's exact Node/Bun versions and dependency resolver.
- Full RC-to-stable API/type migration beyond the inspected paths, Socket contract and tested operations. No general cross-version compatibility guarantee was found.
- A real TanStack Start fetch handler with SSR, asset manifests, POST bodies and cancellation; the seam is proven with a stub only.
- Linux/Windows runs, large-database scans, WAL concurrency benchmarks, interruption of synchronous SQLite calls and real shutdown under many SSE/WebSocket subscribers.
- DuckDB native bindings and any custom Effect SQL adapter; actual dashboard/RPC bundle sizes and browser execution/rendering benchmarks.

## Primary-source index

Labels above reference the owning source below. Effect paths are relative to `~/git/mirror/effect`; OpenCode paths to `~/git/opencode`. Published-package sources use versioned npm URLs. Line numbers refer to the inspected files, not generated declarations.

- [services]: [Effect LLMS.md:124–150](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/LLMS.md#L124-L150), services; `ai-docs/src/01_effect/01_basics/10_creating-effects.ts`, Promise/callback boundaries.
- [exports]: [packages/effect/package.json:32–60,75–103](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/package.json#L32-L60), exact exports.
- [migration]: [MIGRATION.md:25–66](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/MIGRATION.md#L25-L66), consolidated packages, matching versions, renamed imports and stability policy.
- [http-example]: [ai-docs/src/51_http-server/10_basics.ts:7–15,33–64,80–117](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/ai-docs/src/51_http-server/10_basics.ts#L7-L117).
- [bun-server]: [packages/platform/bun/src/BunHttpServer.ts:106–174,209–216,300–344](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/bun/src/BunHttpServer.ts#L106-L174), listener, finalizers, default 20-second grace and service layers.
- [bun-abort]: [packages/platform/bun/src/BunHttpServer.ts:195–205](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/bun/src/BunHttpServer.ts#L195-L205).
- [node-server]: [packages/platform/node/src/NodeHttpServer.ts:89–175,180–219](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/node/src/NodeHttpServer.ts#L89-L219), listener, finalizers, grace and request interruption.
- [node-upgrade]: [packages/platform/node/src/NodeHttpServer.ts:145–175,275–299](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/node/src/NodeHttpServer.ts#L275-L299).
- [static]: [packages/effect/src/http/HttpStaticServer.ts:1–11,71–85,113–175,182–255](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpStaticServer.ts#L71-L255).
- [web-request]: [packages/effect/src/http/HttpServerRequest.ts:1060–1123](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpServerRequest.ts#L1060-L1123).
- [web-response]: [packages/effect/src/http/HttpServerResponse.ts:1481 onward](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpServerResponse.ts#L1481), `fromWeb` conversion.
- [api-client]: [packages/effect/src/http-api/HttpApiClient.ts:45–101,937–988](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http-api/HttpApiClient.ts#L45-L101), typed client and streaming decoding.
- [api-stream]: [packages/effect/src/http-api/HttpApiSchema.ts:265–438](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http-api/HttpApiSchema.ts#L265-L438); `HttpApiBuilder.ts:1056–1104`, stream encoding.
- [sse]: [packages/effect/src/encoding/Sse.ts:1–11,99–118](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/encoding/Sse.ts#L1-L118).
- [socket]: [packages/effect/src/socket/Socket.ts:1–12,63–147](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/socket/Socket.ts#L63-L147); `http/HttpServerRequest.ts:186 onward`, upgrade channel.
- [rpc]: [packages/effect/src/rpc/Rpc.ts:932–984](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/rpc/Rpc.ts#L932-L984); [RpcServer.ts:860–897](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/rpc/RpcServer.ts#L860-L897).
- [pubsub]: [packages/effect/src/PubSub.ts:334–466,1217–1284](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/PubSub.ts#L334-L466); `Stream.ts:1173`, scoped stream subscription.
- [sqlite-bun]: [packages/sql/sqlite-bun/src/SqliteClient.ts:1–12,88–99,130–155,211–212,227–246](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql/sqlite-bun/src/SqliteClient.ts#L130-L155).
- [sqlite-node]: [packages/sql/sqlite-node/src/SqliteClient.ts:1–13,95–106,136–164,319](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql/sqlite-node/src/SqliteClient.ts#L136-L164), native driver and WAL behavior; `executeStream` is unimplemented later in this same file.
- [sqlite-layers]: `packages/sql/sqlite-bun/src/SqliteClient.ts:268–296` and `packages/sql/sqlite-node/src/SqliteClient.ts:341–369`, same checkout as the links above.
- [reactivity]: [packages/effect/src/reactivity/Reactivity.ts:1–8,96–125,153–219](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/reactivity/Reactivity.ts#L1-L219).
- [sql-client]: [packages/effect/src/sql/SqlClient.ts:60–100,118–178,220,259–269](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/sql/SqlClient.ts#L60-L178).
- [sql-connection]: [packages/effect/src/sql/SqlConnection.ts:1–11,28–75](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/sql/SqlConnection.ts#L28-L75); `sql/Statement.ts:65,855 onward`, dialect/SQL compiler seam.
- [sql-packages]: [packages/sql inventory](https://github.com/Effect-TS/effect/tree/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql), bounded evidence of no included DuckDB adapter, not a claim about all third-party packages.
- [cli]: [ai-docs/src/70_cli/10_basics.ts:7–17,152–162](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/ai-docs/src/70_cli/10_basics.ts#L152-L162); `packages/effect/src/cli/Command.ts:1791–1816,1882 onward`; `cli/Flag.ts:99`, `Int`.
- [vitest]: [packages/vitest/package.json:52–59](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/vitest/package.json#L52-L59); `packages/vitest/src/internal/internal.ts:57–59,386–387`, test services/scoping.
- [api-test]: [ai-docs/src/51_http-server/20_testing.ts:1–10,41–65](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/ai-docs/src/51_http-server/20_testing.ts#L41-L65).
- [lifecycle]: [packages/effect/src/ManagedRuntime.ts:1–8,208–227,337–346](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/ManagedRuntime.ts#L208-L227); `packages/platform/node/src/NodeRuntime.ts:1–7,24–30`; `packages/platform/bun/src/BunRuntime.ts:1–7,24–28`.
- [node-package]: [packages/platform/node/package.json:28–30,68–75](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/node/package.json#L28-L30); compare SQLite's `node:sqlite` import at `packages/sql/sqlite-node/src/SqliteClient.ts:32`.
- [fiber]: [packages/effect/src/internal/effect.ts:508,643–692](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/internal/effect.ts#L643-L692); `Redactable.ts:164`, shared current-fiber key.
- [rc-fiber]: Published [effect@4.0.0-rc.112/src/internal/effect.ts](https://unpkg.com/effect@4.0.0-rc.112/src/internal/effect.ts):502,630–677; `src/Redactable.ts`, same current-fiber key.
- [rc-socket]: Published [effect@4.0.0-rc.112/src/unstable/socket/Socket.ts](https://unpkg.com/effect@4.0.0-rc.112/src/unstable/socket/Socket.ts):59–91.
- [rc-api-stream]: Published [effect@4.0.0-rc.112/src/unstable/httpapi/HttpApiSchema.ts](https://unpkg.com/effect@4.0.0-rc.112/src/unstable/httpapi/HttpApiSchema.ts):231–324, streaming schema definitions.
- [npm]: [effect@4.0.0 package metadata](https://registry.npmjs.org/effect/4.0.0), [platform-bun](https://registry.npmjs.org/@effect/platform-bun/4.0.0), [platform-node](https://registry.npmjs.org/@effect/platform-node/4.0.0), [sql-sqlite-bun](https://registry.npmjs.org/@effect/sql-sqlite-bun/4.0.0), [sql-sqlite-node](https://registry.npmjs.org/@effect/sql-sqlite-node/4.0.0), [vitest](https://registry.npmjs.org/@effect/vitest/4.0.0).
- [opencode-pin]: [OpenCode package.json:82](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/package.json#L82); `packages/core/package.json:3`, 2.0.21.
- [opencode-sse]: [packages/server/src/handlers/event.ts:1–37](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/server/src/handlers/event.ts#L1-L37); `server/src/event-feed.ts:64–79`, overflow and scoped queues.
- [opencode-bus]: [packages/core/src/bus.ts:194,502–503,756–762,810](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/bus.ts#L756-L762).
- [opencode-sql]: [packages/core/src/database/sqlite.ts:27–97](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/sqlite.ts#L27-L97); `sqlite.node.ts:78–99` and `sqlite.bun.ts:83–103`, native connection layers. `packages/server/src/process.ts:46–91,148–160` demonstrates NodeHttpServer and scoped host cleanup.
- [opencode-conditions]: [packages/core/package.json:32–38](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/package.json#L32-L38); `core/test/sqlite-bundle.test.ts:5–9,36–48`, guarding against Bun imports in other runtime bundles.
- [plugin]: [packages/plugin/src/effect/plugin.ts:56–63](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/effect/plugin.ts#L56-L63), Effect-returning plugin contract; this source is evidence of a boundary risk, not confirmation of the final plugin entrypoint.
