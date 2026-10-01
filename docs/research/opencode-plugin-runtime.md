# OpenCode v2 plugin runtime

## Direct answer

**A long-lived localhost HTTP server is allowed, but a global server plugin is not a machine-wide or process-wide singleton. It is loaded once per active location graph, can be torn down and set up again, and shares the service's runtime and event loop. Desktop normally starts the compiled Bun CLI, not an Electron-hosted plugin or the separate Node executable. Use a Promise-API boundary to run opencode-stats' own Effect 4.0.0 runtime.** [Lifecycle], [Desktop], [Builds], [Promise bridge]

### Per-host fact sheet

| Fact                       | Installed compiled Bun CLI                                                                                                                                                              | OpenCode Desktop                                                                                                                                                                                                                          | Separate Node CLI build                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-plugin execution    | Inside the background `serve --service` process; not the TUI process. Explicit `serve` and the TUI's private-server option are additional hosts.                                        | Inside the adopted/started CLI background service, **not Electron main or renderer**. The packaged executable comes from the Bun CLI artifacts. An already-running compatible service can be adopted, so its actual runtime wins.         | Inside the Node service process, using the same Core plugin lifecycle. It is a distinct build, not the normal Desktop payload.                                  |
| Runtime version            | Observed OpenCode **2.0.18**, **Bun 1.4.2**. Its reported `process.versions.node = 26.3.0` is Bun's compatibility version, not evidence of V8/Node execution.                           | Source pins Electron 44.4.5, but that does not determine server-plugin APIs. Bundled CLI build uses Bun 1.4.2 in this snapshot; Desktop can reuse another compatible service. Installed Desktop runtime was not experimentally inspected. | Build script pins **Node 26.4.0**, with `--experimental-ffi`, `--use-system-ca`, and warning suppression. Source-verified; no Node SEA artifact was run.        |
| HTTP                       | `Bun.serve` and `node:http` both passed an actual request in the isolated plugin.                                                                                                       | Same as the selected service runtime, normally Bun. No Electron API is injected.                                                                                                                                                          | `node:http` available; `Bun.serve` unavailable.                                                                                                                 |
| SQLite                     | Both `bun:sqlite` and `node:sqlite` opened an in-memory database and executed a query.                                                                                                  | Same as the service.                                                                                                                                                                                                                      | `node:sqlite` available; `bun:sqlite` unavailable.                                                                                                              |
| N-API / workers / children | N-API `.node` loading supported by Bun, with module-specific compatibility caveats. `node:worker_threads` and ordinary spawning passed the probe; detached children survived host exit. | These run in/on behalf of the service, not Electron. No Electron ABI rebuild should be assumed for server plugins.                                                                                                                        | N-API, workers and child processes are Node APIs. SEA/runtime-specific compatibility still needs testing for the chosen dependency.                             |
| Installation / imports     | OpenCode's npm Arborist installer; ordinary runtime imports in-process, not a sandbox. TS and JS local sources work.                                                                    | Same server-plugin installer and loader. Desktop has no separate `desktop` plugin entrypoint in the inspected loader.                                                                                                                     | Same installer; ordinary Node imports. Local erasable TS works, but published TS under `node_modules` is rejected by Node's default loader; publish runtime JS. |
| Cleanup                    | Returned Promise/void cleanup awaited on orderly unload, replacement, location disposal or shutdown. Not guaranteed on crash/SIGKILL.                                                   | Closing a window/app is **not** service shutdown; the detached shared service can remain alive.                                                                                                                                           | Same lifecycle contract; abrupt termination likewise cannot guarantee finalizers.                                                                               |
| Dashboard affordance       | Server command via `ctx.command.transform`; optional separate `./tui` entrypoint adds palette/slash/keybind actions, toasts, dialogs and slots.                                         | Server commands appear in the common composer. No server-plugin API for Desktop toast, tab, notification or `shell.openExternal`. A server command can spawn the OS browser opener.                                                       | Server commands work. Node TUI plugins need precompiled code/JSX rather than Bun's runtime JSX transform.                                                       |

Sources: [Lifecycle], [Desktop], [Builds], [Import], [Capabilities], [Commands], [TUI], [Experiment]. The Node column is source/documentation verification, not a second runtime experiment.

### Constraints for a server-starting plugin

