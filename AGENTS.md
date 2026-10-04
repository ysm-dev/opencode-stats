## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Quality gates

`bun run ci` runs every gate below, with gate verification last. CI blocks on all of them; mutation has its own full-run job on every PR.

| Gate                 | Threshold / enforcement                                                                                                              | `bun run`      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Formatting           | Clean                                                                                                                                | `format:check` |
| Lint                 | Both complexity measures < 22 via `oxlint-plugin-complexity`; < 500 lines; no `any`; `unknown` only at trust boundaries; no warnings | `lint`         |
| Types                | Clean                                                                                                                                | `typecheck`    |
| Coverage             | 100% in all four measures, per file                                                                                                  | `test`         |
| Mutation             | No surviving or uncovered mutants                                                                                                    | `mutate`       |
| Dead code            | Normal and `--production --strict`                                                                                                   | `knip`         |
| Duplication          | Zero                                                                                                                                 | `dup`          |
| Exceptions           | Reasoned single-line suppressions and human-owned whole-file waivers                                                                 | `exceptions`   |
| Package shape        | `exports`, `bin`, `types` point into each package's own `src/`                                                                       | `shape`        |
| Runtime contracts    | Every Bun adapter has nonempty, passing tests on real Bun                                                                            | `contracts`    |
| Dependency freshness | New unheld releases fail after 7 days                                                                                                | `outdated`     |
| Gate verification    | Planted violations rejected in `.ts` and `.tsx`                                                                                      | `verify-gates` |

Every gate reads `.ts` and `.tsx`; `dist/`, `.release/` and `.dev/` are artifacts, excluded everywhere. Tests, `testing/` code and contract tests are excluded from coverage and mutation by rule, not by waiver. Testing code stays under the other gates and is importable only from tests or testing code.

### Rules that are easy to get wrong

- **`any` is banned outright.** No exceptions.
- **`unknown` is allowed only at a trust boundary** — a function taking untrusted input (CLI arguments, parsed JSON, environment variables) and narrowing it before anything downstream sees it. It is banned in every other declared parameter, return, or field type. See `packages/dashboard-server/src/arguments.ts` for the intended shape.
- **Coverage is per file, not global.** A global average is trivially gamed by one large well-covered file.
- **Untestable code goes in a thin edge file**, not behind a coverage ignore comment. `packages/dashboard-server/src/process.ts` is the worked example: argument parsing and serving live in tested modules; the edge only reads `process.argv` and selects Bun adapters.

### When a gate blocks you

Do **not** delete the test, weaken the type, or inline a duplicate to get green. Those are worse than the violation.

Exceptions live in `quality-exceptions.json`, which is owned by a human via CODEOWNERS. You may propose an entry; you cannot land one. Every entry needs a `reason`. Inline suppressions must carry `-- <reason>` and are reported by `bun run exceptions`.

Each manifest entry names one file and its gates. Coverage requires mutation too. Those edge files are limited to 30 lines, no branches and no nested functions, and need an exact CODEOWNERS line. Use only reasoned line suppressions or described `@ts-expect-error`; block/blanket disables, `@ts-ignore`, `@ts-nocheck`, coverage ignores and duplication ignores are rejected. The `any` and `no-unsafe-*` rules admit no suppressions.

Dependency updates are manual. `dependency-holds.json` records allowed versions, a reason and the condition for lifting each hold. Install releases at least 3 days old; keep oxfmt updates and their reformatting in a separate change. Add ownership and planted verification whenever a ticket adds a gate file.

A sudden burst of `no-unsafe-*` errors means the TypeScript program is misconfigured, **not** that you should add a disable comment.

### Package shape

Packages are Just-in-Time: exports point at source, and relative imports use explicit `.ts` (or `.tsx`) extensions. No package exports compiled output; only a release bundles into `.release/` (ADR 0012). Package-level build scripts or `dist/` exports make source gates silently enforce nothing.
