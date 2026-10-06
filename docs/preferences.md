# Browser preferences — #37 implementation notes

Implemented against integration `75974a98940cb90faba35402605d3f404a3ed99a` (including
#35 sync and #40 launcher reconciliation) using the
published `@opencode/ui` 2.0.21 provider, resolvers and controls. No accessibility exception.

## Storage and first paint

- The published ThemeProvider owns its theme, scheme and two CSS-cache keys. The dashboard
  owns `opencode-stats-single-key-shortcuts`, encoded `on`/`off`. These are the only preferences.
- Vite emits a synchronous classic head script, before the module bundle. Its trusted catalog
  is generated through the actual published legacy/v2 resolvers; it holds backgrounds, cache
  checksums and declaration/reference allowlists, not a second set of theme JSONs.
- Unknown stored choices normalize to OpenCode/System/On. Storage's property getter, methods
  and late refusals are guarded. Readable choices and caches are mirrored before testing writes.
  A refused store is replaced with ordinary Storage-shaped page memory, including length/key/clear.
- Cache consistency uses CRC-32: Node's standard implementation produces expected values;
  the classic script checks them synchronously. This is **not a security checksum**. The separate
  property/reference allowlists and value grammar reject rules, strings, URLs and arbitrary functions.
  Tests exercise that validation even with matching checksums. Safe shadows are supported.
- Missing, corrupt or stale caches are discarded, **not the valid theme choice**. The catalog still
  paints that theme's deep background before the bundle. The provider supplies its complete CSS.
- The published provider stays untouched. Its synchronous `onThemeApplied` callback writes the
  dashboard aliases and corrects its fixed background in the same task. Every theme stays in the
  one module bundle. Preference changes do not call the engine or redraw page data.

## Colours

Dashboard aliases cover base/deep/three raised surfaces, text, muted text, warning, edges,
selection, focus, inverse text/background, empty days, four graph levels and chart colours.
Numbered origins choose nearest passing numbered steps, with stronger contrast breaking ties.
Generated origins use squared Oklab distance within the same ramp, compositing unrounded sRGB
before the published normalized-RGB conversion. Static alpha tokens come from the published CSS.
The two documented fallback
cases remain inverse-background darkening and base text for unrepairable raised muted text.

The coordinated series/readout order is blue, orange, purple, green, pink, yellow, cyan, grey
(More). Token kinds use the first five, in input/cache-read/cache-write/output/reasoning order.
Outcomes use green/pink/grey for succeeded/failed/stopped. Light starts at 700, except orange
and green 800, yellow 900 and grey 600; dark starts at 400. Only a failing chart surface moves
a colour along its original OpenCode hue. Graph levels are four distinct passing interactive
steps, ordered by actual luminance against both chart and empty surfaces.

The Node check uses real published resolution, independent unrounded WCAG calculations, and
Sharma-checked CIEDE2000 plus full-severity Machado screening for neighbouring categories.
It also has negative/boundary fixtures through the same public palette seam.

## Focus and verification

- The published select's deferred initial autofocus can overwrite an early keyboard reading.
  Its public highlight callback preserves that reading; genuine pointer input releases it.
  Native input listeners use an AbortController scoped to the covering sheet.
- After the maintainer's no-mutation policy change, bounded ordinary validation passes:
  611 behavioral tests with 100% per-file coverage, formatting, lint, types, budgets, dead-code,
  duplication, exceptions, package shape, freshness, native runtime contracts and release.
  No mutation command or former unbounded CI aggregate is used. No new whole-file exception.
- Chromium and WebKit pass first stored-theme paint, denied storage, other-tab synchronization,
  system scheme changes, whole-paint/no-request/data-identity checks and Settings accessibility.
  The packed suite has 25 passing tests; it covers OpenCode Light/Dark, Matrix Light and
  Everforest Light at 320–1280 widths, short windows and zoom-equivalent viewport/density.
- Native browser zoom and VoiceOver remain human checks; automated reflow uses equivalent
  viewport/density conditions, not a claimed Safari/Chrome toolbar-zoom or screen-reader walkthrough.

Every validation command is bounded at five minutes, with the tighter 5-second unit/Bun,
10-second hook and 30-second browser caps retained. The mutation-free policy integration is
reconciled and its outer-300-second `bun run ci` was executed. Preparation, ordinary gates,
coverage, contracts, release and all 25 packed tests passed. Final gate verification is blocked
by the independent #35 stats-store tests exceeding their 5-second caps in isolated verification:
`runtime.bun.test.ts`, `history.test.ts` and `types.test.ts`. Their limits were not raised and
their source/tests were not changed by #37. Full aggregate acceptance requires the #35 owner
to optimize/reconcile those tests; the preferences-specific checks have no remaining failure.
