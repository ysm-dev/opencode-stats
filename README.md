# opencode-stats

A TypeScript monorepo initialized from [ysm-dev/ts-template](https://github.com/ysm-dev/ts-template), using the `@opencode-stats` package scope: Bun, Turborepo, TypeScript 7, and mandatory quality gates.

The premise is that when agents write most of the code, review does not scale but gates do.

## Quick start

```sh
bun install
bun run ci
```

## Layout

```
packages/cli/          Example application. Zero dependencies, no build step.
packages/duration/     Example library. Demonstrates narrowing `unknown` at a trust boundary.
scripts/               Repo tooling: exceptions report, gate verification.
quality-exceptions.json  The only place file-level gate exceptions may live.
dependency-holds.json     Reasoned version holds; updates are manual.
```

## The gates

| Gate                  | Threshold                   | Command                |
| --------------------- | --------------------------- | ---------------------- |
| Formatting            | clean                       | `bun run format:check` |
| Cyclomatic complexity | < 22                        | `bun run lint`         |
| Cognitive complexity  | < 22                        | `bun run lint`         |
| Lines per file        | < 500                       | `bun run lint`         |
| `any` types           | 0                           | `bun run lint`         |
| Types                 | clean                       | `bun run typecheck`    |
| Coverage              | 100%, per file              | `bun run test`         |
| Dead code             | 0                           | `bun run knip`         |
| Duplicated code       | 0                           | `bun run dup`          |
| Surviving mutants     | 0                           | `bun run mutate`       |
| Exceptions            | reasoned, owned             | `bun run exceptions`   |
| Package shape         | source entries only         | `bun run shape`        |
| Dependency freshness  | 7-day grace, reasoned holds | `bun run outdated`     |
| Gate verification     | every planted rule rejected | `bun run verify-gates` |

Both complexity measures come from `oxlint-plugin-complexity`, including short functions. Lint denies warnings, bans `any`, and allows `unknown` only at a reasoned trust boundary. Dead-code analysis includes `--production --strict`.

`bun run ci` runs all gates, with `verify-gates` last. Verification plants deliberate violations in `.ts` and `.tsx`, runs the public commands, and demands the expected named failure. It proves coverage/mutation waivers against an identical unlisted neighbour and runs describe-nested mutation canaries: useless assertions must leave survivors; useful assertions must kill them. Configs and planted files are restored in `finally` blocks. Run verification sequentially, never beside tests or mutation.

Coverage and mutation include unimported source and exclude tests, `testing/` code and `*.contract.test.{ts,tsx}` by rule. Testing code remains under other gates. All gates ignore `dist/`, `.release/` and `.dev/`. Runtime contracts and packed-tarball gates will arrive with the packages they test, not empty prefactor commands.

Whole-file waivers name their gates in the human-owned manifest; coverage requires mutation too. Edge files need exact CODEOWNERS entries, are at most 30 lines, and have no branches or nested functions. Single-line suppressions need reasons; only described `@ts-expect-error` directives are allowed. Blanket/block disables, coverage/duplication ignores, and suppressions of `any` or `no-unsafe-*` are rejected. `bun run exceptions` audits both packages and scripts and lists dependency holds.

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
