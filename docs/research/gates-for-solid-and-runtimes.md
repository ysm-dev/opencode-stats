# Gates for Solid and runtimes

Research for [#10](https://github.com/ysm-dev/opencode-stats/issues/10), under [map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Investigated 2026-10-01 against repository commit `87bf072`. This is a recommendation, not an implementation or approval of exceptions. No OpenCode database was opened.

## Direct answer

**Keep the eight gates and their thresholds. Use Node-run Vitest 5 + V8 coverage, Solid Testing Library + `vite-plugin-solid({ hot: false })` + jsdom for the dashboard, and the patched Stryker 10 Vitest runner for authored TS/TSX. Put runtime dependencies behind Effect v4 services/layers, but test the actual adapter source too, not just the replacement layer. Add real Bun/Node/native contract tests in CI.** The throwaway spike reached 100% per-file coverage and mutation for a reactive TSX counter and Bun-only adapters, without adding an exception. [R1], [R2], [S1], [S2], [S3]

Required gate changes:

1. Widen coverage, mutation, duplication and inline-exception discovery from `packages/*/src/**/*.ts` to `packages/*/src/**/*.{ts,tsx}`. Widen package test discovery and test exclusions to `**/*.test.{ts,tsx}`. Keep explicit coverage inclusion of **unimported** production files and all four 100% per-file thresholds. Original TS-only coverage and mutation globs produced demonstrated **silent false passes** for untested TSX. [R1], [R2], [R3], [R4]; spike below.
2. Give dashboard packages `jsx: "preserve"`, `jsxImportSource: "solid-js"`, DOM libraries, a `src` include that includes TSX, and their own typecheck script. Keep Just-in-Time package exports pointing at source, not absent compiled output. Oxlint and oxfmt already discover TSX; no JSX extension switch is needed. The spike proved TS7 JSX checking and type-aware TSX lint rejection. [R5], [R6], [S4], [S5], [S6]
3. Make runtime contracts explicit test entries in Knip, while preserving its production pass. Use its Vite/TanStack Router plugins and ensure the generated route tree exists **before** analysis. Do not mark every source file as an entry or exclude the route tree from dependency traversal. [R7], [S7], [S8]
4. Expand `verify-gates` to plant TSX violations in real package tsconfigs, including a type-aware violation, unimported/uncovered TSX, duplicated TSX and a deliberately surviving TSX mutant. Retain the runner-patch assertion and add a real nested-test mutation check. Run this destructive-canary command sequentially, not alongside tests, Knip or Stryker. Its existing checks prove TS only and verify patch text, not TSX mutation. [R8]
5. Wire every approved exception into the actual gate. Currently coverage is wired into Vitest; coverage **and** mutation are wired into Stryker; `lint` and `duplication` entries are only reported, not consumed by those gate configurations. Use one manifest-driven configuration/wrapper per affected tool, with exact paths and tests that prove the exception works and neighboring files remain enforced. [R1], [R2], [R3], [R4], [R6], [R9]

Known blockers / limits:

- **Browser mode cannot be the sole component gate suite:** the Stryker Vitest runner officially does not support it. Chromium browser tests are useful additional checks for actual layout, charts, keyboard behavior and hydration, but retain a Node/jsdom suite for coverage/mutation. Happy-dom is supported by Vitest and documented as faster with fewer browser APIs; it was not spiked here. [S2], [S27]
- **Bun coverage is not equivalent to this coverage gate:** V8 does not run on Bun. Bun's documented coverage covers loaded files, lines and functions; statement thresholds are not enforced, and an LCOV-only run can bypass thresholds. Do not replace or average away Node's per-file, four-metric gate with `bun test --coverage`. [S1], [S9]
- **Generated route trees conflict with the absolute `any` ban:** the normal typed generator emits `as any`, `@ts-nocheck` and an ESLint-disable header. A blanket lint exception would waive the ban, which `AGENTS.md` explicitly forbids. This needs a human decision about generated-artifact policy or an any-free generation approach; neither is authorized by this research. [R9], [S10], [S11]
- **TanStack Start conflicts with a literal “no build step anywhere” reading:** its official setup requires a bundler and client/server output. Keep all workspace analysis source-based, but the maintainer must distinguish dashboard distribution compilation from Just-in-Time package exports in the eventual spec. Do not silently add `build`/`dist` packages. Full Start compilation and delivery were not verified by this component spike. [R5], [R10], [S12]
- Native addon compatibility, OpenCode's compiled Bun host and Desktop's Node host need **real-host** integration evidence; a Node mock or even plain `bun test` does not establish those deployment contracts. [S13], [S14]

## Recommended stack and seams

### Dashboard tests

Use a package-local Vitest configuration separate from the production Start bundler configuration:

```ts
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid({ hot: false })],
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
```

This exact shape was exercised with Vitest/coverage-v8 `5.0.2`, Solid `1.9.15`, plugin `2.11.14`, Solid Testing Library `0.8.10`, jsdom `30.1.1`, Effect `4.0.0`, Bun `1.4.2`, and Node `24.15.0` on macOS. Declare each dependency in the package using it; the repo's isolated linker intentionally exposes undeclared dependencies. [R10]

Render with `render(() => <Component />)`, assert accessible DOM output and interaction results, and clean up after each test. Solid Testing Library documents immediate reactive updates rather than React-like rerenders, and the plugin configures Solid browser resolution in test mode. Do **not** use its `location` helper for TanStack Router: that helper specifically uses `@solidjs/router`. Use a TanStack router wrapper/memory history instead; the exact Start navigation harness remains unverified. [S3], [S15]

The counter spike initially showed 100% lines/statements/functions but **50% branches** with plain `solid()`. Coverage JSON mapped an `if` branch to its return line although authored source had no `if`. Changing only to `solid({ hot: false })` restored 100% branches. The plugin source conditionally injects Solid Refresh when HMR is enabled. This is a transform configuration problem, not justification for a coverage exception. [S15]; spike below.

Keep root coverage configuration authoritative: Vitest projects do not replace the root coverage gate. Its V8 provider transforms/remaps source, includes uncovered files when `coverage.include` is set on a full run, and merges coverage maps. Its source also catches parse errors and excludes that file, so a report/input inventory and transform-error rejection are prudent defenses against silent false passes. Type-only/barrel files can have no executable counters; the spike's text reporter showed 0% for those rows without failing. Distinguish “zero counters” from an omitted executable file. [R1], [S16]

Keep production Start plugin ordering separate: official setup places `tanstackStart()` before `viteSolid({ ssr: true })`. Unit tests need the component transform, not the production bundler/server-function machinery. Keep stats/business logic outside route declarations, then add Start integration tests for the actual transformed boundary. Compatibility of the full Start transform with Stryker is **unverified**, not established by the isolated counter. [S12]

### Runtime and native tests

Recommended arrangement:

| Source                           | Node coverage + mutation                                                                                  | Additional contract                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Shared domain/HTTP/storage logic | Real source with deterministic Effect test layers                                                         | Same observable contract on both runtime implementations       |
| Bun adapter                      | Real adapter source; mock only `bun:sqlite`/the Bun capability, assert options, calls, errors and cleanup | `bun test` with real synthetic SQLite/HTTP fixtures            |
| Node adapter / Node-only API     | Real adapter source in Node; native dependency mocked only where necessary                                | Real Node-native dependency and supported host/runtime version |
| Tiny process/host entry shim     | Exact-path human-approved exception only if genuinely untestable                                          | Launch/host integration test; no business logic in the shim    |

Effect v4 `Context.Service`, `Layer.succeed` and `Effect.provide` let the same computation receive different implementations. Swapping a complete layer is appropriate for **consumers**, but leaves the real adapter unexecuted unless there are adapter tests. A fake adapter's coverage is not the real adapter's coverage. Runtime imports must stay in runtime-specific modules so Node does not eagerly import `bun:sqlite` through a shared barrel. Select the layer at the edge; keep the selection and failure behavior testable. [S17], [S28]; spike below.

Place the runtime seam at the smallest interface the domain module needs, not a replica of the whole SQLite/server driver. Bun and Node adapters are actual variations at that seam. Keep driver options, acquisition and cleanup local to their implementations, and test the observable contract through the same interface consumers use. A runtime adapter is not an untestable process shim merely because it uses a runtime-specific dependency.

The spike mocked `bun:sqlite` with `vi.mock` in a **Node-environment** test and actually imported/executed the Bun layer source. Putting that test in jsdom first failed with `Cannot bundle Node.js built-in "bun:sqlite"`; `// @vitest-environment node` fixed it without an alias. A separate real-Bun test exercised the same layer with the actual built-in SQLite library. Bun `version` was also exercised through a Node global test double and a real Bun contract. [S18]; spike below.

For `Bun.serve`, apply the same split: Node tests execute adapter wiring against a typed capability double, asserting host binding, handler/error configuration and lifecycle; a real-Bun test starts on an ephemeral localhost port, requests it, and verifies shutdown. This specific server contract was **not spiked**. Use Effect's runtime HTTP layer rather than duplicating server logic when possible; do not introduce runtime branches throughout consumers.

Treat native query results and host/CLI inputs as a **trust boundary**: accept untrusted input there, narrow it before downstream use, and keep the documented reason on the permitted `unknown` declaration. Avoid returning driver `any`/unnarrowed data into typed services. These constraints apply to tests too. [R9]

Node's addon docs require Node-API or context-aware initialization for worker support; Stryker's Vitest runner uses threads. A native addon that cannot load in worker threads is therefore a real integration limitation, not a reason to exclude its TypeScript wrapper. Mock the native module for wrapper coverage/mutation, run real addon contracts in an appropriate process, and fail CI when required native dependencies are missing. Bun documents **most**, not all, Node-API extensions as compatible. No specific third-party addon was installed or verified here. [S2], [S13], [S14]

If an adapter genuinely cannot execute under Node even with a narrow capability boundary, Stryker's built-in **command runner** can run a small real-Bun suite. The spike proved mutant activation across `bun test` without a custom runner. Use `coverageAnalysis: "off"`, explicit adapter mutation inputs and `thresholds.break: 100`; this is an additional partition, not a substitute for the coverage gate. The runner sees only the command exit code, not test counts or per-test coverage, so require an independent test-discovery/count canary and never let “no tests” exit 0. [S19], [S20]

The real-Bun mutation probe deliberately did **not** meet 100%: six of eight mutants died, but replacing `":memory:"` with `""` and removing `close()` survived its simplistic result assertion. Bun documents those memory paths as equivalent. This shows the difference between wiring assertions and real semantics; it does not justify automatic exceptions or manufactured assertions. A production contract must assert meaningful resource/read-only/error behavior, and genuine equivalent mutants require human review rather than lowering the gate. [S18]; spike below.

## Tooling and input coverage

| Gate/tool                         | Required treatment                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complexity, lines, `any` / oxlint | TSX already discovered. Keep current 21/21 complexity and 499-line limits; retain type-aware mode in CI. Preserve package tsconfigs and resolved source dependencies. The spike's floating Promise in TSX was rejected by `typescript/no-floating-promises`. [R6], [S5]                                         |
| Types / TS7                       | Preserve JSX for Solid's compiler; use `jsxImportSource: "solid-js"`, DOM libs and scoped Node/Bun types. TS7's released compiler is invoked as `tsc` here (the earlier native preview binary was `tsgo`). It rejected an invalid JSX prop in the spike. [R5], [S4], [S12]                                      |
| Coverage / Vitest V8              | Widen production inclusion and test exclusion; keep `perFile: true` and all four 100s. Never move runtime adapter folders outside the input glob to obtain green. [R1], [S1]                                                                                                                                    |
| Mutation / Stryker                | Widen TSX inclusion/exclusion. Preserve path-based plugin loading, exact runner patch and absent `tsconfigFile` workaround. Stryker 10 explicitly dispatches `.tsx` to its TSX parser; Solid's Vite plugin then compiles mutated source. [R2], [S21], [S22]                                                     |
| Dead code / Knip 6                | Keep normal **and** production mode. Official pinned plugin discovers `src/routeTree.gen.{ts,js}` and `src/{router,start,client,server}.{js,jsx,ts,tsx}` as production inputs and reads `tsr.config.json.generatedRouteTree`. Declare custom paths when plugin defaults differ. [R7], [S7], [S8]                |
| Duplication / jscpd               | Widen the source pattern; preserve threshold 0 and 50-token minimum. Pinned tokenizer recognizes `.tsx`; spike duplicated JSX produced a named clone and exit 1. This is the detector's existing clone-window policy, not a semantic claim that every two identical short expressions are rejected. [R3], [S23] |
| Formatting / oxfmt                | TSX is a natively supported language; existing config has no TS-only restriction. The spike formatted and checked TSX successfully. Keep an exact version pin. [R11], [S6]                                                                                                                                      |

Knip's Vite plugin reads Vite configuration/HTML entries and recognizes Vite/Vitest dependencies; the TanStack plugin supplies Start's source entry points rather than requiring a client HTML entry. Its source follows the generated tree's imports; marking all route files as entries could mask an orphan route. Generate deterministically before **typecheck, Knip, coverage and mutation**, including in a clean checkout/sandbox. Keep generated imports traversable even when generated code itself has an approved exception. A tree that is missing, stale, ignored by `.gitignore`-aware discovery or outside `project` patterns needs an explicit failing inventory check. [S7], [S8], [S11]

In the spike, a new Bun contract outside Vitest discovery was initially an unused file in Knip. Adding a workspace test entry fixed the normal pass, but exposed unused root scripts in production mode because workspace configuration superseded the old top-level entry setup. Moving root entries under `workspaces["."]` with `scripts/*.ts!`, and declaring only the contract entry in the spike workspace, made **both** modes pass. Production `!` is intentional; tests stay test-only entries, not production roots. Do not disable production analysis to quiet it. [S24]; spike below.

### Existing Stryker constraints stay relevant

The repo patch changes both test-name builders to join with `" > "`, matching Vitest 5. Upstream issue #6210 was still open when inspected. Nested `describe`/`it` tests in the spike killed TSX and adapter mutants using the installed patched runner. Do not interpret a fast run with many survivors as a speed improvement. [R12], [S25]

TS7 `7.0.2` does not expose the old compiler API expected by Stryker's tsconfig preprocessor. Its published root entry exports version information; a scratch `import("typescript")` confirmed `parseConfigFileTextToJson` is undefined. The existing `tsconfig.stryker-disabled.json` setting deliberately references an absent file, so the preprocessor never calls that missing API. Keep type checking as its separate gate; no need to add the Stryker TypeScript checker. This spike retained the workaround and required no emitted package output. [R2], [S29], [S30]

Start's official setup also warns that `verbatimModuleSyntax` can leak server bundles into client bundles. The repo base sets it to `true`; plan a dashboard-local override following Start's recommendation, with a client-bundle leakage check, rather than changing every library's TS configuration. That full Start build behavior was not spiked. [R16], [S12]

## Generated files and exceptions

The manifest currently has categories `coverage`, `mutation`, `duplication`, `lint`, with `path`, `reason`, `added`. The report validates existence and nonempty reasons, but does not validate approvals, whether a gate consumed the exception, or whether a thin shim has grown logic. CODEOWNERS/human approval remains essential. The only existing exception is the CLI process shim's coverage entry. [R4], [R9], [R15]

For an actual generated route tree, propose **separate named entries per necessary gate**, not `**/*.gen.*` or `src/routes/**`. A generated-code exception should name generator/version, why enforcement is inappropriate, how regeneration is checked, and which authored route tests replace that evidence. Keep handwritten routes, router setup, server handlers and runtime adapters under all gates. Add a regeneration-diff check and a no-orphan-route canary. These are proposed safeguards, not landed exceptions. [R9], [S10], [S11]

Two policy/implementation problems must be resolved first:

1. The typed route generator emits `as any`; changing the filename, omitting `.js` from globs, or adding a broad lint exception is not an any-free solution. `disableTypes` explicitly switches output to `.js`, sacrificing generated typing and requiring JS gate inputs rather than making the problem disappear. An any-free generator/custom route approach is **unverified** here. The maintainer must resolve this conflict before declaring file-based Start setup build-ready. [S10], [S11], [R9]
2. `lint`/`duplication` manifest entries are not applied today, and there is no `format`/`types` exception category. TanStack's generated banner asks users to exclude the file from their linter/formatter; obeying it independently would create undocumented exceptions. Extend the human-owned exception mechanism if approved, derive exact tool paths from it, and audit `@ts-nocheck`/ESLint/formatter directives as well as today's oxlint/Stryker/V8 patterns. Do not waive the absolute any ban as an incidental part of that extension. [R3], [R4], [R6], [R11], [S11]

Coverage exceptions also implicitly remove a file from mutation today (`stryker.config.js:3`). Make that coupling explicit in the report/spec, or change mutation to require its own approved entry. Otherwise a coverage-only exception silently removes mutation enforcement. Thin **untestable** edge shims may justify precise exceptions, but “Bun-only” or “native” does not automatically mean untestable: the spike tested actual Bun adapter source under Node. [R2], [R9]

## Speed and tiers

Keep fast formatting/syntax lint at pre-commit, typecheck/coverage at pre-push, and all gates plus real-runtime contracts at CI. The current hook already includes TSX but its lint job is not type-aware; CI's lint command is. A **tier** changes feedback cost, not whether a gate applies. [R13], [R14]

For scale, keep jsdom scoped to UI projects, Node scoped to backend/adapter tests, per-test mutation selection, direct imports of source from tests, and Stryker-managed workers. Cap worker count after measuring memory/CPU; every DOM worker adds environment startup cost. Don't run a whole Start server per mutant when a layer/component contract suffices. The runner disables Vitest coverage during mutation and supplies its own per-test analysis; coverage and mutation are independent gates. [S2], [S20]

Stryker incremental mode supports Vitest test locations, but does **not** invalidate cached results for dependency/config/environment/snapshot changes. Use it for local feedback; authoritative CI should do a full run, or force reruns under a cache policy that accounts for those inputs. Do not enable `ignoreStatic`, exclude mutator categories or lower thresholds to meet a timing goal. Partition packages only with a manifest proving every non-excepted source belongs to a mutation partition. [S26], [S20]

The clean tiny spike ran Vitest in 0.906 s and Stryker in approximately 4 s (73 mutants; 23 tests), with nine mutation workers. That demonstrates feasibility, **not speed at dashboard scale**. Stryker warned six static mutants accounted for an estimated 60% of time; startup and static service identifiers can dominate small suites. Full dashboard/Start/native-scale timings remain **unverified**.

## Throwaway spike: results and essential snippets

A separate detached scratch worktree from `origin/main` was used, distinct from the findings worktree. It added one Just-in-Time package with a Solid TSX counter, Effect service/test layer, `Bun.version` layer and `bun:sqlite` layer. Gate globs were widened and the original patched runner/thresholds retained. No spike source or gate configuration is committed; the scratch worktree is removed after research.

Essential tested source shapes:

```tsx
export function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```ts
export class RuntimeVersion extends Context.Service<
  RuntimeVersion,
  { readonly read: Effect.Effect<string> }
>()("spike/RuntimeVersion") {}

export const BunSqliteLive = Layer.succeed(RuntimeVersion, {
  read: Effect.sync(() => {
    const db = new Database(":memory:");
    db.exec("SELECT 1");
    db.close();
    return "sqlite-ok";
  }),
});
```

These are minimal probes, not production database/resource management. Consumer tests supplied `Layer.succeed(RuntimeVersion, { read: Effect.succeed("test") })`. Adapter tests executed the **real** module with a mocked `Database` and asserted constructor SQL and close calls; a nested suite asserted the service key's public identity, killing the initial identifier-string survivor. Real-Bun contracts imported the same adapters without those mocks and used only a fresh in-memory database.

| Command / scenario                                                      | Observed outcome                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`, first UI test                                           | Exit 1, `typescript/unbound-method` for destructuring `getByRole`; using `view.getByRole` fixed it. Untyped `vi.fn()` in the initial SQLite mock also failed the required-mock-type-parameters rule; typed mocks fixed it.                                                        |
| `bun run typecheck`, clean package                                      | Exit 0; actual TS7 compiler checked Solid TSX and Effect/Bun typings.                                                                                                                                                                                                             |
| `bun run test`, default `solid()`                                       | Exit 1; TSX branch coverage 50%, other metrics 100%. Disable HMR: exit 0, all four metrics 100% per executable file.                                                                                                                                                              |
| SQLite mock test in jsdom                                               | Exit 1 before tests: cannot bundle built-in `bun:sqlite`. Node-environment test: passed, adapter 100% coverage.                                                                                                                                                                   |
| `bun run knip`, initial contract entry                                  | Exit 1, unused Bun contract; initial workspace fix exposed root scripts in production. Correct root/workspace entry configuration: both normal and production runs exit 0.                                                                                                        |
| `bun run dup`, clean widened pattern                                    | Exit 0; report explicitly analyzed TSX and TypeScript.                                                                                                                                                                                                                            |
| `bun run mutate`, initial layer identifier                              | Exit 1, 98.51%, one surviving service-key StringLiteral; counter itself 100%. Public key assertion added; clean final run exit 0, 100%, 67 killed + 6 timeouts, zero survivors/no-coverage/errors. Counter: 3 killed; SQLite: 6 killed; Bun version: 2 killed; service: 2 killed. |
| `bun run verify-gates`, clean widened configuration                     | Exit 0; all existing TS canaries and patch assertion passed. This did not prove new TSX canaries exist in the script.                                                                                                                                                             |
| Unimported `gate-canary.tsx`, original TS-only coverage include via CLI | **Exit 0, silent false pass**; file absent from report even though other packages were covered.                                                                                                                                                                                   |
| Same TSX canary, widened coverage include                               | Exit 1, file explicitly 0% lines/functions/statements and named in threshold diagnostics.                                                                                                                                                                                         |
| Same TSX canary, original TS-only mutation config                       | **Exit 0, silent false pass**; 70 mutants, TSX omitted, score 100%.                                                                                                                                                                                                               |
| Same TSX canary, widened mutation config                                | Exit 1; 75 mutants, two named TSX `NoCoverage` mutants, total score 97.33%.                                                                                                                                                                                                       |
| Same orphan TSX, `bun run knip`                                         | Exit 1, named unused TSX file.                                                                                                                                                                                                                                                    |
| Floating Promise planted in TSX, `bun run lint`                         | Exit 1, named `typescript/no-floating-promises` with `Promise<number>` type, demonstrating type-aware enforcement.                                                                                                                                                                |
| Invalid JSX prop planted, `bun run typecheck`                           | Exit 1, TS2322 naming `impossibleProp` on `HTMLAttributes<HTMLParagraphElement>`.                                                                                                                                                                                                 |
| Two duplicated TSX components, `bun run dup`                            | Exit 1, named TSX clone: 12 lines / 133 tokens; 4.0% over threshold 0.                                                                                                                                                                                                            |
| `bunx --no-install oxfmt packages/gates-spike`, then `--check`          | Both exit 0; 12 package files formatted/checked, including TSX.                                                                                                                                                                                                                   |
| `bun test packages/gates-spike/test/bun.contract.test.ts`               | Exit 0, 2 actual runtime contracts.                                                                                                                                                                                                                                               |
| Same real-Bun contracts with `--coverage`                               | Exit 0; 100% lines, 88.89% functions overall; no branch/statement or unimported-file proof. Not a replacement coverage gate.                                                                                                                                                      |
| `bun run mutate stryker.bun-spike.config.js`, command runner            | Exit 1 as intended: 8 adapter mutants, 6 killed, 2 survived, score 75%. Command runner's “1 test” means the whole command, not the two actual Bun tests.                                                                                                                          |
| Final clean rerun after removing all planted violations                 | All seven requested commands exit 0: lint, typecheck, test, Knip, duplication, mutation, then gate verification run separately.                                                                                                                                                   |

Two exploratory runs were not used as gate evidence: a repeated CLI `--mutate` option replaced rather than accumulated patterns, leaving zero mutation inputs and correctly failing for no tests; one coverage/verification overlap raced the planted canary/coverage output and failed for an unrelated diagnostic. Both were rerun with the actual configuration and sequential verification. This is why the inventory and named-diagnostic checks matter.

## Sources

Repository citations below refer to the inspected base commit, not mutable future configuration. Upstream docs were inspected on the research date; version-pinned source is used where available. The main checkout's uncommitted `GLOSSARY.md` was read for vocabulary, not copied or changed.

[R1]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/vitest.config.ts#L4-L12
[R2]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/stryker.config.js#L1-L41
[R3]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/.jscpd.json#L1-L10
[R4]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/scripts/exceptions.ts#L5-L43
[R5]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/AGENTS.md#L45-L47
[R6]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/.oxlintrc.json#L3-L36
[R7]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/knip.json#L1-L5
[R8]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/scripts/verify-gates.ts#L42-L183
[R9]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/AGENTS.md#L19-L43
[R10]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/README.md#L40-L46
[R11]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/.oxfmtrc.json#L1-L7
[R12]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/patches/%40stryker-mutator%252Fvitest-runner%4010.0.0.patch#L1-L26
[R13]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/lefthook.yml#L3-L21
[R14]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/package.json#L8-L36
[R15]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/quality-exceptions.json#L1-L12
[R16]: https://github.com/ysm-dev/opencode-stats/blob/87bf072/tsconfig.base.json#L1-L20
[S1]: https://vitest.dev/guide/coverage.html
[S2]: https://stryker-mutator.io/docs/stryker-js/vitest-runner/
[S3]: https://github.com/solidjs/solid-testing-library/blob/main/README.md
[S4]: https://github.com/microsoft/typescript-go/blob/main/README.md
[S5]: https://oxc.rs/docs/guide/usage/linter/type-aware.html
[S6]: https://oxc.rs/docs/guide/usage/formatter/language-support.html
[S7]: https://github.com/webpro-nl/knip/blob/knip%406.38.0/packages/knip/src/plugins/vite/index.ts
[S8]: https://github.com/webpro-nl/knip/blob/knip%406.38.0/packages/knip/src/plugins/tanstack-router/index.ts
[S9]: https://bun.sh/docs/test/code-coverage
[S10]: https://github.com/TanStack/router/blob/main/packages/router-generator/src/config.ts
[S11]: https://github.com/TanStack/router/blob/main/packages/router-generator/src/generator.ts
[S12]: https://github.com/TanStack/router/blob/main/docs/start/framework/solid/build-from-scratch.md
[S13]: https://nodejs.org/api/addons.html#worker-support
[S14]: https://bun.sh/docs/runtime/node-api
[S15]: https://github.com/solidjs/vite-plugin-solid/blob/master/src/index.ts
[S16]: https://github.com/vitest-dev/vitest/blob/v5.0.2/packages/coverage-v8/src/provider.ts
[S17]: https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Context.ts
[S18]: https://bun.sh/docs/runtime/sqlite
[S19]: https://github.com/stryker-mutator/stryker-js/blob/v10.0.0/packages/core/src/test-runner/command-test-runner.ts
[S20]: https://stryker-mutator.io/docs/stryker-js/configuration/
[S21]: https://github.com/stryker-mutator/stryker-js/blob/v10.0.0/packages/instrumenter/src/parsers/create-parser.ts
[S22]: https://github.com/stryker-mutator/stryker-js/blob/v10.0.0/packages/instrumenter/src/parsers/ts-parser.ts
[S23]: https://github.com/kucherenko/jscpd/blob/v5.3.3/rust/crates/cpd-tokenizer/src/formats.rs
[S24]: https://knip.dev/features/production-mode
[S25]: https://github.com/stryker-mutator/stryker-js/issues/6210
[S26]: https://stryker-mutator.io/docs/stryker-js/incremental/
[S27]: https://vitest.dev/guide/environment.html
[S28]: https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Layer.ts
[S29]: https://unpkg.com/typescript@7.0.2/lib/version.cjs
[S30]: https://github.com/stryker-mutator/stryker-js/blob/v10.0.0/packages/core/src/sandbox/ts-config-preprocessor.ts
