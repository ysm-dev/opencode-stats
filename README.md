# opencode-stats

A TypeScript monorepo initialized from [ysm-dev/ts-template](https://github.com/ysm-dev/ts-template), using the `@opencode-stats` package scope: Bun, Turborepo, TypeScript 7, and mandatory quality gates.

The premise is that when agents write most of the code, review does not scale but gates do.

## Quick start

```sh
bun install
bun run dev
bun run ci
```

## Layout

```
packages/dashboard-server/  Effect 4 HTTP program; Bun adapter and Node test twin.
packages/stats-store/        Private SQLite step facts; readonly source and sync worker.
packages/dashboard/         Solid dashboard; typed TanStack routes on Vite.
packages/opencode-stats/    Private workspace bin; release generates its public manifest.
packages/launcher/          Node-built-in-only child start command.
packages/e2e/               Private installed-tarball and Chromium checks.
scripts/               Repo tooling: exceptions report, gate verification.
quality-exceptions.json  The only place file-level gate exceptions may live.
dependency-holds.json     Reasoned version holds; updates are manual.
```

## The gates

| Gate                  | Threshold                   | Command                          |
| --------------------- | --------------------------- | -------------------------------- |
| Formatting            | clean                       | `bun run format:check`           |
| Time budgets          | five minutes, hard limit    | `bun run budgets`                |
| Cyclomatic complexity | < 22                        | `bun run lint`                   |
| Cognitive complexity  | < 22                        | `bun run lint`                   |
| Lines per file        | < 500                       | `bun run lint`                   |
| `any` types           | 0                           | `bun run lint`                   |
| Types                 | clean                       | `bun run typecheck`              |
| Coverage              | 100%, per file              | `bun run test`                   |
| Dead code             | 0                           | `bun run knip`                   |
| Duplicated code       | 0                           | `bun run dup`                    |
| Exceptions            | reasoned, owned             | `bun run exceptions`             |
| Package shape         | source entries only         | `bun run shape`                  |
| Runtime contracts     | real, nonempty Bun tests    | `bun run contracts`              |
| Packed tarball        | installed bin and Chromium  | `bun run release && bun run e2e` |
| Dependency freshness  | 7-day grace, reasoned holds | `bun run outdated`               |
| Gate verification     | every planted rule rejected | `bun run verify-gates`           |

Both complexity measures come from `oxlint-plugin-complexity`, including short functions. Lint denies warnings, bans `any`, and allows `unknown` only at a reasoned trust boundary. Dead-code analysis includes `--production --strict`.

`bun run ci` runs all gates, with `verify-gates` last. Verification plants deliberate violations in `.ts` and `.tsx`, runs the public commands, and demands the expected named failure. It proves coverage waivers against an identical unlisted neighbour. Configs and planted files are restored in `finally` blocks. Run verification sequentially within a checkout, never beside source tests. Mutation testing is retired by maintainer policy; ordinary behavioral, unit and property tests remain.

Coverage includes unimported source and excludes tests, `testing/` code and `*.contract.test.{ts,tsx}` by rule. Testing code remains under other gates. All gates ignore `dist/`, `.release/` and `.dev/`. `contracts` inventories every `*.bun.{ts,tsx}` adapter and executes each contract separately on real Bun, rejecting missing, empty, skipped-only or failing contracts. The private e2e package runs separately from source coverage.

Whole-file coverage waivers live in the human-owned manifest. Edge files need exact CODEOWNERS entries, are at most 30 lines, and have no branches or nested functions. Single-line suppressions need reasons; only described `@ts-expect-error` directives are allowed. Blanket/block disables, coverage/duplication ignores, and suppressions of `any` or `no-unsafe-*` are rejected. `bun run exceptions` audits both packages and scripts and lists dependency holds.

The bin argument reader, `packages/opencode-stats/src/bin.ts`, passes arguments to its Node-tested program and sets its exit code. Its maintainer-approved coverage waiver is limited to this runtime edge. `packages/opencode-stats/src/options.ts` demonstrates narrowing untrusted plugin options to a valid TCP port and database path.

## Source development

`bun run dev` opens Vite at `http://127.0.0.1:5173`, forwarding `/api` to the source dashboard server on **22440** with Host rewritten. Its synthetic SQLite file, state and cache stay under gitignored `.dev/`; it does not use an installed OpenCode database. Stop both processes with Ctrl+C.

Overview shows all-history Tokens (input, cache read, cache write, output and reasoning), computed by the engine worker from the server's browser copy. The shell appears only after its complete state, fonts and styles are ready. A missing `--db` prints the selected path and the fix without opening a browser.

`bun run dev:plugin` loads the workspace plugin in a private `opencode serve` using the installed OpenCode executable. `--opencode <version>` installs an exact per-platform release; `--packed` loads `.release/package/` after `bun run release`. Its HOME/config/data stay under `.dev/opencode/`, its dashboard port is **22440**, and state/cache and the synthetic database are shared with `bun run dev`. Vite serves the source dashboard at `http://127.0.0.1:5173`. No shared OpenCode service or real database is used.

The workspace's conventional `server.ts` forwards to the tested source entry without bundling. See [V2 activation evidence](docs/research/issue-40-plugin-activation.md) for the host APIs and eligible runtime pins.

## Plugin mode

Add `"opencode-stats"` to `plugins` in OpenCode's global `opencode.json(c)`. The standard Bun build starts or joins one detached dashboard server without opening a browser. All plugin activations in one OpenCode process share a hold; the dashboard server stops about ten seconds after the last process releases it. Invalid options, a Node OpenCode build or a missing database fail plugin setup.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "opencode-stats", "options": { "port": 22439 } }],
}
```

The optional `db` is a nonempty file path and overrides automatic selection. The launcher and bin share OpenCode's `databasePath` rule: `OPENCODE_DB` is absolute or relative to `$XDG_DATA_HOME/opencode` (default `~/.local/share/opencode`); otherwise official channels use `opencode.db`, and custom channels use `opencode-<sanitized-channel>.db`. The `OPENCODE_DISABLE_CHANNEL_DB` values `1` and `true` select the official filename. The current environment is overlaid with `env` read from `service.json` in `$OPENCODE_CONFIG_DIR`, or `${XDG_CONFIG_HOME:-~/.config}/opencode`; nothing writes that config. Standalone assumes an official channel, so custom OpenCode builds need `--db`. Missing-file messages include the selected path's source.

Only `bun run release` bundles: Bun emits unminified bin/server ES modules with linked maps, and Vite emits one minified dashboard bundle and its engine worker into `.release/package/`. It generates the dependency-free manifest and packs one `.release/opencode-stats-<version>.tgz`. Paths are swapped at bundle time, never redirected by runtime environment variables. Source server static-file tests use that release-owned layout; development continues to use Vite.

For standalone mode, run `bunx opencode-stats --no-open --db <path>` (Bun ≥ 1.4.2), or pass `--port <n>`. `--db` wins over the automatic selection above. The file must exist. Its step facts are built once, with five independently nullable token kinds, into a private XDG cache; no source connection can write. macOS uses the controlled upstream SQLite library included in this same package, for arm64 and x64, with no compiler, extra installation, native-library setting or runtime download. See [stats-store](packages/stats-store/README.md) for provenance and source safety. The bin opens a browser by default and keeps the server as its foreground child until Ctrl+C. Update standalone mode with `bunx opencode-stats@latest`. Following writes and diagnostics arrive in later spec tickets.

`bun run e2e` provisions the pinned Playwright Chromium headless shell **and WebKit**, then installs the existing tarball through npm with lifecycle scripts off into an otherwise empty temp folder. On Linux it also runs Playwright's `--with-deps` installation for the required OS libraries/fonts; use a supported distro with root or passwordless sudo available. Browser downloads, OS preparation, pinned OpenCode preparation and tests all share e2e's external 300-second deadline (and the aggregate/job/attempt deadline when called from CI). No prior browser cache or separate unbounded install is required. It activates the tarball in isolated, password-protected `opencode serve` processes, never `--service`. CI bundles and tests on Bun 1.4.2: Linux and macOS block, Windows reports. `bun run bundle:check` checks Bun metafiles, rejecting non-built-in external imports and any Effect/SQLite/drizzle input in the bin and launcher.

Hooks run lint/format before commits, types/coverage before pushes, and reject non-Conventional Commit messages. CI runs gate verification last; the required **Quality gates** check succeeds only when every required job succeeds.

### Time budgets

Five minutes (300,000 ms) is a **failure threshold**, not a timing target. Every CI job has `timeout-minutes: 5`. The required **Quality gates** job also checks the current workflow attempt's start time and fails if the end-to-end run exceeds five minutes, including setup, waiting between jobs, and advisory jobs. Initial scheduling before the attempt starts is outside that clock; missing or invalid timing metadata fails closed.

Every public CI stage has an external five-minute watchdog that terminates the command and its workers, including detached descendants, and fails on expiry. Preparation and tests share that deadline, including cold e2e runtime installation. Gate verification shares one five-minute deadline across its canaries. Hosted verification runs in sixteen isolated checkouts after the other gates. Local verification runs the same sixteen partitions in temporary snapshots with two workers, including frozen installs inside the deadline; workspace links and planted fixtures belong to each snapshot. A failure cancels active siblings and stops launching work. The caller's source stays untouched even on a hard timeout. Static canaries are ordered by command family and gate name to balance the exhaustive, disjoint partition; each checkout retains the freshness controls. `scripts/testing/shards.ts` checks command-family balance, the actual canary partitions and the workflow matrix and selector.

Every Vitest configuration also installs a whole-run deadline for direct invocations, terminating blocked workers and their detached descendants before the coordinator. Unit tests and Bun contract tests retain five-second individual limits, e2e tests have 30 seconds, and Vitest hooks/teardown have ten seconds. `bun run budgets` rejects missing/raised configuration limits, including those tighter individual caps; planted verification checks exercise watchdog expiry, process cleanup and configuration regressions with short fixtures.

`bun run ci` has **one external 300-second deadline for the entire aggregate**, including native preparation, all source gates, contracts, release, e2e and final exhaustive verification. Stages receive only the remaining aggregate budget, not a fresh five minutes. Local verification clears inherited shard selectors and runs every canary. Hosted CI's parallel graph has the additional end-to-end limit above. When a budget fails, optimize or isolate parallel work while preserving every remaining gate.

## Design decisions worth knowing

### Browser preferences

Settings keeps exactly three choices at the dashboard's browser origin: the OpenCode theme,
System/Light/Dark colour scheme, and single-key shortcuts (On by default). Another browser,
a private window, a port change or cleared site data starts shortcuts On again. Nothing is
written to an opencode-stats preference file or cookie. If storage is refused, the page uses
memory and Settings says so; that memory does not survive a reload.

Implementation and automated verification are recorded in `docs/preferences.md`.

### Accessibility

The dashboard targets WCAG 2.2 AA in every offered theme. Its own colour uses take the
nearest passing theme-ramp colours rather than inheriting inaccessible faint text or edges.
All 72 palettes are checked with unrounded contrast calculations; axe rejects violations
and incomplete results. Keyboard/focus tests and packed Chromium/WebKit checks cover Settings,
light/dark and the harder Matrix/Everforest light palettes, including narrow and short windows.
Native browser zoom and VoiceOver with Safari/Chrome remain human release checks, not claimed
automated screen-reader verification. Report accessibility problems as ordinary GitHub bugs.

- **bun installs and runs scripts; Node runs tests.** Vitest treats bun as a package manager only, and the v8 coverage provider does not work on the bun runtime.
- **No package exports compiled output; only a release bundles.** Workspace entries remain in each package's own `src/`; ADR 0012 permits one root release bundle into `.release/`. Nothing imports a release bundle from source.
- **Exact version pins, no ranges.** oxfmt is pre-1.0 with no semver protection on formatting output, and `oxlint-tsgolint` is hard-pinned to a TypeScript patch release.
- **Manual dependency updates.** Bun's minimum release age is 3 days. Tooling pins use the newest eligible releases (Turbo 2.11.6, lefthook 2.1.15 and Node types 26.6.3 on this prefactor's date). Keep oxfmt upgrades and reformatting separate. `outdated` checks every manifest, dev dependencies, Bun's `devEngines` pin, and workflow Actions against live release dates; a newer unheld release older than 7 days fails. Holds name allowed versions and when to lift them. Registry/network/invalid-metadata failures fail closed. `npm_config_registry`, `GITHUB_API_URL`, and optional `GITHUB_TOKEN` select the metadata services; verification uses a synthetic loopback registry.
- **bun's default isolated linker is kept.** It turns an undeclared dependency into an immediate failure instead of a latent bug.
- **`globalStore = true` in `bunfig.toml`.** Packages are symlinked from one machine-wide store, keeping each clone's `node_modules` small.
