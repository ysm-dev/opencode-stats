# TanStack Solid Start: code-based routing versus generated-route gates

Researched 2026-10-03 against published packages, official documentation, and an executable spike. Base: `origin/main`, `f3749f4`. No application package or gate configuration was changed. The retained throwaway fixtures are in [`spike/`](../../spike/); they are research evidence, **not a gate-green dashboard implementation**.

## Decision summary / direct answers

1. **Not a working, supported production SPA configuration at these versions.** Solid Router documents code-based routing, and hand-written routes work in Start's development server with typed links/navigation. Start's documented approach is file-based routing. Turning off generation successfully avoids `routeTree.gen.ts`, but `vite build` fails in Start's production asset-manifest builder before shell prerendering. It produces the client bundle, **not a successfully built `_shell.html`**. Do not equate the working dev server with production support.
2. **Supported generator options do not produce a typed, `any`-free tree.** `routeTreeFileHeader: []` removes the suppression header, but typed generation unconditionally emits `as any`. `disableTypes: true` removes casts by generating JavaScript and dropping route types; additionally, Start currently appends a TypeScript footer to that JavaScript, causing the server build to fail parsing it. `verboseFileRoutes` does not exist in this version. Virtual file routes use the same emitter. Merely removing the casts causes TS2353, not a valid type-safe tree.
3. **Hand-written files pass the requested code gates; generated files do not pass lint.** Both fixtures pass TypeScript 7.0.2, formatting, scoped zero-duplication checks, and suitably discovered knip entry points. No lint suppression or gate exception was used. Knip silently has no match for a nonexistent default tree; it still follows `src/router.tsx`. A real `src/start.ts` importing `createStart` is necessary in this fixture to avoid knip production reporting `@tanstack/solid-start` unused, because its only other authored import is in the build-time Vite config. See the gate table and scope limitations below.
4. **Start installs file-routing generator machinery by default, but generation can be disabled using `router.enableRouteGeneration: false`.** The option is in the published configuration schema. The plugin still constructs a Generator and installs related hooks; it skips the generation operation and writes no route tree. The production build nevertheless depends on the generator's route-manifest side effect. No public manual-route-manifest option was found in the pinned schema/source.

Therefore the choice is not currently “supported Start code routing instead of a generated-file exception.” Keeping Start's current production pipeline requires generated routing plus a human-owned gate decision, an upstream fix, or a separately maintained integration. A plain Solid Router SPA could use code routing, but replacing Start or constructing a separate prerender pipeline was outside this investigation. An exception for `any` alone would not cover all observed generated-file lint failures.

## Exact versions

The application versions were resolved from npm's `latest` metadata and then pinned; Solid Start's declared exact Router dependency is the Router version below. Internal TanStack packages use independent version numbers, not the Solid Start number.

| Package                       | Tested version                           |
| ----------------------------- | ---------------------------------------- |
| `@tanstack/solid-start`       | `1.168.57`                               |
| `@tanstack/solid-router`      | `1.170.38`                               |
| `vite`                        | `8.3.2`                                  |
| `vite-plugin-solid`           | `2.11.14`                                |
| `solid-js`                    | `1.9.15`                                 |
| `@tanstack/start-plugin-core` | `1.171.49`                               |
| `@tanstack/router-plugin`     | `1.168.42`                               |
| `@tanstack/router-generator`  | `1.167.40`                               |
| `typescript` / native `tsc`   | `7.0.2`                                  |
| `knip`                        | `6.38.0` (repo pin, not registry latest) |
| `oxlint` / `oxlint-tsgolint`  | `1.86.0` / `7.0.2003`                    |
| `oxfmt`                       | `0.71.0`                                 |
| `jscpd`                       | `5.3.3`                                  |
| `playwright`                  | `1.58.2`                                 |
| Bun / Node                    | `1.4.2` / `24.15.0`                      |

