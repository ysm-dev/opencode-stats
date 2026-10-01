# Adopting `@opencode/ui` for the dashboard

## Direct answer

**Adopt the npm package directly, pinned to `2.0.21`; compile its TSX with Solid, import both its Tailwind and v2 token styles, and use its `oc-2` theme. Do not import OpenCode's application or copy its provider tree.** The published package needs no unpublished `@opencode/*` dependency. Vite consumption works; TanStack Start consumption also works with the SSR configuration below. Charts, the contribution graph, statistics tables, metric tiles, and the dashboard shell remain dashboard-owned work. [P] [CSS] [Theme] [Spike]

### Consumption recipe

1. Install `@opencode/ui@2.0.21` and its two peers: `solid-js` (`^1.9.8`) and `@solidjs/meta` (`^0.29.0`). Tested peers: Solid `1.9.15`, Meta `0.29.4`. The package brings Kobalte `0.13.13` and its other runtime dependencies itself. There is **no root barrel export**: import `@opencode/ui/button`, `@opencode/ui/select`, etc. Published exports contain `.d.ts` types but execute `.ts`/`.tsx` source. [P]
2. Use Vite + `vite-plugin-solid` + Tailwind v4's `@tailwindcss/vite` plugin. Tested: Vite `8.2.2`, Solid plugin `2.11.14`, Tailwind and its Vite plugin `4.3.3`. No sprite-generation plugin, OpenCode monorepo alias, `@opencode/app`, or `@opencode/session-ui` is needed. [P] [Build] [Spike]
3. In the dashboard CSS entry, import `@opencode/ui/styles/tailwind`, then `@opencode/ui/styles/tokens`, then **explicitly register the dashboard source** with `@source`. The library uses `source(none)` and source paths aimed at its original monorepo; it does not discover an unrelated consumer's components automatically. Its Tailwind entry already imports `@opencode/ui/styles`, including reset, legacy/component CSS, and utilities. Do not import ordinary `tailwindcss` again and overwrite the library's theme. [CSS] [TW]
4. Load fonts yourself. `<Font />` is a no-op in `2.0.21`. Inter and JetBrains Mono Nerd Font are included and exposed through `@opencode/ui/fonts/*`; IBM Plex Mono requires a separate font source (`@ibm/plex@6.4.1` reproduces the application). For the dashboard, Inter is the essential UI face; IBM Plex Mono is useful for numbers/code; omit the terminal-only Nerd Font if unused. [Fonts] [AppType] [Spike]
5. Wrap the dashboard with `ThemeProvider defaultTheme="oc-2"`; call `useTheme().setColorScheme("light" | "dark" | "system")`. It defaults to `oc-2`/system, resolves both legacy and v2 tokens, injects `#oc-theme`, sets root `data-theme`/`data-color-scheme`, persists preferences, and observes system/storage changes. Put theme on the document root so portalled overlays inherit it. Add a small **pre-paint head script** for the saved/system scheme, following OpenCode's preload, to avoid a light flash. [Theme] [Preload]
6. English-only needs no custom localization bridge: the UI context has an English fallback. `MetaProvider` is appropriate when using Meta components. `DialogProvider` is needed if using the UI's dialog service; the dashboard does not need OpenCode's server, file, command, extension, or language providers merely to use buttons/selects/popovers. [I18n] [Dialogs] [AppProviders]
7. For TanStack Start, put `tanstackStart()` **before** `solid({ ssr: true })`, keep UI/Kobalte non-external for SSR, and import the dashboard stylesheet from the root route. Tested Start `1.168.57` with Router `1.170.38`; their versions are not lockstep. A successful build alone is insufficient: test actual server rendering and client hydration. [Start] [SSR] [Spike]

Asset handling is ordinary Vite bundling: the shipped SVG sprites are imported as URLs and fonts can be imported through the published font subpaths. Do not use the library's `Favicon` as an asset installer: it emits links to root-relative OpenCode favicon/manifest files, while those original favicon assets are not in the npm file allowlist. Give the dashboard its own public favicon/title. [P] [Icons] [Favicon]