1. **Share ownership explicitly.** A global configuration entry is applied to every location, including multiple directories of one project. Do not bind one fixed port or start a sync loop independently on each `setup()`. Account for repeated setup within one service and for several service/private/standalone processes. OpenCode supplies no dashboard singleton/election primitive. [Lifecycle], [Service]
2. **Keep setup short and cleanup bounded.** Finish setup after acquiring the listener and scheduling owned background work; never await the server's entire lifetime. Setup is sequential and readiness-sensitive. Close listeners, workers, timers, subscriptions and the private Effect runtime in the returned cleanup. Handle partial setup failure yourself when no cleanup has yet been returned. [Lifecycle], [Promise bridge]
3. **Do not tie the dashboard to a window/TUI lifetime.** Server plugins belong to the shared background service. If a detached child is chosen, its ownership, reuse and eventual termination are opencode-stats' responsibility; OpenCode does not reap arbitrary plugin children. [Service], [Experiment]
4. **Use the Promise API as the Effect-version firewall.** Exchange Promises/plain data/callbacks with OpenCode, not Effects, Layers, Context tags or Scope objects from Effect 4.0.0. Own and dispose the private runtime. The Effect plugin API is executed by the host's rc.112 runtime and has no documented cross-version ABI guarantee. [Effect boundary], [Experiment]
5. **Support the service's runtime, not the UI's branding.** Keep Bun-only imports behind runtime selection, or use tested common Node APIs. A compiled OpenCode executable is not a general `bun`/`node` launcher: do not assume `fork()` or `process.execPath script.ts` executes an arbitrary child script. [Builds], [Import], [Capabilities]
6. **Ship native binaries without install-time compilation/downloads.** Lifecycle scripts are disabled. Matching optional platform packages are installed by default, but optional dependencies can be omitted or fail; validate the binary at runtime and give a clear error. A Node native addon also must be Bun-compatible if used in the Bun host. [Installation], [Experiment], [Capabilities]
7. **Keep the OpenCode database strictly read-only.** Do not use `ctx.storage.set/remove`: server-plugin storage is OpenCode's own SQL KV table. Put the stats store, ownership records, preferences and diagnostic files in opencode-stats' own directories. Do not use `session.prompt`, synthetic messages or other mutating APIs just to announce the dashboard URL. [Storage]
8. **Treat events as hints, not the source of truth.** They are live, non-replaying, server-wide in this plugin context, and only cover this host's publications. A dashboard over the one OpenCode database must reconcile from that database regardless of events, including activity from another process. Avoid capturing/logging message or tool-content payloads. [Events], [Experiment]
9. **Provide deliberate URL discovery.** A server plugin has no toast/browser API and its `console.log` is not a visible TUI/Desktop notification. Use an explicit user action (server command and/or TUI action), a stable documented localhost URL or opencode-stats' own diagnostics. Do not auto-open a browser from every setup. Binding localhost and avoiding shell-interpolated URLs are application constraints, not protections provided by the plugin loader. [Commands], [Logging], [Capabilities]
10. **Resolve data paths from the actual host.** `ctx.app` provides version/channel/name, not the OpenCode database path. Mirror the channel-aware CLI rule and `OPENCODE_DB`; expose an explicit override. Never infer a database filename solely from “v2” or from the TUI/Desktop executable name. [Host information]

These are implementation constraints, not an ADR selecting in-process ownership versus a managed child. Plugin mode and standalone mode need a deliberate coexistence/ownership decision before implementation.

## Scope and confidence