Reproducibility: [`spike/package.json`](../../spike/package.json), [`spike/bun.lock`](../../spike/bun.lock), and the existing root lockfile. Run the generated-config build before its typecheck/knip commands: its derived `generated-src/routeTree.gen.ts` is produced by that build, quoted below, and not committed. It is not added to any ignore pattern for the gates. Registry primary sources: [Solid Start metadata](https://registry.npmjs.org/@tanstack/solid-start/1.168.57), [Router](https://registry.npmjs.org/@tanstack/solid-router/1.170.38), [Vite](https://registry.npmjs.org/vite/8.3.2), [Solid plugin](https://registry.npmjs.org/vite-plugin-solid/2.11.14), [Solid](https://registry.npmjs.org/solid-js/1.9.15).

## 1. Hand-written routing: configuration, build, browser, types

[Solid Router's code-based routing guide][router-guide] explicitly documents `createRootRoute`, `createRoute`, `getParentRoute`, and `addChildren`. In contrast, [Start's Solid routing guide][start-routing] says “Start uses TanStack Router's file-based routing approach,” imports `routeTree.gen`, and documents automatic generation. [SPA mode][spa-docs] still runs a server build for prerendering; disabling runtime SSR does not avoid the failing server build.

The tested `vite.config.ts` is:

```ts
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    tanstackStart({
      spa: { enabled: true },
      router: {
        enableRouteGeneration: false,
        codeSplittingOptions: { defaultBehavior: [] },
      },
    }),
    solid({ ssr: true }),
  ],
});
```

`defaultBehavior: []` requests no route splitting. Start excludes `autoCodeSplitting` from its accepted router schema, so `router.autoCodeSplitting: false` is **not** the corresponding Start option. `solid({ ssr: true })` is needed for the build-time server rendering, even though the deployed app is client-only. See [Start's schema][start-schema] and [Router plugin's grouping configuration][plugin-config].

The spike has a root document (`HydrationScript`, `HeadContent`, `Outlet`, `Scripts`), an empty default pending component, and `/` and `/models` pages. Its router is simply:

```ts
const routeTree = rootRoute.addChildren([overviewRoute, modelsRoute]);

export function getRouter() {
  return createRouter({ routeTree, defaultPendingComponent: () => null });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

All authored relative imports use explicit `.ts`/`.tsx` extensions. The TS config extends the repo's unchanged strict base, adding DOM libraries, Solid JSX configuration and Vite/Node types. No `any`, `unknown`, type assertion, or suppression is needed in the hand-written routes.

Observed commands, from `spike/`:

| Command                                                    | Outcome                                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install`                                              | Installed pinned versions.                                                                                                                      |
| `bun run build` (`vite build`)                             | Client succeeds: one JS asset, final fixture 138.61 kB / 46.79 kB gzip. Server build fails with the error below. No successful shell prerender. |
| `bunx vite --host 127.0.0.1 --port 4179`                   | Hand-written Start development app serves successfully.                                                                                         |
| `SPIKE_URL=http://127.0.0.1:4179 node scripts/browser.mjs` | Headless Chromium: Overview → Models via `Link` → Overview via `useNavigate`; URL changes; direct `/models` load works; no page errors.         |
| `bun run typecheck`                                        | Native TS 7.0.2 passes.                                                                                                                         |

The reproducible production error is:

```text
[plugin tanstack-start:start-manifest-plugin]
TypeError: Cannot convert undefined or null to object
    at Object.entries
    at buildRouteManifestRoutes
```

Root cause, established from the published source:

- [Start's router integration][start-router-plugin] installs `routesManifestPlugin()` as a **generator plugin**.
- [That generator plugin][routes-manifest] writes `globalThis.TSS_ROUTES_MANIFEST` after generation.
- [The production Start manifest plugin][manifest-plugin] reads that global and passes it as `routeTreeRoutes` without a manual-tree fallback. In development it returns an empty/root client-script manifest instead, explaining why development works.
- [The manifest builder][manifest-builder] calls `Object.entries(options.routeTreeRoutes)` (source line 552), which fails when generation has been skipped.

The experiment was run in fresh build processes, not after a generator had populated globals in the same process. Re-running after adding the explicit Start entry below produces the same failure. The fixture's `src/` has no generated tree before or after the build/dev tests.

**Typed links and navigation are proven, independently of the production failure.** Temporarily adding these lines to an included `.tsx` file:

```tsx
export const invalidLink = <Link to="/does-not-exist">Invalid</Link>;
void getRouter().navigate({ to: "/does-not-exist" });
```

causes TS2322 on **both** destinations: `"/does-not-exist"` is not assignable to `"." | ".." | "/" | "/models"`. Removing that deliberate negative-test file restores a clean typecheck. No `@ts-expect-error` was used or retained. The valid destinations are exercised in the browser.

## 2. Generated routing: output and options

The generated fallback lives in `generated-src/`, selected by `vite.generated.config.ts`. Its two page routes plus root use normal `createFileRoute`. It keeps generation enabled, requests no route splitting, and sets:

```ts
router: {
  routeTreeFileHeader: [],
  addExtensions: true,
  quoteStyle: "double",
  semicolons: true,
  codeSplittingOptions: { defaultBehavior: [] },
}
```

The entire emitted Solid tree for this configuration is quoted below. It is not post-processed. Removing the header clearly does not remove the `any` casts:

```ts
// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from "./routes/__root.tsx";
import { Route as IndexRouteImport } from "./routes/index.tsx";
import { Route as ModelsRouteImport } from "./routes/models.tsx";

const IndexRoute = IndexRouteImport.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRouteImport,
} as any);
const ModelsRoute = ModelsRouteImport.update({
  id: "/models",
  path: "/models",
  getParentRoute: () => rootRouteImport,
} as any);

export interface FileRoutesByFullPath {
  "/": typeof IndexRoute;
  "/models": typeof ModelsRoute;
}
export interface FileRoutesByTo {
  "/": typeof IndexRoute;
  "/models": typeof ModelsRoute;
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport;
  "/": typeof IndexRoute;
  "/models": typeof ModelsRoute;
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath;
  fullPaths: "/" | "/models";
  fileRoutesByTo: FileRoutesByTo;
  to: "/" | "/models";
  id: "__root__" | "/" | "/models";
  fileRoutesById: FileRoutesById;
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute;
  ModelsRoute: typeof ModelsRoute;
}

declare module "@tanstack/solid-router" {
  interface FileRoutesByPath {
    "/": {
      id: "/";
      path: "/";
      fullPath: "/";
      preLoaderRoute: typeof IndexRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/models": {
      id: "/models";
      path: "/models";
      fullPath: "/models";
      preLoaderRoute: typeof ModelsRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  ModelsRoute: ModelsRoute,
};
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>();

import type { getRouter } from "./router.tsx";
import type { createStart } from "@tanstack/solid-start";
declare module "@tanstack/solid-start" {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
```

The default header, from the pinned [generator configuration source][generator-config], is:

```ts
/* eslint-disable */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols
```

| Option                     | Actual behavior at `router-generator@1.167.40`                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routeTreeFileHeader: []`  | Removes those three default header lines, including `@ts-nocheck`. Does not affect casts or the fixed generated-file notice.                                                                                                                                                          |
| `disableTypes`             | Default `false`. The [emitter][generator-source] uses `config.disableTypes ? '' : 'as any'` at line 712; no separate safe-cast option exists. `true` also drops file-route interfaces/type augmentation and `_addFileTypes`; config rewrites a `.ts`/`.tsx` output filename to `.js`. |
| `verboseFileRoutes`        | Absent from the pinned schema and TanStack package sources; not a supported option here.                                                                                                                                                                                              |
| `addExtensions`            | `false` by default; `true` or an extension string controls import extensions, not casts. The fixture uses `true` for explicit `.tsx` imports.                                                                                                                                         |
| `quoteStyle`, `semicolons` | Formatting only. `"double"` / `true` make this output agree with the repo's formatter.                                                                                                                                                                                                |
| `routeTreeFileFooter`      | Appends footer lines. Start adds its own registration footer through its integration; an empty user footer does not remove Start's footer.                                                                                                                                            |
| `virtualRouteConfig`       | Changes how route nodes are discovered/organized; the same `buildRouteTree` emitter produces casts. Not code-based routing without generation.                                                                                                                                        |

Supported options therefore cannot preserve the typed TypeScript tree while removing all `any`. `disableTypes` is not a typed equivalent. Moreover, in the actual Start integration, testing `disableTypes: true` and changing the router import to `.js` builds the client but fails the server:

```text
[PARSE_ERROR] Expected `from` but found `{`
generated-src/routeTree.gen.js:26:13
import type { getRouter } from "./router.tsx";
```

[Start's footer builder][footer-source] always emits type imports and a `declare module` block; the generator appends that footer even with types disabled. This is a separate integration failure, not a way around the ban.

As a minimal post-processing test, removing just the two `as any` expressions causes TS2353 twice: `'id' does not exist in type 'UpdatableRouteOptions<...>'`. A rewrite to differently structured/type-checked code would need its own maintenance and gate tests; no supported post-processing recipe was established. The fixture was regenerated afterward to retain actual generator output.

**Positive build/browser control:** `bunx vite build --config vite.generated.config.ts` succeeds, produces a single client JS bundle (137.97 kB / 46.64 kB gzip), the build-time server output, and `dist/client/_shell.html`. The shell has the root HTML document and client script but **no page `<h1>`**. `node scripts/browser.mjs` serves only static client output with fallback to the shell and passes Overview → Models → Overview and direct `/models`, with no page errors. Thus the failing hand-written build is not merely an unconfigured Solid/Vite/SPA setup.

## 3. Gate results and knip configuration

All requested repo configs were read on the base branch, then copied byte-for-byte into a temporary gate harness. The strict TS base was inherited unchanged, with app-specific DOM/JSX additions. No gate rules, thresholds, ignores, or exceptions were weakened.

Important scope caveat: repo jscpd, Vitest and Stryker configs target `packages/*/src/**/*.ts`. An unchanged invocation there would **not test a spike outside `packages/` or `.tsx` UI files**. For meaningful duplication evidence, jscpd was invoked with the unchanged config **plus an explicit source-pattern argument** for each fixture. Tests, coverage, mutation, and full `bun run ci` were not claimed or run. UI test/mutation integration remains future dashboard work.

| Gate                                                                         | Hand-written fixture                                                 | Generated TypeScript fixture                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Type-aware oxlint, unchanged rules, unused suppressions reported             | **Pass**, zero diagnostics, including all `no-unsafe-*` rules        | **Fail**, 9 errors in the emitted tree; listed below                              |
| Native `tsc` 7.0.2                                                           | **Pass**                                                             | **Pass** with header empty, despite lint failures                                 |
| `oxfmt --check`                                                              | **Pass**                                                             | **Pass**, with generator double quotes/semicolons and formatted authored routes   |
| jscpd threshold 0, unchanged thresholds, explicit `.ts`/`.tsx` fixture scope | **Pass**, 0 clones                                                   | **Pass**, 0 clones, including generated tree                                      |
| Knip 6.38.0 normal mode                                                      | **Pass** with unchanged repo config in isolated canonical app layout | **Pass** with explicit non-default generated entries in retained combined fixture |
| Knip 6.38.0 production mode                                                  | **Pass** with unchanged repo config and explicit Start entry         | **Pass** with those entries                                                       |

The generated-tree lint errors are: two `no-explicit-any`; two `no-unsafe-argument`; two `no-unsafe-type-assertion`; two `no-underscore-dangle` (`_addFileChildren`, `_addFileTypes`); and unused `createStart` in Start's emitted footer. The authored generated-fixture pages have no remaining unsafe diagnostics after providing the correct Solid JSX TS project. Do not solve an accidentally missing JSX program by suppressing unsafe rules.

Representative gate commands (isolated app's `src/`, copied configs in sibling `gates/`):

```sh
bunx oxlint --type-aware --report-unused-disable-directives --config ../gates/.oxlintrc.json src vite.config.ts
bunx tsc --noEmit
bunx oxfmt --check src vite.config.ts
bunx jscpd --config ../gates/.jscpd.json --pattern 'src/**/*.{ts,tsx}' .
bunx knip --config ../gates/knip.json
bunx knip --config ../gates/knip.json --production
```

All six commands exited 0 in the clean hand-written harness. Normal knip emits three harmless configuration hints because the standalone spike has no root scripts or agent directories. The authored Start entry is:

```ts
// src/start.ts
import { createStart } from "@tanstack/solid-start";

export const startInstance = createStart(() => ({}));
```

This is a real Start convention entry consumed by the app, not an unused import to fool the analyzer. Without it, normal knip passed, but production knip flagged `@tanstack/solid-start` as an unused dependency: its authored import was only in `vite.config.ts`, which is a development configuration. No dependency ignore was added.

### What happens when the default generated file is missing?

At the repo's pinned knip version, [the TanStack Router plugin][knip-router] enables itself for `@tanstack/solid-start` or `@tanstack/solid-router`, and declares production entry patterns:

```js
["src/routeTree.gen.{ts,js}", "src/{router,start,client,server}.{js,jsx,ts,tsx}"];
```

A missing default generated file simply does not match the glob. It is not an unresolved-import error and does not disable the plugin or prevent discovering `src/router.tsx` and its imported hand-written routes. The isolated canonical fixture confirms this in **both modes** without any custom tree-path or file-ignore configuration.

The [Vite plugin][knip-vite] itself discovers `vite.config.*`, HTML entries and config-derived inputs; the generated-tree/convention entry patterns above belong to the **TanStack Router plugin**, not Vite's own default patterns. TanStack's plugin reads `tsr.config.json` for a non-default `generatedRouteTree`; it does not extract that property from arbitrary `tanstackStart(...)` arguments in Vite config.

The retained combined research fixture has **two apps** and non-default `generated-src/` paths, plus a Playwright helper. Its small `spike/knip.json` therefore names the additional production entries and Vite config:

```json
{
  "entry": ["generated-src/router.tsx!", "generated-src/routeTree.gen.ts!", "scripts/browser.mjs"],
  "project": [
    "src/**/*.{ts,tsx}",
    "generated-src/**/*.{ts,tsx}",
    "vite*.config.ts",
    "scripts/*.mjs"
  ],
  "vite": { "config": ["vite*.config.ts"] }
}
```

`!` is knip's production-entry marker, not a suppression. The default plugin still discovers the ordinary `src/router.tsx` / `src/start.ts`. Explicitly naming the non-default tree reproduces the plugin's normal treatment of a default generated tree; without it normal-mode knip additionally reports three unused exported interfaces. No route tree is ignored by lint, typecheck, formatting, duplication, or knip. The entry-based treatment of exported types is knip's standard framework-entry behavior, not proof that those interfaces have application consumers.

## 4. Is generation mandatory in Start's Vite plugin?

[The Start router plugin][start-router-plugin] always installs the generator plugin and code-splitter integrations. [Start's schema][start-schema] composes Router plugin config (excluding `target` and `autoCodeSplitting`), so `enableRouteGeneration` remains an accepted, typed option. [Router's generator plugin][generator-plugin] checks `userConfig.enableRouteGeneration === false` and returns from `generate()` before running generation.

That confirms a supported **switch to stop writing the generated file**, not supported end-to-end Start production code routing. Start's client-tree loader also expects an initialized generator/crawling result if the configured generated-tree path is actually imported. The hand-written fixture never imports that path, so it gets past that loader; the asset-manifest dependency is the later blocker. Setting `generatedRouteTree` to the manual tree path would therefore not be a safe workaround.

No package source was patched, no generator hooks were filtered out, and no internal manifest global was manually fabricated. Such workarounds would conceal the missing integration contract rather than demonstrate public support.

## Limits / recommendation

- Verified: actual published-package build failures, successful generated SPA build and static browser behavior, successful hand-written dev browser behavior, positive/negative Router typing, and the requested scoped code gates.
- Not verified: production browser behavior of hand-written Start (no completed shell build), full repo CI/test/mutation coverage, six-page worker/data integration, future versions, or arbitrary custom post-processors.
- The published source is stronger evidence than the broad documentation sentence that all Router features are available in Start. At these pins, the production manifest contract still assumes generation.
- If the absolute ban remains, do not choose Start code routing based only on a dev-server demonstration. Either resolve the manifest support upstream before committing to it, choose a Router-only client architecture with a separately specified shell strategy, or ask the human owner to consider a narrowly documented generated-file gate policy covering **all** observed violations.

[router-guide]: https://raw.githubusercontent.com/TanStack/router/main/docs/router/routing/code-based-routing.md
[start-routing]: https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/solid/guide/routing.md
[spa-docs]: https://tanstack.com/start/latest/docs/framework/solid/guide/spa-mode
[start-schema]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/schema.ts
[start-router-plugin]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/vite/start-router-plugin/plugin.ts
[routes-manifest]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/start-router-plugin/generator-plugins/routes-manifest-plugin.ts
[manifest-plugin]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/vite/start-manifest-plugin/plugin.ts
[manifest-builder]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/start-manifest-plugin/manifestBuilder.ts
[footer-source]: https://unpkg.com/@tanstack/start-plugin-core@1.171.49/src/start-router-plugin/route-tree-footer.ts
[generator-config]: https://unpkg.com/@tanstack/router-generator@1.167.40/src/config.ts
[generator-source]: https://unpkg.com/@tanstack/router-generator@1.167.40/src/generator.ts
[plugin-config]: https://unpkg.com/@tanstack/router-plugin@1.168.42/src/core/config.ts
[generator-plugin]: https://unpkg.com/@tanstack/router-plugin@1.168.42/src/core/router-generator-plugin.ts
[knip-router]: https://unpkg.com/knip@6.38.0/dist/plugins/tanstack-router/index.js
[knip-vite]: https://unpkg.com/knip@6.38.0/dist/plugins/vite/index.js
