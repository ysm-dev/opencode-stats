# Browser preferences — #37 implementation notes

Implemented against integration `4a37d0b6604fc39cbb14db48e3711d5dbe0be98d` (including
the `75974a9` mutation-free policy, #34 passive stall diagnostics, #35 sync and
#40 launcher reconciliation) using the
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
  The packed suite has 28 passing tests (the original 25 plus three setup/cleanup regressions);
  it covers OpenCode Light/Dark, Matrix Light and
  Everforest Light at 320–1280 widths, short windows and zoom-equivalent viewport/density.
- Native browser zoom and VoiceOver remain human checks; automated reflow uses equivalent
  viewport/density conditions, not a claimed Safari/Chrome toolbar-zoom or screen-reader walkthrough.

## Clean preparation and setup-failure ownership

- The public `bun run e2e` now provisions both Chromium's headless shell and WebKit. On Linux,
  Playwright `--with-deps` installs the actual OS libraries/fonts. Hosted CI calls that same
  preparation path, rather than a Chromium-only step. Downloads and OS/OpenCode preparation
  are inside the existing e2e watchdog and enclosing local aggregate/job/attempt deadlines.
- An empty `PLAYWRIGHT_BROWSERS_PATH` reproduced the missing WebKit executable before the fix.
  Public subprocess regressions then failed on leaked fixture directories for both missing
  WebKit and an npm installation failure; both now pass without skipping unavailable browsers.
  A third regression checks that a real launched server's PID, listening address and directory
  are gone after browser launch rejects.
- The shared preferences fixture uses native `AsyncDisposableStack` / `await using` to own
  server, browser and context as each is acquired, including browser/context setup failures.
  Fixture initialization catches installation/startup failures, always removes its temporary
  directory, closes its synthetic writer in `finally`, and stops its owned process tree if
  graceful shutdown fails. It still passes an explicit synthetic database and isolated homes;
  no real user configuration or database is read.

Final bounded measurements after reconciling `4a37d0b`:

| Actual command/environment                                                                                                                              | Result                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run ci`, macOS ARM64, new empty browser path                                                                                                       | 117.31s total, including cold downloads; ordinary gates, 611 tests / 100% per-file coverage, contracts, release and all 28 packed cases pass; final verification fails on #35's `runtime.bun.test.ts` 5s limit |
| `bun run e2e packages/e2e/tests/preferences.test.ts packages/e2e/tests/preferences-setup.test.ts`, Debian 12 ARM64 clean container / empty browser path | 116.42s including container preparation, Linux OS prerequisites and browser downloads; all 15 affected cases pass (45.26s test run)                                                                            |

The initial broader clean Linux container run passed 24/27 cases, including preferences,
but three plugin activation cases hit their unchanged 30s caps. This is not a full Linux or
hosted-CI success claim. Logs are `issue-37-final-cold-ci.log`,
`issue-37-final-clean-linux-preferences.log` and `issue-37-clean-linux.log` in the session's
managed temporary directory.

Every validation command is bounded at five minutes, with the tighter 5-second unit/Bun,
10-second hook and 30-second browser caps retained. Full aggregate acceptance remains blocked
by independently owned #35 verification timeouts (the earlier run also hit `history.test.ts`
and `types.test.ts`). Those sources/tests and limits were not changed by #37. No mutation
tooling was restored or executed; no browser/paint/accessibility assertion was removed.