For nested/hoisted development installs, ensure Vite's `server.fs.allow` covers the dependency directory. The nested Start spike needed `server: { fs: { allow: [".."] } }` because its fonts lived in the parent's `node_modules`. The actual repo has a workspace manifest, which Vite can auto-detect; do not disable filesystem restrictions globally. Verify font HTTP responses as well as JavaScript page errors. [DevAssets] [Spike]

Minimal plain Vite config (consumer bundle, not a build step for a Just-in-Time library):

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";

export default defineConfig({ plugins: [tailwind(), solid()] });
```

TanStack Start variant, verified against the published package:

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  ssr: { noExternal: ["@opencode/ui", "@kobalte/core"] },
  plugins: [tailwind(), tanstackStart(), solid({ ssr: true })],
});
```

TypeScript needs `jsx: "preserve"`, `jsxImportSource: "solid-js"`, DOM libs, and bundler module resolution. Retain the repo's explicit `.ts` imports for workspace code. Start's official guide warns about `verbatimModuleSyntax` leaking server bundles into client bundles; its interaction with this repo's inherited `true` setting remains **unverified** and must be checked in the actual dashboard package. This research did not change that setting. [SolidTS] [Start]

Example `src/style.css`:

```css
@import "@opencode/ui/styles/tailwind";
@import "@opencode/ui/styles/tokens";
@source "./"; /* Paths are relative to this stylesheet. */

@font-face {
  font-family: "Inter";
  src: url("@opencode/ui/fonts/Inter.ttf") format("truetype");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("@ibm/plex/IBM-Plex-Mono/fonts/complete/woff2/IBMPlexMono-Text.woff2") format("woff2");
  font-weight: 440;
  font-display: swap;
}
body {
  font-family: var(--font-family-text);
  font-size: 13px;
  font-weight: 440;
  color: var(--v2-text-text-base);
}
```

Register any shared TSX workspace sources separately; include the consumer HTML if it contains utilities. Keep utility names literal, not constructed strings. For example, `bg-v2-background-bg-base`, `text-v2-text-text-muted`, `p-6`, `gap-4` work; default Tailwind palette/typography assumptions do not, because the library resets its Tailwind theme with `--*: initial`. [CSS] [TW]

