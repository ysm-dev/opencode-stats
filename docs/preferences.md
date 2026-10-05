# Browser preferences — #37 implementation notes

Implemented against integration `af498ff6b99163be2b6361d809ac2d5462dc2c8e` (including
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
- The complete foreground `bun run ci` aggregate passes: 611 tests with 100% per-file coverage,
  all twelve exhaustive mutation partitions at 100%, all sixteen gate-verification partitions,
  runtime contracts, release and installed-tarball checks. No new whole-file exception.
- Chromium and WebKit pass first stored-theme paint, denied storage, other-tab synchronization,
  system scheme changes, whole-paint/no-request/data-identity checks and Settings accessibility.
  The packed suite has 24 passing tests; it covers OpenCode Light/Dark, Matrix Light and
  Everforest Light at 320–1280 widths, short windows and zoom-equivalent viewport/density.
- Native browser zoom and VoiceOver remain human checks; automated reflow uses equivalent
  viewport/density conditions, not a claimed Safari/Chrome toolbar-zoom or screen-reader walkthrough.

The existing five-minute watchdogs and tighter test/hook limits are unchanged.
