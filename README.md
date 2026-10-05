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
| Cyclomatic complexity | < 22                        | `bun run lint`                   |
| Cognitive complexity  | < 22                        | `bun run lint`                   |
| Lines per file        | < 500                       | `bun run lint`                   |
| `any` types           | 0                           | `bun run lint`                   |
| Types                 | clean                       | `bun run typecheck`              |
| Coverage              | 100%, per file              | `bun run test`                   |
| Dead code             | 0                           | `bun run knip`                   |
| Duplicated code       | 0                           | `bun run dup`                    |
| Surviving mutants     | 0                           | `bun run mutate`                 |
| Exceptions            | reasoned, owned             | `bun run exceptions`             |
| Package shape         | source entries only         | `bun run shape`                  |
| Runtime contracts     | real, nonempty Bun tests    | `bun run contracts`              |
| Packed tarball        | installed bin and Chromium  | `bun run release && bun run e2e` |
| Dependency freshness  | 7-day grace, reasoned holds | `bun run outdated`               |
| Gate verification     | every planted rule rejected | `bun run verify-gates`           |

Both complexity measures come from `oxlint-plugin-complexity`, including short functions. Lint denies warnings, bans `any`, and allows `unknown` only at a reasoned trust boundary. Dead-code analysis includes `--production --strict`.

`bun run ci` runs all gates, with `verify-gates` last. Verification plants deliberate violations in `.ts` and `.tsx`, runs the public commands, and demands the expected named failure. It proves coverage/mutation waivers against an identical unlisted neighbour and runs describe-nested mutation canaries: useless assertions must leave survivors; useful assertions must kill them. Configs and planted files are restored in `finally` blocks. Run verification sequentially, never beside tests or mutation.

Coverage and mutation include unimported source and exclude tests, `testing/` code and `*.contract.test.{ts,tsx}` by rule. Testing code remains under other gates. All gates ignore `dist/`, `.release/` and `.dev/`. `contracts` inventories every `*.bun.{ts,tsx}` adapter and executes each contract separately on real Bun, rejecting missing, empty, skipped-only or failing contracts. The private e2e package runs separately from source coverage.

Whole-file waivers name their gates in the human-owned manifest; coverage requires mutation too. Edge files need exact CODEOWNERS entries, are at most 30 lines, and have no branches or nested functions. Single-line suppressions need reasons; only described `@ts-expect-error` directives are allowed. Blanket/block disables, coverage/duplication ignores, and suppressions of `any` or `no-unsafe-*` are rejected. `bun run exceptions` audits both packages and scripts and lists dependency holds.

The bin argument reader, `packages/opencode-stats/src/bin.ts`, passes arguments to its Node-tested program and sets its exit code. Its maintainer-approved coverage/mutation waiver is limited to this runtime edge. `packages/dashboard-server/src/arguments.ts` demonstrates narrowing untrusted arguments to a valid TCP port.

## Source development

`bun run dev` opens Vite at `http://127.0.0.1:5173`, forwarding `/api` to the source dashboard server on **22440** with Host rewritten. Its synthetic SQLite file, state and cache stay under gitignored `.dev/`; it does not use an installed OpenCode database. Stop both processes with Ctrl+C.

Overview shows all-history Tokens (input, cache read, cache write, output and reasoning), computed by the engine worker from the server's browser copy. The shell appears only after its complete state, fonts and styles are ready. A missing `--db` prints the selected path and the fix without opening a browser.

Only `bun run release` bundles: Bun emits unminified bin/server ES modules with linked maps, and Vite emits one minified dashboard bundle and its engine worker into `.release/package/`. It generates the dependency-free manifest and packs one `.release/opencode-stats-<version>.tgz`. Paths are swapped at bundle time, never redirected by runtime environment variables. Source server static-file tests use that release-owned layout; development continues to use Vite.

For the installed standalone slice, run `bunx opencode-stats --no-open --db <path>` (Bun ≥ 1.4.2), or pass `--port <n>`. `--db` wins over `OPENCODE_DB`, otherwise the source is `$XDG_DATA_HOME/opencode/opencode.db` (default `~/.local/share/opencode/opencode.db`). The file must exist. Its step facts are built once, with five independently nullable token kinds, into a private XDG cache; no source connection can write. macOS uses the controlled upstream SQLite library included in this same package, for arm64 and x64, with no compiler, extra installation, native-library setting or runtime download. See [stats-store](packages/stats-store/README.md) for provenance and source safety. The bin opens a browser by default and keeps the server as its foreground child until Ctrl+C. Update standalone mode with `bunx opencode-stats@latest`. Following writes, diagnostics and plugin activation arrive in later spec tickets.

`bun run e2e` installs the existing tarball through npm with lifecycle scripts off into an otherwise empty temp folder, then checks the installed bin and Chromium. Install its browser once with `bun run --cwd packages/e2e playwright install chromium`. CI bundles and tests on Bun 1.4.2: Linux and macOS block, Windows reports. `bun run bundle:check` checks Bun metafiles, rejecting non-built-in external imports and any Effect/drizzle input in the bin.

Hooks run lint/format before commits, types/coverage before pushes, and reject non-Conventional Commit messages. CI runs full mutation separately, then gate verification; the required **Quality gates** check succeeds only when every job succeeds.

## Design decisions worth knowing

- **bun installs and runs scripts; Node runs tests.** Vitest treats bun as a package manager only, and the v8 coverage provider does not work on the bun runtime.
- **No package exports compiled output; only a release bundles.** Workspace entries remain in each package's own `src/`; ADR 0012 permits one root release bundle into `.release/`. Nothing imports a release bundle from source.
- **Exact version pins, no ranges.** oxfmt is pre-1.0 with no semver protection on formatting output, and `oxlint-tsgolint` is hard-pinned to a TypeScript patch release.
- **Manual dependency updates.** Bun's minimum release age is 3 days. Tooling pins use the newest eligible releases (Turbo 2.11.6, lefthook 2.1.15 and Node types 26.6.3 on this prefactor's date). Keep oxfmt upgrades and reformatting separate. `outdated` checks every manifest, dev dependencies, Bun's `devEngines` pin, and workflow Actions against live release dates; a newer unheld release older than 7 days fails. Holds name allowed versions and when to lift them. Registry/network/invalid-metadata failures fail closed. `npm_config_registry`, `GITHUB_API_URL`, and optional `GITHUB_TOKEN` select the metadata services; verification uses a synthetic loopback registry.
- **bun's default isolated linker is kept.** It turns an undeclared dependency into an immediate failure instead of a latent bug.
- **`globalStore = true` in `bunfig.toml`.** Packages are symlinked from one machine-wide store, so a clone's `node_modules` is ~200KB instead of ~240MB. The cost is that tools resolving plugins by package name from their _own_ location break, since the store is not a parent of the project — `stryker.config.js` references its runner by path for exactly this reason.

## Known patch

`@stryker-mutator/vitest-runner@10.0.0` is patched via `bun patch` (see `patches/`).

Vitest 5 changed `testNamePattern` to match against a `" > "`-joined test name; the Stryker runner still joins with a single space, so every test nested in a `describe` is skipped and every mutant is reported as survived. Upstream: [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210).

The patch is pinned to exactly `10.0.0`. If the runner is updated, `patchedDependencies` stops matching and bun applies nothing — but it **fails closed**: unpatched, the score collapses to 3.33% and `thresholds.break: 100` reds the build. Remove the patch when the fix ships upstream.