Minimal composition (inside the router's root body for Start):

```tsx
import { MetaProvider } from "@solidjs/meta";
import { ThemeProvider } from "@opencode/ui/theme/context";

<MetaProvider>
  <ThemeProvider defaultTheme="oc-2">
    <Dashboard />
  </ThemeProvider>
</MetaProvider>;
```

### Dashboard component inventory and gaps

All paths below are subpaths of `@opencode/ui`; availability is checked against the npm `2.0.21` exports **and actual files**, not just against the moving `v2` checkout. [P]

| Need                          | Reuse                                                                   | Limit / dashboard-owned work                                                                                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell, layout, panels         | `divider`, `scroll-view`, `resize-handle`, `dock-surface`               | No ready-made application shell/sidebar/header/grid. `DockShell`/`DockTray` are surface wrappers, not navigation/layout. Build a small semantic shell. [Layout]                                                                                                              |
| Cards / summaries             | `card` (`Card`, `CardTitle`, `CardDescription`, `CardActions`), `badge` | Card is a transparent callout with a 2px left accent, not a raised KPI tile. Compose custom metric tiles with the same tokens; no KPI/sparkline component. [Card]                                                                                                            |
| View tabs                     | `tabs`, optionally `tab-state-indicator`                                | Use current variants `line`, `pill`, `settings`; older `panel`, `underline`, `surface` use legacy styling. `Tabs.List/Trigger/Content` are Kobalte-based; route navigation still belongs to TanStack Router. [Tabs]                                                          |
| Time range / grouping         | `segmented-control` (`SegmentedControl`, `SegmentedControlItem`)        | Controlled string-or-null values, `aria-pressed`, arrow/Home/End focus handling. Default width 232px, height 28px: all seven time presets may need a wider responsive composition or Select, not seven cramped labels. [Segments]                                            |
| Model/project filters         | `select`; `list` + `text-input`/`text-field` in an overlay for search   | Select is **single selection**, supports grouping and custom labels; not a searchable or multi-select dashboard filter. List is a filtered picker, not a table. [Select] [List]                                                                                              |
| Tooltips / definitions        | `tooltip`, `popover`, `hover-card`, `dialog`                            | Tooltip supports three appearances and portalled content. Popover can contain arbitrary filter/definition UI. Use `triggerAs="button"` for actionable popover triggers, and accessible names on controls. [Overlays]                                                         |
| Menus / actions               | `menu`, `context-menu`, `button`, `icon-button`, `split-button`         | Keep actions limited to dashboard preferences/filtering; never copy OpenCode mutation actions. [P] [Buttons]                                                                                                                                                                 |
| Keyboard hints                | `keybind`                                                               | Takes `keys: string[]`, **not** a keybinding expression. It renders hints only; TanStack Hotkeys owns behavior, and hints must match enabled/platform-specific shortcuts. [Keys]                                                                                             |
| Icons / identity              | `icon`, `provider-icon`, `project-avatar`, `avatar`                     | UI icon SVGs and provider sprites are shipped. General icon sizes are 14/16/20px. No second icon library or sprite build is required. [Icons]                                                                                                                                |
| Preferences / forms           | `checkbox`, `radio`, `switch`, `field`, `text-input`, `textarea`        | Useful for dashboard-owned preferences. There is no packaged date-range picker/calendar. [P]                                                                                                                                                                                 |
| Tables                        | None                                                                    | Build semantic HTML tables with shared type/spacing/border tokens; own sorting, numeric alignment, empty state, and any virtualization. No data-grid API. [P]                                                                                                                |
| Charts and contribution graph | None                                                                    | The fixed stack's TanStack Charts and a dashboard-owned contribution graph need tokenized axes/gridlines/legends/tooltips. No chart palette, legend, or heatmap/contribution component exists in the published inventory. [P]                                                |
| Animated values / feedback    | `animated-number`, `toast`; loaders/spinner/progress exports exist      | AnimatedNumber rounds to a nonnegative integer and defaults to 600ms digit motion: not suitable as-is for precise cost/fractional metrics. Do not use spinners, skeletons, loading button variants, or delayed-value animations to conceal cache misses. [Numbers] [Buttons] |

### Short style guide distilled from `packages/app`

- **Shell:** deep neutral background, compact persistent title/navigation strip, inset base-colour content surfaces. OpenCode's web titlebar is effectively 36px (28px + 8px safe-area clearance); settings surfaces use 8px exterior insets, 10px radius, and `--v2-elevation-raised`. Mirror the visual structure, not native desktop traffic lights, session tab mutations, or extension infrastructure. Keep the dashboard shell mounted across route changes. [AppShell] [AppProviders]
- **Navigation:** muted 28px rows with 4px radii, 6px inner padding and gaps, layer-03 selected fill, tokenized hover wash. Use icon + label where useful; use actual links for dashboard destinations and Tabs for local panels. This is a desktop-like compact UI, not a large marketing page. [AppNav] [Tabs]
- **Typography:** Inter for UI; default body 13px/440. Library baseline is 13/14/16/20px, regular 400 and medium 500; current controls often explicitly use 440. Compact/base line heights are 16/20px. IBM Plex Mono is the code face. Use tabular numerals for aligned statistical values; choose a larger KPI size deliberately rather than adopting a whole different typographic scale. [AppType] [CSS] [Segments]
- **Spacing / density:** use the library's 4px spacing unit; 8–16px control/row gaps, 24px ordinary content padding, and restrained 4–10px rounding are sensible dashboard defaults. Current select and segmented controls are 28px high with 6px radii. Wider settings margins are page-specific, not a universal rule. [CSS] [Select] [Segments] [AppNav]
- **Colour / elevation:** consume semantic `--v2-background-bg-*`, `--v2-text-text-*`, `--v2-border-border-*`, `--v2-icon-icon-*`, `--v2-state-*` and `--v2-elevation-*`, not hard-coded light/dark greys. Use muted/faint text for secondary labels, subtle borders, neutral surfaces, and blue accent sparingly. Chart series/heatmap levels are **new design work**: derive dashboard tokens from available ramps, test both schemes, and do not misuse danger/success states to mean ordinary categories. [Tokens]
- **Icons / interaction:** use shipped 14/16/20px icons, ghost icon controls for quiet actions, tokenized focus rings, short hover/press transitions, portalled menus/tooltips, and keyboard hints near the action. Kobalte supplies behavior/ARIA primitives, but component names and keyboard reachability still need dashboard tests. [Icons] [Buttons] [Overlays] [Kobalte]
- **Motion:** controls use about 80–120ms transitions/menu animations; application panel transitions are around 160–240ms. Mirror restrained movement, honour reduced motion, and never delay statistics or navigation behind animation. Upstream includes reduced-motion handling in some components, **not every control stylesheet**; add it for new dashboard animation. The map's no-loading-state rule overrides upstream loaders and shimmer. [Select] [Segments] [AppMotion] [Numbers]

## Verification detail

### Sources and scope

Researched on 2026-10-01. Read-only OpenCode checkout: branch `v2`, commit `8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43`. Its UI and application manifests both report `2.0.21`. Source files researched here were not modified. The published tarball was obtained with `npm pack @opencode/ui@2.0.21` **outside this repo**, then unpacked and separately installed by the spike. Registry artifact: [official npm tarball](https://registry.npmjs.org/@opencode/ui/-/ui-2.0.21.tgz); SHA-1 `b3fc5704efeca16e6dbda2ad8b674a25f4bfb8ea`, packed 2,669,082 bytes, unpacked 5,928,323 bytes. [P]

No OpenCode database was accessed. All rendered numbers and labels were synthetic. Adoption concerns only the dashboard; it adds no coupling between plugin mode or standalone mode and OpenCode's UI runtime, and changes nothing about the OpenCode database or stats store.

The checkout is **not byte-identical to the npm artifact** despite its manifest version: `context/dialog.tsx`, `project-avatar.tsx`, `navigation/tabs/tabs.css`, `styles/tailwind/index.css`, and `styles/theme.css` differ. For example, the checkout adds a GUI-extension `@source`, absent in npm; the checkout has a bold font token, absent in npm. Published component consumption was checked against the tarball, with checkout citations used for application conventions. Tests/stories and some original asset directories are intentionally omitted from npm. [P] [CSS]

### Throwaway spike results

Location: `$OPENCODE_TEMP/scratch-opencode-ui-adoption/` (outside the repository/worktree). Essential sources are quoted above and below rather than added as workspace code; no lockfiles, generated bundles, dependencies, or screenshots are committed.

| Layer                           | Versions                                                                        | Result                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/tooling                 | macOS arm64, Node `24.15.0`, npm `11.19.1`                                      | npm install succeeded; no unpublished-package resolution. Bun `1.4.2` used only for the research worktree's existing dependencies/hooks.                                                                                               |
| UI / peers / optional mono font | UI `2.0.21`, Solid `1.9.15`, Meta `0.29.4`, Kobalte `0.13.13`, IBM Plex `6.4.1` | Buttons, Card, SegmentedControl, Select, Tooltip, Keybind, Popover rendered. Fonts resolved through CSS imports.                                                                                                                       |
| Plain build                     | Vite `8.2.2`, Solid plugin `2.11.14`, Tailwind/plugin `4.3.3`                   | Production build passed without UI patching or custom include/exclude settings.                                                                                                                                                        |
| Browser                         | Playwright `1.58.2`, Chromium `145.0.7632.6`                                    | Both schemes rendered `oc-2`. Light base surface `rgb(255,255,255)`, dark `rgb(22,22,22)`; `gap-4` = 16px, `p-6` = 24px, body Inter 13px, font-load check passed.                                                                      |
| Interactions                    | Same browser/build versions                                                     | Segment selection, model selection, popover open/Escape dismissal, and tooltip hover passed; zero page errors. Screenshots of both schemes were inspected.                                                                             |
| Start SSR / hydration           | Start `1.168.57`, Router `1.170.38`, same UI/build versions                     | Client/server builds passed. With explicit SSR non-externalization, built server `fetch(Request)` returned HTTP 200 with actual heading/button markup; dev SSR hydration, light/dark toggles and tooltip worked with zero page errors. |
| TypeScript                      | `5.8.2`                                                                         | Strict consumer check passed with the repo's existing `skipLibCheck: true`; see third-party declaration defect below.                                                                                                                  |

**Errors, corrections, and limits:**

- Plain Vite's first build had no errors. A source-level API mistake in the initial demo (`Keybind keybind=` instead of `keys=`) was corrected before final verification. Vite does not replace TypeScript checking. [Keys] [Spike]
- An initial automated check looked for Select as a combobox; its actual trigger is a Kobalte `div` with `role="button"`, `aria-haspopup="listbox"`, and keyboard focus. The check was corrected; selection worked. This was a test-selector error, not a library defect. [Select]
- Chromium was not installed for the selected Playwright version; `npx playwright install chromium` supplied it. This is test tooling, not a dashboard dependency.
- Installing Router at Start's exact `1.168.57` failed (`ETARGET`, no such Router release). Installing the independently published Router `1.170.38` succeeded.
- **SSR trap:** Start's unmodified config built successfully but actual requests rendered its error boundary: `Client-only API called on the server side...`, originating in Kobalte's precompiled DOM chunk. The response was still HTTP 200, so status alone was a false success. The error reproduced even after giving the nested spike its own dependency manifest. `ssr.noExternal: ["@opencode/ui", "@kobalte/core"]` fixed it: Vite resolves Kobalte's `solid` JSX export and Solid compiles for SSR. Package-only configuration without this fix still failed. [SSR] [KobaltePackage] [Spike]
- **Nested dev assets:** final server-log review exposed Inter 403 responses in the nested Start spike, despite zero JavaScript page errors. Its dependency directory was outside Vite's serving allowlist. Allowing the scratch parent with `server.fs.allow: [".."]` fixed this; a repeated browser check waited for hydration/network idle, loaded Inter successfully, observed font HTTP 200/304, and found zero HTTP errors/page errors. Production font bundling and plain Vite font loading had already passed. This is a nested-root development setup issue, not an npm packaging defect. [DevAssets] [Spike]
- Strict checking **without** `skipLibCheck` reported four TS2693 errors in Kobalte `0.13.13`'s `dist/index-79050fd4.d.ts:6–9` (`typeof` applied to type-only button props). The consumer check passes with the repository's already-existing `tsconfig.base.json:9` setting; no gate/type setting was changed. Upstream correction/newer Kobalte compatibility is **unverified**. [KobaltePackage]
- OpenCode's own Vite config contains a Tailwind `4.3.3` dev `hotUpdate` guard for an absent `context.server`; the spike did not reproduce that error. Do not copy its worker/session/mermaid configuration. Add the specific guard only if the dashboard reproduces it. [Build]
- Aggregate initial plain-build output was approximately **206.49 kB CSS / 35.99 kB gzip** and **272.21 kB JS / 80.03 kB gzip**, plus lazy theme chunks and font assets. The global styles import KaTeX CSS/fonts even though the dashboard demo did not render math. Included Inter was about 874.70 kB and terminal Nerd Font about 1,060.58 kB; the optional IBM text face about 46.22 kB. These are artifact sizes, not downloaded-transfer totals or a startup benchmark. Only referenced font faces are normally needed by the browser; omit unused terminal font declarations. [CSS] [Fonts] [Spike]
- ThemeProvider uses Vite's `import.meta.glob` for available theme JSON; default `oc-2` is eagerly imported, other themes have lazy chunks. Keeping the default theme avoids an asynchronous theme acquisition on first use. A pre-paint scheme script is still needed for flash-free dark startup. SSR/system-theme first-paint, full accessibility, Safari/Firefox, final chart integration, and the map's next-frame/1s targets are **not established by this spike**. [Theme] [Preload]

Representative verified controls:

```tsx
import { createSignal } from "solid-js";
import { useTheme } from "@opencode/ui/theme/context";
import { Button } from "@opencode/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { Select } from "@opencode/ui/select";
import { Keybind } from "@opencode/ui/keybind";

function Controls() {
  const theme = useTheme();
  const [range, setRange] = createSignal<string | null>("Week");
  const [model, setModel] = createSignal("All models");
  return (
    <>
      <Button onClick={() => theme.setColorScheme("dark")}>Dark</Button>
      <Button onClick={() => theme.setColorScheme("light")}>Light</Button>
      <SegmentedControl aria-label="Time range" value={range()} onChange={setRange}>
        <SegmentedControlItem value="Today">Today</SegmentedControlItem>
        <SegmentedControlItem value="Week">Week</SegmentedControlItem>
      </SegmentedControl>
      <Select
        aria-label="Model filter"
        options={["All models", "Example model"]}
        current={model()}
        onSelect={(next) => {
          if (next) setModel(next);
        }}
      />
      <Keybind keys={["⌘", "K"]} />
    </>
  );
}
```

### Release tracking and pinning risk

UI releases follow the **shared OpenCode release version**, not an independently demonstrated design-system compatibility policy. The root publish script rewrites all package versions from `Script.version` and publishes UI in the same release pipeline; the UI publisher skips an already-published version. Its packer emits declaration files, changes TypeScript exports to `{ types, import }`, and packs source for execution. npm `2.0.21` was published 2026-09-30T23:05:15.959Z. [Release] [P]

**Recommendation:** exact-pin `@opencode/ui` to `2.0.21` with a lockfile and review upgrades deliberately. This freezes the dashboard's compiled UI baseline; it does **not** require the installed OpenCode database producer to remain at `2.0.21`. Risks: frozen bugs/assets/transitive versions and visual drift from later OpenCode; patch upgrades can carry source/CSS/token changes because the release version belongs to the whole product. No independent guarantee of backwards-compatible component APIs, token names, or supported external consumers was found: **unverified**, not promised. The observed checkout/npm differences make tag/tarball verification essential. [Release] [P]

For each upgrade, re-run production build, actual Start SSR + hydration, dark/light visual checks, keyboard interaction, declaration checking, and asset/payload inspection. Keep dashboard code on exported subpaths and semantic tokens; do not vendor implementation internals. This is a recommendation based on the observed source distribution and failures, not a claim that upstream guarantees those seams.

## Primary-source citations

`npm UI` below means the exact unpacked `@opencode/ui@2.0.21` artifact; URLs show the corresponding version-pinned file. Line ranges refer to those files. `OpenCode v2` links are pinned to the read checkout commit, not the moving branch. No secondary write-ups were used.

- **[P]** [npm UI `package.json`](https://unpkg.com/@opencode/ui@2.0.21/package.json), lines 14–34 (published files), 35–220 (exports), 242–260 (dependencies/peers); [npm registry metadata](https://registry.npmjs.org/@opencode%2fui/2.0.21) (artifact integrity/version), [release timestamps](https://registry.npmjs.org/@opencode%2fui) (`time["2.0.21"]`). Import scan of published `src/**/*.{ts,tsx}` found only `@opencode/ui` self-imports under the `@opencode` scope; no unpublished sibling imports.
- **[CSS]** npm UI [`styles/tailwind/index.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tailwind/index.css):1–26,52–95 (imports, scanning, theme); [`styles/index.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/index.css):1–37 (base/components/KaTeX); [`styles/tokens/index.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tokens/index.css):1–2; [`styles/theme.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/theme.css):1–50 (fonts/sizes/spacing/radii); [`styles/base.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/base.css):7–36,160–164 (reset/table base).
- **[Tokens]** npm UI [`styles/tokens/theme.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tokens/theme.css):5–70,105–140,260–304,386–448 (semantic tokens, typography, schemes); [`styles/tailwind/colors.css`](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tailwind/colors.css) (semantic utility mappings).
- **[Theme]** npm UI [`theme/context.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/theme/context.tsx):7–29,86–159,174–197,262–292,317–332 (JSON/glob, fallback, persistence, application, scheme API).
- **[Fonts]** npm UI [`components/font.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/font.tsx):1; package manifest lines 30–32,219–220; OpenCode v2 [`packages/app/src/index.css`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/index.css#L1-L26):1–26 (styles/fonts); [`packages/app/package.json`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/package.json#L62):62 (`@ibm/plex`).
- **[AppType]** OpenCode v2 [`packages/app/src/app.tsx`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/app.tsx#L38-L43):38–43 (body typography); [`settings/model.tsx`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/settings/model.tsx#L19-L26):19–26,280–288 (font defaults/application).
- **[AppProviders]** OpenCode v2 [`packages/app/src/app.tsx`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/app.tsx#L48-L100):48–100 (providers; persistent router-root layout). The spike proves the smaller consumer provider set.
- **[Preload]** OpenCode v2 [`packages/app/public/oc-theme-preload.js`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/public/oc-theme-preload.js#L1-L33):1–33; [`packages/app/vite.js`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/vite.js#L73-L88):73–88 (inline pre-paint preload). Dashboard implementation should guard storage access rather than assume it is available.
- **[Build]** OpenCode v2 [`packages/app/vite.js`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/vite.js#L1-L19):1–19,49–82; [official Solid Vite plugin documentation](https://github.com/solidjs/solid-vite-plugin#readme); [official Tailwind Vite installation](https://tailwindcss.com/docs/installation/using-vite).
- **[TW]** [Official Tailwind source-detection docs](https://tailwindcss.com/docs/detecting-classes-in-source-files), especially explicit registration, `source(none)`, ignored dependencies, and literal complete class names.
- **[SolidTS]** [Official Solid TypeScript configuration](https://docs.solidjs.com/configuration/typescript#configuring-typescript).
- **[Start]** [Official TanStack Start Solid from-scratch guide](https://tanstack.com/start/latest/docs/framework/solid/build-from-scratch), plugin order, SSR Solid configuration, root route, TS settings and `verbatimModuleSyntax` warning.
- **[SSR]** [Official Vite SSR options](https://vite.dev/config/ssr-options#ssr-noexternal); [official Kobalte SSR guide](https://kobalte.dev/docs/core/overview/ssr); [published Solid Vite plugin `2.11.14`](https://unpkg.com/vite-plugin-solid@2.11.14/dist/esm/index.mjs):136–159,172–199 (SSR resolution/compilation).
- **[DevAssets]** [Official Vite dev-server filesystem allowlist docs](https://vite.dev/config/server-options#server-fs-allow), workspace-root detection and narrow `allow` extensions.
- **[KobaltePackage]** [Kobalte `0.13.13` manifest](https://unpkg.com/@kobalte/core@0.13.13/package.json):32–43 (Solid JSX vs default JS exports); [`dist/chunk/BK63AFY4.js`](https://unpkg.com/@kobalte/core@0.13.13/dist/chunk/BK63AFY4.js):3,19 (DOM template); [`dist/index-79050fd4.d.ts`](https://unpkg.com/@kobalte/core@0.13.13/dist/index-79050fd4.d.ts):1–9 (declaration defect).
- **[I18n]** npm UI [`context/i18n.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/context/i18n.tsx):90–120 (English fallback/optional provider).
- **[Dialogs]** npm UI [`context/dialog.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/context/dialog.tsx) (dialog service/provider), [`overlays/dialog/dialog.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/overlays/dialog/dialog.tsx):1–16,87–108 (context/layer dependence).
- **[Layout]** npm UI [`components/dock-surface.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/dock-surface.tsx):1–54; [`components/scroll-view.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/scroll-view.tsx):7–27; package exports/files for divider and resize-handle.
- **[Card]** npm UI [`components/card.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/card.tsx):4–20,38–123; [`components/card.css`](https://unpkg.com/@opencode/ui@2.0.21/src/components/card.css):1–48,84–88.
- **[Tabs]** npm UI [`navigation/tabs/tabs.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/navigation/tabs/tabs.tsx):1–43,188–194 (Kobalte/variants/parts).
- **[Segments]** npm UI [`navigation/segmented-control/segmented-control.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/navigation/segmented-control/segmented-control.tsx):33–43,158–198; [`segmented-control.css`](https://unpkg.com/@opencode/ui@2.0.21/src/navigation/segmented-control/segmented-control.css):5–65.
- **[Select]** npm UI [`forms/select/select.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/forms/select/select.tsx):54–72,129–145,184–217; [`select.css`](https://unpkg.com/@opencode/ui@2.0.21/src/forms/select/select.css):9–24,50–73.
- **[List]** npm UI [`components/list.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/list.tsx):35–49,90–114 (filtered picker API).
- **[Overlays]** npm UI [`overlays/tooltip/tooltip.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/overlays/tooltip/tooltip.tsx):7–16,94–100,128–149; [`components/popover.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/popover.tsx):9–20,139–151; tooltip CSS lines 97–102 (reduced motion).
- **[Buttons]** npm UI [`actions/button/button.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/actions/button/button.tsx):6–21,24–40 (sizes/variants/icon/CSS import).
- **[Keys]** npm UI [`data-display/keybind/keybind.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/data-display/keybind/keybind.tsx):4–29.
- **[Icons]** npm UI [`icons/icon/icon.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/icons/icon/icon.tsx):283–320; [`components/provider-icon.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/provider-icon.tsx):1–25; manifest lines 27–31 (assets).
- **[Favicon]** npm UI [`components/favicon.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/favicon.tsx):1–13; manifest lines 17–34 (published asset allowlist).
- **[Numbers]** npm UI [`components/animated-number.tsx`](https://unpkg.com/@opencode/ui@2.0.21/src/components/animated-number.tsx):4–5,65–69; [`animated-number.css`](https://unpkg.com/@opencode/ui@2.0.21/src/components/animated-number.css):78 onward (reduced motion).
- **[AppShell]** OpenCode v2 [`packages/app/src/shell/shell.tsx`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/shell/shell.tsx#L19-L83):19–83; [`shell/titlebar/titlebar.tsx`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/shell/titlebar/titlebar.tsx#L124-L149):124–149; [`settings/settings.css`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/settings/settings.css#L8-L23):8–23.
- **[AppNav]** OpenCode v2 [`packages/app/src/settings/settings.css`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/settings/settings.css#L69-L145):69–145.
- **[AppMotion]** OpenCode v2 [`packages/app/src/index.css`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/app/src/index.css#L82-L146):82–146 (panel transitions and reduced motion).
- **[Kobalte]** [Official Kobalte introduction](https://kobalte.dev/docs/core/overview/introduction) (unstyled, composable, accessibility behavior).
- **[Release]** OpenCode v2 [`script/publish.ts`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/script/publish.ts#L19-L28):19–28,81–82; [`packages/ui/script/publish.ts`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/ui/script/publish.ts#L11-L23):11–23; [`packages/ui/script/pack.ts`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/ui/script/pack.ts#L16-L36):16–36.
- **[Spike]** Direct experimental results from the throwaway setup, versions/commands/configuration and assertions recorded in this document. They establish only the paths listed, not untested dashboard performance or future dependency compatibility.
