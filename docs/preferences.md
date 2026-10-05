# Browser preferences — #37 implementation notes

**Work in progress; not release-ready.** The exhaustive mutation gate and Chromium's
long-select keyboard/focus checks still need to pass. No accessibility exception is proposed.

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
Generated origins use squared Oklab distance within the same ramp. The two documented fallback
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

## Remaining verification

- Kill all surviving/uncovered preference, palette and startup mutants, without suppressions.
- Resolve Chromium long-select keyboard focus/scrolling in short viewports; WebKit checks pass.
- Complete all twelve mutation and sixteen gate-verification partitions and the full `ci` aggregate.
- Native browser zoom and VoiceOver remain human checks; automated reflow uses equivalent
  viewport/density conditions, not a claimed Safari/Chrome toolbar-zoom or screen-reader walkthrough.

The existing five-minute watchdogs and tighter test/hook limits are unchanged.
