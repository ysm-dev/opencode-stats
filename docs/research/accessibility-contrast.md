# Accessibility contrast: OpenCode oc-2 and the dashboard prototype

Measured **2026-10-03** for [#25](https://github.com/ysm-dev/opencode-stats/issues/25). This is colour evidence, not an accessibility promise or a complete WCAG audit. Only this note is committed; the measurement script and dependencies remain in approved temporary storage, as in the earlier browser-copy-cost research.

## Findings at a glance

- At normal-text **4.5:1**, base and muted pass on all five requested surfaces in both schemes. Faint fails **5/5 light**, **3/5 dark**; accent additionally fails on light layer-03 (**4.47**). Inverse text on inverse background passes both (**18.10**).
- Warning text fails **5/5 light** (**2.12–2.46**), passes **5/5 dark** (**7.56–13.32**). The actual 11px “not updating” line is on base: **2.46 light / 12.03 dark**.
- On the chart's base surface, series including “more” pass/fail **4/4 light, 7/1 dark**; kinds **2/3, 4/1**; levels **2/3, 2/3**; outcomes **1/2, 3/0**. Dark stopped outcomes also fail on selected table rows, layer-03 (**2.88**).
- All **13** series/kind partial fills fail in each scheme at the actual **42%** opacity. No step in the existing light ramps passes while retaining 42%; the best grey step reaches **2.91**. Same-hue dark alternatives exist, listed below.
- All **15** muted/base/strong-border × surface comparisons fail in each scheme. The v2 blue-500 focus token fails **5/5 light** (**2.36–2.73**) and passes **5/5 dark** (**4.16–7.32**). The prototype's different `v2-border-border-selected` token is **undefined**, not an alias for that focus token.
- The actual range-cell outline is **base text**, not muted, and contrasts with its base-surface gap at **18.10 light / 17.34 dark**. Fill-adjacent comparisons are also tabulated, but are not the normal gapped outline's adjacency.
- No normal-vision series/kind pair has ΔE00 below 10. Full-severity simulations do; the minimum is light orange/yellow under deuteranopia (**2.71**). Complete pair lists and one-colour-at-a-time nearest steps are below.

## Provenance and measurement method

**Published package is the authority:** [npm tarball @opencode/ui@2.0.21](https://registry.npmjs.org/@opencode/ui/-/ui-2.0.21.tgz), `npm pack` SHA-1 **b3fc5704efeca16e6dbda2ad8b674a25f4bfb8ea**. `package.json` reports 2.0.21. Unpacked outside the worktrees. The final colours were obtained by executing its `src/theme/resolve.ts` and `src/theme/v2/resolve.ts`, then recursively resolving `var()` references and the static alpha primitives in `src/styles/tokens/colors.css`. This matters: static CSS defaults alone are not the final oc-2 theme.

The local OpenCode checkout is `v2` at **d9d094a54378a8af4852a6c3594e0a8a91e2d498**, remote `anomalyco/opencode`. All files in published `src/theme/` match local `packages/ui/src/theme/` byte-for-byte; local-only files are a JSON schema and `v2/resolve.test.ts`. The token CSS directory and checked text-input/segmented-control CSS also match. No colour difference was found. Its [ThemeProvider implementation, lines 133–155](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/context.tsx#L133-L155) injects both resolved legacy and v2 tokens. [oc-2 overrides](https://unpkg.com/@opencode/ui@2.0.21/src/theme/themes/oc-2.json), [v2 resolver](https://unpkg.com/@opencode/ui@2.0.21/src/theme/v2/resolve.ts), [static alpha primitives](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tokens/colors.css).

Dashboard sources are pinned to prototype commit **726a30caed5bf44a9b6a63128ed3c3b252b4f9c9**, not an eventual implementation. Measurements ran in a separate worktree on `research/accessibility-contrast`, based on `origin/main` **51527b9**. The main working tree was not modified; the OpenCode database was never opened.

Ratios use [WCAG relative luminance and contrast](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance): normalized sRGB channel `c` becomes `c/12.92` for `c ≤ 0.04045`, otherwise `((c+0.055)/1.055)^2.4`; `L = 0.2126R + 0.7152G + 0.0722B`; ratio `(max(L)+0.05)/(min(L)+0.05)`. **Unrounded** values decide pass/fail; displayed ratios round to two decimals. P/F in text matrices means **normal / large**, thresholds **4.5 / 3**. Large means ≥24px or ≥18.66px bold; 13px Inter 440, captions and 19–21px medium headings are normal text. The pre-2021 WCAG breakpoint 0.03928 gives the same results for these opaque 8-bit tokens; current 0.04045 is used consistently for composites.

Alpha is composited in **encoded sRGB**, `result = alpha × foreground + (1−alpha) × actual background`, before linearizing for contrast. CSS `#…14`, `#…1a`, `#…33` mean **20/255, 26/255, 51/255**, not exactly 8%, 10%, 20%. Composite hex strings are rounded display conveniences; ratios use unrounded channels. 42% `color-mix(in srgb, colour 42%, transparent)` is the original unpremultiplied hue with alpha 0.42. The dark input gradient uses the actual `15/255` and `5/255` white-alpha endpoints; its entire endpoint range fails 4.5 for faint placeholder text.

[WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requires 3:1 only for visual information required to identify controls/states or understand graphics. Decorative borders, inactive controls, and genuinely equivalent text/table presentations have relevant exceptions. Thus the tables report **numerical threshold failures**, not an assertion that every low-contrast border or empty level-0 cell is necessarily a conformance failure. Pairwise ratios between non-touching cells/lines are diagnostics, not automatically required adjacency. Thin-line anti-aliasing, keyboard operation, focus visibility/occlusion, reflow, accessible names and screen-reader equivalents were not audited.

### Chart surfaces and prototype controls

The [shared style, lines 18–66](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/style.css#L18-L66) supplies every dashboard-owned chart/kind/level/outcome mapping measured below. The [mobile main surface](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/m-mobile/m.css#L39-L58) is base; [.a-card, lines 45–49](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/a-pages/a.css#L45-L49) explicitly paints base beneath charts and contribution graphs. E's `.oc-surface` is also base. Outcome strokes in [.c-outcomes](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/c-explorer/c.css#L484-L516) can sit on base, total layer-02 or filtered layer-03; those additional ratios are included.

Partial opacity is **42%**, in [mobile chart.tsx:51,262](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/m-mobile/chart.tsx#L51) and [shared time-chart.tsx:33,73](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/charts/time-chart.tsx#L33). Levels/outcomes are not faded in those paths. [Contribution graph CSS:65–72](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/d-calendar/graph.css#L65-L72) uses a 1px **base-text** range outline, offset 1px; hover/focus uses 2px. Mobile “picked” uses 2px base text, offset 2px and a base-surface gap. The mobile fit mode sets range outline offset **0**, so the low fill/outline comparisons become relevant there; none of these range outlines uses muted.

The prototype's [.c-search border/input](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/c-explorer/c.css#L134-L163) uses base border over base fill, with deep outside in the E/mobile sidebar. Mobile select/searchfield/context buttons use 0.5px base-border shadows, mostly layer-01 fills. Native facet `<input type="checkbox">` elements have **no author-defined outline colour**; their only colour assignment is `accent-color: var(--chart-1)` ([c.css:218–225](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/c-explorer/c.css#L218-L225)). A native unchecked-checkbox outline ratio cannot be resolved from these tokens: it depends on browser/platform/state. The legacy **@opencode/ui** checkbox is a different control; its measured authored borders are separately named below.

### What OpenCode's web app actually uses

These are concrete source examples, not an exhaustive screenshot audit. Exact ratios for their declared surfaces/opacity are in “Actual app examples”. App paths below are under `packages/app/src` at the pinned commit; UI paths refer to published 2.0.21.

| Use                                   | Primary source and colour/surface evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secondary labels and descriptions     | [home/sessions/view.tsx:29,843,869](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/home/sessions/view.tsx#L843): v2 muted; [home/route.tsx:21–25](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/home/route.tsx#L21-L25): base. Passes both schemes.                                                                                                                                                                                                          |
| Secondary text with additional fading | [home/projects/view.tsx:96–109](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/home/projects/view.tsx#L96-L109): server name is muted at 70% over base. Light fails, dark passes.                                                                                                                                                                                                                                                                                                                                   |
| Captions and hints                    | [providers/connect/console.tsx:19,67–69](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/providers/connect/console.tsx#L67): 13px faint hint; [UI dialog.css:25](https://unpkg.com/@opencode/ui@2.0.21/src/overlays/dialog/dialog.css): layer-01. [new-session/workspace/selector.tsx:282](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/new-session/workspace/selector.tsx#L282): 13px faint branch caption on layer-02. Both examples fail in both schemes. |
| Timestamps                            | [session/commands/fork-dialog.tsx:89–106](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/session/commands/fork-dialog.tsx#L89-L106): legacy text-weak, 14px list row, transparent over dialog layer-01. Fails both.                                                                                                                                                                                                                                                                                                 |
| Tiny status/error secondary text      | [providers/connect/mcp-dialog.tsx:76,80](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/providers/connect/mcp-dialog.tsx#L76): 11px legacy text-weaker over dialog layer-01. Fails both.                                                                                                                                                                                                                                                                                                                            |
| Search placeholders                   | [home/sessions/view.tsx:320–332](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/home/sessions/view.tsx#L320-L332): faint on 60% layer-02 over base, opaque layer-02 when hovered/focused. Both states fail both schemes. [UI text-input.css:15–17,101–104](https://unpkg.com/@opencode/ui@2.0.21/src/forms/text-input/text-input.css) uses faint over a white-alpha gradient on base; both gradient endpoints fail both schemes, despite dark faint on plain base passing.                                          |
| Legacy placeholders                   | [UI text-field.css:20–22,51–52,100–102](https://unpkg.com/@opencode/ui@2.0.21/src/components/text-field.css): text-weak, input-base. [UI list.css:59–79](https://unpkg.com/@opencode/ui@2.0.21/src/components/list.css): search field uses surface-base. Both fail both schemes.                                                                                                                                                                                                                                                                                          |
| Disabled text                         | Console copy button above: UI ghost-muted keeps muted and applies opacity 0.5 ([button.css:262–264](https://unpkg.com/@opencode/ui@2.0.21/src/actions/button/button.css)); segmented control keeps muted, opacity 0.45 ([segmented-control.css:44,51–54](https://unpkg.com/@opencode/ui@2.0.21/src/navigation/segmented-control/segmented-control.css)); text-input applies opacity 0.5 to the entire control (text-input.css:46–49). These are inactive-control exceptions, not text contrast violations.                                                                |

There are **no global v2 text-weak/weaker/subtle tokens** in this package. Legacy `text-weak` and `text-weaker` do exist and differ from v2 muted/faint. Menu-local `--menu-v2-fg-muted` is **v2 faint**, whereas `--menu-v2-fg-subtle` is **v2 muted** ([menu.css:38–45](https://unpkg.com/@opencode/ui@2.0.21/src/navigation/menu/menu.css)); menu group labels use faint at 11px (170–180), over layer-01 (16), failing both schemes. Legacy `text-faint` is referenced by an app class but is not a defined package theme token. “Looks like OpenCode” therefore does not imply 4.5:1 everywhere: the source contains passing muted text and failing faint/legacy secondary text.

### Focus implementations, not just token colours

| Implementation                 | Token and geometry                                                                                                                                  | Source                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 button and icon-button      | `v2-border-border-focus`, 2px outline, 2.5px offset                                                                                                 | Published [button.css:33–35](https://unpkg.com/@opencode/ui@2.0.21/src/actions/button/button.css), [icon-button.css:25–27](https://unpkg.com/@opencode/ui@2.0.21/src/actions/icon-button/icon-button.css)                                                                                                                                                        |
| V2 segmented, radio, switch    | Same token, 2px, 1px offset                                                                                                                         | Published segmented-control.css:56–59; radio.css:101–105; switch.css:101–103                                                                                                                                                                                                                                                                                     |
| V2 text-input                  | Same token, **1px** outer outline, offset 0, `:focus-within`; inner icon button 2px, offset 1px                                                     | Published text-input.css:13–14,36–39,149–151                                                                                                                                                                                                                                                                                                                     |
| V2 split-button                | Same token, 2px, **−2px** inset offset                                                                                                              | Published split-button.css:45–47,69–71; an inset ring must be compared to the actual component fill, not just the page                                                                                                                                                                                                                                           |
| App's explicit ring            | Provider console external link uses focus token, 2px; no explicit offset                                                                            | [providers/connect/dialog.tsx:812](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/providers/connect/dialog.tsx#L812)                                                                                                                                                                                       |
| Legacy text-field and checkbox | Text-field shadows: 3px weak-selected halo plus 1px selected rim; checkbox: selected outer 3px spread with background-weak 2px gap and base 1px rim | Published text-field.css:54–62; checkbox.css:85–88; [styles/theme.css:70–77](https://unpkg.com/@opencode/ui@2.0.21/src/styles/theme.css). Legacy selected is **not** v2 focus; dark outer ring on layer-01 is only **2.44**.                                                                                                                                     |
| App controls without a ring    | Some use hover-like backgrounds and suppress outlines; not every app control uses the common ring                                                   | [shell/titlebar/titlebar.css:93–99](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/shell/titlebar/titlebar.css#L93-L99), [shell/commands/dialog.css:36–51,120–125](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/shell/commands/dialog.css#L36-L51) |

The prototype [e.css's final focus rule, lines 404–408](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/e-v1/e.css#L404-L408) uses `v2-border-border-selected`, 1px, offset 2px; [mobile chart SVG, m.css:699–702](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/variants/m-mobile/m.css#L699-L702) uses that name, 1px, offset −1px. Searches of **all published source/theme CSS** found no definition. An unresolved `var()` with no fallback makes these declarations invalid at computed-value time; there is no colour or ratio to resolve. They must not be silently measured as legacy `border-selected` or v2 `border-focus`. Standard behaviour is [CSS Variables: invalid at computed-value time](https://www.w3.org/TR/css-variables-1/#invalid-at-computed-value-time); no browser focus-navigation test is claimed here.

### CVD and nearest-step method

Simulation uses the authors' [Machado et al. 2009, supplementary Table 1](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html), severity **1.0**, applied to **linear sRGB**. Out-of-gamut linear channels are clipped to [0,1], then converted to **CIELAB with D65 white**; differences are **CIEDE2000**, `kL=kC=kH=1`. No D50 chromatic adaptation is used. The seven series plus grey yield 28 unordered pairs; kinds yield 10. ΔE00 <10 is the requested “hard to tell apart” screening threshold, **not a WCAG criterion or a perceptual guarantee**. These are simulations, not participant measurements. Clipping/white-point choices are stated because a near-10 pair can change membership under other conventions.

| Simulation   | Full-severity matrix rows                                                                     |
| ------------ | --------------------------------------------------------------------------------------------- |
| Protanopia   | `[0.152286,1.052583,-0.204868]; [0.114503,0.786281,0.099216]; [-0.003882,-0.048116,1.051998]` |
| Deuteranopia | `[0.367322,0.860646,-0.227968]; [0.280085,0.672501,0.047413]; [-0.011820,0.042940,0.968881]`  |
| Tritanopia   | `[1.255528,-0.076749,-0.178779]; [-0.078411,0.930809,0.147602]; [0.004733,0.691367,0.303900]` |

Calculations used Bun **1.4.2** and temporary **colorjs.io 0.6.0** for colour conversion/ΔE00 ([implementation](https://github.com/color-js/color.js/blob/v0.6.0/src/deltaE/deltaE2000.js)). Self-checks passed: black/white =21, identical greys =1, the published [Sharma CIEDE2000 test pair](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/) `(50,2.6772,−79.7751)/(50,0,−82.7485)` =2.0425 within 0.0001, and all 42 opaque chart-token/background ratios cross-checked against Color.js within 0.005 (its XYZ luminance weights are higher precision than WCAG's prescribed rounded weights). The displayed WCAG ratios are from the explicit WCAG formula above, not the library's slightly different luminance coefficients.

Nearest means **fewest numbered steps away** within the original hue ramp; ties select the higher resulting contrast/ΔE. For legacy colours not literally a ramp step and composited neutral borders, nearest is smallest **normal-vision D65 ΔE00** from the current visible colour among passing same-hue steps. Alpha borders are compared to **opaque** grey replacements; original alpha is not retained unless the row explicitly says 42% or 70%. The missing selected token has no original colour/hue, so there is no factual “nearest” step for it. For pair failures both one-sided alternatives are shown, holding the other original colour fixed. Those alternatives are independent: they are not a jointly passing palette, need not preserve level ordering, and can create other failures. Five colours cannot all have pairwise luminance contrast ≥3 within sRGB's 21:1 total range (`3⁴=81>21`); every pairwise alternative must not be read as a simultaneous solution.

## Resolved tokens

| Token                     | Light                                           | Dark                                        |
| ------------------------- | ----------------------------------------------- | ------------------------------------------- |
| v2-background-bg-deep     | v2-grey-100 → #fafafaff                         | v2-grey-1200 → #080808ff                    |
| v2-background-bg-base     | v2-grey-50 → #ffffffff                          | v2-grey-1100 → #161616ff                    |
| v2-background-bg-layer-01 | v2-grey-100 → #fafafaff                         | v2-grey-1000 → #242424ff                    |
| v2-background-bg-layer-02 | v2-grey-200 → #f2f2f2ff                         | v2-grey-900 → #2e2e2eff                     |
| v2-background-bg-layer-03 | v2-grey-300 → #eeeeeeff                         | v2-grey-800 → #3a3a3aff                     |
| v2-background-bg-inverse  | v2-grey-1100 → #161616ff                        | v2-grey-50 → #ffffffff                      |
| v2-text-text-base         | v2-grey-1100 → #161616ff                        | v2-grey-100 → #fafafaff                     |
| v2-text-text-muted        | v2-grey-700 → #5c5c5cff                         | v2-grey-500 → #aeaeaeff                     |
| v2-text-text-faint        | v2-grey-600 → #808080ff                         | v2-grey-600 → #808080ff                     |
| v2-text-text-accent       | v2-blue-600 → #3b5cf6ff                         | v2-blue-400 → #a2bcffff                     |
| v2-text-text-accent-hover | v2-blue-700 → #0b34f4ff                         | v2-blue-300 → #c3d4fdff                     |
| v2-text-text-code-accent  | v2-blue-900 → #2c47c8ff                         | v2-blue-400 → #a2bcffff                     |
| v2-text-text-code-path    | v2-blue-900 → #2c47c8ff                         | v2-blue-300 → #c3d4fdff                     |
| v2-text-text-inverse      | v2-grey-50 → #ffffffff                          | v2-grey-1100 → #161616ff                    |
| v2-text-text-contrast     | v2-grey-50 → #ffffffff                          | v2-grey-50 → #ffffffff                      |
| v2-state-fg-warning       | v2-yellow-800 → #cb9f34ff                       | v2-yellow-500 → #f2cf76ff                   |
| text-strong               | text-strong → #171717                           | text-strong → #EDEDED                       |
| text-base                 | text-base → #6F6F6F                             | text-base → #A0A0A0                         |
| text-weak                 | text-weak → #8F8F8F                             | text-weak → #707070                         |
| text-weaker               | text-weaker → #C7C7C7                           | text-weaker → #505050                       |
| v2-border-border-muted    | v2-alpha-dark-8 → #00000014                     | v2-alpha-light-8 → #ffffff14                |
| v2-border-border-base     | v2-alpha-dark-10 → #0000001a                    | v2-alpha-light-10 → #ffffff1a               |
| v2-border-border-strong   | v2-alpha-dark-20 → #00000033                    | v2-alpha-light-20 → #ffffff33               |
| v2-border-border-focus    | v2-blue-500 → #7698fdff                         | v2-blue-500 → #7698fdff                     |
| v2-border-border-selected | undefined                                       | undefined                                   |
| border-weak-base          | border-weak-base → #DBDBDB                      | border-weak-base → #282828                  |
| border-focus              | border-focus → #a6a5a4                          | border-focus → #5f5d5c                      |
| border-selected           | border-selected → rgba(5, 77, 253, 0.99)        | border-selected → rgba(20, 86, 247, 0.9)    |
| border-weak-selected      | border-weak-selected → rgba(210, 225, 253, 0.5) | border-weak-selected → rgba(2, 24, 88, 0.6) |
| input-base                | input-base → #f8f8f8                            | input-base → #151515                        |
| surface-base              | surface-base → #F8F8F8                          | surface-base → #1C1C1C                      |

## Text matrix

Each cell is ratio, then normal/large pass flags.

### light

| Token                     | deep      | base      | layer-01  | layer-02  | layer-03  |
| ------------------------- | --------- | --------- | --------- | --------- | --------- |
| v2-text-text-base         | 17.34 P/P | 18.10 P/P | 17.34 P/P | 16.16 P/P | 15.60 P/P |
| v2-text-text-muted        | 6.41 P/P  | 6.69 P/P  | 6.41 P/P  | 5.97 P/P  | 5.76 P/P  |
| v2-text-text-faint        | 3.78 F/P  | 3.95 F/P  | 3.78 F/P  | 3.53 F/P  | 3.40 F/P  |
| v2-text-text-accent       | 4.97 P/P  | 5.19 P/P  | 4.97 P/P  | 4.63 P/P  | 4.47 F/P  |
| v2-text-text-accent-hover | 7.16 P/P  | 7.47 P/P  | 7.16 P/P  | 6.67 P/P  | 6.44 P/P  |
| v2-text-text-code-accent  | 7.08 P/P  | 7.39 P/P  | 7.08 P/P  | 6.60 P/P  | 6.37 P/P  |
| v2-text-text-code-path    | 7.08 P/P  | 7.39 P/P  | 7.08 P/P  | 6.60 P/P  | 6.37 P/P  |
| v2-state-fg-warning       | 2.35 F/F  | 2.46 F/F  | 2.35 F/F  | 2.19 F/F  | 2.12 F/F  |
| text-strong               | 17.18 P/P | 17.93 P/P | 17.18 P/P | 16.01 P/P | 15.45 P/P |
| text-base                 | 4.81 P/P  | 5.02 P/P  | 4.81 P/P  | 4.49 F/P  | 4.33 F/P  |
| text-weak                 | 3.10 F/P  | 3.23 F/P  | 3.10 F/P  | 2.89 F/F  | 2.79 F/F  |
| text-weaker               | 1.62 F/F  | 1.69 F/F  | 1.62 F/F  | 1.51 F/F  | 1.46 F/F  |

### dark

| Token                     | deep      | base      | layer-01  | layer-02  | layer-03  |
| ------------------------- | --------- | --------- | --------- | --------- | --------- |
| v2-text-text-base         | 19.19 P/P | 17.34 P/P | 14.87 P/P | 13.01 P/P | 10.90 P/P |
| v2-text-text-muted        | 9.03 P/P  | 8.16 P/P  | 7.00 P/P  | 6.12 P/P  | 5.13 P/P  |
| v2-text-text-faint        | 5.07 P/P  | 4.58 P/P  | 3.93 F/P  | 3.44 F/P  | 2.88 F/F  |
| v2-text-text-accent       | 10.66 P/P | 9.63 P/P  | 8.26 P/P  | 7.23 P/P  | 6.05 P/P  |
| v2-text-text-accent-hover | 13.50 P/P | 12.20 P/P | 10.46 P/P | 9.15 P/P  | 7.67 P/P  |
| v2-text-text-code-accent  | 10.66 P/P | 9.63 P/P  | 8.26 P/P  | 7.23 P/P  | 6.05 P/P  |
| v2-text-text-code-path    | 13.50 P/P | 12.20 P/P | 10.46 P/P | 9.15 P/P  | 7.67 P/P  |
| v2-state-fg-warning       | 13.32 P/P | 12.03 P/P | 10.32 P/P | 9.03 P/P  | 7.56 P/P  |
| text-strong               | 17.11 P/P | 15.46 P/P | 13.26 P/P | 11.60 P/P | 9.72 P/P  |
| text-base                 | 7.66 P/P  | 6.92 P/P  | 5.94 P/P  | 5.19 P/P  | 4.35 F/P  |
| text-weak                 | 4.04 F/P  | 3.65 F/P  | 3.13 F/P  | 2.74 F/F  | 2.30 F/F  |
| text-weaker               | 2.48 F/F  | 2.24 F/F  | 1.93 F/F  | 1.68 F/F  | 1.41 F/F  |

| Pair                              | Light   | Dark    |
| --------------------------------- | ------- | ------- |
| inverse text / inverse background | 18.10 P | 18.10 P |

## Chart fills and partial buckets

Opaque fills and 42% partial fills on base.

| Token             | Light ramp / hex     | Light   | Dark ramp / hex      | Dark    | 42% light / hex  | 42% dark / hex   |
| ----------------- | -------------------- | ------- | -------------------- | ------- | ---------------- | ---------------- |
| chart-1           | blue-700 / #0b34f4   | 7.47 P  | blue-500 / #7698fd   | 6.62 P  | 2.22 F / #99aafa | 2.17 F / #3e4d77 |
| chart-2           | orange-700 / #ee7330 | 2.95 F  | orange-600 / #ff8648 | 7.54 P  | 1.56 F / #f8c4a8 | 2.31 F / #78452b |
| chart-3           | green-700 / #2eaf5a  | 2.84 F  | green-600 / #49c970  | 8.51 P  | 1.53 F / #a7ddba | 2.49 F / #2b613c |
| chart-4           | purple-600 / #7152f4 | 4.98 P  | purple-500 / #8271f8 | 4.88 P  | 1.84 F / #c3b6fa | 1.85 F / #433c75 |
| chart-5           | cyan-700 / #0096b8   | 3.47 P  | cyan-500 / #00c5df   | 8.66 P  | 1.66 F / #94d3e1 | 2.48 F / #0d606a |
| chart-6           | pink-700 / #e4429e   | 3.77 P  | pink-500 / #f26cb2   | 6.52 P  | 1.75 F / #f4b0d6 | 2.13 F / #723a58 |
| chart-7           | yellow-800 / #cb9f34 | 2.46 F  | yellow-600 / #f6c251 | 10.99 P | 1.43 F / #e9d7aa | 2.92 F / #745e2f |
| chart-other       | grey-500 / #aeaeae   | 2.22 F  | grey-700 / #5c5c5c   | 2.71 F  | 1.36 F / #ddd    | 1.44 F / #333    |
| kind-input        | blue-700 / #0b34f4   | 7.47 P  | blue-500 / #7698fd   | 6.62 P  | 2.22 F / #99aafa | 2.17 F / #3e4d77 |
| kind-cache-read   | blue-300 / #c3d4fd   | 1.48 F  | blue-1000 / #263fa9  | 2.04 F  | 1.17 F / #e6edfe | 1.27 F / #1d2754 |
| kind-cache-write  | cyan-600 / #00abcf   | 2.72 F  | cyan-600 / #00abcf   | 6.66 P  | 1.54 F / #94dceb | 2.14 F / #0d5564 |
| kind-output       | orange-700 / #ee7330 | 2.95 F  | orange-600 / #ff8648 | 7.54 P  | 1.56 F / #f8c4a8 | 2.31 F / #78452b |
| kind-reasoning    | purple-600 / #7152f4 | 4.98 P  | purple-500 / #8271f8 | 4.88 P  | 1.84 F / #c3b6fa | 1.85 F / #433c75 |
| level-0           | grey-200 / #f2f2f2   | 1.12 F  | grey-1000 / #242424  | 1.17 F  | not faded        | not faded        |
| level-1           | blue-300 / #c3d4fd   | 1.48 F  | blue-1100 / #22388f  | 1.75 F  | not faded        | not faded        |
| level-2           | blue-500 / #7698fd   | 2.73 F  | blue-900 / #2c47c8   | 2.45 F  | not faded        | not faded        |
| level-3           | blue-700 / #0b34f4   | 7.47 P  | blue-600 / #3b5cf6   | 3.49 P  | not faded        | not faded        |
| level-4           | blue-1100 / #22388f  | 10.34 P | blue-400 / #a2bcff   | 9.63 P  | not faded        | not faded        |
| outcome-succeeded | green-700 / #2eaf5a  | 2.84 F  | green-600 / #49c970  | 8.51 P  | not faded        | not faded        |
| outcome-failed    | red-700 / #d92e3c    | 4.77 P  | red-600 / #f1484f    | 4.98 P  | not faded        | not faded        |
| outcome-stopped   | grey-500 / #aeaeae   | 2.22 F  | grey-600 / #808080   | 4.58 P  | not faded        | not faded        |

## Adjacent levels and token kinds

| Outcome           | Surface  | Light ratio / nearest if failing | Dark ratio / nearest if failing |
| ----------------- | -------- | -------------------------------- | ------------------------------- |
| outcome-succeeded | layer-02 | 2.54 F → green-800 (3.90)        | 6.38 P                          |
| outcome-succeeded | layer-03 | 2.45 F → green-800 (3.76)        | 5.35 P                          |
| outcome-failed    | layer-02 | 4.26 P                           | 3.74 P                          |
| outcome-failed    | layer-03 | 4.11 P                           | 3.13 P                          |
| outcome-stopped   | layer-02 | 1.98 F → grey-600 (3.53)         | 3.44 P                          |
| outcome-stopped   | layer-03 | 1.91 F → grey-600 (3.40)         | 2.88 F → grey-500 (5.13)        |

| Pair                               | Light  | Dark   |
| ---------------------------------- | ------ | ------ |
| level-0 / level-1                  | 1.33 F | 1.50 F |
| level-1 / level-2                  | 1.84 F | 1.40 F |
| level-2 / level-3                  | 2.73 F | 1.42 F |
| level-3 / level-4                  | 1.38 F | 2.76 F |
| kind-input / kind-cache-read       | 5.03 P | 3.25 P |
| kind-input / kind-cache-write      | 2.75 F | 1.01 F |
| kind-input / kind-output           | 2.54 F | 1.14 F |
| kind-input / kind-reasoning        | 1.50 F | 1.36 F |
| kind-cache-read / kind-cache-write | 1.83 F | 3.27 P |
| kind-cache-read / kind-output      | 1.99 F | 3.70 P |
| kind-cache-read / kind-reasoning   | 3.36 P | 2.39 F |
| kind-cache-write / kind-output     | 1.08 F | 1.13 F |
| kind-cache-write / kind-reasoning  | 1.83 F | 1.36 F |
| kind-output / kind-reasoning       | 1.69 F | 1.55 F |

## Border composites and focus

### light

| Token  | deep             | base             | layer-01         | layer-02         | layer-03         |
| ------ | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| muted  | #e6e6e6 / 1.19 F | #ebebeb / 1.19 F | #e6e6e6 / 1.19 F | #dfdfdf / 1.19 F | #dbdbdb / 1.19 F |
| base   | #e1e1e1 / 1.26 F | #e5e5e5 / 1.26 F | #e1e1e1 / 1.26 F | #d9d9d9 / 1.26 F | #d6d6d6 / 1.26 F |
| strong | #c8c8c8 / 1.60 F | #ccc / 1.61 F    | #c8c8c8 / 1.60 F | #c2c2c2 / 1.60 F | #bebebe / 1.60 F |
| focus  | #7698fd / 2.62 F | #7698fd / 2.73 F | #7698fd / 2.62 F | #7698fd / 2.44 F | #7698fd / 2.36 F |

### dark

| Token  | deep             | base             | layer-01         | layer-02         | layer-03         |
| ------ | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| muted  | #1b1b1b / 1.17 F | #282828 / 1.23 F | #353535 / 1.27 F | #3e3e3e / 1.28 F | #494949 / 1.27 F |
| base   | #212121 / 1.25 F | #2e2e2e / 1.33 F | #3a3a3a / 1.37 F | #434343 / 1.38 F | #4e4e4e / 1.37 F |
| strong | #393939 / 1.74 F | #454545 / 1.88 F | #505050 / 1.92 F | #585858 / 1.90 F | #616161 / 1.85 F |
| focus  | #7698fd / 7.32 P | #7698fd / 6.62 P | #7698fd / 5.68 P | #7698fd / 4.97 P | #7698fd / 4.16 P |

| Range outline against | Light   | Dark    |
| --------------------- | ------- | ------- |
| base                  | 18.10 P | 17.34 P |
| level-0               | 16.16 P | 14.87 P |
| level-1               | 12.20 P | 9.91 P  |
| level-2               | 6.62 P  | 7.08 P  |
| level-3               | 2.42 F  | 4.97 P  |
| level-4               | 1.75 F  | 1.80 F  |

## Actual app examples and control edges

For completeness, the v2 focus token against **inverse background** is **6.62 P light / 2.73 F dark**; the nearest same-blue passing step for that dark comparison is **blue-600 (5.19)**. An outer ring around an inverse-filled button normally sits on the surrounding surface instead, so this is not an assertion about every inverse button's focus.

Disabled rows report ratios only (contrast-exempt). Nearest values are for this one comparison, not a coordinated palette.

| Example                                                     | Light ratio | Dark ratio  | Nearest light / dark passing step (ratio) |
| ----------------------------------------------------------- | ----------- | ----------- | ----------------------------------------- |
| Home secondary / base                                       | 6.69 P      | 8.16 P      | — / —                                     |
| Console browser hint / dialog layer-01                      | 3.78 F      | 3.93 F      | grey-700 (6.41) / grey-500 (7.00)         |
| Workspace branch caption / layer-02                         | 3.53 F      | 3.44 F      | grey-700 (5.97) / grey-500 (6.12)         |
| Home search placeholder / 60% layer-02 over base            | 3.69 F      | 3.91 F      | grey-700 (6.25) / grey-500 (6.96)         |
| Home search placeholder / focus layer-02                    | 3.53 F      | 3.44 F      | grey-700 (5.97) / grey-500 (6.12)         |
| Home server secondary / base at 70%                         | 3.32 F      | 4.61 P      | grey-800 (4.60) / —                       |
| Fork timestamp / dialog layer-01                            | 3.10 F      | 3.13 F      | grey-700 (6.41) / grey-500 (7.00)         |
| MCP status/error / dialog layer-01                          | 1.62 F      | 1.93 F      | grey-700 (6.41) / grey-500 (7.00)         |
| Legacy input placeholder / input-base                       | 3.05 F      | 3.69 F      | grey-700 (6.30) / grey-600 (4.62)         |
| Legacy list search placeholder / surface-base               | 3.05 F      | 3.44 F      | grey-700 (6.30) / grey-500 (7.68)         |
| Disabled ghost-muted button / dialog layer-01 at 50%        | 2.20 exempt | 2.83 exempt | — / —                                     |
| Disabled segmented muted label / layer-01 at 45%            | 2.01 exempt | 2.55 exempt | — / —                                     |
| Prototype search border / base interior                     | 1.26 F      | 1.33 F      | grey-600 (3.95) / grey-600 (4.58)         |
| Prototype search border / deep exterior (painted over base) | 1.21 F      | 1.47 F      | grey-600 (3.78) / grey-600 (5.07)         |
| Segment track outer shadow / base exterior                  | 1.26 F      | 1.33 F      | grey-600 (3.95) / grey-600 (4.58)         |
| Segment selected shadow / layer-01 track                    | 1.60 F      | 1.92 F      | grey-600 (3.78) / grey-600 (3.93)         |
| Legacy checkbox outline / base                              | 1.38 F      | 1.23 F      | grey-600 (3.95) / grey-600 (4.58)         |
| Legacy checkbox outline / layer-01                          | 1.33 F      | 1.05 F      | grey-600 (3.78) / grey-600 (3.93)         |
| Legacy checkbox focus outer ring / layer-01                 | 5.69 P      | 2.44 F      | — / blue-500 (5.68)                       |
| Legacy input border / input-base interior                   | 1.30 F      | 1.24 F      | grey-600 (3.72) / grey-600 (4.62)         |
| V2 input placeholder / 6% white gradient endpoint on base   | 3.95 F      | 3.94 F      | grey-700 (6.69) / grey-500 (7.02)         |
| V2 input placeholder / 2% white gradient endpoint on base   | 3.95 F      | 4.38 F      | grey-700 (6.69) / grey-500 (7.80)         |
| V2 input 0.5px neutral rim / base exterior                  | 1.38 F      | 1.88 F      | grey-600 (3.95) / grey-600 (4.58)         |

## Nearest passing steps

Text at 4.5, graphics/pairs/borders at 3. Original token is changed, other colour held fixed; opaque unless 42% stated.

| Mode  | Failure                            | Nearest step (ratio)                                                 |
| ----- | ---------------------------------- | -------------------------------------------------------------------- |
| light | v2-text-text-faint / deep          | grey-700 (6.41)                                                      |
| light | v2-text-text-faint / base          | grey-700 (6.69)                                                      |
| light | v2-text-text-faint / layer-01      | grey-700 (6.41)                                                      |
| light | v2-text-text-faint / layer-02      | grey-700 (5.97)                                                      |
| light | v2-text-text-faint / layer-03      | grey-700 (5.76)                                                      |
| light | v2-text-text-accent / layer-03     | blue-700 (6.44)                                                      |
| light | v2-state-fg-warning / deep         | yellow-1100 (6.88); large: yellow-900 (3.18)                         |
| light | v2-state-fg-warning / base         | yellow-1000 (4.56); large: yellow-900 (3.32)                         |
| light | v2-state-fg-warning / layer-01     | yellow-1100 (6.88); large: yellow-900 (3.18)                         |
| light | v2-state-fg-warning / layer-02     | yellow-1100 (6.42); large: yellow-1000 (4.08)                        |
| light | v2-state-fg-warning / layer-03     | yellow-1100 (6.19); large: yellow-1000 (3.93)                        |
| light | text-base / layer-02               | grey-700 (5.97)                                                      |
| light | text-base / layer-03               | grey-700 (5.76)                                                      |
| light | text-weak / deep                   | grey-700 (6.41)                                                      |
| light | text-weak / base                   | grey-700 (6.69)                                                      |
| light | text-weak / layer-01               | grey-700 (6.41)                                                      |
| light | text-weak / layer-02               | grey-700 (5.97); large: grey-600 (3.53)                              |
| light | text-weak / layer-03               | grey-700 (5.76); large: grey-600 (3.40)                              |
| light | text-weaker / deep                 | grey-700 (6.41); large: grey-600 (3.78)                              |
| light | text-weaker / base                 | grey-700 (6.69); large: grey-600 (3.95)                              |
| light | text-weaker / layer-01             | grey-700 (6.41); large: grey-600 (3.78)                              |
| light | text-weaker / layer-02             | grey-700 (5.97); large: grey-600 (3.53)                              |
| light | text-weaker / layer-03             | grey-700 (5.76); large: grey-600 (3.40)                              |
| light | chart-1 / base (42%)               | none (best 2.68)                                                     |
| light | chart-2 / base                     | orange-800 (3.77)                                                    |
| light | chart-2 / base (42%)               | none (best 2.32)                                                     |
| light | chart-3 / base                     | green-800 (4.36)                                                     |
| light | chart-3 / base (42%)               | none (best 2.41)                                                     |
| light | chart-4 / base (42%)               | none (best 2.63)                                                     |
| light | chart-5 / base (42%)               | none (best 2.43)                                                     |
| light | chart-6 / base (42%)               | none (best 2.40)                                                     |
| light | chart-7 / base                     | yellow-900 (3.32)                                                    |
| light | chart-7 / base (42%)               | none (best 2.19)                                                     |
| light | chart-other / base                 | grey-600 (3.95)                                                      |
| light | chart-other / base (42%)           | none (best 2.91)                                                     |
| light | kind-input / base (42%)            | none (best 2.68)                                                     |
| light | kind-cache-read / base             | blue-600 (5.19)                                                      |
| light | kind-cache-read / base (42%)       | none (best 2.68)                                                     |
| light | kind-cache-write / base            | cyan-700 (3.47)                                                      |
| light | kind-cache-write / base (42%)      | none (best 2.43)                                                     |
| light | kind-output / base                 | orange-800 (3.77)                                                    |
| light | kind-output / base (42%)           | none (best 2.32)                                                     |
| light | kind-reasoning / base (42%)        | none (best 2.63)                                                     |
| light | level-0 / base                     | grey-600 (3.95)                                                      |
| light | level-1 / base                     | blue-600 (5.19)                                                      |
| light | level-2 / base                     | blue-600 (5.19)                                                      |
| light | outcome-succeeded / base           | green-800 (4.36)                                                     |
| light | outcome-stopped / base             | grey-600 (3.95)                                                      |
| light | level-0 / level-1                  | level-0: grey-700 (4.51); level-1: blue-600 (4.63)                   |
| light | level-1 / level-2                  | level-1: blue-1000 (3.25); level-2: blue-600 (3.50)                  |
| light | level-2 / level-3                  | level-2: blue-400 (3.97); level-3: blue-1000 (3.25)                  |
| light | level-3 / level-4                  | level-3: blue-500 (3.78); level-4: blue-400 (3.97)                   |
| light | kind-input / kind-cache-write      | kind-input: blue-1000 (3.27); kind-cache-write: cyan-500 (3.58)      |
| light | kind-input / kind-output           | kind-input: blue-1000 (3.01); kind-output: orange-600 (3.11)         |
| light | kind-input / kind-reasoning        | kind-input: blue-300 (3.36); kind-reasoning: purple-300 (4.00)       |
| light | kind-cache-read / kind-cache-write | kind-cache-read: blue-1000 (3.27); kind-cache-write: cyan-800 (3.21) |
| light | kind-cache-read / kind-output      | kind-cache-read: blue-1000 (3.01); kind-output: orange-900 (3.31)    |
| light | kind-cache-write / kind-output     | kind-cache-write: cyan-1100 (3.50); kind-output: orange-1100 (3.21)  |
| light | kind-cache-write / kind-reasoning  | kind-cache-write: cyan-400 (3.01); kind-reasoning: purple-800 (3.02) |
| light | kind-output / kind-reasoning       | kind-output: orange-400 (3.18); kind-reasoning: purple-900 (3.41)    |
| light | border-muted / deep                | grey-600 (3.78)                                                      |
| light | border-muted / base                | grey-600 (3.95)                                                      |
| light | border-muted / layer-01            | grey-600 (3.78)                                                      |
| light | border-muted / layer-02            | grey-600 (3.53)                                                      |
| light | border-muted / layer-03            | grey-600 (3.40)                                                      |
| light | border-base / deep                 | grey-600 (3.78)                                                      |
| light | border-base / base                 | grey-600 (3.95)                                                      |
| light | border-base / layer-01             | grey-600 (3.78)                                                      |
| light | border-base / layer-02             | grey-600 (3.53)                                                      |
| light | border-base / layer-03             | grey-600 (3.40)                                                      |
| light | border-strong / deep               | grey-600 (3.78)                                                      |
| light | border-strong / base               | grey-600 (3.95)                                                      |
| light | border-strong / layer-01           | grey-600 (3.78)                                                      |
| light | border-strong / layer-02           | grey-600 (3.53)                                                      |
| light | border-strong / layer-03           | grey-600 (3.40)                                                      |
| light | border-focus / deep                | blue-600 (4.97)                                                      |
| light | border-focus / base                | blue-600 (5.19)                                                      |
| light | border-focus / layer-01            | blue-600 (4.97)                                                      |
| light | border-focus / layer-02            | blue-600 (4.63)                                                      |
| light | border-focus / layer-03            | blue-600 (4.47)                                                      |
| light | range-outline / level-3            | grey-500 (3.37)                                                      |
| light | range-outline / level-4            | grey-500 (4.66)                                                      |
| dark  | v2-text-text-faint / layer-01      | grey-500 (7.00)                                                      |
| dark  | v2-text-text-faint / layer-02      | grey-500 (6.12)                                                      |
| dark  | v2-text-text-faint / layer-03      | grey-500 (5.13); large: grey-500 (5.13)                              |
| dark  | text-base / layer-03               | grey-500 (5.13)                                                      |
| dark  | text-weak / deep                   | grey-600 (5.07)                                                      |
| dark  | text-weak / base                   | grey-600 (4.58)                                                      |
| dark  | text-weak / layer-01               | grey-500 (7.00)                                                      |
| dark  | text-weak / layer-02               | grey-500 (6.12); large: grey-600 (3.44)                              |
| dark  | text-weak / layer-03               | grey-500 (5.13); large: grey-500 (5.13)                              |
| dark  | text-weaker / deep                 | grey-600 (5.07); large: grey-600 (5.07)                              |
| dark  | text-weaker / base                 | grey-600 (4.58); large: grey-600 (4.58)                              |
| dark  | text-weaker / layer-01             | grey-500 (7.00); large: grey-600 (3.93)                              |
| dark  | text-weaker / layer-02             | grey-500 (6.12); large: grey-600 (3.44)                              |
| dark  | text-weaker / layer-03             | grey-500 (5.13); large: grey-500 (5.13)                              |
| dark  | chart-1 / base (42%)               | blue-300 (3.14)                                                      |
| dark  | chart-2 / base (42%)               | orange-400 (3.03)                                                    |
| dark  | chart-3 / base (42%)               | green-400 (3.08)                                                     |
| dark  | chart-4 / base (42%)               | purple-200 (3.22)                                                    |
| dark  | chart-5 / base (42%)               | cyan-300 (3.24)                                                      |
| dark  | chart-6 / base (42%)               | pink-300 (3.00)                                                      |
| dark  | chart-7 / base (42%)               | yellow-500 (3.10)                                                    |
| dark  | chart-other / base                 | grey-600 (4.58)                                                      |
| dark  | chart-other / base (42%)           | grey-400 (3.28)                                                      |
| dark  | kind-input / base (42%)            | blue-300 (3.14)                                                      |
| dark  | kind-cache-read / base             | blue-600 (3.49)                                                      |
| dark  | kind-cache-read / base (42%)       | blue-300 (3.14)                                                      |
| dark  | kind-cache-write / base (42%)      | cyan-300 (3.24)                                                      |
| dark  | kind-output / base (42%)           | orange-400 (3.03)                                                    |
| dark  | kind-reasoning / base (42%)        | purple-200 (3.22)                                                    |
| dark  | level-0 / base                     | grey-600 (4.58)                                                      |
| dark  | level-1 / base                     | blue-600 (3.49)                                                      |
| dark  | level-2 / base                     | blue-600 (3.49)                                                      |
| dark  | level-0 / level-1                  | level-0: grey-500 (4.66); level-1: blue-500 (5.68)                   |
| dark  | level-1 / level-2                  | level-1: blue-400 (3.93); level-2: blue-500 (3.78)                   |
| dark  | level-2 / level-3                  | level-2: blue-1200 (3.30); level-3: blue-400 (3.93)                  |
| dark  | level-3 / level-4                  | level-3: blue-700 (3.97); level-4: blue-300 (3.50)                   |
| dark  | kind-input / kind-cache-write      | kind-input: blue-1000 (3.27); kind-cache-write: cyan-1100 (3.77)     |
| dark  | kind-input / kind-output           | kind-input: blue-700 (3.11); kind-output: orange-1100 (3.19)         |
| dark  | kind-input / kind-reasoning        | kind-input: blue-200 (3.28); kind-reasoning: purple-900 (3.67)       |
| dark  | kind-cache-read / kind-reasoning   | kind-cache-read: blue-1200 (4.62); kind-reasoning: purple-400 (3.53) |
| dark  | kind-cache-write / kind-output     | kind-cache-write: cyan-1000 (3.26); kind-output: orange-1100 (3.21)  |
| dark  | kind-cache-write / kind-reasoning  | kind-cache-write: cyan-100 (3.34); kind-reasoning: purple-800 (3.02) |
| dark  | kind-output / kind-reasoning       | kind-output: orange-200 (3.13); kind-reasoning: purple-800 (3.42)    |
| dark  | border-muted / deep                | grey-600 (5.07)                                                      |
| dark  | border-muted / base                | grey-600 (4.58)                                                      |
| dark  | border-muted / layer-01            | grey-600 (3.93)                                                      |
| dark  | border-muted / layer-02            | grey-600 (3.44)                                                      |
| dark  | border-muted / layer-03            | grey-500 (5.13)                                                      |
| dark  | border-base / deep                 | grey-600 (5.07)                                                      |
| dark  | border-base / base                 | grey-600 (4.58)                                                      |
| dark  | border-base / layer-01             | grey-600 (3.93)                                                      |
| dark  | border-base / layer-02             | grey-600 (3.44)                                                      |
| dark  | border-base / layer-03             | grey-500 (5.13)                                                      |
| dark  | border-strong / deep               | grey-600 (5.07)                                                      |
| dark  | border-strong / base               | grey-600 (4.58)                                                      |
| dark  | border-strong / layer-01           | grey-600 (3.93)                                                      |
| dark  | border-strong / layer-02           | grey-600 (3.44)                                                      |
| dark  | border-strong / layer-03           | grey-500 (5.13)                                                      |
| dark  | range-outline / level-4            | grey-700 (3.56)                                                      |

## Colour-vision simulation

Nearest alternatives in this table target ΔE ≥10, not a WCAG ratio.

| Mode  | Group         | Vision       | Minimum ΔE00                       | Pairs below 10; nearest alternative (ΔE00)                                                                                                                                                                                                                                                                                  |
| ----- | ------------- | ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| light | series + more | normal       | 10.85 (chart-1/chart-4)            | none                                                                                                                                                                                                                                                                                                                        |
| light | series + more | protanopia   | 5.97 (chart-3/chart-7)             | chart-3/chart-7: 5.97 [chart-3→green-800 (13.40); chart-7→yellow-1000 (16.60)]; chart-1/chart-4: 7.06 [chart-1→blue-500 (14.78); chart-4→purple-500 (14.20)]; chart-2/chart-7: 8.99 [chart-2→orange-800 (15.64); chart-7→yellow-700 (14.28)]; chart-2/chart-3: 9.30 [chart-2→orange-800 (15.53); chart-3→green-600 (16.11)] |
| light | series + more | deuteranopia | 2.71 (chart-2/chart-7)             | chart-2/chart-7: 2.71 [chart-2→orange-900 (16.98); chart-7→yellow-1000 (15.27)]                                                                                                                                                                                                                                             |
| light | series + more | tritanopia   | 4.95 (chart-1/chart-4)             | chart-1/chart-4: 4.95 [chart-1→blue-500 (18.64); chart-4→purple-500 (13.05)]; chart-3/chart-5: 7.05 [chart-3→green-600 (12.01); chart-5→cyan-800 (13.63)]; chart-2/chart-6: 7.96 [chart-2→orange-500 (17.05); chart-6→pink-800 (12.63)]                                                                                     |
| light | token kinds   | normal       | 10.85 (kind-input/kind-reasoning)  | none                                                                                                                                                                                                                                                                                                                        |
| light | token kinds   | protanopia   | 7.06 (kind-input/kind-reasoning)   | kind-input/kind-reasoning: 7.06 [kind-input→blue-500 (14.78); kind-reasoning→purple-500 (14.20)]                                                                                                                                                                                                                            |
| light | token kinds   | deuteranopia | 10.76 (kind-input/kind-reasoning)  | none                                                                                                                                                                                                                                                                                                                        |
| light | token kinds   | tritanopia   | 4.95 (kind-input/kind-reasoning)   | kind-input/kind-reasoning: 4.95 [kind-input→blue-500 (18.64); kind-reasoning→purple-500 (13.05)]                                                                                                                                                                                                                            |
| dark  | series + more | normal       | 13.06 (chart-1/chart-4)            | none                                                                                                                                                                                                                                                                                                                        |
| dark  | series + more | protanopia   | 6.72 (chart-3/chart-7)             | chart-3/chart-7: 6.72 [chart-3→green-700 (11.48); chart-7→yellow-900 (15.35)]; chart-1/chart-4: 8.91 [chart-1→blue-400 (18.74); chart-4→purple-600 (14.78)]                                                                                                                                                                 |
| dark  | series + more | deuteranopia | 7.74 (chart-2/chart-7)             | chart-2/chart-7: 7.74 [chart-2→orange-700 (12.45); chart-7→yellow-400 (13.36)]; chart-1/chart-4: 7.84 [chart-1→blue-400 (18.92); chart-4→purple-600 (14.67)]; chart-2/chart-3: 8.87 [chart-2→orange-700 (10.36); chart-3→green-700 (12.41)]                                                                                 |
| dark  | series + more | tritanopia   | 5.29 (chart-2/chart-6)             | chart-2/chart-6: 5.29 [chart-2→orange-400 (17.33); chart-6→pink-400 (10.54)]; chart-3/chart-5: 5.98 [chart-3→green-700 (11.17); chart-5→cyan-300 (12.53)]                                                                                                                                                                   |
| dark  | token kinds   | normal       | 13.06 (kind-input/kind-reasoning)  | none                                                                                                                                                                                                                                                                                                                        |
| dark  | token kinds   | protanopia   | 8.91 (kind-input/kind-reasoning)   | kind-input/kind-reasoning: 8.91 [kind-input→blue-400 (18.74); kind-reasoning→purple-600 (14.78)]; kind-input/kind-cache-write: 9.90 [kind-input→blue-600 (19.24); kind-cache-write→cyan-500 (14.18)]                                                                                                                        |
| dark  | token kinds   | deuteranopia | 7.36 (kind-input/kind-cache-write) | kind-input/kind-cache-write: 7.36 [kind-input→blue-600 (17.91); kind-cache-write→cyan-700 (10.71)]; kind-input/kind-reasoning: 7.84 [kind-input→blue-400 (18.92); kind-reasoning→purple-600 (14.67)]                                                                                                                        |
| dark  | token kinds   | tritanopia   | 7.00 (kind-input/kind-cache-write) | kind-input/kind-cache-write: 7.00 [kind-input→blue-600 (19.23); kind-cache-write→cyan-500 (11.50)]                                                                                                                                                                                                                          |

## Summary counts

Core-text counts below exclude warning and inverse; add one inverse pass in each scheme. Outcome base counts are supplemented by the two table-row surfaces. Range-outline fill comparisons are diagnostic for the offset-0 fit mode; a gapped outline has just the base-surface comparison, which passes in both schemes. The undefined prototype focus token and native checkbox outlines are not assigned invented ratios.

| Mode  | Group                                  | Pass/fail | Worst ratio              |
| ----- | -------------------------------------- | --------- | ------------------------ |
| light | core text (base/muted/faint/accent ×5) | 14/6      | faint/layer-03: 3.40     |
| light | warning                                | 0/5       | layer-03: 2.12           |
| light | chart-                                 | 4/4       | chart-other: 2.22        |
| light | kind-                                  | 2/3       | kind-cache-read: 1.48    |
| light | level-                                 | 2/3       | level-0: 1.12            |
| light | outcome-                               | 1/2       | outcome-stopped: 2.22    |
| light | partial series+kinds                   | 0/13      | kind-cache-read: 1.17    |
| light | border muted/base/strong ×5            | 0/15      | muted/layer-03: 1.19     |
| light | focus ×5                               | 0/5       | layer-03: 2.36           |
| light | range outline ×base+5 levels           | 4/2       | level-4: 1.75            |
| dark  | core text (base/muted/faint/accent ×5) | 17/3      | faint/layer-03: 2.88     |
| dark  | warning                                | 5/0       | layer-03: 7.56           |
| dark  | chart-                                 | 7/1       | chart-other: 2.71        |
| dark  | kind-                                  | 4/1       | kind-cache-read: 2.04    |
| dark  | level-                                 | 2/3       | level-0: 1.17            |
| dark  | outcome-                               | 3/0       | outcome-stopped: 4.58    |
| dark  | partial series+kinds                   | 0/13      | kind-cache-read: 1.27    |
| dark  | border muted/base/strong ×5            | 0/15      | muted/deep: 1.17         |
| dark  | focus ×5                               | 5/0       | layer-03: 4.16           |
| dark  | range outline ×base+5 levels           | 5/1       | level-4: 1.80            |
| light | adjacent level pairs                   | 0/4       | level-0/1: 1.33          |
| dark  | adjacent level pairs                   | 0/4       | level-1/2: 1.40          |
| light | token-kind pairs                       | 2/8       | cache-write/output: 1.08 |
| dark  | token-kind pairs                       | 3/7       | input/cache-write: 1.01  |
| light | outcomes ×base/layer-02/layer-03       | 3/6       | stopped/layer-03: 1.91   |
| dark  | outcomes ×base/layer-02/layer-03       | 8/1       | stopped/layer-03: 2.88   |