Investigated for ticket [#5](https://github.com/ysm-dev/opencode-stats/issues/5), under the binding constraints of map [#1](https://github.com/ysm-dev/opencode-stats/issues/1), on 2026-10-01.

- Installed executable: `opencode v2.0.18`; runtime experiments used only an isolated copy of its environment and scratch data.
- Read-only source checkout: OpenCode `v2` at [`8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43`](https://github.com/anomalyco/opencode/tree/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43), whose packages report 2.0.21. Checked the relevant diff against local tag `v2.0.18` ([`cd9a14a6b688d4021bee381dfd39d2cef9c0f862`](https://github.com/anomalyco/opencode/tree/cd9a14a6b688d4021bee381dfd39d2cef9c0f862)); the registry lifecycle, installer, source loaders, build scripts and key location behavior discussed here are unchanged. The Desktop development-only isolated-server fixed-port change is newer; do not attribute that fix to installed 2.0.18.
- Official docs were read, but their local-file configuration examples contradict both inspected source and installed behavior; the observed restriction is recorded below.
- No maintainer configuration, running service or live OpenCode database was touched. No private project/session/message/spend data was examined or published.
- Node SEA, installed Desktop, Linux, Windows, individual native addons and cross-version Effect-API interoperability remain **experimentally unverified**. Documented/source-supported API availability is distinguished from actual probe results.

## Lifecycle in detail

### What “once” means

The plugin registry and supervisor are **location-scoped** nodes. `Instance.layer(ref)` builds a fresh location graph; its cache key is directory plus optional workspace placement, not plugin package or canonical project. Healthy graphs are retained with infinite idle TTL. Therefore the global entry becomes one instance per booted location **per host**, not one per session, TUI, project, machine or package-import cache. Merely adding the global entry does not eagerly create a host-global plugin instance independent of location activation. [Lifecycle]

Within a registry activation, the unchanged ordered `(id, revision)` prefix stays alive. At the first changed/inserted/removed/reordered definition, the **entire old suffix** is closed in reverse order and the new suffix is set up in order. Thus changing an earlier plugin can restart opencode-stats even when opencode-stats' own package/options did not change. Repeated reads and unchanged reload notifications do not normally rerun setup. [Lifecycle]

Local-source revisions include fingerprints of tracked source files. Options and configuration operations participate in a generation's revision. Watched config/source changes are debounced for 100 ms; there is also daily reactivation/update checking. A domain call such as `ctx.command.reload()` replays that domain's transforms; it is **not** “reload this plugin.” [Reload]

### Teardown and failure

The Promise adapter acquires `setup(context)` and registers its returned cleanup as an Effect scope release. Scope shutdown also disposes host registrations and Promise event iterators. Replacement unloads the previous generation **before** starting the next one. Removing/disabling the entry unloads it. Host shutdown closes the registry; explicit location reload invalidates/rebuilds every currently cached location. Final disposal can depend on borrowed location scopes becoming releasable. [Promise bridge], [Lifecycle], [Reload]

A module-load failure retains the last running generation. A new setup failure may restore the old definition by **running its setup again**, after its earlier cleanup. A transform failure disables that activation and schedules cleanup. None of this is an exactly-once guarantee. Also, OpenCode cannot call a cleanup that a rejected setup never returned: acquire resources with a local failure-cleanup path. [Lifecycle], [Reload]

Normal SIGTERM completed all six probe cleanups. The service client can escalate an unresponsive process to SIGKILL; no finalizer can be promised then. Long cleanup can block reload, and long setup can delay plugin activation/session readiness. [Service], [Experiment]

### How many processes?

Normal operation is **one shared compatible background service plus any number of UI clients**, not one plugin-host service per TUI. The TUI discovers/starts `serve --service`; Desktop does the same using its bundled command. Service startup contenders are detached and unrefed, and stdout is discarded. Managed startup uses a channel-specific fixed port, incumbent recognition and a registration file; a duplicate contender backs off/exits rather than becoming another normal service. The Promise client's ensure loop can have up to two startup contenders while recovering a missing/stalled service. [Service]

`opencode service start/status/stop/restart` manage that shared service. Version mismatch can replace it, causing plugin cleanup/reload. UI exit alone does not stop it. Explicit `serve`, a TUI using `--standalone` (OpenCode's private-server option, **not** opencode-stats' standalone mode), other channels/profiles, remote services and embedded SDK hosts can coexist. The private TUI server uses a child process with stdin-EOF ownership and forced termination after three seconds. There is no meaningful universal “typical process count,” and no machine-wide singleton guarantee for the dashboard. [Service]

## Runtime and package installation

### Desktop is a client, not the plugin VM

`desktop-cli.ts` resolves `opencode-cli` from packaged resources, stages it under Electron's `userData`, and supplies its command/version. `background-service.ts` calls `Service.ensure` with `serve --service`, or adopts a healthy compatible service. Desktop packaging copies the platform **`@opencode/cli-*`** executable, built with `Bun.build({ compile: ... })`. The release workflow downloads `opencode-preview-cli` for Electron packaging. [Desktop], [Builds]

`build-node.ts` instead creates **`@opencode/cli-node-*`**, with executable `opencode2-node`, using Node's SEA builder and Node 26.4.0. That is a parallel artifact family; existence of this script does not make the packaged Desktop service Node. Development Desktop explicitly supports `bun run ... src/index.ts`. A Desktop connected to an already-running Node service could still have Node-hosted server plugins because service adoption is based on compatibility/version, not JS runtime. [Desktop], [Builds], [Service]

### No permission sandbox

The loader dynamically imports the plugin and calls its default definition. It is not a worker, VM sandbox or model-tool permission gate. Imported code has the service user's normal filesystem, network, process and environment access. OpenCode permissions on model tools do **not** make plugin startup code read-only. [Import]

`node:http` is the common HTTP option. Both SQLite interfaces actually worked under the installed Bun runtime; nevertheless Bun's SQLite implementation differs from Node in some details, including macOS system SQLite and synchronous backup. Keep a runtime-specific adapter if the chosen database layer needs different functionality. N-API supports `.node` modules in both runtimes, not all V8-specific addons; shipping compatible platform binaries and testing them is still required. Bun's worker/child-process compatibility also has documented omissions. [Capabilities], [Experiment]

Detached children can outlive OpenCode with ignored stdio and `unref()`; the probe confirmed this on macOS and then stopped them. A child launched with a real OS executable works. For a JS server child, supply an actual compatible executable/artifact rather than treating the compiled host's `process.execPath` as a general-purpose interpreter. Browser opening is likewise possible through an ordinary subprocess/library such as `open`; no plugin-specific browser helper is supplied by the server context. [Capabilities], [Builds], [Experiment]

### Installation mechanics

- Packages live under **`$XDG_CACHE_HOME/opencode/npm/<target-key>/<numeric-generation>/node_modules/<package-name>`**, or `~/.cache/opencode/...` by default. Registry keys are the package name plus requested spec, e.g. an exact version; Git keys include a slug and hash. Dependencies are installed into that generation's dependency tree. This is not an npm-global install and does not add dependencies to the project checkout. [Installation], [Host information]
- OpenCode uses **`@npmcli/arborist`** in-process, not `bun install` or an external system npm command. It loads npm config/registry/credentials from the inherited environment and npm configuration, sets `audit: false`, `binLinks: true` and **`ignoreScripts: true`**, reifies a staging directory, then atomically publishes a new generation. It uses an installation lock and preserves old generations. [Installation]
- Dependencies, transitive dependencies and matching optional platform packages are supported. npm `os`/`cpu` metadata is respected; mismatched optional packages are skipped. User npm `omit`/platform settings can alter this. Preinstall/install/postinstall/prepare scripts must not be relied upon to compile/download native assets. Exact versions/full Git commits stay pinned; unpinned packages are checked for updates, not silently upgraded by that check. [Installation], [Plugin docs], [Experiment]
- `opencode plugin add <package-spec>` installs a registry/Git target, resolves its entrypoint, then edits the global server config when a server entrypoint exists; TUI-only packages go in CLI configuration. Server startup can activate cached packages immediately and install missing ones asynchronously. Local directory loading uses existing files and native import resolution; the inspected path has **no implicit local dependency-install step**. Install those dependencies yourself when developing a local plugin. [Installation], [Reload], [Import]
- The module must export **default `{ id, setup }`** (Promise API) or **default `{ id, effect }`** (Effect API). A package's `./server` subpath is tried before its root entrypoint; optional `./tui` and `./rpc` are separate entries. Relative configured paths resolve from their containing config document. [Import], [Plugin docs]
- **Docs mismatch:** the official configure page shows explicitly configured `../shared/plugin.ts` and absolute file paths. Source deliberately warns “configured plugin path must be a directory” and drops configured existing files. Installed 2.0.18 did exactly that. Use a directory with `index.ts`/`index.js` or proper package exports. Auto-discovery still admits direct `.ts`/`.js` files under global/project `plugin/` or `plugins/` directories. [Local sources], [Experiment]
- Bun can run TS package exports directly. Node's loader strips erasable TS outside dependencies but rejects TS under `node_modules`; it also does not transform TSX. Neither the server loader nor the Node build installs a general TS transpiler for plugin dependencies. Consequently the published opencode-stats artifact needs runtime **JavaScript** for Node, even if repository packages retain the mandated Just-in-Time TS source shape. This is a packaging constraint for a future spec/ADR, not a request to add repository builds here. OpenCode's own plugin publishing script rewrites TS source exports to compiled JS for its tarball. [Import], [Builds], [Publish], [Node TypeScript]

## Host information and events

### Available without discovery

Server `ctx.app` has **`name`, `version`, `channel`**. These describe the **service**, not the connected Desktop/TUI client. In the probe they were `cli`, `2.0.18`, `latest`. `ctx.location` has **directory, optional workspaceID, project id/directory/canonical**; `ctx.options` supplies object-entry options. Ordinary `process.versions`, `process.platform`, `process.arch`, `process.pid` and environment APIs are also available. [Host information], [Experiment]

There is **no** server-context `dataDirectory`, database handle/path, listening URL, `ctx.client`, `ctx.server.info`, `ctx.log`, `ctx.ui`, `ctx.tui` or browser API. Calling it “essentially a server client” in the docs does not mean the context exposes every generated client method. [Host information]

### Resolving the OpenCode database

The CLI's data root is `(XDG_DATA_HOME || ~/.local/share)/opencode`. Its database rule is:

1. Use `OPENCODE_DB` when present; absolute paths stay absolute and relative paths resolve under the data root. Preserve the special `:memory:` value; it is not a file.
2. Otherwise use `opencode.db` for `latest`, `dev`, `beta`, `next`, `prod`, or when `OPENCODE_DISABLE_CHANNEL_DB` equals `1`/`true`.
3. Otherwise use `opencode-<sanitized-channel>.db`, where disallowed channel characters become `_`.

`OPENCODE_CONFIG_DIR` changes the config root, **not** the data root. The module-level default root uses `os.homedir()` and XDG variables, so `OPENCODE_TEST_HOME` alone does not isolate data/config/cache/state. Embedded SDK hosts can supply different paths outside this CLI rule; those need explicit overrides. [Host information]

For an existing managed service, a separate client can **read-only discover** its registration and URL. The CLI chooses `service.json` for `latest/dev/beta/next` and sanitized `service-<channel>.json` otherwise, under the state root. Pass the correct file: the Promise service client's generic fallback is just `service.json`. Never call `Service.ensure/start/restart` just to learn host information: ensure can replace a mismatched/unresponsive service. Explicit/private/embedded hosts may have no discoverable registration. `/api/info` returns version, pid, URLs and only a temporary-directory path, **not a database/data-directory path**. Plugin mode does not require this server URL to serve its own dashboard. [Service], [Host information]

### Public events

`ctx.event.subscribe({ signal })` returns an async iterable; Effect plugins receive a Stream. The host allows events in `EventManifest.ServerDefinitions` plus custom `rpc.*` events. This includes session lifecycle/execution/inbox/message/usage events, location/config/plugin updates, models/providers/agents/integrations, projects/worktrees, permissions/forms, filesystem/reference/skills, shell/PTYS, websearch, VCS, TUI and selected MCP events. The linked manifest is the authoritative inventory; not every internal event is public. [Events]

Stats-relevant examples include `session.created`, `session.renamed`, `session.deleted`, `session.model.selected`, `session.execution.started/succeeded/failed/interrupted`, `session.usage.recorded` and `session.usage.updated`. Other events may carry prompts, responses or tool content: subscribe only to what is needed and discard those payloads without recording them. [Events]

The underlying bus can location-filter subscribers when an ambient Location service is present, but external plugin execution deliberately receives only its Scope/logging context. Thus the plugin's public stream is **not limited to `ctx.location`**. The probe observed cross-location `plugin.updated` events. Events are volatile “from now on”; the plugin context does not expose the bus's durable-log replay method. They are not a machine-wide stream or an exhaustive change-data-capture protocol for the OpenCode database. [Events], [Lifecycle], [Experiment]

## Surfacing the dashboard

### A command in both clients

The server API can register a command whose executor opens the dashboard and returns without prompting a model:

```ts
await ctx.command.transform((editor) => {
  editor.add({
    name: "stats",
    description: "Open the local dashboard",
    execute: async () => {
      await openDashboardBrowser(); // Application-owned OS opener.
    },
  });
});
```

The executor receives a sessionID, prompt/attachments and delivery mode, but need not use them. Core command execution itself simply invokes the executor; it need not insert a message or invoke the LLM. Both TUI and Desktop consume the server command catalog; Desktop's composer recognizes catalog commands and sends them to the server. **Caveat:** invoking a server command from Desktop's new-session composer can create a session before execution, so do not claim this is a universal “no OpenCode write whatsoever” UI path. [Commands]

### A TUI action is a separate plugin

Export `./tui` alongside the server entrypoint to let the TUI discover it from an active server plugin. It has its own `setup` and cleanup **in each TUI**, not in the background service. It can register a keymap command with palette/slash/bind metadata; show a URL in a toast/dialog/footer; request terminal attention/system notifications; or open a browser with a normal library. A local `/stats` action can avoid the session-command pathway. It must discover/contact the already-owned dashboard rather than start another dashboard server. CLI-only entries live under `cli.json.plugins` and can remain active against a remote server. [TUI]

OpenCode's loader recognizes server/TUI/RPC entrypoints, **not Desktop UI extensions for a server plugin**. The server context cannot request a Desktop toast, notification, native external-open action, or custom dashboard tab. Electron's internal `shell.openExternal` and GUI extension code are not server-plugin capabilities. A server-side OS opener operates on the server machine; that is acceptable for this map's localhost-only scope but must not be described as a general remote-client opener. [Desktop], [Import], [Host information], [Capabilities]

### Logs are not notifications

The docs show `console.log`, but the managed service contender is launched with stdout ignored and stderr captured/drained for startup diagnostics. A log line is not automatically rendered in the TUI/Desktop. Core's Effect logger records plugin lifecycle warnings/errors and role-tagged server diagnostics, but the Promise context has no public log-line notification method. Prefer explicit URL affordances and opencode-stats-owned diagnostics; do not write synthetic session messages for discoverability. [Logging], [TUI], [Host information]

## Effect-version boundary

OpenCode's catalog pins Effect **4.0.0-rc.112**. `@opencode/plugin/effect` returns Effects that the **host interpreter** runs directly; its domain operations return host Effects and its scope ownership is a host Scope. No plugin-loader version assertion enforces an exact version, and the package declares Effect as a dependency rather than a peer constraint. That does **not** constitute a stable cross-version runtime ABI: rc.112 and 4.0.0 may differ in interpreter opcodes, services, scopes or schemas. Conservatively target the host's exact Effect line for any Effect-API integration, or prove compatibility for every supported version; it is not required for a Promise-only integration. [Effect boundary]

Promise plugins are converted by the host's adapter. It interprets host Effects itself, exposes Promise methods, and acquires/releases `setup` and cleanup using `Promise.resolve`. A plugin can independently create a **4.0.0 ManagedRuntime**, run its own HTTP/sync services there, call ctx's Promise operations, and return a Promise cleanup that disposes that runtime. No Effect value needs to cross the boundary. The installed rc.112 host successfully ran an independently installed **effect@4.0.0** runtime and a Promise command transform/read in the same setup; teardown disposed both on all six activations. This proves the architectural seam, not every future Effect HTTP/SQL module under both runtimes. [Promise bridge], [Experiment], [Effect source]

For the thinnest adapter, a default `{ id, setup }` object works without importing OpenCode at runtime; use type-only imports for its public contract if desired. Importing the full `@opencode/plugin` root also pulls its schema exports/Effect dependency, so do not assume that root is dependency-free. Keep foreign Effect services/scopes/schemas out of hook/tool/RPC return values as well. [Import], [Effect boundary]

## Isolated experimental evidence

### Isolation before launching

The probe ran under the requested scratch directory, never in the real project/config/home. It used a **sanitized environment** rather than merging arbitrary existing `OPENCODE_*` settings:

```text
HOME=<scratch>/home
OPENCODE_TEST_HOME=<scratch>/home
XDG_CONFIG_HOME=<scratch>/config
XDG_DATA_HOME=<scratch>/data
XDG_CACHE_HOME=<scratch>/cache
XDG_STATE_HOME=<scratch>/state
TMPDIR=<scratch>/tmp
OPENCODE_CONFIG_DIR=<scratch>/config/opencode
OPENCODE_DB=<scratch>/data/probe.db
OPENCODE_DISABLE_PROJECT_CONFIG=1
OPENCODE_DISABLE_MODELS_FETCH=1
OPENCODE_DISABLE_FFF=1
```

Source review confirmed XDG roots, the distinct test-home getter, config override, disabled project discovery, temporary-root derivation and absolute database override before execution. A scratch-only password authenticated the isolated API. The process ran **`opencode serve --hostname 127.0.0.1 --port 0`**, without `--service`, so it neither discovered nor replaced the maintainer's service and did not contend for its port/registration. All API calls targeted the URL emitted by that new process. [Host information], [Service]

### Probe sequence and results

The local TS plugin exported a plain Promise definition. Setup created a `node:http` listener, issued actual localhost requests to it and a temporary `Bun.serve`, queried both SQLite modules **only in memory**, received `42` from a worker, ran an ordinary OS child, subscribed to `plugin.updated`, and started a bounded detached sleep child. A later probe revision independently installed Effect 4.0.0 and used `ManagedRuntime.make(Layer.empty)` plus the host's Promise command registration/list methods. Cleanup stopped the listener/subscription/private runtime. [Experiment]

| Operation                                      | Cumulative setups | Cumulative cleanups |
| ---------------------------------------------- | ----------------: | ------------------: |
| Access location A twice, then location B       |                 2 |                   0 |
| Change the tracked local plugin source         |                 4 |                   2 |
| Remove the global config entry                 |                 4 |                   4 |
| Restore the global config entry                |                 6 |                   4 |
| Terminate only this isolated host with SIGTERM |                 6 |                   6 |

Assertions/observations: both listeners returned expected bodies; both SQLite queries returned 1; worker returned 42; ordinary child exited 0; own Effect returned 42; the registered command was visible through the host's Promise API; cross-location plugin-update events were received. Six detached children remained alive after host exit, and the harness stopped all six. PIDs, absolute locations and passwords are deliberately omitted. [Experiment]

The first attempt used an explicitly configured TS **file**; it produced zero setups and the warning “configured plugin path must be a directory.” Switching to a directory containing `index.ts` succeeded. This is a verified documentation contradiction, not an import/transpilation failure. [Local sources], [Experiment]

A separate synthetic loopback npm registry served one test plugin with a transitive dependency, a matching optional `os/cpu` dependency, a mismatched optional dependency and lifecycle scripts that would create a marker. `opencode plugin add <synthetic-package>@1.0.0` ran under another fully isolated profile. The root package, transitive package and matching optional package were present in the numeric cache generation; the mismatched package and lifecycle marker were absent. This exercised OpenCode's actual installer, not an approximation using `bun install`. Its temporary registry was stopped. [Installation], [Experiment]

Essential probe shape, excluding diagnostics and auxiliary capability checks:

```ts
import { createServer } from "node:http";
import { Effect, Layer, ManagedRuntime } from "effect"; // Independently installed 4.0.0.

export default {
  id: "runtime-probe",
  async setup(ctx) {
    const runtime = ManagedRuntime.make(Layer.empty);
    await runtime.runPromise(Effect.succeed(42));
    await ctx.command.transform((editor) => {
      editor.add({ name: "probe", execute: async () => {} });
    });
    const server = createServer((_request, response) => response.end("probe"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return async () => {
      await new Promise((resolve) => server.close(resolve));
      await runtime.dispose();
    };
  },
};
```

This is throwaway research code, not the proposed production implementation (which needs typed boundaries and partial-acquisition cleanup). No spike dependencies, lockfiles, databases or raw logs are committed.

## Primary sources

All OpenCode source links below are pinned to the inspected checkout commit; paths and line ranges identify the owner of each claim. Official docs can change independently of the installed executable.

[Plugin docs]: https://opencode.ai/v2/docs/plugins
[Lifecycle]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin.ts#L17-L258
[Desktop]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/background-service.ts#L30-L75
[Builds]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/script/build-node.ts#L17-L153
[Promise bridge]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/adapter.ts#L216-L294
[Import]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/module.ts#L80-L133
[Capabilities]: https://bun.com/docs/runtime/nodejs-compat
[Commands]: https://opencode.ai/v2/docs/build/plugins#commands
[TUI]: https://opencode.ai/v2/docs/build/plugins/cli
[Service]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/client/src/promise/service.ts#L23-L129
[Reload]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/supervisor.ts#L58-L237
[Installation]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/npm.ts#L134-L398
[Storage]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/kv.ts#L36-L59
[Host information]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/plugin.ts#L26-L60
[Events]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/schema/src/event-manifest.ts#L41-L84
[Logging]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/client/src/service-contender.ts#L13-L51
[Local sources]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/config/plugin/source.ts#L127-L188
[Publish]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/script/publish.ts#L13-L43
[Node TypeScript]: https://nodejs.org/download/release/v26.4.0/docs/api/typescript.html#type-stripping-in-dependencies
[Effect boundary]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/effect/plugin.ts#L26-L63
[Effect source]: https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/ManagedRuntime.ts#L185-L227
[Experiment]: #isolated-experimental-evidence

Additional owner citations for claims whose implementation spans files:

- **Location ownership/retention:** [`core/src/instance.ts:59–159`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/instance.ts#L59-L159), [`location-services.ts:20–72`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/location-services.ts#L20-L72), [`location-service-map.ts:20–43`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/location-service-map.ts#L20-L43), [`plugin/service.ts:29–34`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/service.ts#L29-L34).
- **Promise cleanup and event iterators:** [`plugin/src/promise/adapter.ts:45–74,604–607`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/adapter.ts#L604-L607); [official lifecycle/context guide](https://opencode.ai/v2/docs/build/plugins#lifecycle).
- **Desktop artifact identity:** [`desktop-cli.ts:48–78,142–160`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/desktop-cli.ts#L48-L78), [`desktop/scripts/utils.ts:17–53,73–101`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/scripts/utils.ts#L73-L101), [`cli/script/build.ts:124–155`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/script/build.ts#L124-L155), [`publish.yml:350–395`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/.github/workflows/publish.yml#L350-L395), [`publish.yml:98–120 (Bun 1.4.2 compile release)`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/.github/workflows/publish.yml#L98-L120), [`desktop/package.json:53`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/package.json#L53), [`cli/src/node/target.ts:39`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/node/target.ts#L39).
- **Managed/private service behavior:** [`cli/src/server-process.ts:54–67,143–178`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/server-process.ts#L54-L67), [`service-config.ts:30–43,94–124`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/services/service-config.ts#L30-L43), [`service-registration.ts:38–70`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/services/service-registration.ts#L38-L70), [`client/promise/service.ts:249–261`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/client/src/promise/service.ts#L249-L261), [`standalone.ts:18–49`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/services/standalone.ts#L18-L49), [`default.ts:35–38`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/commands/handlers/default.ts#L35-L38); [official service guide](https://opencode.ai/v2/docs/troubleshooting#check-the-background-service).
- **Native import/entry resolution:** [`plugin/src/host.ts:17–48`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/host.ts#L17-L48), [`util/src/runtime/import.node.ts:7–47`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/runtime/import.node.ts#L7-L47), [`runtime/import.bun.ts:3–9`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/runtime/import.bun.ts#L3-L9), [`plugin/source-directory.ts:7–32`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/source-directory.ts#L7-L32), [`plugin/src/source.bun.ts:23–25`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/source.bun.ts#L23-L25), [`tui/runtime-plugin-support.node.ts:1`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/tui/src/plugin/runtime-plugin-support.node.ts#L1).
- **Installer configuration / CLI add:** [`util/src/npm-config.ts:6–33`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/npm-config.ts#L6-L33), [`cli/plugin/add.ts:16–43`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/commands/handlers/plugin/add.ts#L16-L43).
- **Root/database/metadata rules:** [`util/src/global-roots.ts:4–18`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/global-roots.ts#L4-L18), [`global.ts:15–26,77–80`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/global.ts#L15-L26), [`cli/src/database-path.ts:4–12`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/database-path.ts#L4-L12), [`server-process.ts:88–115`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/server-process.ts#L88-L115), [`plugin/src/app.ts:1–5`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/app.ts#L1-L5), [`server-info.ts:5–16`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/server/src/server-info.ts#L5-L16), [`server handler:16–25`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/server/src/handlers/server.ts#L16-L25).
- **Event semantics/storage:** [`core/src/plugin/host.ts:255–264,602–618`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/host.ts#L255-L264), [`core/src/bus.ts:121–129,726–762`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/bus.ts#L726-L762), [`schema/session-event.ts:51–178,242–263`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/schema/src/session-event.ts#L158-L178).
- **Commands and TUI ownership:** [`core/src/session/command.ts:20–34`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/session/command.ts#L20-L34), [`app/composer/model.ts:196–229`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/composer/model.ts#L196-L229), [`app/composer/submit.ts:104–112,157–161`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/composer/submit.ts#L104-L112), [`tui/plugin/context.tsx:95–103,150–218,569–592`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/tui/src/plugin/context.tsx#L95-L103).
- **Browser/native API docs:** [Bun N-API](https://bun.com/docs/runtime/node-api), [Node 26.4 N-API](https://nodejs.org/download/release/v26.4.0/docs/api/n-api.html), [Node 26.4 child processes/detachment](https://nodejs.org/download/release/v26.4.0/docs/api/child_process.html#optionsdetached), [Node 26.4 workers](https://nodejs.org/download/release/v26.4.0/docs/api/worker_threads.html), [Node 26.4 HTTP](https://nodejs.org/download/release/v26.4.0/docs/api/http.html), [Node 26.4 SQLite](https://nodejs.org/download/release/v26.4.0/docs/api/sqlite.html), [`util/src/open.ts:3–7`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/open.ts#L3-L7).
- **Effect versions:** [`OpenCode/package.json:8,45–48,82`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/package.json#L82), [`plugin/package.json:29–44`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/package.json#L29-L44), [`plugin/src/promise/index.ts:1–20`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/index.ts#L1-L20), [Effect 4.0.0 first-party registry manifest](https://registry.npmjs.org/effect/4.0.0), [`Effect/package.json:1–4`](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/package.json#L1-L4).
