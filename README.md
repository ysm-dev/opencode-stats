# opencode-stats

A TypeScript monorepo built for agent-generated code: bun, Turborepo, TypeScript 7, and eight quality gates that block CI. Started from [ysm-dev/ts-template](https://github.com/ysm-dev/ts-template).

The premise is that when agents write most of the code, review does not scale but gates do.

## Quick start

```sh
bun install
bun run ci
```

## Layout

```
apps/                     Applications. Zero dependencies, no build step.
packages/                 Libraries shared between apps.
  opencode-stats/           Published to npm as `opencode-stats`.
scripts/                  Repo tooling: exceptions report, gate verification.
quality-exceptions.json   The only place file-level gate exceptions may live.
```

## The gates

| Gate                  | Threshold      | Command                |
| --------------------- | -------------- | ---------------------- |
| Formatting            | clean          | `bun run format:check` |
| Cyclomatic complexity | < 22           | `bun run lint`         |
| Cognitive complexity  | < 22           | `bun run lint`         |
| Lines per file        | < 500          | `bun run lint`         |
| `any` types           | 0              | `bun run lint`         |
| Types                 | clean          | `bun run typecheck`    |
| Coverage              | 100%, per file | `bun run test`         |
| Dead code             | 0              | `bun run knip`         |
| Duplicated code       | 0              | `bun run dup`          |
| Surviving mutants     | 0              | `bun run mutate`       |

`bun run verify-gates` proves the gates actually reject bad code. It plants a deliberate violation for each gate, runs the real gate, and asserts it is rejected **and named the expected rule** — an exit code alone would pass if the gate had failed for an unrelated reason. It also asserts the Stryker patch is still applied, since that is the mutation gate’s real failure mode. A gate that has silently stopped enforcing anything is the failure mode this repo is designed around.

## Design decisions worth knowing

- **bun installs and runs scripts; Node runs tests.** Vitest treats bun as a package manager only, and the v8 coverage provider does not work on the bun runtime.
- **No build step anywhere.** Packages export TypeScript source directly. A compiled package that has not been built makes type-aware lint and knip exit 0 while enforcing nothing — a silent false pass.
- **Exact version pins, no ranges.** oxfmt is pre-1.0 with no semver protection on formatting output, and `oxlint-tsgolint` is hard-pinned to a TypeScript patch release.
- **bun's default isolated linker is kept.** It turns an undeclared dependency into an immediate failure instead of a latent bug.
- **`globalStore = true` in `bunfig.toml`.** Packages are symlinked from one machine-wide store, so a clone's `node_modules` is ~200KB instead of ~240MB. The cost is that tools resolving plugins by package name from their _own_ location break, since the store is not a parent of the project — `stryker.config.js` references its runner by path for exactly this reason.

## Publishing

`packages/opencode-stats` publishes to npm as [`opencode-stats`](https://www.npmjs.com/package/opencode-stats). Releases are tag-triggered:

```sh
# after bumping packages/opencode-stats/package.json's "version"
git tag v0.1.0
git push --tags
```

`.github/workflows/publish.yml` then runs the full gate suite and publishes via npm's [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/) — no long-lived npm token is stored in CI. The publish step itself must run through `npm`, not `bun`: bun has no OIDC support ([oven-sh/bun#24855](https://github.com/oven-sh/bun/issues/24855)). Since this repo's `devEngines` otherwise requires bun, the workflow packs with `bun pm pack` and publishes the resulting tarball from outside the checkout, where npm's `devEngines` check does not apply.

## Known patch

`@stryker-mutator/vitest-runner@10.0.0` is patched via `bun patch` (see `patches/`).

Vitest 5 changed `testNamePattern` to match against a `" > "`-joined test name; the Stryker runner still joins with a single space, so every test nested in a `describe` is skipped and every mutant is reported as survived. Upstream: [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210).

The patch is pinned to exactly `10.0.0`. If Renovate bumps the runner, `patchedDependencies` stops matching and bun applies nothing — but it **fails closed**: unpatched, the score collapses to 3.33% and `thresholds.break: 100` reds the build. Remove the patch when the fix ships upstream.
