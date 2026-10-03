# Packages follow where their code runs

opencode-stats' code runs in places with different rules: inside OpenCode's processes, as the launcher, which loads no Effect and no SQLite (ADR 0003), and as the `/dashboard` TUI action; in the dashboard server and its sync worker on Bun; and in each tab's worker and page. Workspace packages export their TypeScript source, so a package is type-checked under the settings of every package that imports it, and bun's isolated linker lets a package import only what its own `package.json` lists. So packages are cut where the runtime changes, and their dependency lists enforce each runtime's rules. `opencode-stats`, which holds the launcher, the TUI action and the bin, loads nothing that brings Effect or SQLite, and neither does `@opencode-stats/launcher`, which holds start-or-join and the record and hold protocol the launcher shares with the dashboard server: so even `bunx opencode-stats` starts the dashboard server as a process of its own rather than running it itself. OpenCode's plugin package depends on OpenCode's pre-release Effect, so `opencode-stats` imports it for its types only, and lists nothing else that brings Effect or SQLite. `@opencode-stats/engine` holds the tab's worker and `@opencode-stats/dashboard` its page, and `@opencode-stats/browser-copy`, which both the dashboard server and the tab's worker import, uses no DOM, Bun or Node types.

## Considered Options

- **The bin running the dashboard server in its own process.** One process fewer in standalone mode, but the published package would depend on Effect, and only a lint rule or a bundle check would keep Effect out of the launcher and the TUI action.
- **Start-or-join in the published package.** The dashboard server would depend on the published package for the record and holds, while a release carries the dashboard server's bundle inside it.
- **The engine as folders of the dashboard.** One tsconfig can't type both: TypeScript 7 reports duplicate declarations between the DOM and WebWorker libraries, `skipLibCheck` hides them, and worker code could then use `document` without a type error.
- **The browser copy's format in the dashboard server or the engine.** The browser would depend on Bun code, or the server on browser code.
- **A shared domain package.** The counting rules run only in sync, and metrics and time ranges only in the engine; what they share is the facts, which `@opencode-stats/browser-copy` defines.

## Consequences

- Standalone mode runs two processes: `bunx opencode-stats` waits in the foreground for the dashboard server it started, and Ctrl+C reaches both.
- The bin never opens the stats store itself: whatever it reports from it, such as `--diagnose` (ADR 0011), comes from a process that may, such as the dashboard server.
- The root `package.json` lists only tooling: whatever it lists resolves from every package, past the linker.
- The stats store depends on the browser copy for the facts' definitions, never the reverse: nothing the browser imports may bring in Bun or drizzle.
- A release carries the dashboard server's and the dashboard's bundles inside `opencode-stats` without making them importable from its entries.
- The end-to-end test lives in `@opencode-stats/e2e`, a private package that ships nowhere, so the synthetic OpenCode database it needs from the stats store never enters a shipped package's dependency list.
