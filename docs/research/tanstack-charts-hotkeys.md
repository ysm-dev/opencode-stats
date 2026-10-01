# TanStack Charts and Hotkeys in Solid

Research for [#8](https://github.com/ysm-dev/opencode-stats/issues/8), under [map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Verified 2026-10-01. Synthetic data only; no OpenCode database was accessed.

## Direct answer

The fixed stack can cover the dashboard's requested charts and shortcuts, **but Charts 0.18.0 is not an out-of-the-box Solid SSR solution in its published form**, and an annual stacked-bar cold mount missed a 60 Hz frame budget in the spike. Do not equate cached data or disabled animation with a guaranteed next-frame view.

Exact evaluated packages: `@tanstack/charts@0.18.0`, `@tanstack/solid-charts@0.18.0`, `@tanstack/solid-hotkeys@0.12.1`, **`@tanstack/hotkeys@0.10.1`**. The requested core Hotkeys 0.12.x does not exist in the observed published version list. Adapter 0.12.0 depends on core 0.10.0; adapter 0.12.1 depends on core 0.10.1. These are different version tracks, not interchangeable pins. [C-package] [H-package] [H-changes]

### Charts capability matrix

The core owns definitions, geometry, scales and interaction; the Solid adapter mounts/updates them and exposes Solid tooltip composition and callbacks. Both `@tanstack/solid-charts` and `@tanstack/charts/solid` are published entries. [C-package] [C-adapter]

| Need                             | Support at 0.18.0                                                                                                                                                                                              | Dashboard work / qualification                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bar, stacked bar, horizontal bar | Built-in `barY`, `barX`; implicit stacks or explicit `stack({ order, offset })`; grouping also available. [C-bars]                                                                                             | Supply aggregated rows, stable keys, series order, units and zero-baseline policy. Stacked time-axis bars rendered in the spike.                                                                                                         |
| Line, area                       | Built-in `lineY`/`lineX`, `areaY`/`areaX`; area stacking supported. [C-lines]                                                                                                                                  | Sort chronological rows, decide gaps and series grouping. A five-series time-axis line rendered in the spike.                                                                                                                            |
| Combined                         | Layer marks in one definition; named scales allow different mappings/axes. [C-scales] [C-lines]                                                                                                                | Compose the desired bar/line/area combination; no separate combined-chart component is necessary. Product owns whether multiple units/axes are appropriate.                                                                              |
| Donut                            | Opt-in `@tanstack/charts/polar`: `pie` allocates angles, `polar` + `radialArc` draw them; set nonzero `innerRadius`. [C-polar]                                                                                 | Compose the definition, label/format values and preserve semantic slice keys; no custom arc renderer needed.                                                                                                                             |
| Time axis, local ticks           | Pass `d3-scale`'s `scaleTime` or `scaleUtc`; `axis.ticks` supports count, explicit values and formatters. Compact scales have no temporal tick generator. [C-scales]                                           | For browser-local calendar ticks use `scaleTime`; explicitly format axes, crosshair and tooltips. For another selected timezone, formatting alone does not change tick boundaries.                                                       |
| Tooltips and crosshair           | Opt-in `tooltip`, grouped focus (`group-x`), `crosshair` mark, pointer/keyboard focus, pinning; `renderTooltipBody` supports Solid components. [C-focus] [C-adapter]                                           | Default tooltip dates are UTC ISO, not local dates. Override formatting; bridge richer content to `@opencode/ui`. Hover and five-series tooltip were verified.                                                                           |
| Legends                          | `colorLegend`, gradient/discrete forms, and controlled `interactiveColorLegend`. The latter renders native pressed-state buttons in the browser and a static fallback on the server. [C-legends]               | Store visible series in dashboard state. Ordinary visual legends are accessibility-hidden; provide essential category meaning elsewhere.                                                                                                 |
| Click to filter                  | `onSelect(point)` for pointer or keyboard activation; `onFocusChange`/`onFocusGroupChange` for hover/focus. [C-adapter] [C-focus]                                                                              | Translate `point.datum` into dashboard filters/Router search state and cached queries. No automatic server query/filter integration. Click returned the expected synthetic row in the spike.                                             |
| CSS-variable theming             | Inherited `currentColor`, transparent background, `--ts-chart-1` through `--ts-chart-6`, explicit palette/theme, tooltip CSS variables. [C-theme]                                                              | Alias actual `@opencode/ui` tokens in dashboard CSS; stable series-to-color mapping remains ours. Changing an aliased variable changed SVG paint without rebuilding the definition. Exact OpenCode token names were not researched here. |
| Disable animation                | Default SVG animation is opt-in; set `svgAnimation: false`, do not select the optional `motion()` renderer. Static SVG does not animate. [C-animation]                                                         | Also avoid dashboard CSS transitions for next-frame changes. The spike used `false`; disabling animation does not eliminate scene/layout/DOM work.                                                                                       |
| Typical rendering cost           | See measurements below: annual line update p95 2.2 ms; annual stacked-bar update p95 12.7 ms, cold mount p95 20.7 ms.                                                                                          | Bound rendered rows/series and total charts per view. Benchmark full navigation/filter changes; prewarming and weekly/monthly bins are candidate mitigations, not proven solutions.                                                      |
| SSR / prerender                  | Source/docs advertise complete Solid server SVG and shared hydration. **Published browser-compiled Solid entries throw on Node server import.** Core static SVG works without DOM. [C-SSR] [C-published-solid] | Resolve this packaging gap before specifying normal Solid Start SSR. A client-only import is not a no-loading-state solution by itself; pre-rendered visible SVG plus client adoption would need deliberate integration.                 |
| Bundle                           | ESM, `sideEffects: false`, narrow capability subpaths, optional Canvas/motion/polar. Measured browser fixture: 173,009 B minified / 60,934 B gzip including Solid and temporal scale. [C-package] [C-bundle]   | Measure actual dashboard chunks; avoid interpreting npm package footprint as browser download size.                                                                                                                                      |
| API stability                    | Official Alpha; 0.x minors may break APIs; no guaranteed deprecation window. 0.16.0 replaced old scale properties with `scales.x/y`, among other changes. [C-stability]                                        | Exact pins, a small dashboard-owned definition boundary, upgrade tests for types, rendering, interactions and SSR.                                                                                                                       |
| Contribution graph               | **Supported as a composition**, not a prebuilt calendar widget. The pinned catalog includes `118-token-usage-calendar`, using `cell`, band scales, color levels, month ticks and tooltip. [C-calendar]         | Generate complete local-date/week/weekday rows, zero days, thresholds, labels and accessible meaning. Its example is UTC; do not copy its calendar calculations unchanged. SVG/CSS-grid from scratch is optional, not required.          |

### Hotkeys capability matrix

The headless core supplies matching, sequences, recording, formatting, registries and conflicts. The Solid adapter supplies reactive registration/options and cleanup; it does not supply a dashboard shortcut dialog or a Router binding. [H-package] [H-sequence] [H-help]

| Need                         | Support in Solid 0.12.1 / core 0.10.1                                                                                                                                                                                                                                | Dashboard work / qualification                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key sequences, e.g. `g p`    | `createHotkeySequence(['G', 'P'], callback)`; per-step modifiers, configurable timeout (default 1,000 ms). Modifier-only events, repeats and IME composition do not advance sequences. [H-sequence]                                                                  | Choose nonambiguous bindings and timeout. Normal sequence fired once; a 1,100 ms inter-step delay did not fire in the spike.                                                                                                                                                                                                                |
| Scopes                       | Element/document/window `target`, reactive `enabled`, component disposal cleanup; provider defaults. No named-scope stack is present in `HotkeyOptions`. Metadata `group` is presentation only. [H-options] [H-sequence] [H-help]                                    | Use focused element targets and/or reactive enabled policies for routes, dialogs and charts. Explicitly disable global navigation while a dialog owns keys. Scoped, disabled, reenabled and disposed registrations were verified.                                                                                                           |
| Text-input conflicts         | `ignoreInputs`; detects input, textarea, select and contenteditable, including focused elements/composed event paths. Button-type inputs are excluded. Smart default ignores bare keys/Shift/Alt, but **Ctrl/Meta and Escape fire in inputs**. [H-input] [H-options] | Set `ignoreInputs: true` explicitly for dashboard navigation/action shortcuts. A bare `g p` typed into an input did not fire. Do not assume every modifier shortcut is suppressed by default.                                                                                                                                               |
| Registration conflicts       | `warn` (default, both handlers can fire), `error`, `replace`, `allow`; `findHotkeyConflicts` can inspect equivalent and sequence-prefix conflicts across overlapping targets. [H-conflicts]                                                                          | Prefer `error` for duplicate owned bindings and an explicit prefix-conflict check. Registry checks cannot see unmounted routes, browser/OS shortcuts or third-party listeners; no automatic arbitration across all layers.                                                                                                                  |
| Platform modifiers / layouts | `Mod` = Command on macOS, Control on Windows/Linux; logical keys and typed physical codes (`Mod+[KeyK]`); `formatForDisplay` supports symbols/parts/labels. [H-platform] [H-changes]                                                                                 | Decide logical vs physical identity. Display verified as `⌘ K` on macOS / `Ctrl+K` on Linux; actual Meta+K fired in Chromium on macOS. Linux/Windows/non-QWERTY hardware was not tested.                                                                                                                                                    |
| Discoverable cheat sheet     | `createHotkeyRegistrations()` exposes reactive single/sequence views, including `meta.name`, `description`, `group`; formatting and held-modifier hint primitives are available. [H-help]                                                                            | Build an accessible `@opencode/ui` help dialog, visible help affordance and open-help binding. Mounted registrations alone cannot list actions on unmounted pages: use an explicit product action list if the sheet must show every page's shortcuts. Devtools are not a user-facing cheat sheet.                                           |
| TanStack Router navigation   | Callback-based integration; official React kitchen sink calls `navigate` from sequences. Solid registration lifetime follows its component owner. [H-router] [H-sequence]                                                                                            | Register global page sequences once in the persistent dashboard layout; call the Solid Router navigation function. Register route-local shortcuts in route components and dispose/disable them appropriately. Hotkeys neither preloads route data nor guarantees next-frame navigation. Solid Router end-to-end integration was not spiked. |
| SSR and runtime              | Published packages are ES2022 ESM-only, Node >=20; Solid sequence registration resolves no document on the server. Node import/setup succeeded. [H-package] [H-sequence]                                                                                             | No server key listeners. Pass stable platform information for prerendered shortcut labels if necessary; default platform detection can differ from the browser. [H-platform]                                                                                                                                                                |
| API stability                | Pre-1.0 changes already include logical/physical union types and recorder defaults in adapter 0.11, then removal of CommonJS/source-map exports in 0.12. [H-changes]                                                                                                 | Pin adapter and its actual core version; do not assume Charts and Hotkeys version tracks move together.                                                                                                                                                                                                                                     |

### Gaps and notable risks

1. **SSR packaging is the biggest integration blocker.** Verify a corrected release or an upstream-supported packaging solution before promising Solid Start chart SSR/hydration. The source implementation alone is insufficient evidence of the installed package's server behavior.
2. **Next-frame performance is not supplied by either library.** The stats store and query cache supply ready data; charts still consume CPU and DOM time. Annual stacked bars alone consumed more than a 60 Hz cold-mount budget. Multiple charts, route disposal/remount, font measurement and responsive resizing require dashboard-level measurement.
3. **Local calendar semantics are dashboard policy.** Use consistent local-day aggregation from the stats store, local calendar iteration (not adding 86,400,000 ms), tick generation and tooltip formatting. The contribution example and default tooltip use UTC. SSR locale/timezone defaults must not silently follow the server when it differs from the user's browser. [C-scales] [C-focus] [C-calendar] [C-SSR]
4. **Custom work is composition and product state, not chart geometry:** contribution-calendar data/labels, chart-to-filter callbacks, CSS token aliases, help dialog, route/modal shortcut policy and cache-aware navigation. These frontend responsibilities apply equally to plugin mode and standalone mode; neither library needs access to the OpenCode database.
5. **Accessibility is not solved by having SVG and shortcuts.** Supply chart names/descriptions, readable category meaning, accessible filter controls/help, and test keyboard focus without collisions between chart navigation, dialog behavior and global hotkeys. Ordinary legends/crosshair are visual guidance, not a complete textual alternative. [C-adapter] [C-legends] [C-focus]

## Evidence: published packages versus documentation

Pinned Charts repository: [`015f5f26dd3242e5eff4e45d4afd9c56e015865c`, tag `v0.18.0`](https://github.com/TanStack/charts/tree/015f5f26dd3242e5eff4e45d4afd9c56e015865c). Pinned Hotkeys repository: [`536da97c6a91080cdecf13d74103dcd4a3d3529f`, tag `@tanstack/solid-hotkeys@0.12.1`](https://github.com/TanStack/hotkeys/tree/536da97c6a91080cdecf13d74103dcd4a3d3529f). All documentation/source links below use these commits, not unreleased `main`. The live [Charts overview](https://tanstack.com/charts/latest/docs/framework/solid/overview) explicitly warns that live docs follow unreleased main.

Inspected the four installed packages' export maps, runtime files and declarations in `node_modules/@tanstack/*`, installed with npm **outside** this repository. The published Solid Charts adapter pins core Charts 0.18.0 and accepts Solid >=1.8; Solid Hotkeys pins core Hotkeys 0.10.1 and accepts Solid >=1.7.0. [C-package] [H-package]

### SSR reproduction

Node 24.15.0, native ESM resolution, no browser globals:

```sh
node --input-type=module -e "await import('@tanstack/solid-charts')"
node --input-type=module -e "await import('@tanstack/charts/solid')"
```

Both failed with `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` The standalone adapter stack pointed to `@tanstack/solid-charts/dist/index.js:7:23`, which invokes Solid's browser `template()` at module initialization. Both export maps select browser-compiled JavaScript, with no separate server entry. [C-published-solid] This is narrower than claiming every possible custom bundler setup fails: a complete TanStack Start build/hydration test was **not performed**.

The contrasting core test imported `createChartRuntime`, `renderChartSvg`, `defineChart`, `lineY` from `@tanstack/charts`, built a two-point scene at 900 × 360, and produced a 6,277-character `<svg>` string without a DOM. The source adapter calls `adapter.prerender()` and owns mount/update/cleanup, matching the intended source-level SSR design. [C-SSR] [C-adapter] A dashboard-specific visible SVG/server-to-client handoff is therefore plausible, **not verified**; simply substituting a client-only component would not satisfy the map's ban on loading states.

Native Node import of `@tanstack/solid-hotkeys` plus `createHotkeySequence(['G', 'P'], () => {})` succeeded without a document. Actual server-rendered help-label hydration parity was not tested.

## Evidence: throwaway Solid browser spike

Scratch location: `/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode/scratch-tanstack-charts-hotkeys/`. No spike dependencies or generated output were put under repository `packages/` or committed. Essential source and method are quoted here.

### Environment and method

- macOS, Apple M4 (10 cores), 16 GB RAM; one headless Chromium **153.0.8010.12** browser, driven by Playwright. The desktop browser tool was unavailable; no desktop-browser measurements are claimed.
- Charts/adapter **0.18.0**, Hotkeys core **0.10.1**, Solid adapter **0.12.1**, Solid **1.9.15**, `d3-scale` **4.0.2**, Vite **8.3.1**, `vite-plugin-solid` **2.11.14**. Production `vite build`, then `vite preview`; no dev/HMR cost included.
- Browser viewport 1,000 × 700; explicit timezone `America/Los_Angeles`; charts fixed at 900 × 360. Five synthetic series; one local-midnight row per series per day; no dots on lines. Tooltip, crosshair, axes and legend enabled, `svgAnimation: false`.
- Each type/size used two discarded warmups and **20 retained samples**. Start work in a `requestAnimationFrame` callback. Mount: time around Solid `render` (including definition creation, initial SVG and mount effects) plus forced container layout. Update: prebuild changed synthetic rows, then time the setter plus forced layout. This includes definition/scene/DOM work but excludes row generation for updates, HTTP, query lookup and navigation. Old-chart disposal precedes the mount timer.
- `performance.now()` durations; median below is the upper middle sample, p95 is nearest-rank sample 19/20. A follow-up rAF callback was also timed, but **rAF is not a paint-completion measurement**. No GPU trace, screenshot-paint deadline, cold-download or full-dashboard benchmark is claimed. These are warmed-code cold-component mounts, not process startup.

| Chart       | Daily points × series | SVG descendants | Mount median / p95 | Update median / p95 |
| ----------- | --------------------- | --------------: | -----------------: | ------------------: |
| Line        | 30 × 5                |              59 |       1.4 / 1.6 ms |        0.9 / 1.0 ms |
| Line        | 365 × 5               |              59 |       3.4 / 4.6 ms |        1.9 / 2.2 ms |
| Stacked bar | 30 × 5                |             200 |       2.6 / 3.1 ms |        1.6 / 1.7 ms |
| Stacked bar | 365 × 5               |           1,875 |     18.2 / 20.7 ms |      10.7 / 12.7 ms |

Recorded update-to-following-rAF median/p95: line 30 days 15.6/22.7 ms; line 365 days 19.8/21.6 ms; bar 30 days 16.3/22.3 ms; bar 365 days 13.6/20.4 ms. These scheduling intervals are not interchangeable with render cost and do not prove next-frame visible paint. The 365-day bar's synchronous mount already exceeds 16.7 ms, leaving no room for the rest of a 60 Hz view.

Practical implication: an annual line is much cheaper than 1,825 SVG bar rectangles. Keeping chart instances mounted, using fewer visible bins/series, or opt-in Canvas are possible avenues; **none was benchmarked as a dashboard solution**. Mixed Canvas marks are supported by the source/docs, but their SSR/hydration and performance were not tested here. [C-bundle]

### Functional observations

- Both stacked bar and line rendered with a true `scaleTime` x axis. Explicit tick formatting yielded `Jan 1`, `Apr 1`, `Jul 1`, `Oct 1`. Grouped hover produced five values; explicit tooltip formatting displayed `Jun 28`, not the default UTC ISO heading. Clicking selected the synthetic date/series/value datum. Crosshair was rendered on focus.
- `--ts-chart-1: var(--accent)` initially yielded stroke `rgb(255, 136, 0)`; changing only `--accent` to `#123456` yielded `rgb(18, 52, 86)` with the same SVG `stroke="var(--ts-chart-1, #2563eb)"` attribute. This proves CSS aliasing, not integration with an installed OpenCode theme.
- `g p` incremented once; typing `g p` in the focused text input left the count unchanged; Meta+K incremented the action count as expected. Both registrations used explicit `ignoreInputs: true`.
- A target-scoped `g x` sequence had counts **0 outside → 1 inside → 1 disabled → 2 reenabled → 2 after disposal**. A 1,100 ms delay prevented `g p` completion. `findHotkeyConflicts(['G'])` reported both live `G`-prefixed sequences. This validates scope/options/lifecycle and prefix detection, not external browser shortcut detection.
- Local calendar construction across Los Angeles DST produced March 8 `2026-03-08T08:00:00.000Z` and March 9 `2026-03-09T07:00:00.000Z`: **23 hours**, not 24. This verifies the fixture's local dates; full DST/calendar-heatmap correctness remains a dashboard test requirement.

### Essential chart and hotkey source

The scratch `main.tsx` used this definition shape (with a reactive `createMemo` rebuilt from rows):

```tsx
import { Chart } from "@tanstack/solid-charts";
import { barY, lineY, defineChart, stack, colorLegend } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleTime } from "d3-scale";
import { createHotkeySequence } from "@tanstack/solid-hotkeys";

const series = ["A", "B", "C", "D", "E"];
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const rows = Array.from({ length: 365 }, (_, day) =>
  series.map((series, s) => ({
    id: `${day}-${s}`,
    date: new Date(2026, 0, day + 1),
    series,
    value: 20 + s * 5 + (day % 19),
  })),
).flat();
const definition = defineChart({
  svgAnimation: false,
  marks: [
    barY(rows, {
      x: "date",
      y: "value",
      z: "series",
      key: "id",
      layout: stack({ order: series }),
    }),
    // For the line fixture, replace barY with:
    // lineY(rows, { x: 'date', y: 'value', z: 'series', key: 'id' })
    crosshair({ x: { label: true }, y: false }),
  ],
  scales: {
    x: {
      scale: scaleTime,
      axis: {
        ticks: { count: 7, format: (value) => dateFormat.format(value) },
      },
    },
    y: { scale: scaleLinear, grid: true },
  },
  color: { domain: series, legend: colorLegend() },
  focus: "group-x",
  tooltip: {
    use: tooltip,
    formatGroup: (points) =>
      `${dateFormat.format(points[0].datum.date)}\n` +
      points.map((p) => `${p.datum.series}: ${p.datum.value}`).join("\n"),
  },
});
// Inside a Solid component owner, with ready synthetic rows:
createHotkeySequence(["G", "P"], goToProjects, {
  ignoreInputs: true,
  conflictBehavior: "error",
  meta: { name: "Projects", group: "Navigation" },
});
// <Chart definition={definition} width={900} height={360}
//   ariaLabel="Synthetic usage" onSelect={point => ...} />
```

The measurement boundary in scratch `main.tsx` was:

```js
await new Promise((resolve) => requestAnimationFrame(resolve));
const start = performance.now();
// mount: render(() => <Chart ... />, container)
// update: setRows(prebuiltChangedRows), feeding createMemo(definition)
container.getBoundingClientRect();
const synchronousMs = performance.now() - start;
await new Promise((resolve) => requestAnimationFrame(resolve));
const followingRafMs = performance.now() - start;
```

### Bundle measurements

Separate scratch `size.mjs` fixtures used esbuild **0.28.2**, browser platform, ESM output, ES2022 target, conditions `browser`/`solid`, bundling/minification/tree-shaking, no source maps; sizes are output bytes and Node `gzipSync` bytes. These are **whole fixture bundles including shared dependencies**, not marginal adapter sizes:

| Fixture                                                                                          | Minified JS |     gzip |
| ------------------------------------------------------------------------------------------------ | ----------: | -------: |
| Solid exports (`render`, `createSignal`, `createMemo`, `createRoot`)                             |    10,906 B |  4,321 B |
| Callable Solid chart mount; bar/line, stack, legend, crosshair, tooltip, temporal x and linear y |   173,009 B | 60,934 B |
| Callable Solid setup; single/sequence registration, live registries, display formatting          |    32,679 B | 11,413 B |

Do not subtract the entire baseline fixture as an exact marginal cost: retained Solid exports differ. The actual Vite production spike before adding the separate scope/conflict check reported **201.71 kB / 69.79 kB gzip** (rounded decimal kB), including chart/hotkey code, synthetic fixtures and benchmark logic. With that check added, Vite reported 203.28 kB / 70.34 kB gzip. No Router, Query, Start or `@opencode/ui` is included, and no donut/Canvas/motion feature cost was measured.

## Primary-source index

### Charts

- **[C-package]** Published metadata: [`@tanstack/charts@0.18.0/package.json`](https://unpkg.com/@tanstack/charts@0.18.0/package.json), [`@tanstack/solid-charts@0.18.0/package.json`](https://unpkg.com/@tanstack/solid-charts@0.18.0/package.json). Own version, peers, dependencies, `sideEffects`, exports and published files.
- **[C-adapter]** [Solid props reference](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/framework/solid/reference/chart.md#L15-L43); [Solid component source](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/packages/solid-charts/src/Chart.tsx#L26-L98). Own callbacks, initial markup and lifecycle.
- **[C-bars]** [Bar/rect reference](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/reference/marks/bar-and-rect.md#L15-L109). Own stacking, horizontal/vertical bars and temporal-axis bandwidth fallback.
- **[C-lines]** [Line/area reference](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/reference/marks/line-and-area.md); [stacked compositions](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/examples/stacked-and-composition.md#L28-L92).
- **[C-polar]** [Polar reference](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/reference/marks/polar.md#L144-L217). Own pie allocation and radial arc radii.
- **[C-scales]** [Scale ownership and temporal mappings](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/concepts/scales-and-d3.md#L54-L110); [axis tick contract and named scales](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/reference/scales-guides-and-color.md). Exact installed temporal implementation: `node_modules/d3-scale/src/time.js:1-71` (`d3-scale@4.0.2`); the TanStack docs identify its role but do not supply arbitrary-IANA-zone tick generation.
- **[C-focus]** [Tooltips/focus, including UTC defaults and overrides](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/tooltips-and-focus.md#L152-L253); [crosshair and interaction ownership](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/interactions-and-selections.md#L6-L78).
- **[C-legends]** [Legends and color](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/legends-and-color.md#L96-L236).
- **[C-theme]** [Themes and CSS tokens](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/themes-and-styling.md#L6-L45); [tooltip tokens](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/themes-and-styling.md#L215-L256).
- **[C-animation]** [Dynamic data/animation](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/dynamic-data-and-animation.md#L86-L156).
- **[C-SSR]** [Intended SSR/hydration contract, dimensions, deterministic formatters and static renderer](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/ssr-and-hydration.md); [Solid adapter's SSR claims](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/framework/solid/adapter.md#L26-L49).
- **[C-published-solid]** Actual installed runtime: [`@tanstack/solid-charts@0.18.0/dist/index.js`](https://unpkg.com/@tanstack/solid-charts@0.18.0/dist/index.js), lines 1–10; [`@tanstack/charts@0.18.0/dist/solid/index.js`](https://unpkg.com/@tanstack/charts@0.18.0/dist/solid/index.js). Both browser template calls disagree with the intended server contract; reproduction above owns the observed failure.
- **[C-bundle]** [Bundle boundaries and optional renderers](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/guides/bundle-size-and-performance.md#L10-L113). Actual fixture numbers above are our measurements, not advertised vendor sizes.
- **[C-stability]** [Alpha version contract](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/stability.md#L6-L42); [0.16 breaking changes](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/packages/charts-core/CHANGELOG.md#L70-L92).
- **[C-calendar]** [Calendar explanation and UTC choices](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/docs/examples/heatmaps-and-densities.md#L95-L115); [actual calendar composition](https://github.com/TanStack/charts/blob/015f5f26dd3242e5eff4e45d4afd9c56e015865c/benchmarks/conformance/cases/118-token-usage-calendar/example.tsx#L49-L114). Its React wrapper is incidental: `createExampleChart` returns a framework-neutral definition.

### Hotkeys

- **[H-package]** Published [`@tanstack/solid-hotkeys@0.12.1/package.json`](https://unpkg.com/@tanstack/solid-hotkeys@0.12.1/package.json), [`@tanstack/hotkeys@0.10.1/package.json`](https://unpkg.com/@tanstack/hotkeys@0.10.1/package.json), [`Solid adapter declarations`](https://unpkg.com/@tanstack/solid-hotkeys@0.12.1/dist/index.d.ts); [core registry version list](https://registry.npmjs.org/@tanstack%2fhotkeys). Own actual dependency pairing and available releases.
- **[H-sequence]** [Solid sequence registration/reactivity/cleanup](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/solid-hotkeys/src/createHotkeySequence.ts#L64-L155); [sequence options/default timeout](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/sequence-manager.ts#L27-L58).
- **[H-options]** [HotkeyOptions](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/hotkey-manager.ts#L28-L56); [smart defaults and duplicate conflict behavior](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/_registration.ts#L7-L64).
- **[H-input]** [Input/focus/shadow-path detection](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/_event-target.ts#L1-L102).
- **[H-conflicts]** [Live overlap/prefix checks and limits](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/conflicts.ts#L15-L125); duplicate policy implementation is [H-options].
- **[H-help]** [Solid live registry primitive](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/solid-hotkeys/src/createHotkeyRegistrations.ts#L15-L44); [metadata](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/hotkey.types.ts#L250-L260); [published Solid hint/formatter exports](https://unpkg.com/@tanstack/solid-hotkeys@0.12.1/dist/index.d.ts).
- **[H-platform]** [Platform detection and Mod resolution](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/src/platform.ts#L3-L65).
- **[H-router]** [Official React Router integration example](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/examples/react/kitchen-sink/src/index.tsx#L58-L85). Evidence of callback composition, not a tested Solid Router adapter.
- **[H-changes]** [Solid adapter 0.12.1, 0.12.0 and breaking 0.11 changes](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/solid-hotkeys/CHANGELOG.md#L3-L62); [core 0.10/0.9 changes](https://github.com/TanStack/hotkeys/blob/536da97c6a91080cdecf13d74103dcd4a3d3529f/packages/hotkeys/CHANGELOG.md#L3-L49).

## Unverified boundaries

No end-to-end TanStack Start SSR/hydration or prerender build; no complete dashboard/Router/Query performance result; no chart rendered against the maintainer's OpenCode database; no standalone heatmap/donut/combined/Canvas benchmark; no real `@opencode/ui` token installation; no Firefox/Safari/mobile/Linux/Windows browser run or keyboard-layout hardware test. These gaps are explicit rather than extrapolations from the successful Chromium spike.
