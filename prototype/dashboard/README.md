# Dashboard prototype (throwaway)

**PROTOTYPE: never merge, never import.** Fake data only.

- **A–E** answer [What pages, charts and hotkeys does the dashboard have?](https://github.com/ysm-dev/opencode-stats/issues/14). E is the v1 desktop design.
- **F–H** answer [How does the dashboard lay out from phone width up?](https://github.com/ysm-dev/opencode-stats/issues/23). They are three mobile-first versions of E, and each one turns into E at desktop widths.

**Verdict on #23: F, the Picker preset, unchanged.** That means page-name menu, range bar and filter sheet; 2-column headline numbers; time charts fit to width with the same buckets; the contribution graph scrolling sideways, opened at today; tables scrolling sideways with the name column pinned; the weekday × hour grid fitted; and the shared rules below. The decision lives on the issue; G and H stay here as the alternatives.

```sh
bun run prototype        # from the repo root; serves http://localhost:4747
```

Open http://localhost:4747/?variant=F&frame=all to see F at 360, 768 and 1280 px side by side.

## The bar

Flip variants with ← → or the yellow bar. Range, filters and page live in the URL, so they survive a reload and a variant switch.

| Control                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Width**                        | Shows the dashboard in a frame of a real width: 360, 390, 768, 1024, 1280 px, or 360 · 768 · 1280 side by side. Media queries respond as they would in a window that size. A change made in one frame (page, range, filters) is mirrored to the others.                                                                                                                                                                                   |
| **Touch**                        | `on` gives a mouse-driven screen the touch presentation: 44 px targets, taps that read rather than act, no key hints. `auto` follows the device: devtools' device mode or a real touchscreen.                                                                                                                                                                                                                                             |
| **Status**                       | Fakes each state of the page's status line from [How does opencode-stats report problems?](https://github.com/ysm-dev/opencode-stats/issues/22). `build reading` gives "History from Sep 26 · older history is still being read" and the summary sentence's "…since Sep 26". `build stopped`, `sync stopped` and `server lost` give the "not updating" lines in OpenCode's warning colour, with the live dot grey. Counts aren't clipped. |
| **Mix**                          | F–H only. Swaps any single choice below, so pieces from different presets can be combined (`?m.<choice>=`). Switching variant resets it.                                                                                                                                                                                                                                                                                                  |
| Dates, Clock, Theme, Live writes | As before.                                                                                                                                                                                                                                                                                                                                                                                                                                |

On a narrow window the bar folds into a pill at the bottom right: tap it to unfold.

## F, G, H

| Choice                         | F · Picker                                                                                                                            | G · Tabs                                                                                                                  | H · Drawer                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages, range, filters          | Top bar with a page-name ▾ menu and search (OpenCode's settings screen), a ‹ range ▾ › bar, and a Filters sheet. Sidebar from 768 px. | Bottom tab bar, a range sheet and a filter sheet. Icon rail from 600 px, sidebar from 1024 px. No on-screen command menu. | ☰ opens E's sidebar as a drawer. Each page starts with a search field, a scrolling preset strip and wrapping chips. Sidebar from 1024 px. |
| Headline numbers               | 2 columns                                                                                                                             | One list                                                                                                                  | 4 large + 6 listed                                                                                                                         |
| Time charts                    | Fit: same buckets, fit to width                                                                                                       | Scroll: same buckets, at least 12 px each, scrolling sideways, opened at today                                            | Coarser: buckets grow (day → week → month) until each is at least 6 px wide                                                                |
| Contribution graph             | Scroll: full-size cells, opened at today                                                                                              | Months: one small calendar per month, newest first                                                                        | Fit: the whole year shrunk to the column                                                                                                   |
| Tables                         | Scroll: name column pinned, chosen metric moved next to it                                                                            | Cards: one fixed-height card per row, sorted from a menu                                                                  | One column: name and chosen metric; a tap opens a sheet with every metric and the filter toggle                                            |
| Weekday × hour                 | Fit                                                                                                                                   | Turned: 24 rows × 7 columns on phones                                                                                     | Fit                                                                                                                                        |
| Segmented controls when narrow | Selects                                                                                                                               | Scrolling segments                                                                                                        | Wrapping segments                                                                                                                          |

**The same in all three:**

- **No hover-only values.** A tap selects a bucket, day or cell. The chart's legend doubles as the readout, with "Drill in"; the graph's readout selects the day, week or month. A mouse keeps E's hover and direct clicks.
- **Sizes.** Targets grow to 44 px whenever a touchscreen is present (`any-pointer: coarse`), whatever the width. Layout follows width. Key hints and the shortcut sheet hide when the main pointer can't hover.
- **Breakpoints.** Shell breakpoints follow the viewport. Content forms follow the page column's own width (a container query, 720 px), so a sidebar narrows them like a small screen.
- **No animation.** Sheets, the drawer and menus appear in one frame. Session rows and cards keep fixed heights.

## What is real and what isn't

- **Real:** `@opencode/ui@2.0.21` controls and v2 tokens, TanStack Hotkeys 0.12, the time-range rules from issue #12 and the metric definitions from issue #13.
  - A–E use TanStack Charts 0.18. F–H use a hand-rolled SVG chart, so that fit, scroll, coarser buckets and tap-to-read can be tried. Production would drive the same readout from TanStack Charts' `onFocusChange` and `onSelect`.
- **Fake:** the usage history (`src/data/db.ts`): about 18k steps generated in the browser from a fixed seed.
- **Not answered here:** performance, how data reaches the browser, virtualised lists (row heights are fixed, but every row is drawn).
- **Not production code:** a plain Vite SPA, with no tests and no error handling. F–H sit in `src/variants/m-mobile`; the bar and frames in `src/prototype`.
