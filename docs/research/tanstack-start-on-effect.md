# TanStack Start (Solid) on an Effect server

Research for [#6](https://github.com/ysm-dev/opencode-stats/issues/6), under [map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Investigated 2026-10-01. All fixture values are synthetic; no OpenCode database was opened.

## Direct answer

**Both static hosting and Start SSR work on Effect v4, on Bun and Node, without a running Vite or Nitro server. Neither hosting mode, `ensureQueryData`, persistence, nor speculative preloading alone guarantees next-frame rendering. That requires the route's code and complete render data already in memory.**

| Mode                            | Effect owns                                                                          | Runtime requirements                                                                                          | Initial content and trade-off                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start SPA                       | Files from `dist/client`, SPA fallback, separate Effect HTTP API/push                | Effect and platform adapter; no Start SSR runtime if server functions/routes are unused                       | Start emits `_shell.html`, not populated dashboard routes. Simplest runtime; bootstrap current stats-store data into the document and seed Query before client routing. First dashboard content still requires JS.                         |
| Static prerender                | Prerendered HTML and assets; API/push if live data is needed                         | Same as SPA for files-only hosting                                                                            | HTML can already contain rendered values and dehydrated Query data, but those are **build-time** values. Never publish a user's stats-store snapshot in an npm artifact. Static prerender alone cannot supply another user's live data.    |
| Start handler mounted in Effect | Assets/API/push and catch-all `start.fetch(Request)` via `HttpEffect.fromWebHandler` | Effect/platform adapter plus the Start server bundle's runtime dependencies, or a dependency-bundled artifact | Per-request SSR can render current stats-store data in initial HTML and serialize Query state. Server functions and Start server routes also work. More runtime JS and hydration work, but the cleanest path to data-bearing initial HTML. |

These output modes and their limitations are documented in the version-pinned [hosting], [spa], and [prerender] sources and were tested below. Nitro is an **alternative deployment adapter**, not a prerequisite for calling Start's fetch handler. Do not run Nitro's listener alongside Effect's listener.

**Recommended data pattern, independent of hosting choice:**

1. Effect owns reads of the stats store and exposes a read-only bootstrap/snapshot API plus live revision notifications. Use the same Effect service for SSR bootstrap; do not make SSR take an HTTP round trip to its own listener.
2. Bootstrap a bounded, sufficient aggregate working set for the dashboard's pages, time ranges and filters. Either seed all supported query keys or seed an aggregate basis from which those views are cheap local selectors. The data API/aggregation ticket must settle its size and computation budget; this research does not assert that arbitrary filters can be precomputed affordably.
3. Create one browser QueryClient, one request-local QueryClient for SSR. Await critical loaders, dehydrate their Query data into SSR HTML, and hydrate before observers/router loading. For SPA, inject a safely serialized snapshot into the shell and seed Query **before** creating/loading the browser router. Persisted browser data is an optional warm-start accelerator, not the stats store or the source of truth.
4. Use route loaders with `ensureQueryData`, reactive Solid `useQuery` in components, Query `staleTime: Infinity` for push-driven data, and Router `defaultPreloadStaleTime: 0`. Preload/eagerly bundle the route/component/chart chunks for every immediately selectable view. `preload="render"` or explicit `preloadRoute` covers known navigation better than intent alone. Keep the warmed working set from being garbage-collected.
5. On push, keep the previous good data visible, then patch Query with `setQueryData`, or invalidate and refresh in the background. Refresh inactive-but-selectable views too, or update the shared aggregate basis. Do not remove cache entries to indicate staleness. Reconcile the revision on reconnect/focus so missed events cannot leave `Infinity` data permanently stale.
6. Treat a missing/invalid bootstrap as a startup/error-path design problem, not something a spinner-free view can magic away. Cold download, async IndexedDB reads and an uncached fetch do not fit a next-frame guarantee. An SSR first paint can contain data; _every later_ route/filter change still needs a cache-hit invariant and a browser frame-budget test.

This is a viable architecture menu, not an ADR selecting one mode. SPA plus Effect API is the smaller runtime; SSR plus the same Effect API is preferable if data-bearing first paint is mandatory. Runtime snapshot injection is a small dynamic document endpoint, not files-only static hosting. [query-client], [router-data], [router-preload]

## Versions and compatibility

The tested dependency graph was installed from exact versions, not `latest`:

| Component                                                                     | Tested version                                          | Verified contract                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@tanstack/solid-start`                                                       | 1.168.57                                                | Peers `solid-js >=1.0.0`, Vite `>=7.0.0`; package Node engine `>=22.12.0`. Its dependency is **Solid Router 1.170.38**, not 1.168.x. |
| `@tanstack/solid-router`                                                      | 1.170.38                                                | Peer `solid-js ^1.9.10`. Also inspected 1.168.26: same Solid peer constraint.                                                        |
| `@tanstack/solid-query`, Query core, persistence core, sync storage persister | 5.104.0                                                 | Solid Query peer `solid-js ^1.6.0`; core and storage packages are framework-independent.                                             |
| Solid                                                                         | 1.9.13                                                  | Built and served successfully in every tested mode.                                                                                  |
| Build tooling                                                                 | Vite 7.3.1; vite-plugin-solid 2.11.12; TypeScript 5.9.3 | Start plugin before `solid({ ssr: true })`; `vite build` emitted both client and SSR environments.                                   |
| Effect and both platform packages                                             | 4.0.0                                                   | `effect/http` imports, not v3 `@effect/platform` or old beta `effect/unstable/http` imports.                                         |
| Runtimes                                                                      | Bun 1.4.2; Node 24.15.0; macOS arm64                    | Tested, including ordinary in-process imports and a compiled Bun fixture.                                                            |

Sources: exact npm metadata for [Start][npm-start], [Router][npm-router], [older Router][npm-router-old], [Solid Query][npm-query], [Effect][npm-effect], [Node platform][npm-node]; Effect's [migration] source explains matching v4 versions and the unstable HTTP API paths.

**Solid 2 is not supported by this pinned combination:** Start's broad peer range alone is misleading; Router's `^1.9.10` and Query's `^1.6.0` exclude 2.x. No Solid 2 runtime was tested. Do not use the independent 2.0 beta/RC package tracks to infer support for Start 1.168.x. Pin the complete compatible graph; forcing every TanStack package to the same version is wrong. [npm-start], [npm-router], [npm-query]

Start's Node minimum is not the whole runtime minimum: this install resolved `undici 8.11.2` via `@effect/platform-node 4.0.0`; its npm engine is `>=22.19.0`. Node 24.15.0 is the actual verified runtime, not a claim of support for every Node 22 release. [npm-node], [npm-undici]

There is an official Solid SSR Query adapter: `@tanstack/solid-router-ssr-query`, whose [source][solid-ssr-adapter] installs the core integration and wraps the router with QueryClientProvider. The inspected 1.167.3 package requires Router `>=1.170.31` and Query `>=5.102.0`; the pinned official [example][solid-query-example] uses it. It is a suitable alternative to manual dehydrate/hydrate callbacks, but was **not** installed in this spike. An older 1.168.x Router cannot simply be paired with that current adapter. [npm-ssr-adapter]

## Effect hosting seam

Start's default server entry exports `{ fetch }`, wrapping `createStartHandler(defaultStreamHandler)`. It does **not** create a listening server. [start-entry]

The minimal dynamic route is:

```ts
import { HttpEffect, HttpRouter } from "effect/http";
import start from "./dashboard-artifact/server/server.js";

const StartRoutes = HttpRouter.add(
  "*",
  "/*",
  HttpEffect.fromWebHandler(async (request) => start.fetch(request)),
);
```

`fromWebHandler` converts the current Effect request, supplies an abort signal, translates promise failures to HTTP errors, and converts the returned Web Response. `fromWeb` retains status/headers, handles Set-Cookie, and exposes the body as a stream; do not buffer every SSR response using `.text()`. URL reconstruction uses Host and the forwarded protocol, so validate the permitted localhost Host/Origin at the edge rather than trusting arbitrary headers. [effect-web], [effect-response], [effect-request]

Provide the runtime-specific listener/support services:

```ts
// Bun
BunHttpServer.layer({ hostname: "127.0.0.1", port });
// Node
NodeHttpServer.layer(createServer, { host: "127.0.0.1", port });
// Both
HttpRouter.serve(Routes).pipe(Layer.provide(platform));
```

The adapters acquire/release the server in an Effect scope. [effect-bun], [effect-node], [effect-example]

For files, Effect 4 already provides `HttpStaticServer.make/layer`: root, index filename, MIME types, SPA fallback, range/conditional responses, and cache-control. SPA output uses `index: "_shell.html", spa: true`. The fallback only applies to extensionless missing paths accepting HTML; test deep links with `Accept: text/html`. Prerendered `/page.html` output needs an explicit URL rewrite, or configure `autoSubfolderIndex: true` to emit `/page/index.html`. [effect-static], [prerender]

Route order/coverage should be explicit: Effect API and push endpoints first, assets next, Start handler or HTML fallback last. Missing JS assets and unknown API paths must be real errors, not successful HTML fallback responses. Use immutable caching for hashed assets; do not immutably cache per-user documents or snapshots. For SSR, serve `dist/client/assets/*` as files and leave page/server-function routes to Start. A files-only deployment cannot execute server functions merely because `spa.enabled` is true. [spa], [hosting]

### Running inside a host process

There is no requirement to spawn Vite, Nitro, Bun or Node child processes to host either mode. Export a scoped server-start operation from the npm entrypoint; plugin mode starts it during setup and returns cleanup, standalone mode owns its own scope. Do not call `runMain` or install process-global signal handlers from the plugin entrypoint. Do not replace `globalThis.Response` with a Nitro optimization in someone else's process. Start server functions can bridge to an Effect service through typed request context (`fetch(request, { context })`) rather than making that service a process-global singleton. The request-context option exists in [start-request-handler]; a real stats-store bridge was not implemented here.

OpenCode V2's [plugin lifecycle][opencode-plugins] supports setup and cleanup. Its npm plugin loader resolves a package server entry and imports it; it is not a generic facility to mount arbitrary plugin HTTP routes into OpenCode's own router. A separate localhost listener in the same process is the conservative hosting interpretation. Actual OpenCode router integration is **unverified** and unnecessary for this hosting proof. [opencode-module], [opencode-host]

**Compiled Bun packaging caveat, observed:** a compiled Bun 1.4.2 fixture dynamically importing the unpacked, non-bundled `host.ts` failed with `Cannot find package 'effect'`, even after `bun install --production` inside that package. Ordinary Bun and Node imports worked. Bundling the runtime dependencies into a JS artifact, then dynamically importing that artifact from the same compiled launcher, passed SSR/data/asset checks. The dependency-bundled artifact also ran under ordinary Bun and Node. This is evidence for a safe packaging option, not proof of the cause of Bun's resolver behavior or proof that every external dependency fails. OpenCode's own Bun loader likewise uses dynamic import; test the actual released binary before promising compatibility. [opencode-bun-import]

OpenCode Desktop is Node/Electron at the inspected commit, but **its main process connects to a background service** using the CLI's `serve --service`; don't assume server plugins execute in the renderer or Electron main process simply because the dashboard is opened from Desktop. Its Node import implementation uses the main-context loader. The separate Node fixture proves the hosting seam works in Node, not that this npm plugin has been loaded by the released Desktop application. Both real plugin-mode integrations remain **unverified**. [opencode-desktop-service], [opencode-node-import]

## Data: loading, first paint and later frames

### Server functions versus an Effect API

Start server functions give typed client/server calls and framework serialization, but retain Start's server-function manifest/handler runtime; the bundler replaces browser calls with RPC. A separate Effect API gives one schema/service boundary usable by either hosting mode and keeps statistics logic out of Start. Neither is intrinsically faster on a cache miss. The spike tested an Effect `/api/snapshot` and a `createServerFn({ method: "GET" })` on the same listener. Start's server-function endpoint rejected a request without origin metadata (403); adding matching Origin and `x-tsr-serverFn: true` produced 200. Keep Start's default CSRF protection intact. [start-fn-handler], [start-csrf]

During SSR, direct server-function invocation can run locally; for the proposed Effect API architecture, the initial loader should instead read the shared Effect service directly. Browser observers fetch the Effect API. That avoids a double network bootstrap and keeps the server functions optional.

### Query and Router cache policy

`ensureQueryData(options)` in Query 5.104.0 returns `Promise.resolve(cachedData)` on a hit, even when invalidated/stale. On an absent entry it fetches and waits. `revalidateIfStale: true` schedules a background prefetch while returning the hit. **A resolved promise is not a network wait, but neither is it a frame-timing guarantee.** The method still works but is marked deprecated in this exact release, which proposes `query({ ...options, staleTime: "static" })` as its replacement. Do not blindly set observer `staleTime: "static"`: unlike `Infinity`, static observers are skipped by `refetchQueries`, which is wrong for live revision updates. Keep the ticket's `ensureQueryData` pattern or explicitly design/test the replacement's refresh behavior. [query-client]

Use `staleTime: Infinity` for event-driven freshness; choose `gcTime` separately to retain the bounded working set (`Infinity` is viable only with an explicit memory ceiling). Default stale time is not a cache-fill strategy. Disable unwanted focus/mount refetches if they undermine the intended push policy, but perform explicit revision reconciliation on reconnect/focus.

Router can call the external cache's loader on every preload by setting `defaultPreloadStaleTime: 0`. Intent preloading uses hover/touch, viewport preloading observes visible links, render preloading starts when links mount. Intent has a default delay and cannot cover a keyboard/filter interaction with no hover. Render/viewport preloads are still speculative asynchronous work; finish them before making the next-frame claim. Warm route chunks as well as data: Start's automatic code splitting left the fixture's index route in a separate client JS asset. [router-preload]

Components must subscribe through Solid `useQuery(() => options)`, not just display a loader's old return value or call non-reactive `getQueryData`. Loader data can populate SSR HTML, but a later Query cache patch does not automatically replace the router's stored loader result. If a component really displays loader results instead of Query, it needs Router invalidation too. [router-data], [solid-query-source], [query-client]

### Initial HTML

The tested manual integration was:

```ts
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
});
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  dehydrate: () => ({ queryClientState: dehydrate(queryClient) }),
  hydrate: (state) => hydrate(queryClient, state.queryClientState),
});
```

This belongs inside `getRouter()` so SSR does not share a QueryClient between requests. The root supplies QueryClientProvider. The critical route loader awaits `ensureQueryData`; Start renders the result and serializes both loader data and the custom Query state into its document. Do not defer/stream data required for the first dashboard view behind Suspense if a content-bearing first paint is required. Start's serializer handles its injected payload; a custom SPA JSON injection needs its own safe escaping (at least `<`/script termination), CSP handling and schema validation. The fixture used a literal synthetic object, **not** a production-safe arbitrary-data serializer. [router-data], [start-entry], [query-hydration]

The SPA fixture inserted `window.__SNAPSHOT__={total:42,...}` in `<head>` and seeded `queryClient.setQueryData(["snapshot"], window.__SNAPSHOT__)` before `createRouter`. Its HTTP document contained the seed but no rendered `Total:` element. That proves document data availability, not browser first-paint timing or JS hydration correctness; no desktop browser was connected for a browser test.

Build-time prerendering did produce both visible `Total: 42` markup and a Query hydration payload. Those are synthetic/build-time values: use runtime SSR for current personal figures, or an Effect-produced per-user runtime artifact outside the npm package with a specified refresh lifecycle. The latter is a custom runtime snapshot scheme, not what Start's release build prerendering alone supplies. [spa], [prerender]

## Persistence and live updates

Solid Query's QueryClient extends Query core's client, so the framework-independent `@tanstack/query-persist-client-core` can save/restore it. Use the core utilities, **not React's `PersistQueryClientProvider`**. The [core persister source][persist-core] restores asynchronously, validates `maxAge` (24 hours by default) and `buster`, calls hydrate, then subscribes to cache changes. Solid's provider mounts Query observers; restoration must complete before those observers/routing start to avoid duplicate fetch/race behavior. Attach/unsubscribe persistence with dashboard lifecycle. [solid-query-client], [solid-provider]

- **localStorage:** `createSyncStoragePersister` accepts the standard synchronous storage interface and serializes JSON. It works with Solid's client, but is deprecated in 5.104.0 in favor of `createAsyncStoragePersister`. The async persister also accepts localStorage's synchronous methods; it does not make localStorage I/O nonblocking. Keep snapshots small and avoid large writes on interactive frames. [sync-persister], [async-persister]
- **IndexedDB:** implement the same three-method `Persister` contract (`persistClient`, `restoreClient`, `removeClient`) using IndexedDB, or adapt it to the async-storage interface. TanStack's official persistence guide includes a custom IndexedDB example. Its React import lines are not the Solid API: import the types/utilities from persistence **core**. IndexedDB restoration is async and cannot guarantee instant cold reload. An actual browser IndexedDB/localStorage/quota test was **not** run. [persist-guide], [persist-core]
- **Lifetime:** set Query `gcTime >= maxAge` for persisted entries, or a bounded working-set policy with no GC. Key/buster by dashboard data schema/build compatibility and source identity; include local timezone in aggregate/query identity. A changed stats-store revision should refresh data, not clear the whole browser cache on every write. Don't expose a sensitive filesystem path as the source identity. [persist-guide]
- **Hydration order:** restore any compatible persisted snapshot, then hydrate the fresh SSR/bootstrap snapshot before starting observers; Query hydration only overwrites an existing entry when the supplied data is newer. Revision/identity checks are still needed across server rebuilds/clock differences. Browser persistence is optional, untrusted, discardable derived data; never read it as an authority over the stats store. [query-hydration]

**SSE is sufficient for one-way stats-store revision notifications**; WebSocket is also viable but adds an upgrade/connection protocol with no necessary benefit here. Effect 4 has an SSE encoder and streamed HTTP responses; both adapters expose WebSocket upgrade capabilities. TanStack Query does not subscribe to either transport for you. An EventSource/WebSocket handler must call the Query update/invalidation methods. [effect-sse], [effect-response], [effect-bun], [effect-request]

Keep the old snapshot on invalidation. `invalidateQueries` marks entries stale and refetches active matches by default; inactive routes are not guaranteed updated. Use `refetchType: "all"` for a small warmed key set, or fetch/patch the shared basis and derive all views locally. `ensureQueryData` without revalidation will keep returning an invalidated hit, so marking it stale alone is insufficient. Register query functions/defaults or mount observers before refetching hydrated keys: serialized cache state does not include executable query functions. The cache spike verified these semantics. [query-client], [query-hydration]

Include a revision in bootstrap and push. On stream reconnect, validate/refetch current revision; if using SSE replay, define event IDs/replay behavior. If updates race, do not let an older response overwrite a newer revision. SSE/WS integration and the 2-second visibility target were **not** benchmarked here.

## Shipping the artifact

The no-Nitro Vite build emitted:

```text
dist/client/assets/<hashed route and entry>.js
dist/server/server.js                 # default export: { fetch }
dist/server/assets/<hashed chunks>.js # manifest/router/server functions
dist/client/_shell.html              # SPA build only
dist/client/index.html               # tested prerender of /
```

Keep **all** referenced chunks/assets, not just `server.js`. Nitro builds use a different `.output` layout; don't mix their entrypoints with this output. The ordinary Vite SSR bundle retained bare runtime imports (including Router core, Solid, h3 and serialization dependencies). Either declare all external runtime dependencies or bundle them. Do not rely on whatever versions OpenCode happens to embed. [hosting], [start-entry]

Resolve files relative to the **external npm package artifact's** `import.meta.url`, never the launcher's CWD or compiled binary's virtual filesystem. Build/publish once, install and serve the result; no consumer Vite process or install-time dashboard build. The spike's `bun pm pack` files allowlist included the entire client/server trees and its host entry. Unpacked SSR worked on ordinary Bun/Node; the dependency-bundled variant also worked when imported from compiled Bun.

For production, expose a library entry that starts/stops the server instead of the fixture's top-level listener. Keep plugin setup thin and runtime-adapter selection lazy so Node never executes Bun-only initialization. Bound loopback, validate Host/Origin, keep API/HTML responses private, and keep client assets/SSR imports aligned under npm packaging tests.

**Repository constraint:** this repo's internal packages are Just-in-Time and may not gain `build` scripts or `dist/` exports. The dashboard's publish artifact is a distribution concern requiring an explicit package/layout decision in the downstream spec; the spike does not authorize converting internal packages to compiled packages. Keep all eight gates on dashboard `.tsx` source. This branch changes only this research Markdown file.

## Throwaway spike: evidence and reproduction essentials

Scratch location: `$TMPDIR/opencode/scratch-tanstack-start-on-effect/` (outside repository packages/worktree). No fixture sources, dependency trees, lockfiles or generated output were committed. The essential server seam/config/cache policy appears above.

Vite configuration:

```ts
export default defineConfig({
  plugins: [
    tanstackStart(
      process.env.SPA === "1"
        ? { spa: { enabled: true } }
        : process.env.PRERENDER === "1"
          ? { prerender: { enabled: true }, pages: [{ path: "/" }] }
          : {},
    ),
    solid({ ssr: true }),
  ],
});
```

The fixture's root renders `<html><head><HeadContent /></head><body>` with a captured QueryClientProvider, Outlet and Scripts. Its index has an awaited Query loader for synthetic `{ total: 42, revision: "synthetic-1" }`, then renders `<p id="data">Total: 42</p>`. SSR uses a GET server function; the browser query function reads the separate Effect API. Capture the provider client before rendering JSX instead of calling a router hook lazily from a cleanup-time prop getter.

For each output, a Node assertion script launched the Effect host on loopback using `bun host.ts` and `node host.ts`, checked page status/body, queried `/api/snapshot`, fetched a referenced JS asset, and terminated the exact child server. SSR additionally checked the server-function endpoint with same-origin headers; SPA checked a deep-link HTML fallback.

| Test                                    | Bun 1.4.2 | Node 24.15.0 | What it established                                                                                                                                                                      |
| --------------------------------------- | --------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default SSR, no Nitro                   | Pass      | Pass         | HTML had rendered 42, loader data and Query payload; API, assets and server function worked.                                                                                             |
| SPA files                               | Pass      | Pass         | `_shell.html` had no rendered route data; API/assets and `/deep-link` fallback worked. The custom Query callback emitted an empty payload, not a populated snapshot.                     |
| Static prerender `/`                    | Pass      | Pass         | `index.html` had rendered 42 and populated Query payload from build-time loading.                                                                                                        |
| SPA with runtime seed injection         | Pass      | Pass         | Document had bootstrap seed before module execution, but no rendered route data. Browser rendering was not tested.                                                                       |
| Packed/unpacked ordinary SSR            | Pass      | Pass         | Client/server artifact layout remained usable after relocation.                                                                                                                          |
| Dependency-bundled SSR artifact         | Pass      | Pass         | A 1.33 MB unminified host/server bundle ran on either runtime and served adjacent assets.                                                                                                |
| Solid client + core persister semantics | —         | Pass         | Save/restore, zero-fetch `ensureQueryData` hit, retained invalidated hit, explicit refetch, and buster rejection. Storage was an in-memory implementation of the localStorage interface. |

The compiled Bun fixture used:

```ts
// launcher.ts, compiled with bun build --compile
import { pathToFileURL } from "node:url";
await import(pathToFileURL(process.argv[2]).href);
```

Importing the dependency-bundled package artifact passed SSR HTML and referenced asset checks. Importing its non-bundled source entry failed dependency resolution. The bundling experiment used `bun build host.ts --target bun --outfile <unpacked-package>/bundled-host.js`; it is a **packaging proof**, not a proposed repository build script or a full cross-runtime production bundler configuration.

Observed synthetic end-to-end assertion batches took roughly 4–29 ms, depending on mode/runtime; these include multiple requests and are **not** p95 latency, cold-start, render-frame, memory, or real-database benchmarks. First paint containing data is proven at the HTTP markup level for SSR/prerender, not timed in a browser. Actual OpenCode compiled-binary loading, Desktop plugin loading, browser hydration/persistence, chart rendering and guaranteed next-frame behavior remain acceptance tests for implementation.

## Primary sources

TanStack Router/Start source is pinned to commit `57e126e99dbd86f735ead2ba98ba5e98ef0cc668`, the commit behind tag `@tanstack/solid-start@1.168.57`. Query source is pinned to `d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca`, tag `@tanstack/solid-query@5.104.0`. npm metadata/package contents were checked where independent package release versions differ. Effect source is the requested read-only mirror at `67ba4e46a11ccda0b6761578bfd22c04ae00167d`; OpenCode is the requested read-only `v2` checkout at `8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43`. The Solid [hosting] and [spa] documents are reference/replace wrappers: their owning text is [shared hosting][hosting-shared] and [shared SPA][spa-shared], with the Solid wrapper's package/plugin substitutions applied. Router's data/preloading guides are framework-shared; their React snippets are not Solid primitives.

OpenCode's own dashboard-hosting precedent is **not Start**: [app package][opencode-app-package] uses Vite/Solid and `@solidjs/router`, [app entry][opencode-app-entry] calls Solid `render`, and [Vite config][opencode-app-vite] emits `dist` with `_assets`. The [CLI asset loader][opencode-assets] supports embedded compressed assets or local build files; its [Effect web handler][opencode-web] serves assets and `index.html` fallback separately from API paths. Desktop [renderer protocol][opencode-desktop-protocol] serves prebuilt files over its custom Electron protocol. Reuse the static-asset/API separation, not undocumented Start integration or the checkout's older Effect-beta import paths.

[hosting]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/start/framework/solid/guide/hosting.md
[hosting-shared]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/start/framework/react/guide/hosting.md
[spa]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/start/framework/solid/guide/spa-mode.md
[spa-shared]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/start/framework/react/guide/spa-mode.md
[prerender]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/start/framework/solid/guide/static-prerendering.md
[router-data]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/router/guide/external-data-loading.md
[router-preload]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/docs/router/guide/preloading.md
[start-entry]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/packages/solid-start/src/default-entry/server.ts#L1-L21
[start-request-handler]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/packages/start-server-core/src/request-handler.ts
[start-fn-handler]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/packages/start-server-core/src/server-functions-handler.ts
[start-csrf]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/packages/start-client-core/src/createCsrfMiddleware.ts
[solid-ssr-adapter]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/packages/solid-router-ssr-query/src/index.tsx
[solid-query-example]: https://github.com/TanStack/router/blob/57e126e99dbd86f735ead2ba98ba5e98ef0cc668/examples/solid/start-basic-solid-query/src/router.tsx
[query-client]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/query-core/src/queryClient.ts#L195-L224
[query-hydration]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/query-core/src/hydration.ts
[solid-query-source]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/solid-query/src/useQuery.ts
[solid-query-client]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/solid-query/src/QueryClient.ts
[solid-provider]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/solid-query/src/QueryClientProvider.tsx
[persist-core]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/query-persist-client-core/src/persist.ts
[sync-persister]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/query-sync-storage-persister/src/index.ts
[async-persister]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/packages/query-async-storage-persister/src/index.ts
[persist-guide]: https://github.com/TanStack/query/blob/d4033eb1e5bdef3c8aa72a6cc614bcdd98b1ddca/docs/framework/react/plugins/persistQueryClient.md
[npm-start]: https://registry.npmjs.org/@tanstack/solid-start/1.168.57
[npm-router]: https://registry.npmjs.org/@tanstack/solid-router/1.170.38
[npm-router-old]: https://registry.npmjs.org/@tanstack/solid-router/1.168.26
[npm-query]: https://registry.npmjs.org/@tanstack/solid-query/5.104.0
[npm-ssr-adapter]: https://registry.npmjs.org/@tanstack/solid-router-ssr-query/1.167.3
[npm-effect]: https://registry.npmjs.org/effect/4.0.0
[npm-node]: https://registry.npmjs.org/@effect/platform-node/4.0.0
[npm-undici]: https://registry.npmjs.org/undici/8.11.2
[migration]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/MIGRATION.md#L14-L48
[effect-example]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/ai-docs/src/51_http-server/10_basics.ts#L45-L64
[effect-web]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpEffect.ts#L462-L495
[effect-response]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpServerResponse.ts#L1470-L1506
[effect-request]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpServerRequest.ts
[effect-static]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/http/HttpStaticServer.ts#L71-L205
[effect-bun]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/bun/src/BunHttpServer.ts
[effect-node]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/platform/node/src/NodeHttpServer.ts#L425-L469
[effect-sse]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/encoding/Sse.ts
[opencode-plugins]: https://opencode.ai/v2/docs/build/plugins
[opencode-module]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/module.ts#L80-L132
[opencode-host]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/host.ts#L17-L48
[opencode-bun-import]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/runtime/import.bun.ts
[opencode-node-import]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/runtime/import.node.ts
[opencode-desktop-service]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/background-service.ts#L30-L74
[opencode-app-package]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/package.json
[opencode-app-entry]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/entry.tsx#L71-L100
[opencode-app-vite]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/vite.config.ts#L25-L53
[opencode-assets]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/app-assets.ts#L10-L35
[opencode-web]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/services/web-ui.ts#L7-L54
[opencode-desktop-protocol]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/windows/protocol.ts#L46-L99
