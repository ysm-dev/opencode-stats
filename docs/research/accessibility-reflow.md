# Accessibility measurements: mobile-first dashboard F

Primary measurement evidence for [#25](https://github.com/ysm-dev/opencode-stats/issues/25), measured **2026-10-03**. This is a throwaway prototype baseline, not a conformance audit or an accessibility promise for the real dashboard. No product decision is made here.

## Results at a glance

1. **Reflow:** root horizontal overflow was **0 px in all 105 cases**: seven page/view states × three viewports × five overlay states. Text truncation nevertheless exists. Default top/range bars fit at 320 px; adding Touch mode, one filter and a fixed-day label truncates that label by **24 px**.
2. **Short height:** at 320×256 the bars occupy **93 px (36.3%)**, or **101 px (39.5%)** in Touch mode. After scrolling the range menu fully down, its last option extends **8.5 / 19.5 px** below the viewport, respectively.
3. **Text spacing:** **119 / 15 newly clipped text elements** at 360 / 1280 px in the seven base page/view states. No new vertical clipping or visible text-to-text overlap was detected. The majority are session titles/metadata and table-name ellipses, not rows collapsing vertically.
4. **Zoom:** the 640×400, DPR 2 emulation keeps root horizontal overflow at **0 px**, but the desktop-form command panel extends **110 px** below the viewport; its final list option ends **63 px** below it at maximum list scroll. With a verified browser default font of 32 px, **0 of 4,931 text-bearing dashboard elements** changed computed font size.
5. **axe:** the baseline returned `color-contrast` and, on all seven phone page/view states, `page-has-heading-one`. Contrast counts range **4–419** among phone runs. Desktop Sessions Table has an axe contrast-rule execution error, not a contrast pass.
6. **Targets:** Touch mode does not enlarge contribution day cells (**13×13**, **3 px** gap), week selectors (**16×18**, **0 px** gap), or rhythm cells (**10.14×10.14**, **1.45 px** gap). Shell/readout/checklist targets are larger; details below.

## Scope and method

- Source is [`origin/prototype/mobile-first-layout` at `726a30c`](https://github.com/ysm-dev/opencode-stats/tree/726a30c/prototype/dashboard). Findings branch starts from `origin/main` at `51527b9`. Both were isolated temporary worktrees; the main checkout was not edited. No OpenCode database was opened. All displayed data was invented by the prototype.
- **Playwright 1.63.0**, bundled headless **Chromium 153.0.8010.12**, **axe-core 4.13.0**, macOS. The npm registry's latest axe-core version on the measurement date was 4.13.0. Default desktop pointer/hover emulation, no safe-area inset and no virtual keyboard. “Touch on” means the prototype's `touch=on` styling/interaction switch, not a mobile browser/device emulation.
- `?variant=F&embed=1&live=off` removes the prototype switcher entirely while retaining one real viewport. No `frame` parameter, iframe or side-by-side frame view was used. `page=…`, `sessions=day|table`, `build=stopped`, `touch=auto|on` are source-defined URL states. Light/dark use browser `prefers-color-scheme`; actual `.m-main` backgrounds were checked as `#ffffff` / `#161616`.
- Seven page/view states: Overview, Models, Projects, Agents, Tools, Sessions By day, Sessions Table. Reflow uses 320×640, 320×256 and 360×640, each with base, Filters sheet, Page menu, Time range menu and Commands open. **All 105 use the longest status state (`build=stopped`)**, including its history prefix and plugin-update instruction. Default range is Last 30 days. Supplementary bar measurements add one selected project, Last 365 days and `range=day:2026-09-30`.
- Geometry uses `getBoundingClientRect`, `scrollWidth/clientWidth`, `scrollHeight/clientHeight` and text-node `Range.getClientRects`. Fractional geometry is rounded to two decimals; scroll dimensions are browser-rounded integers. Overflow detection permits 1 px integer rounding noise. Clip amounts below are **content width minus clip-box width**, not root overflow. Counts include all rendered rows, including rows that can be reached by vertical scrolling.
- Tables (`.c-table-scroll`) and the contribution graph's intentional horizontal scroller are excluded from viewport-spill and text-overlap checks. Individual table text boxes remain in the text-spacing check: table scrolling does not expose text already ellipsized within a cell.
- Overlap checking intersects visible text rectangles after ancestor clipping, compares distinct text-bearing siblings/branches, and excludes intentional overlay-over-page layering. It does not treat a menu painting over underlying content as text overlap. SVG text is included where rendered; this is a geometric screen, not a glyph/pixel proof. Screenshots and source were used to check the reported cases.
- Spacing is paired on the **same loaded DOM/data** at 360×800 and 1280×800. On phones, all four overlays were checked too; on desktop, the base page and Commands were checked. There are **49 paired cases**. “New” means a previously unflagged element becomes clipped, not a pre-existing ellipsis becoming wider. Existing clipping is not counted again.
- Full default `axe.run(document)` ruleset, no exclusions/rule suppressions, **28 base-page runs** (7 views × 2 widths × 2 schemes), at height 800, with up-to-date/default status. The large incomplete sets and execution error are retained as limitations, not converted to passes. Open overlays are measured geometrically, not included in this axe baseline.

The reproducible [measurement script](../../scripts/accessibility-reflow.mjs) writes the full per-element measurements, DOM indices, text snippets, clip amounts, rectangles, axe node selectors/check data and target dimensions to JSON outside the repo. [The supplementary script](../../scripts/accessibility-reflow-supplement.mjs) reproduces selected-filter bar geometry and screenshots. These throwaway probes live in the repo's existing `scripts/*.mjs` tooling area, not in application packages; no gate configuration, dependency or application implementation is changed.

The committed [per-element clipping index](accessibility-reflow/clipping-index.json) names **every flagged base-page element** with its case-specific DOM index, selector/class, actual invented text, and exact x/y clip amount; it also records every newly clipped base-page element under spacing overrides. It expands the grouped tables below without counting duplicate overlay copies again.

The prototype emitted ResizeObserver “undelivered notifications” errors and Solid computation-disposal warnings during some runs. They were not suppressed or fixed. The final repeated run retained the same root-overflow, newly clipped-text and axe violation counts; this is still a sampled layout, not a stability/performance test. The findings branch passed **`bun run ci`**, including 19 tests and the existing coverage/mutation gates.

## 1. Reflow and the 320 px bars

Every row below covers **all five overlay states** and the longest status line; each root width equals its client width.

| Page/view       | 320×640 | 320×256 | 360×640 |
| --------------- | ------- | ------- | ------- |
| Overview        | 320/320 | 320/320 | 360/360 |
| Models          | 320/320 | 320/320 | 360/360 |
| Projects        | 320/320 | 320/320 | 360/360 |
| Agents          | 320/320 | 320/320 | 360/360 |
| Tools           | 320/320 | 320/320 | 360/360 |
| Sessions By day | 320/320 | 320/320 | 360/360 |
| Sessions Table  | 320/320 | 320/320 | 360/360 |

Numbers are root `scrollWidth/clientWidth`, CSS px. No non-exempt painted element visibly spilled beyond the left/right viewport edge. Some **descendant boxes** extend beyond the viewport but are clipped by their ancestors:

- The chart readout's nested `.faint` instruction extends **62.78 px** beyond the 320 px viewport, **22.78 px** at 360. Its parent `.m-readout-rest` ellipsizes it before that edge; this is clipping, not document horizontal scrolling.
- Sessions By day's model-chip boxes extend up to **114.36 px** beyond the 320 px viewport and **74.36 px** at 360, but `.d-session-meta` clips them inside the session row. The metadata itself is cut, as tabulated below.

### Elements cut or truncated without spacing overrides

The two 320 px heights have identical horizontal results. “n” is the number of affected boxes in that page/view; repeated titles/metadata are separate boxes.

| Page/view                                 | Element                                                 | 320 px: n; clipped width | 360 px: n; clipped width |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------ |
| Overview, Models, Projects, Agents, Tools | `.m-readout-rest`, range/totals/hover/drill instruction | 1 each; **95 px**        | 1 each; **55 px**        |
| Overview                                  | ranking label `.truncate`: Claude Sonnet 5 + Anthropic  | 1; **31 px**             | 0                        |
| Overview                                  | ranking label `.truncate`: GPT-5.6 Luna + OpenCode Go   | 1; **41 px**             | 0                        |
| Overview                                  | ranking label `.truncate`: Kimi K3 Free + OpenCode Zen  | 1; **34 px**             | 0                        |
| Models                                    | `.m-legend-label`: Claude Sonnet 5                      | 0                        | 1; **10 px**             |
| Projects                                  | `.m-legend-label`: acme-storefront                      | 0                        | 1; **6 px**              |
| Sessions By day                           | `.d-session-title`                                      | **104; 3–166 px**        | **74; 3–126 px**         |
| Sessions By day                           | `.d-session-meta`, project/model line                   | **60; 3–219 px**         | **28; 3–179 px**         |
| Sessions Table                            | `.c-table-name`, within intended table scroller         | **89; 2–92 px**          | **89; 2–92 px**          |

Examples identifying the largest session cases: `↳ Explore: plan migration for user preferences` loses **166 / 126 px** at 320 / 360; metadata `Global / GPT-5.6 Luna / GPT-5.6 Luna / GPT-6.1 Sol / Claude Sonnet 5` loses **219 / 179 px**. Table name `Clean up migration for user preferences` loses **92 px**. No vertical hidden/clip overflow or visible text-to-text overlap was detected in these base pages or overlays.

### Top bar and range bar

At 320 px, mouse/default mode, longest status, Overview:

| Top-bar item                  | Horizontal bounds |
| ----------------------------- | ----------------- |
| Logo                          | 12–33             |
| Page-name trigger             | 39–139.11         |
| Flexible gap                  | 145.11–183.44     |
| “Not updating” live indicator | 189.44–276        |
| Search button                 | 282–314           |

All page names fit; the longest is Overview. No top-bar truncation, clipping or overlap was detected. In the default range bar, Previous is **4–36**, Last 30 days **38–149.69**, Next **151.69–183.69**, and Filters **234.08–312**. The range title, arrows and Filters fit; with one filter the count remains visible.

Adding one filter and varying the range gives the following **range-label ellipsis** amounts; the root still has zero horizontal overflow. At 320 px, the fixed-day case also compresses the Filters button's box, but its count/text still stay on screen.

| Width | Touch | Last 30 days | Last 365 days | Wed, Sep 30, 2026 |
| ----- | ----- | ------------ | ------------- | ----------------- |
| 320   | auto  | 0            | 0             | **10 px**         |
| 320   | on    | **1 px**     | **5 px**      | **24 px**         |
| 360   | auto  | 0            | 0             | 0                 |
| 360   | on    | 0            | 0             | **1 px**          |

The 1 px case is browser-rounded width overrun; it is listed separately from the >1 px automated clipping threshold. With Touch + one filter, even Last 30 days visibly becomes `Last 30 da…` in the 320 px screenshot. There is no text overlap between the two bars.

## 2. Short viewports and reachable controls

At **320×256** the fixed shell occupies top bar **48 px** + range bar **44 px** + bottom border **1 px** = **93 px**, leaving **163 px** for `.m-scroll`. Touch mode changes the range bar to **52 px**, totaling **101 px**, leaving **155 px**. The status paragraph is not fixed: it occupies **64 px** at 320 wide (**48 px** at 360 wide) and scrolls away with page content.

| Overlay, default mode            | Geometry at 320×256                                             | At its maximum internal scroll                                                                        |
| -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Filters sheet                    | y **38.41–256**, h **217.59**; header **42**; body h **165.16** | Body scrolls **1216 px**; final “8 more” control y **159.84–187.84**, reachable; Done remains visible |
| Page menu                        | y **43–222.19**, h **179.19**                                   | Scrolls **9 px**; final Sessions item y **188–218**, fully reachable                                  |
| Range menu                       | y **89.5–268.69**, h **179.19**                                 | Scrolls **39 px**; final All time item y **234.5–264.5**, **8.5 px below viewport**                   |
| Commands, full-screen phone form | y **0–256**; input area **53**; list h **203**                  | Scrolls **2969 px**; final option y **198–250**, fully reachable                                      |

The range menu itself extends **12.69 px** below the viewport; in Touch mode it starts at **100.5** and ends at **279.69** (**23.69 px** below), with All time ending at **275.5** (**19.5 px** below). Scrolling the list further is impossible once its scrollTop is at the maximum. The option remains partially tappable; its bottom/text is cut, not a completely missing option. This occurs on every page/view because the menu is shared.

The page, Filters body and Commands list have positive scrolling room. No additional wholly unreachable control was found there. Fixed-height phone session rows still fit individually in the remaining page area; the page can be scrolled to its bottom. This does not mean already-ellipsized session text is recoverable by scrolling.

Screenshots at maximum range-menu scroll: [default](accessibility-reflow/short-range-auto.png), [Touch](accessibility-reflow/short-range-on.png).

## 3. WCAG text-spacing overrides

The injected CSS changes only the four requested spacing properties:

```css
* {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
p {
  margin-bottom: 2em !important;
}
```

### Newly clipped boxes, excluding pre-existing ellipses

| Page/view       | 360 px: newly clipped elements and clipped widths                                                                 | 1280 px: newly clipped elements and clipped widths |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Overview        | `.m-legend-label`: Cache read **10**, Cache write **15**; three ranking `.truncate` labels **38–46**; **5 boxes** | Cache read **5**, Cache write **10**; **2 boxes**  |
| Models          | five `.m-legend-label` boxes **4–21**                                                                             | four `.m-legend-label` boxes **11–16**             |
| Projects        | None                                                                                                              | None                                               |
| Agents          | None                                                                                                              | None                                               |
| Tools           | `.c-table-name`: github_search_code **12**; **1 box**                                                             | None                                               |
| Sessions By day | **35** `.d-session-title` boxes **2–64**; **37** `.d-session-meta` boxes **3–55**                                 | None                                               |
| Sessions Table  | **36** `.c-table-name` boxes **3–37**                                                                             | **9** `.c-table-name` boxes **9–48**               |

All amounts are CSS px. The same new clipping set remains when each phone overlay is open; **no extra clipped text box within the sheet/menus/Commands** was detected. Desktop Commands likewise adds no new clip box. Root widths remain **360/360** and **1280/1280**. Across all 49 pairs, **0 new vertical clips**, **0 new visible text-box overlaps**, **0 newly overflowing fixed-row text ranges** were detected. Earlier geometric candidates consisting of menu text over the covered page, or sidebar content behind its footer, are intentionally excluded after ancestor clipping/layer checks.

Model legend labels newly affected at 360: GPT-6.1 Sol, GPT-5.6 Luna, Claude Opus 5, Kimi K3 Free, Gemini 3 Pro. At 1280: the first four of those. Claude Sonnet 5 was already clipped and is not counted again. Newly affected ranking labels are the three named in the reflow table; newly affected session examples include `Fix webhook retries`, `Speed up search ranking`, `api · side / Claude Opus 5` and `dotfiles / Claude Opus 5`. The full per-element text/indices are emitted by the script.

### Fixed-height rows specifically checked

| Row/control                             | Actual measured height before → after spacing | New vertical clip/overlap                                       |
| --------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Phone two-line session                  | **56 → 56 px**                                | None; additional horizontal title/meta ellipses as above        |
| Phone subagent session                  | **44 → 44 px**                                | None; hidden metadata remains hidden by the design              |
| Phone day heading                       | **36 → 36 px**                                | None; some date/summary text wraps to two lines, within the row |
| Sessions table data cells, either width | **50.5–55 → 48–52.5 px**                      | None; CSS `height:44px` is not a hard cap on a table cell       |
| Desktop navigation row                  | **30 → 30 px**                                | None; F overrides the inherited row height                      |
| Desktop checklist row                   | **28 or 36 → 28 or 37.5 px**                  | None; two-line model labels expand                              |
| Segmented-control items                 | **28 → 28 px**                                | None                                                            |

Some default line heights exceed 1.5 times their font size, so the requested exact override can shrink, rather than grow, those rows. That is why the table's measured height reduces. [Phone sessions with overrides](accessibility-reflow/sessions-spacing.png).

## 4. Zoom and browser font preferences

### 200% layout-equivalent emulation

Viewport **640×400 CSS px**, `deviceScaleFactor:2`, represents the content area of a 1280×800 window at 200% zoom. This is responsive-layout/DPR emulation, **not a claim that changing DPR alone performs browser zoom**, and not pinch zoom via CDP pageScaleFactor. All seven pages and all four overlays were measured (**35 cases**).

- Root horizontal overflow: **0 px in all 35**. Fixed bars still occupy **93 px**, leaving **307 px** page-scroll height. Page menu, range menu and Filters sheet fit and can reach their last items; the sheet is now the centered 480 px form, y **30–370**, body **298 px** high.
- Overview, Agents, Tools and Sessions By day have no detected hidden/clip text overflow in this form. Models legend has **3 clipped labels (2–18 px)**; Projects has **1 (14 px)**. Sessions Table retains the **89 table-name ellipses (2–92 px)** seen at narrow widths. These are content truncations, not new root spill.
- **Commands changes to its desktop-form panel at 600 px.** At 640×400 its panel is x **32–608**, y **56–510**, h **454**. Its list is y **109–469**, h **360**. At maximum list scroll, the final option is y **431–463**: entirely below the viewport; the preceding option is partially below it. The footer is below the viewport too. Panel bottom overrun is **110 px**, list bottom **69 px**, final option bottom **63 px**. The search input and esc close button remain visible. Searching can produce a shorter list; this measurement is the unfiltered Commands list.

[Commands at 200% emulation](accessibility-reflow/zoom-command.png), screenshot stored at CSS scale.

### Default font size 16 → 32 px

Two real full-Chromium headless persistent profiles set `webkit.webprefs.default_font_size` to 16 / 32; an unstyled control paragraph computed to **16 / 32 px**, verifying that the preference took effect. Chromium's bundled **headless shell ignored this preference** in the initial trial; that trial is not the evidence for this result. `channel:'chromium'` selects the full browser in the retained reproduction script.

At **1280×800**, the number of direct-text-bearing dashboard elements compared on each page/view was:

| Overview | Models | Projects | Agents | Tools | Sessions By day | Sessions Table |
| -------- | ------ | -------- | ------ | ----- | --------------- | -------------- |
| 345      | 316    | 294      | 251    | 276   | 1,171           | 2,278          |

**All 4,931 retained identical computed font sizes**: for example logo 11 px, brand/page labels 13 px, key hints 10 px. Root width remained 1280/1280. The prototype's explicit/inherited px font sizes do not respond to that browser default-font setting. This is distinct from full-page zoom, which magnifies px-sized text.

## 5. axe-core baseline

Counts below are **violating nodes for `color-contrast`**, not the number of distinct rules. `page-has-heading-one` has **1 node (`html`) on every 360 px page/view**, and **0 at 1280**. Its example is the picker phone page name: a button/span, not an h1. That rule is an axe best-practice rule, not by itself a finding that the named WCAG criteria fail. No other violation rule IDs were returned in these base runs.

| Page/view       | 360 light | 360 dark | 1280 light | 1280 dark |
| --------------- | --------- | -------- | ---------- | --------- |
| Overview        | 44        | 4        | 41         | 0         |
| Models          | 27        | 12       | 29         | 12        |
| Projects        | 18        | 12       | 28         | 12        |
| Agents          | 19        | 12       | 30         | 12        |
| Tools           | 9         | 5        | 18         | 5         |
| Sessions By day | 419       | 110      | 53         | 15        |
| Sessions Table  | 150       | 14       | **Error**  | **Error** |

**The desktop Sessions Table contrast rule errored:** “Element midpoint exceeds the grid bounds Skipping color-contrast rule.” Its reported target was `th[aria-sort="none"]:nth-child(1) > button` (`Session`). Both desktop runs returned no violations but one incomplete error node. This is not evidence that those pages pass contrast.

### Contrast tokens and elements actually flagged

The flagged text is the **`--v2-text-text-faint` foreground, #808080 in both themes**, including `.faint` and Tailwind `text-v2-text-text-faint` derivatives. The threshold in these results is **4.5:1**. Backgrounds below are axe's resolved/composited colours, not a claim that every pixel has a flat background.

| Surface / foreground                               | Light ratio       | Dark ratio                            | Flagged elements/examples                                                                                                                                                          |
| -------------------------------------------------- | ----------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base background (`--v2-background-bg-base`), faint | **3.94**, #fff    | No flagged base-background faint text | Phone `.m-live`; headline `.e-number-sub`; chart notes; session time/cost; muted explanatory text                                                                                  |
| Deep/header surface (#fafafa / #242424), faint     | **3.78**          | **3.93**                              | Table header sort buttons (`Model`, `Tool`, `Session`); day-heading summary. In light desktop, sidebar v1, Clear all, checklist count/“more”, live note and Shortcuts also flagged |
| Layer-02 / total row (#f2f2f2 / #2e2e2e), faint    | **3.52**          | **3.43**                              | Session `.d-model` badges (e.g. GPT-6.1 Sol); total-row “99% priced” `<small>`                                                                                                     |
| Blue ranking fill, faint                           | **2.50**, #c2ccfc | **2.98**, #2e3750                     | Overview first model's OpenAI provider suffix and 42% share                                                                                                                        |
| Green ranking fill, faint                          | **3.08**, #cbebd6 | **2.78**, #23432d                     | Overview project share text, e.g. 31%                                                                                                                                              |

Representative `color-contrast` targets are `.m-live` (“live”, 11 px) and `.e-number:nth-child(1) > .e-number-sub` (“90% cache read”, 10 px), both light **3.94:1**. Dark examples include `.d-model` (**3.43:1**) and table-header buttons (**3.93:1**).

Contrast **incomplete/review node counts** are also substantial:

| Page/view       | 360 light / dark | 1280 light / dark |
| --------------- | ---------------- | ----------------- |
| Overview        | 48 / 34          | 99 / 57           |
| Models          | 115 / 115        | 77 / 76           |
| Projects        | 103 / 103        | 77 / 76           |
| Agents          | 64 / 64          | 77 / 76           |
| Tools           | 94 / 94          | 77 / 76           |
| Sessions By day | 42 / 42          | 61 / 60           |
| Sessions Table  | 1,845 / 1,845    | 1 error / 1 error |

No numerical contrast pass is inferred for these incomplete nodes, chart colours, non-text chart marks or open overlays. Keyboard/screen-reader behavior, accessible chart alternatives and focus management are outside this baseline.

## 6. Small pointer targets at 360 px

Dimensions and gaps are CSS px. A target is listed as undersized if **either** bounding-box dimension is <24. “Gap” is nearest edge-to-edge distance to another independent target; “centre” is nearest centre-to-centre distance. These are observations, not application of every WCAG exception. Nested checkbox and label are one function: the full checklist label is the clickable target. When a sheet/Commands is open, covered page controls are excluded from its target-spacing measurements.

### Targets still smaller than 24×24, with Touch auto **and** Touch on

| Target kind / selector                          | Count or location                    | Size                              | Nearest gap; centre                                          |
| ----------------------------------------------- | ------------------------------------ | --------------------------------- | ------------------------------------------------------------ |
| Contribution day `.d-cell`                      | 365 days                             | **13×13**                         | **3; 16**                                                    |
| Contribution week selectors `.d-weeks button`   | 53                                   | **16×18**                         | **0; 16**                                                    |
| Contribution month selectors `.d-months button` | 12 full groups + final partial group | **48×20**, final **16×20**        | **4; 20.55** (nearest day target)                            |
| Rhythm weekday×hour SVG cells                   | 168                                  | **10.14×10.14**                   | **1.45; 11.59**                                              |
| All models / All projects links                 | Overview                             | **67.73×20 / 71.89×20**           | **12; 119.68 / 117.70**                                      |
| Day-heading date buttons                        | Sessions By day, 14 rendered days    | **52.05–73.30×20**                | **8**; centres **90.47–129.74** auto, **92.01–129.74** Touch |
| Sort buttons: Model / Project / Agent           | Their breakdown tables               | **29.55 / 33.42 / 28.23×20**      | **82.45 / 78.58 / 83.77**                                    |
| Other breakdown sort buttons                    | Models/Projects/Agents               | **26.98–95.52×20**                | Mostly **20**, Tokens ↓ **50.86**                            |
| Tool sort buttons                               | Tools table, 6                       | **20.20–136.98×20**               | **20**, first Tool **104.47**                                |
| Session sort buttons                            | Sessions Table, 13                   | **26.98–95.52×20**                | Mostly **20**; Session **59**, Started ↓ **50.86**           |
| Active-filter Clear all `.c-text-button`        | After selecting project              | **42.34×20**                      | **6; 41.17 auto / 49.17 Touch**                              |
| Commands close “esc” `.c-text-button`           | Commands input row                   | **18.61×20**                      | **12; 156**                                                  |
| Filter-search input                             | Filters sheet                        | **271.38×20 auto / 285×20 Touch** | **26 / 32**; centres **68.10 / 80.69**                       |

The contribution graph is initially scrolled to its latest days; the dimensions above include all rendered cells, not just those initially visible. Table buttons are measured in their sideways scrollers. Rhythm rects have pointer handlers but no individual button/keyboard role in this prototype; they are included because pointer clicks read their values.

### Chart bars versus actual pointer region

At 360, the Overview chart's plot SVG is **252×190**. Last 30 days has **30 contiguous x-bucket hit regions**, each **8.4 px** wide across the SVG height, **0 px gap**. Visible stacked-bar segment width is **6.048 px**, with **2.352 px** inter-bar gap. These do not change with Touch. The handler computes the bucket from pointer x across the entire SVG, including space between painted bars; the painted segment is not its own DOM pointer target. WCAG 2.5.8's note about values selected spatially within a target is relevant to interpreting this distinction; no exception/conformance verdict is asserted here.

### Requested controls that are **not** undersized

| Control                               | Touch auto              | Touch on                           | Nearest gap        |
| ------------------------------------- | ----------------------- | ---------------------------------- | ------------------ |
| Search / previous / next shell icon   | **32×32**               | **44×44**                          | Range arrows **2** |
| Checklist label row                   | **336×28**              | **336×40**                         | **0** to next row  |
| Chip remove button                    | **28×28**               | **44×44**                          | **6** to Clear all |
| Filters sheet Done                    | **56.78×32**            | **56.78×44**                       | **26 / 32**        |
| Chart Drill in                        | **63.59×28**            | **63.59×44**                       | **6**              |
| Readout clear                         | **28×28**               | **44×44**                          | **6**              |
| Graph readout This day / Week / Month | Not shown in mouse mode | **68.34×44 / 70.23×44 / 40.06×44** | **6**              |
| Command option row                    | **348×32 minimum**      | **348×44 minimum**                 | **0**              |
| Commands search input                 | **269.39×28**           | **269.39×28**                      | **12**             |

The chip itself is a non-interactive span; only its remove button is a target. The sheet uses Done rather than an icon-only close button. There is no separate close icon on the Page/Range menu. Touch mode enlarges these selected controls, not every button/mark in the prototype.

## Sources and reproduction

Primary sources for the measured implementation:

- [Switcher settings](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/prototype/switcher.tsx), [URL state](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/state.ts), [F preset](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/mix.ts).
- [Shell/status text](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/shell.tsx), [overlay structure](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/overlay.tsx), [mobile CSS heights/breakpoints/ellipsis](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/m.css).
- [Chart pointer hit calculation](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/chart.tsx), [graph controls](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/graph.tsx), [rhythm pointer cells](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/m-mobile/rhythm.tsx), [checklist/chip structure](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/e-v1/filters.tsx), [Commands](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/variants/e-v1/palette.tsx), [colour tokens](https://github.com/ysm-dev/opencode-stats/blob/726a30c/prototype/dashboard/src/style.css).
- [axe 4.13 API and result/incomplete semantics](https://github.com/dequelabs/axe-core/blob/v4.13.0/doc/API.md).

W3C primary criteria/context:

- [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): vertically scrolling content at **320 CSS px width**, without loss or two-dimensional scrolling, except sections requiring a two-dimensional layout. **256 px height** is the criterion's horizontal-writing-direction counterpart; 320×256 is additionally the requested 1280×1024-at-400%-zoom scenario. Tables' exception does not automatically exempt their surrounding controls or every cell's text.
- [1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): no loss with **1.5 line height, 2em following paragraphs, 0.12em letters, 0.16em words**. Ellipsis is not automatically a failure if the complete content remains available by another mechanism; this report measures ellipsis, not that mechanism's adequacy.
- [1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html): text can reach **200%** without loss using a supported resizing mechanism; changing the browser default font is not the only such mechanism.
- [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): **24×24 CSS px** or applicable spacing/equivalent/inline/user-agent/essential exception. Spacing uses **24 px-diameter circles**, not merely a fixed edge gap. Spatial value selection within one target is specifically distinguished from separate targets.

Reproduce in an isolated temporary worktree of `726a30c`: `bun install` in `prototype/dashboard`, add throwaway `playwright@1.63.0 axe-core@4.13.0` there, `bunx playwright install chromium`, and `bun run dev --host 127.0.0.1`. Run the retained scripts with `DEPENDENCIES` set to that dashboard directory and `OUTPUT` set to a temporary output directory. `FONT_ONLY=1` and `TARGET_ONLY=1` reproduce those phases separately. Stop the Vite process after measurements. The prototype server used for this research was stopped after completion.

Limits: one Chromium version/platform, fake English labels and the default generated history/range plus the explicitly named supplementary states. No real chart library, list virtualization, mobile keyboard, iOS/Safari/Firefox, OS accessibility text scaling, browser UI chrome, focus/keyboard/screen-reader audit or manual WCAG conformance certification. Geometric non-findings are not guarantees for other labels/data, interactions, font families or the eventual implementation.
