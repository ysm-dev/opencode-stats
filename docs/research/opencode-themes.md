# OpenCode's 36 themes against the dashboard's colour rules

Research for [#26](https://github.com/ysm-dev/opencode-stats/issues/26), measured **2026-10-04**. This is colour and implementation evidence, not a complete WCAG audit or a decision to weaken [ADR 0014](https://github.com/ysm-dev/opencode-stats/blob/main/docs/adr/0014-the-dashboard-meets-wcag-2-2-aa-even-where-opencodes-look-falls-short.md).

## Findings at a glance

- **The oc-2 control matches the earlier contrast findings:** 42 opaque chart/background ratios, 13 additional contrast checks and all 16 series/kind × vision minima match at the earlier report's two-decimal precision. The same published resolvers and calculation conventions were used.
- **None of the 72 palettes passes every requested role as supplied.** The scorecard deliberately starts charts at the prototype's step names, not an invented final AA palette; oc-2 still needs the already-agreed chart and edge changes. Light palettes pass **12–38 of 47** comparisons; dark **34–39 of 48**.
- **54 palettes (18 themes in both schemes) can satisfy every measured contrast comparison by foreground step moves within their resolved ramps.** **18 light palettes cannot:** 18 inverse-text comparisons, plus two muted-text surfaces in Everforest and three in Solarized. No chart hue, focus hue or control grey lacks a passing candidate.
- The strict rule “change only the failing foreground, within its ramp” is therefore insufficient for all themes. A small extension has measurable alternatives: change those 18 inverse **backgrounds** by one or two grey steps, and promote the five unrepairable muted-text uses to their theme's existing base text. All those alternatives pass; no off-theme colour is needed for these comparisons.
- **White matters.** Every resolved theme also retains OpenCode's constant grey-50 (#fff), in addition to its generated 100–1200 grey steps. Including that existing step gives the 54/18 classification above; forbidding it leaves only **47** repairable palettes and **25** with a foreground-ramp failure. It is not a newly invented colour.
- Theme-derived charts are not a stable categorical palette: **60/72** original series palettes have a normal-vision pair below ΔE00 10; **all 72** have such a pair under each full-severity CVD simulation. **39 non-default palettes** have identical/near-identical hue seeds (ΔE00 <3). Ramp names describe seed roles, not guaranteed hues.
- Nearest contrast moves alone do not fix distinctness: series still collide in **60/72** palettes, and normal-vision token-kind collisions rise from **11/72 to 40/72**. The two first contribution levels select the same nearest passing blue in **all 72** palettes. Every palette has at least **five** distinct blue step candidates passing against both base and empty; choosing four ordered levels is feasible but is a separate, coordinated choice.
- Each individual series palette admits an order avoiding adjacent pairs below ΔE00 10 across all four vision conditions, but **no one fixed order of the eight token IDs works across all 72 palettes**, before or after contrast repair. After repair, every one of the 28 possible pairs is confused in at least one palette.
- Fixed chart colours are feasible in principle, but not automatically portable: copying the contrast-repaired oc-2 colours unchanged passes these chart comparisons in **56/72** palettes, not all 72. A chart-local surface or further tuning would still need an explicit choice and tests.
- All 36 JSONs total **93,226 raw bytes**; **22,822 gzip bytes** if separately compressed, **13,190** as one concatenation. One variant's cached CSS is **17,034–17,528 UTF-8 bytes** (about 17 KB, not all 36 CSS strings). Both caches together are about 34 KB of ASCII text, roughly 68 KB if counted as UTF-16 code units.
- Warm resolver + CSS serialization: Bun median/p95 **0.171/0.218 ms**; headless Chromium **0.20/0.30 ms**. These are not cold switching or real dashboard paint times. A synthetic 1,000-row style replacement + forced style calculation was **5.00/5.40 ms**; actual paint was not measured.
- Vite 8's default build really splits the published provider: **35 non-default JSON chunks** plus an entry containing oc-2. With `build.rolldownOptions.output.codeSplitting: false`, all 36 are in **one JS file**; the fixture entry grows by **12,274 gzip bytes**. Theme selection uses immediate setters, not the provider's preview API.

## Provenance and measurement method

**Published npm is the authority:** [@opencode/ui@2.0.21 tarball](https://registry.npmjs.org/@opencode/ui/-/ui-2.0.21.tgz), registry SHA-1 **b3fc5704efeca16e6dbda2ad8b674a25f4bfb8ea**, matching the [earlier report](https://github.com/ysm-dev/opencode-stats/blob/research/accessibility-contrast/docs/research/accessibility-contrast.md). Installed in approved temporary storage, never in the main clone. Its 36 `src/theme/themes/*.json` files, not terminal/TUI themes or static screenshots, supply the 72 variants. The current OpenCode checkout was read-only, branch `v2`, commit **d9d094a54378a8af4852a6c3594e0a8a91e2d498**. A directory comparison found all published theme-source files byte-identical to that checkout; the checkout additionally has a schema and resolver test. No database was opened, and no project/session/message content was used.

This note was produced in a separate temporary worktree, branch `research/opencode-themes`, based on `origin/main` **352aefb**. Only this Markdown file is committed. Measurement scripts (`measure.mjs`, `report.mjs`, `browser.ts`, `playwright.mjs`, `build.mjs`), dependencies, full pairwise outputs and build manifests remain in the approved temporary directory's `themes-measure/` scratch area, outside the repo. The main clone and OpenCode checkout's working files were not changed.

### Resolving what ThemeProvider actually applies

The published [provider](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/context.tsx#L133-L170) executes, in order:

1. `resolveThemeVariant(variant, isDark)` and `themeToCss` for legacy tokens;
2. `resolveThemeVariantV2(variant, isDark)` and `themeV2ToCss` for v2 tokens;
3. both strings into the same unlayered `:root` style element.

Measurements execute those exact package functions. Token lookup overlays the static `src/styles/tokens/colors.css` defaults with both runtime maps, then resolves `var()` recursively. Alpha primitives use the actual 8-bit alpha, not the percentage in their names. Theme colour values are decoded as sRGB; all ratio decisions use **unrounded** values. Displayed ratios are two decimals; a displayed 4.50 can still fail.

The [v2 resolver](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/v2/resolve.ts#L72-L139) regenerates grey/blue/green/yellow/red/purple/pink/orange/cyan 100–1200 per variant, merges default primitives, then semantic mappings, generated foregrounds and `v2Overrides`. Oc-2's overrides restore its familiar ramps and different surface mappings. Non-default themes do **not** merely recolour a single fixed oc-2 ramp. Their default dark layers are grey-800/600/500, unlike oc-2's 1000/900/800. Their base/muted text is generated from ink (and sometimes legacy `text-weak`), not necessarily a numbered grey step; see [foreground.ts](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/v2/foreground.ts#L31-L60).

### Contrast, distance and nearest steps

The method is the [earlier report's](https://github.com/ysm-dev/opencode-stats/blob/research/accessibility-contrast/docs/research/accessibility-contrast.md#provenance-and-measurement-method): WCAG sRGB linearization at **0.04045**, luminance weights **0.2126/0.7152/0.0722**, ratio `(Lmax+0.05)/(Lmin+0.05)`; **sRGB-encoded** alpha compositing before linearization. Text threshold **4.5:1**; marks/edges/focus **3:1**. Borders are composited onto the surface they actually touch and replaced by an **opaque** grey candidate, not a grey retaining the old alpha.

Nearest for an explicit/reference-linked ramp step means fewest adjacent numbered steps away, ties favouring higher contrast. Candidates are 100–1200; grey additionally includes the existing grey-50 default. For a generated, non-step text colour or an alpha border, nearest means smallest **normal-vision D65 CIEDE2000** from the original visible colour among passing grey steps, as before. Such a colour has **no factual number of steps away**. The tables say `ΔE n; ~k steps`: `k` is only a movement proxy, counting from the closest pre-change grey step to the chosen candidate. A 50→100 move is one adjacent step, not half a step.

The scorecard sums exact step distances plus those proxies **per comparison**, not per unique CSS variable. The same foreground tested on five surfaces can count five times; it is a deliberately crude workload/visual-change indicator, not a perceptual distance or implementation patch size. An unresolved role adds `+?`; its cost is unknown, not zero. Independent nearest alternatives are not a jointly optimized palette. A separate existence check requires one candidate to pass every background used by each role: it gives the same 54/18 split. Contribution-level ordering and categorical distinctness still need a coordinated palette.

CVD uses **Machado 2009 severity 1.0**, applied in **linear sRGB**, clipping channels to [0,1], then **CIELAB D65** and **CIEDE2000** (kL=kC=kH=1) through **colorjs.io 0.6.0**. To avoid the library automatically adapting these coordinates to D50, the calculated D65 Lab triples are passed directly to its Lab-based difference calculation. This is the earlier report's no-D50 convention. ΔE00 <10 is a screening threshold, **not WCAG** or evidence from human participants.

| Simulation   | Matrix rows                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- |
| protanopia   | [0.152286,1.052583,-0.204868]; [0.114503,0.786281,0.099216]; [-0.003882,-0.048116,1.051998] |
| deuteranopia | [0.367322,0.860646,-0.227968]; [0.280085,0.672501,0.047413]; [-0.011820,0.042940,0.968881]  |
| tritanopia   | [1.255528,-0.076749,-0.178779]; [-0.078411,0.930809,0.147602]; [0.004733,0.691367,0.303900] |

Black/white checks at 21:1; Sharma's published CIEDE2000 pair gives **2.04245968** (expected 2.0425). The oc-2 control checks named above all passed. Examples: light series orange-700 **2.95**, green-700 **2.84**, yellow-800 **2.46**; dark “more” **2.71**; light adjusted focus blue-600 on layer-03 **4.47**; muted there **5.76 light / 5.13 dark**. Different counts from the earlier report are **different scope**, not different colours: faint is excluded, warning/focus use #25's overrides, accent excludes light layer-03, level-0 is decorative and not a required mark.

## 1. Dashboard roles and nearest passing steps

The [#25 resolution](https://github.com/ysm-dev/opencode-stats/issues/25) and ADR 0014 specify passing colours but explicitly leave the final chart palette to the build. The chart recipe below is the [prototype at 726a30c](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/style.css#L18-L66), applied **by token name** to every theme. This avoids pretending #25 selected a final chart palette. The separately named starting steps are checked below too.

### Comparisons counted

| Role          | Foreground                                             | Backgrounds                        | Threshold | Light / dark count |
| ------------- | ------------------------------------------------------ | ---------------------------------- | --------- | ------------------ |
| Base text     | v2-text-text-base                                      | deep, base, layer-01/02/03         | 4.5       | 5 / 5              |
| Muted text    | v2-text-text-muted                                     | deep, base, layer-01/02/03         | 4.5       | 5 / 5              |
| Accent text   | v2-text-text-accent                                    | same, **excluding light layer-03** | 4.5       | 4 / 5              |
| Warning       | light yellow-1100; dark v2-state-fg-warning            | base                               | 4.5       | 1 / 1              |
| Inverse text  | v2-text-text-inverse                                   | v2-background-bg-inverse           | 4.5       | 1 / 1              |
| Focus         | light blue-600; dark v2-border-border-focus            | five normal surfaces               | 3         | 5 / 5              |
| Series + more | eight prototype chart tokens                           | base                               | 3         | 8 / 8              |
| Token kinds   | five prototype kind tokens                             | base                               | 3         | 5 / 5              |
| Contribution  | level-1/2/3/4                                          | base **and level-0**               | 3         | 8 / 8              |
| Outcomes      | three prototype outcome tokens                         | base                               | 3         | 3 / 3              |
| Control edges | v2-border-border-base, composited; nearest opaque grey | base and layer-01                  | 3         | 2 / 2              |
| Total         |                                                        |                                    |           | **47 / 48**        |

Surface shorthand expands to `v2-background-bg-…`; token shorthand in all remaining tables omits `v2-`. Empty level-0 is layer-02 in light, layer-01 in dark. Required mark/background comparisons do not include contrasts between every adjacent level: #25 permits a graded heat map, and stacked segments use a surface-coloured gap. Partial buckets need a full-strength passing outline, not a passing 42%-opacity fill; the outline is represented by the same chart colour here. Decorative borders, disabled text and other WCAG exceptions are not scored as controls.

| Chart token       | Light ramp             | Dark ramp              |
| ----------------- | ---------------------- | ---------------------- |
| chart-1           | blue-700               | blue-500               |
| chart-2           | orange-700             | orange-600             |
| chart-3           | green-700              | green-600              |
| chart-4           | purple-600             | purple-500             |
| chart-5           | cyan-700               | cyan-500               |
| chart-6           | pink-700               | pink-500               |
| chart-7           | yellow-800             | yellow-600             |
| chart-other       | grey-500               | grey-700               |
| kind-input        | blue-700               | blue-500               |
| kind-cache-read   | blue-300               | blue-1000              |
| kind-cache-write  | cyan-600               | cyan-600               |
| kind-output       | orange-700             | orange-600             |
| kind-reasoning    | purple-600             | purple-500             |
| level-0           | background-bg-layer-02 | background-bg-layer-01 |
| level-1           | blue-300               | blue-1100              |
| level-2           | blue-500               | blue-900               |
| level-3           | blue-700               | blue-600               |
| level-4           | blue-1100              | blue-400               |
| outcome-succeeded | green-700              | green-600              |
| outcome-failed    | red-700                | red-600                |
| outcome-stopped   | grey-500               | grey-600               |

### The specific light starting steps named by #25

Each cell is the ratio on that theme's **base**, followed by P/F at 3. Blue-600+ means candidates, not a guarantee that four selected levels stay distinct/ordered. The seven listed blue steps are 600,700,800,900,1000,1100,1200 in that order. Level-0 comparisons are tested separately in the complete failure tables.

| Theme ID               | orange-800 | green-800 | yellow-900 | grey-600 | blue-600 through 1200                                |
| ---------------------- | ---------- | --------- | ---------- | -------- | ---------------------------------------------------- |
| `amoled`               | 4.51 P     | 4.05 P    | 6.42 P     | 1.45 F   | 6.25P, 8.21P, 10.70P, 13.29P, 15.95P, 17.45P, 18.32P |
| `aura`                 | 5.13 P     | 4.18 P    | 6.62 P     | 1.35 F   | 2.89F, 3.92P, 5.46P, 7.46P, 10.17P, 13.36P, 16.37P   |
| `ayu`                  | 5.21 P     | 4.37 P    | 7.04 P     | 1.26 F   | 2.62F, 3.45P, 4.57P, 6.75P, 9.45P, 13.05P, 16.67P    |
| `carbonfox`            | 4.28 P     | 8.03 P    | 6.18 P     | 1.41 F   | 4.30P, 5.72P, 7.67P, 10.19P, 12.98P, 15.24P, 16.88P  |
| `catppuccin`           | 5.96 P     | 5.39 P    | 6.56 P     | 1.26 F   | 2.87F, 3.83P, 5.30P, 7.17P, 9.76P, 13.16P, 16.12P    |
| `catppuccin-frappe`    | 5.96 P     | 5.39 P    | 6.56 P     | 1.26 F   | 2.87F, 3.83P, 5.30P, 7.17P, 9.76P, 13.16P, 16.12P    |
| `catppuccin-macchiato` | 5.96 P     | 5.39 P    | 6.56 P     | 1.26 F   | 2.87F, 3.83P, 5.30P, 7.17P, 9.76P, 13.16P, 16.12P    |
| `cobalt2`              | 5.22 P     | 4.86 P    | 7.35 P     | 1.34 F   | 5.58P, 7.52P, 10.03P, 13.19P, 16.41P, 18.84P, 20.27P |
| `cursor`               | 8.27 P     | 7.71 P    | 7.62 P     | 1.43 F   | 6.10P, 8.23P, 11.08P, 14.24P, 17.26P, 19.20P, 20.15P |
| `dracula`              | 4.94 P     | 4.31 P    | 6.99 P     | 1.38 F   | 3.79P, 5.27P, 7.32P, 9.58P, 12.35P, 14.82P, 17.12P   |
| `everforest`           | 6.42 P     | 4.85 P    | 7.04 P     | 1.23 F   | 2.73F, 3.62P, 4.85P, 6.57P, 9.26P, 12.68P, 16.24P    |
| `flexoki`              | 11.96 P    | 8.05 P    | 11.18 P    | 1.44 F   | 6.41P, 8.62P, 11.40P, 14.68P, 17.59P, 19.40P, 20.23P |
| `github`               | 12.38 P    | 9.45 P    | 11.67 P    | 1.37 F   | 5.21P, 6.95P, 9.40P, 12.32P, 15.62P, 18.13P, 19.95P  |
| `gruvbox`              | 8.90 P     | 8.09 P    | 8.25 P     | 1.32 F   | 5.76P, 8.15P, 10.88P, 14.03P, 16.80P, 18.33P, 18.99P |
| `kanagawa`             | 8.16 P     | 6.08 P    | 7.45 P     | 1.28 F   | 5.55P, 7.88P, 10.89P, 14.07P, 16.42P, 17.43P, 17.88P |
| `lucent-orng`          | 8.22 P     | 9.70 P    | 7.67 P     | 1.40 F   | 3.27P, 4.29P, 5.76P, 7.67P, 10.19P, 13.36P, 16.66P   |
| `material`             | 4.86 P     | 4.46 P    | 6.88 P     | 1.34 F   | 2.58F, 3.38P, 4.51P, 6.60P, 9.31P, 12.82P, 16.49P    |
| `matrix`               | 4.36 P     | 4.10 P    | 6.29 P     | 1.35 F   | 2.20F, 3.00F, 4.33P, 6.35P, 8.96P, 12.29P, 15.59P    |
| `mercury`              | 13.40 P    | 11.66 P   | 14.29 P    | 1.33 F   | 5.93P, 8.24P, 11.13P, 13.97P, 17.08P, 19.08P, 20.39P |
| `monokai`              | 4.89 P     | 4.35 P    | 6.90 P     | 1.38 F   | 2.67F, 3.63P, 5.34P, 7.65P, 10.47P, 13.86P, 17.02P   |
| `nightowl`             | 8.68 P     | 4.95 P    | 8.18 P     | 1.29 F   | 3.94P, 5.32P, 7.25P, 9.62P, 12.42P, 14.78P, 16.76P   |
| `nord`                 | 6.41 P     | 4.17 P    | 6.63 P     | 1.33 F   | 3.56P, 4.77P, 6.42P, 8.72P, 11.54P, 14.03P, 16.15P   |
| `oc-2`                 | 3.77 P     | 4.36 P    | 3.32 P     | 3.95 P   | 5.19P, 7.47P, 6.27P, 7.39P, 8.87P, 10.34P, 17.11P    |
| `one-dark`             | 7.82 P     | 5.46 P    | 7.27 P     | 1.32 F   | 3.89P, 5.35P, 7.28P, 9.66P, 12.66P, 15.18P, 17.50P   |
| `onedarkpro`           | 5.77 P     | 4.94 P    | 6.82 P     | 1.34 F   | 3.02P, 4.06P, 5.57P, 7.48P, 9.93P, 13.11P, 16.39P    |
| `orng`                 | 8.72 P     | 10.28 P   | 8.13 P     | 1.41 F   | 3.46P, 4.54P, 6.10P, 8.13P, 10.80P, 14.16P, 17.65P   |
| `osaka-jade`           | 6.13 P     | 8.54 P    | 6.57 P     | 1.41 F   | 2.68F, 3.55P, 4.79P, 6.51P, 8.96P, 12.34P, 15.84P    |
| `palenight`            | 4.86 P     | 4.46 P    | 6.88 P     | 1.36 F   | 3.98P, 5.56P, 7.57P, 10.18P, 13.35P, 15.86P, 17.96P  |
| `rosepine`             | 5.08 P     | 10.26 P   | 6.71 P     | 1.26 F   | 4.83P, 6.49P, 8.83P, 11.62P, 14.79P, 17.09P, 18.64P  |
| `shadesofpurple`       | 4.47 P     | 4.10 P    | 6.38 P     | 1.33 F   | 4.03P, 5.77P, 7.64P, 9.94P, 12.73P, 15.00P, 16.94P   |
| `solarized`            | 7.71 P     | 5.43 P    | 7.23 P     | 1.21 F   | 3.46P, 4.61P, 6.22P, 8.41P, 11.17P, 13.90P, 16.47P   |
| `synthwave84`          | 5.00 P     | 4.66 P    | 7.04 P     | 1.37 F   | 2.27F, 3.09P, 4.50P, 6.61P, 9.35P, 12.89P, 16.45P    |
| `tokyonight`           | 9.98 P     | 7.58 P    | 9.40 P     | 1.32 F   | 3.25P, 4.35P, 5.82P, 7.80P, 10.31P, 12.55P, 14.62P   |
| `vercel`               | 5.36 P     | 7.52 P    | 7.31 P     | 1.41 F   | 4.52P, 6.09P, 8.18P, 10.93P, 14.13P, 16.88P, 19.16P  |
| `vesper`               | 4.49 P     | 4.10 P    | 6.49 P     | 1.44 F   | 2.26F, 3.08P, 4.44P, 6.49P, 9.03P, 12.24P, 15.50P    |
| `zenburn`              | 8.56 P     | 6.66 P    | 8.05 P     | 1.32 F   | 4.21P, 5.68P, 7.67P, 10.38P, 13.46P, 16.37P, 18.64P  |

### Control edges, every palette

These are nearest to the theme's **visible base border**, by D65 ΔE00, on each surface, not blindly grey-600 everywhere. All original control-border comparisons fail. Different base/layer-01 choices are allowed; a control touching two surfaces must pass both, and should choose a candidate meeting both comparisons.

| Theme ID               | Scheme | Base replacement (ratio) | Layer-01 replacement (ratio) |
| ---------------------- | ------ | ------------------------ | ---------------------------- |
| `amoled`               | light  | grey-900 (3.40)          | grey-900 (3.08)              |
| `amoled`               | dark   | grey-300 (6.49)          | grey-300 (6.38)              |
| `aura`                 | light  | grey-1000 (4.39)         | grey-1000 (4.02)             |
| `aura`                 | dark   | grey-400 (3.31)          | grey-400 (3.02)              |
| `ayu`                  | light  | grey-1100 (4.49)         | grey-1100 (4.22)             |
| `ayu`                  | dark   | grey-300 (5.36)          | grey-300 (4.91)              |
| `carbonfox`            | light  | grey-900 (3.06)          | grey-1000 (4.87)             |
| `carbonfox`            | dark   | grey-400 (3.41)          | grey-300 (5.03)              |
| `catppuccin`           | light  | grey-1000 (3.02)         | grey-1100 (4.38)             |
| `catppuccin`           | dark   | grey-300 (5.15)          | grey-300 (4.65)              |
| `catppuccin-frappe`    | light  | grey-1000 (3.02)         | grey-1100 (4.38)             |
| `catppuccin-frappe`    | dark   | grey-300 (4.61)          | grey-300 (4.09)              |
| `catppuccin-macchiato` | light  | grey-1000 (3.02)         | grey-1100 (4.38)             |
| `catppuccin-macchiato` | dark   | grey-300 (4.93)          | grey-300 (4.43)              |
| `cobalt2`              | light  | grey-1000 (4.18)         | grey-1000 (3.84)             |
| `cobalt2`              | dark   | grey-400 (3.72)          | grey-400 (3.21)              |
| `cursor`               | light  | grey-900 (3.19)          | grey-1000 (5.24)             |
| `cursor`               | dark   | grey-400 (3.21)          | grey-300 (5.22)              |
| `dracula`              | light  | grey-1000 (4.90)         | grey-1000 (4.48)             |
| `dracula`              | dark   | grey-400 (3.64)          | grey-400 (3.21)              |
| `everforest`           | light  | grey-1100 (3.64)         | grey-1100 (3.44)             |
| `everforest`           | dark   | grey-300 (4.37)          | grey-300 (3.90)              |
| `flexoki`              | light  | grey-900 (3.33)          | grey-900 (3.00)              |
| `flexoki`              | dark   | grey-300 (4.80)          | grey-300 (4.45)              |
| `github`               | light  | grey-1000 (4.64)         | grey-1000 (4.25)             |
| `github`               | dark   | grey-300 (4.98)          | grey-300 (4.62)              |
| `gruvbox`              | light  | grey-1000 (3.82)         | grey-1000 (3.54)             |
| `gruvbox`              | dark   | grey-400 (3.09)          | grey-300 (4.64)              |
| `kanagawa`             | light  | grey-1000 (3.24)         | grey-1000 (3.02)             |
| `kanagawa`             | dark   | grey-300 (5.07)          | grey-300 (4.62)              |
| `lucent-orng`          | light  | grey-900 (3.03)          | grey-1000 (4.82)             |
| `lucent-orng`          | dark   | grey-400 (3.40)          | grey-400 (3.04)              |
| `material`             | light  | grey-1000 (4.23)         | grey-1000 (3.91)             |
| `material`             | dark   | grey-400 (3.62)          | grey-400 (3.14)              |
| `matrix`               | light  | grey-1000 (4.31)         | grey-1000 (3.96)             |
| `matrix`               | dark   | grey-400 (3.07)          | grey-300 (5.29)              |
| `mercury`              | light  | grey-1000 (4.02)         | grey-1000 (3.72)             |
| `mercury`              | dark   | grey-400 (3.06)          | grey-300 (5.04)              |
| `monokai`              | light  | grey-1000 (4.81)         | grey-1000 (4.40)             |
| `monokai`              | dark   | grey-400 (3.61)          | grey-400 (3.15)              |
| `nightowl`             | light  | grey-1000 (3.49)         | grey-1000 (3.25)             |
| `nightowl`             | dark   | grey-400 (3.04)          | grey-300 (5.08)              |
| `nord`                 | light  | grey-1000 (3.92)         | grey-1000 (3.62)             |
| `nord`                 | dark   | grey-400 (3.23)          | grey-300 (4.82)              |
| `oc-2`                 | light  | grey-600 (3.95)          | grey-600 (3.78)              |
| `oc-2`                 | dark   | grey-600 (4.58)          | grey-600 (3.93)              |
| `one-dark`             | light  | grey-1000 (3.86)         | grey-1000 (3.56)             |
| `one-dark`             | dark   | grey-300 (3.71)          | grey-300 (3.38)              |
| `onedarkpro`           | light  | grey-1000 (4.19)         | grey-1000 (3.86)             |
| `onedarkpro`           | dark   | grey-300 (3.84)          | grey-300 (3.53)              |
| `orng`                 | light  | grey-900 (3.07)          | grey-1000 (4.92)             |
| `orng`                 | dark   | grey-400 (3.28)          | grey-400 (3.04)              |
| `osaka-jade`           | light  | grey-900 (3.02)          | grey-1000 (4.83)             |
| `osaka-jade`           | dark   | grey-300 (4.38)          | grey-300 (4.03)              |
| `palenight`            | light  | grey-1000 (4.38)         | grey-1000 (4.02)             |
| `palenight`            | dark   | grey-300 (3.59)          | grey-300 (3.29)              |
| `rosepine`             | light  | grey-1100 (4.47)         | grey-1100 (4.18)             |
| `rosepine`             | dark   | grey-400 (3.12)          | grey-300 (5.15)              |
| `shadesofpurple`       | light  | grey-1000 (3.93)         | grey-1000 (3.63)             |
| `shadesofpurple`       | dark   | grey-400 (3.45)          | grey-400 (3.11)              |
| `solarized`            | light  | grey-1100 (3.54)         | grey-1100 (3.35)             |
| `solarized`            | dark   | grey-300 (3.20)          | grey-200 (4.48)              |
| `synthwave84`          | light  | grey-1000 (4.76)         | grey-1000 (4.35)             |
| `synthwave84`          | dark   | grey-400 (3.72)          | grey-400 (3.29)              |
| `tokyonight`           | light  | grey-1000 (3.78)         | grey-1000 (3.50)             |
| `tokyonight`           | dark   | grey-300 (4.74)          | grey-300 (4.33)              |
| `vercel`               | light  | grey-900 (3.15)          | grey-1000 (5.14)             |
| `vercel`               | dark   | grey-300 (5.61)          | grey-300 (5.51)              |
| `vesper`               | light  | grey-900 (3.22)          | grey-1000 (5.28)             |
| `vesper`               | dark   | grey-400 (3.65)          | grey-400 (3.31)              |
| `zenburn`              | light  | grey-1000 (3.72)         | grey-1000 (3.44)             |
| `zenburn`              | dark   | grey-300 (4.70)          | grey-300 (4.13)              |

### Where a foreground ramp cannot pass

Grey-50 **is included** below. All 23 failures are in light mode. A maximum of 4.49 is not a pass. “Move inverse background” holds the original inverse text fixed; “use base text” keeps the background fixed. These are measured alternatives to the strict foreground-only rule, **not already accepted decisions**.

| Theme ID               | Failing role        | Best same-ramp ratio | Alternative using this theme                    |
| ---------------------- | ------------------- | -------------------- | ----------------------------------------------- |
| `ayu`                  | inverse/inverse     | 3.03                 | inverse background → grey-1200, +2 steps (6.32) |
| `catppuccin`           | inverse/inverse     | 3.36                 | inverse background → grey-1100, +1 steps (4.67) |
| `catppuccin-frappe`    | inverse/inverse     | 3.36                 | inverse background → grey-1100, +1 steps (4.67) |
| `catppuccin-macchiato` | inverse/inverse     | 3.36                 | inverse background → grey-1100, +1 steps (4.67) |
| `cobalt2`              | inverse/inverse     | 4.18                 | inverse background → grey-1100, +1 steps (7.47) |
| `everforest`           | text-muted/layer-02 | 4.46                 | base text (9.14)                                |
| `everforest`           | text-muted/layer-03 | 4.28                 | base text (8.78)                                |
| `everforest`           | inverse/inverse     | 2.68                 | inverse background → grey-1200, +2 steps (4.90) |
| `gruvbox`              | inverse/inverse     | 4.19                 | inverse background → grey-1100, +1 steps (6.45) |
| `kanagawa`             | inverse/inverse     | 3.77                 | inverse background → grey-1100, +1 steps (5.17) |
| `material`             | inverse/inverse     | 4.41                 | inverse background → grey-1100, +1 steps (7.51) |
| `mercury`              | inverse/inverse     | 4.02                 | inverse background → grey-1100, +1 steps (7.05) |
| `nightowl`             | inverse/inverse     | 3.94                 | inverse background → grey-1100, +1 steps (5.69) |
| `nord`                 | inverse/inverse     | 4.44                 | inverse background → grey-1100, +1 steps (6.72) |
| `one-dark`             | inverse/inverse     | 4.03                 | inverse background → grey-1100, +1 steps (6.57) |
| `onedarkpro`           | inverse/inverse     | 4.49                 | inverse background → grey-1100, +1 steps (7.41) |
| `rosepine`             | inverse/inverse     | 3.18                 | inverse background → grey-1200, +2 steps (6.24) |
| `shadesofpurple`       | inverse/inverse     | 4.39                 | inverse background → grey-1100, +1 steps (6.76) |
| `solarized`            | text-muted/layer-01 | 4.47                 | base text (9.14)                                |
| `solarized`            | text-muted/layer-02 | 4.31                 | base text (8.82)                                |
| `solarized`            | text-muted/layer-03 | 4.13                 | base text (8.45)                                |
| `solarized`            | inverse/inverse     | 2.63                 | inverse background → grey-1200, +2 steps (4.73) |
| `zenburn`              | inverse/inverse     | 3.74                 | inverse background → grey-1100, +1 steps (6.26) |

No foreground-ramp solution does **not** mean that AA is physically impossible in that theme. Inverse background moves repair all 18 inverse pairs, and the theme's unmodified base text passes on the five Everforest/Solarized surfaces where no grey-ramp muted replacement can pass. The latter base colours are generated foregrounds outside the numbered grey ramp. If “own generated 100–1200 steps only” excludes inherited white, these additional palettes lose their foreground-only solution: Aura light, Matrix light, One Dark dark, Palenight light/dark, Solarized dark and Tokyonight light. Other already-failing palettes may gain extra unrepairable roles too.

### Complete failure list and nearest replacements

Every failed scored comparison is included below; absent comparisons pass as supplied. Each comma-separated ratio follows the listed role order. Explicit step moves show `+n` adjacent steps (distance, not necessarily darker); non-step colours show ΔE from their visible original and an approximate step proxy. “None” reports the best available ratio. The controls are repeated here so no failure is omitted. All replacements are opaque, except that the original border ratio is composited.

<details>
<summary>AMOLED (amoled)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | chart-3/base, outcome-succeeded/base                | green-700          | 2.77, 2.77       | green-800         | +1 steps           | 4.05, 4.05                        |
| light  | chart-5/base                                        | cyan-700           | 2.89             | cyan-800          | +1 steps           | 4.18                              |
| light  | chart-6/base                                        | pink-700           | 2.91             | pink-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.29, 1.29       | grey-900          | +4 steps           | 3.40, 3.40                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.09, 1.09, 1.08 | blue-600          | +3 steps           | 6.25, 6.25, 5.29                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.13             | cyan-800          | +2 steps           | 4.18                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.49, 1.26       | blue-600          | +1 steps           | 6.25, 5.29                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-900          | ΔE 24.72; ~4 steps | 3.40                              |
| light  | edge/layer-01                                       | border-border-base | 1.25             | grey-900          | ΔE 22.47; ~3 steps | 3.08                              |
| dark   | chart-other/base                                    | grey-700           | 1.06             | grey-300          | +4 steps           | 6.49                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.90             | blue-800          | +2 steps           | 3.88                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.19             | grey-300          | +3 steps           | 6.49                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.44, 1.42       | blue-800          | +3 steps           | 3.88, 3.82                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.66, 2.61       | blue-800          | +1 steps           | 3.88, 3.82                        |
| dark   | edge/base                                           | border-border-base | 1.21             | grey-300          | ΔE 40.90; ~3 steps | 6.49                              |
| dark   | edge/layer-01                                       | border-border-base | 1.22             | grey-300          | ΔE 40.14; ~3 steps | 6.38                              |

</details>

<details>
<summary>Aura (aura)</summary>

| Scheme | Role / background                                                      | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02             | text-text-accent   | 2.76, 2.89, 2.65, 2.51       | blue-800          | +2 steps           | 5.22, 5.46, 5.01, 4.74            |
| light  | inverse/inverse                                                        | text-text-inverse  | 4.39                         | grey-50           | +1 steps           | 4.81                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.76, 2.89, 2.65, 2.51, 2.34 | blue-700          | +1 steps           | 3.75, 3.92, 3.60, 3.40, 3.18      |
| light  | chart-3/base, outcome-succeeded/base                                   | green-700          | 2.85, 2.85                   | green-800         | +1 steps           | 4.18, 4.18                        |
| light  | chart-5/base                                                           | cyan-700           | 2.97                         | cyan-800          | +1 steps           | 4.27                              |
| light  | chart-6/base                                                           | pink-700           | 2.98                         | pink-800          | +1 steps           | 4.31                              |
| light  | chart-other/base, outcome-stopped/base                                 | grey-500           | 1.23, 1.23                   | grey-1000         | +5 steps           | 4.39, 4.39                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                    | blue-300           | 1.13, 1.13, 1.02             | blue-700          | +4 steps           | 3.92, 3.92, 3.40                  |
| light  | kind-cache-write/base                                                  | cyan-600           | 2.17                         | cyan-800          | +2 steps           | 4.27                              |
| light  | level-2/base, level-2/level-0                                          | blue-500           | 1.55, 1.34                   | blue-700          | +2 steps           | 3.92, 3.40                        |
| light  | edge/base                                                              | border-border-base | 1.26                         | grey-1000         | ΔE 32.00; ~5 steps | 4.39                              |
| light  | edge/layer-01                                                          | border-border-base | 1.26                         | grey-1000         | ΔE 30.02; ~4 steps | 4.02                              |
| dark   | chart-other/base                                                       | grey-700           | 1.22                         | grey-400          | +3 steps           | 3.31                              |
| dark   | kind-cache-read/base                                                   | blue-1000          | 1.70                         | blue-800          | +2 steps           | 3.18                              |
| dark   | outcome-stopped/base                                                   | grey-600           | 1.46                         | grey-400          | +2 steps           | 3.31                              |
| dark   | level-1/base                                                           | blue-1100          | 1.28                         | blue-800          | +3 steps           | 3.18                              |
| dark   | level-1/level-0                                                        | blue-1100          | 1.17                         | blue-700          | +4 steps           | 3.96                              |
| dark   | level-2/base                                                           | blue-900           | 2.32                         | blue-800          | +1 steps           | 3.18                              |
| dark   | level-2/level-0                                                        | blue-900           | 2.11                         | blue-700          | +2 steps           | 3.96                              |
| dark   | edge/base                                                              | border-border-base | 1.31                         | grey-400          | ΔE 20.61; ~3 steps | 3.31                              |
| dark   | edge/layer-01                                                          | border-border-base | 1.35                         | grey-400          | ΔE 17.81; ~2 steps | 3.02                              |

</details>

<details>
<summary>Ayu (ayu)</summary>

| Scheme | Role / background                                      | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ------------------------------------------------------ | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/layer-01, accent/layer-02          | text-text-accent   | 2.53, 2.46, 2.35       | blue-900          | +3 steps           | 6.52, 6.33, 6.06                  |
| light  | accent/base                                            | text-text-accent   | 2.62                   | blue-800          | +2 steps           | 4.57                              |
| light  | inverse/inverse                                        | text-text-inverse  | 2.93                   | **none**          | —                  | 3.03                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02 | blue-600           | 2.53, 2.62, 2.46, 2.35 | blue-700          | +1 steps           | 3.34, 3.45, 3.24, 3.10            |
| light  | focus/layer-03                                         | blue-600           | 2.24                   | blue-800          | +2 steps           | 3.91                              |
| light  | chart-4/base, kind-reasoning/base                      | purple-600         | 2.62, 2.62             | purple-700        | +1 steps           | 3.57, 3.57                        |
| light  | chart-other/base, outcome-stopped/base                 | grey-500           | 1.17, 1.17             | grey-1100         | +6 steps           | 4.49, 4.49                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0    | blue-300           | 1.17, 1.17, 1.05       | blue-700          | +4 steps           | 3.45, 3.45, 3.10                  |
| light  | kind-cache-write/base                                  | cyan-600           | 2.31                   | cyan-700          | +1 steps           | 3.14                              |
| light  | level-2/base, level-2/level-0                          | blue-500           | 1.57, 1.41             | blue-700          | +2 steps           | 3.45, 3.10                        |
| light  | edge/base                                              | border-border-base | 1.26                   | grey-1100         | ΔE 32.82; ~5 steps | 4.49                              |
| light  | edge/layer-01                                          | border-border-base | 1.26                   | grey-1100         | ΔE 31.46; ~5 steps | 4.22                              |
| dark   | chart-other/base                                       | grey-700           | 1.19                   | grey-300          | +4 steps           | 5.36                              |
| dark   | kind-cache-read/base                                   | blue-1000          | 1.94                   | blue-800          | +2 steps           | 4.06                              |
| dark   | outcome-stopped/base                                   | grey-600           | 1.40                   | grey-300          | +3 steps           | 5.36                              |
| dark   | level-1/base, level-1/level-0                          | blue-1100          | 1.42, 1.30             | blue-800          | +3 steps           | 4.06, 3.72                        |
| dark   | level-2/base, level-2/level-0                          | blue-900           | 2.75, 2.52             | blue-800          | +1 steps           | 4.06, 3.72                        |
| dark   | edge/base                                              | border-border-base | 1.29                   | grey-300          | ΔE 33.91; ~3 steps | 5.36                              |
| dark   | edge/layer-01                                          | border-border-base | 1.34                   | grey-300          | ΔE 31.26; ~3 steps | 4.91                              |

</details>

<details>
<summary>Carbonfox (carbonfox)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 4.11, 4.30, 3.93, 3.68 | blue-700          | +1 steps           | 5.46, 5.72, 5.22, 4.88            |
| light  | chart-2/base, kind-output/base                             | orange-700         | 3.00, 3.00             | orange-800        | +1 steps           | 4.28, 4.28                        |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.27, 1.27             | grey-900          | +4 steps           | 3.06, 3.06                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.06, 1.06, 1.11       | blue-600          | +3 steps           | 4.30, 4.30, 3.68                  |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.43, 1.22             | blue-600          | +1 steps           | 4.30, 3.68                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-900          | ΔE 22.01; ~4 steps | 3.06                              |
| light  | edge/layer-01                                              | border-border-base | 1.25                   | grey-1000         | ΔE 35.36; ~4 steps | 4.87                              |
| dark   | text-muted/layer-03                                        | text-text-muted    | 4.35                   | grey-100          | ΔE 7.18; ~1 steps  | 5.89                              |
| dark   | chart-other/base                                           | grey-700           | 1.31                   | grey-400          | +3 steps           | 3.41                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.33                   | blue-700          | +3 steps           | 3.20                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.61                   | grey-400          | +2 steps           | 3.41                              |
| dark   | level-1/base                                               | blue-1100          | 1.05                   | blue-700          | +4 steps           | 3.20                              |
| dark   | level-1/level-0                                            | blue-1100          | 1.10                   | blue-600          | +5 steps           | 3.78                              |
| dark   | level-2/base                                               | blue-900           | 1.78                   | blue-700          | +2 steps           | 3.20                              |
| dark   | level-2/level-0                                            | blue-900           | 1.55                   | blue-600          | +3 steps           | 3.78                              |
| dark   | edge/base                                                  | border-border-base | 1.38                   | grey-400          | ΔE 21.60; ~3 steps | 3.41                              |
| dark   | edge/layer-01                                              | border-border-base | 1.38                   | grey-300          | ΔE 36.50; ~3 steps | 5.03                              |

</details>

<details>
<summary>Catppuccin (catppuccin)</summary>

| Scheme | Role / background                                                      | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02             | text-text-accent   | 2.77, 2.87, 2.69, 2.57       | blue-800          | +2 steps           | 5.12, 5.30, 4.97, 4.75            |
| light  | inverse/inverse                                                        | text-text-inverse  | 3.02                         | **none**          | —                  | 3.36                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.77, 2.87, 2.69, 2.57, 2.43 | blue-700          | +1 steps           | 3.70, 3.83, 3.60, 3.44, 3.25      |
| light  | chart-5/base                                                           | cyan-700           | 2.93                         | cyan-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base                                 | grey-500           | 1.18, 1.18                   | grey-1000         | +5 steps           | 3.02, 3.02                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                    | blue-300           | 1.11, 1.11, 1.01             | blue-700          | +4 steps           | 3.83, 3.83, 3.44                  |
| light  | kind-cache-write/base                                                  | cyan-600           | 2.16                         | cyan-800          | +2 steps           | 4.24                              |
| light  | level-2/base, level-2/level-0                                          | blue-500           | 1.51, 1.35                   | blue-700          | +2 steps           | 3.83, 3.44                        |
| light  | edge/base                                                              | border-border-base | 1.26                         | grey-1000         | ΔE 22.73; ~4 steps | 3.02                              |
| light  | edge/layer-01                                                          | border-border-base | 1.26                         | grey-1100         | ΔE 33.09; ~5 steps | 4.38                              |
| dark   | chart-other/base                                                       | grey-700           | 1.21                         | grey-300          | +4 steps           | 5.15                              |
| dark   | kind-cache-read/base                                                   | blue-1000          | 1.76                         | blue-800          | +2 steps           | 3.60                              |
| dark   | outcome-stopped/base                                                   | grey-600           | 1.43                         | grey-300          | +3 steps           | 5.15                              |
| dark   | level-1/base, level-1/level-0                                          | blue-1100          | 1.30, 1.17                   | blue-800          | +3 steps           | 3.60, 3.24                        |
| dark   | level-2/base, level-2/level-0                                          | blue-900           | 2.46, 2.22                   | blue-800          | +1 steps           | 3.60, 3.24                        |
| dark   | edge/base                                                              | border-border-base | 1.33                         | grey-300          | ΔE 32.87; ~3 steps | 5.15                              |
| dark   | edge/layer-01                                                          | border-border-base | 1.36                         | grey-300          | ΔE 30.25; ~3 steps | 4.65                              |

</details>

<details>
<summary>Catppuccin Frappe (catppuccin-frappe)</summary>

| Scheme | Role / background                                                      | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02             | text-text-accent   | 2.77, 2.87, 2.69, 2.57       | blue-800          | +2 steps           | 5.12, 5.30, 4.97, 4.75            |
| light  | inverse/inverse                                                        | text-text-inverse  | 3.02                         | **none**          | —                  | 3.36                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.77, 2.87, 2.69, 2.57, 2.43 | blue-700          | +1 steps           | 3.70, 3.83, 3.60, 3.44, 3.25      |
| light  | chart-5/base                                                           | cyan-700           | 2.93                         | cyan-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base                                 | grey-500           | 1.18, 1.18                   | grey-1000         | +5 steps           | 3.02, 3.02                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                    | blue-300           | 1.11, 1.11, 1.01             | blue-700          | +4 steps           | 3.83, 3.83, 3.44                  |
| light  | kind-cache-write/base                                                  | cyan-600           | 2.16                         | cyan-800          | +2 steps           | 4.24                              |
| light  | level-2/base, level-2/level-0                                          | blue-500           | 1.51, 1.35                   | blue-700          | +2 steps           | 3.83, 3.44                        |
| light  | edge/base                                                              | border-border-base | 1.26                         | grey-1000         | ΔE 22.73; ~4 steps | 3.02                              |
| light  | edge/layer-01                                                          | border-border-base | 1.26                         | grey-1100         | ΔE 33.09; ~5 steps | 4.38                              |
| dark   | text-muted/layer-03                                                    | text-text-muted    | 4.43                         | grey-100          | ΔE 3.52; ~0 steps  | 5.12                              |
| dark   | chart-other/base                                                       | grey-700           | 1.25                         | grey-300          | +4 steps           | 4.61                              |
| dark   | kind-cache-read/base                                                   | blue-1000          | 1.50                         | blue-800          | +2 steps           | 3.10                              |
| dark   | outcome-stopped/base                                                   | grey-600           | 1.48                         | grey-300          | +3 steps           | 4.61                              |
| dark   | level-1/base                                                           | blue-1100          | 1.11                         | blue-800          | +3 steps           | 3.10                              |
| dark   | level-1/level-0                                                        | blue-1100          | 1.02                         | blue-700          | +4 steps           | 3.98                              |
| dark   | level-2/base                                                           | blue-900           | 2.10                         | blue-800          | +1 steps           | 3.10                              |
| dark   | level-2/level-0                                                        | blue-900           | 1.87                         | blue-700          | +2 steps           | 3.98                              |
| dark   | edge/base                                                              | border-border-base | 1.37                         | grey-300          | ΔE 30.63; ~3 steps | 4.61                              |
| dark   | edge/layer-01                                                          | border-border-base | 1.38                         | grey-300          | ΔE 28.14; ~3 steps | 4.09                              |

</details>

<details>
<summary>Catppuccin Macchiato (catppuccin-macchiato)</summary>

| Scheme | Role / background                                                      | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02             | text-text-accent   | 2.77, 2.87, 2.69, 2.57       | blue-800          | +2 steps           | 5.12, 5.30, 4.97, 4.75            |
| light  | inverse/inverse                                                        | text-text-inverse  | 3.02                         | **none**          | —                  | 3.36                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.77, 2.87, 2.69, 2.57, 2.43 | blue-700          | +1 steps           | 3.70, 3.83, 3.60, 3.44, 3.25      |
| light  | chart-5/base                                                           | cyan-700           | 2.93                         | cyan-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base                                 | grey-500           | 1.18, 1.18                   | grey-1000         | +5 steps           | 3.02, 3.02                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                    | blue-300           | 1.11, 1.11, 1.01             | blue-700          | +4 steps           | 3.83, 3.83, 3.44                  |
| light  | kind-cache-write/base                                                  | cyan-600           | 2.16                         | cyan-800          | +2 steps           | 4.24                              |
| light  | level-2/base, level-2/level-0                                          | blue-500           | 1.51, 1.35                   | blue-700          | +2 steps           | 3.83, 3.44                        |
| light  | edge/base                                                              | border-border-base | 1.26                         | grey-1000         | ΔE 22.73; ~4 steps | 3.02                              |
| light  | edge/layer-01                                                          | border-border-base | 1.26                         | grey-1100         | ΔE 33.09; ~5 steps | 4.38                              |
| dark   | chart-other/base                                                       | grey-700           | 1.24                         | grey-300          | +4 steps           | 4.93                              |
| dark   | kind-cache-read/base                                                   | blue-1000          | 1.67                         | blue-800          | +2 steps           | 3.43                              |
| dark   | outcome-stopped/base                                                   | grey-600           | 1.45                         | grey-300          | +3 steps           | 4.93                              |
| dark   | level-1/base, level-1/level-0                                          | blue-1100          | 1.23, 1.10                   | blue-800          | +3 steps           | 3.43, 3.08                        |
| dark   | level-2/base, level-2/level-0                                          | blue-900           | 2.33, 2.09                   | blue-800          | +1 steps           | 3.43, 3.08                        |
| dark   | edge/base                                                              | border-border-base | 1.35                         | grey-300          | ΔE 31.79; ~3 steps | 4.93                              |
| dark   | edge/layer-01                                                          | border-border-base | 1.37                         | grey-300          | ΔE 29.32; ~3 steps | 4.43                              |

</details>

<details>
<summary>Cobalt2 (cobalt2)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/layer-03                                 | text-text-muted    | 4.44             | grey-1100         | ΔE 12.05; ~0 steps | 6.08                              |
| light  | inverse/inverse                                     | text-text-inverse  | 4.18             | **none**          | —                  | 4.18                              |
| light  | chart-4/base, kind-reasoning/base                   | purple-600         | 2.73, 2.73       | purple-700        | +1 steps           | 3.63, 3.63                        |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.23, 1.23       | grey-1000         | +5 steps           | 4.18, 4.18                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.23, 1.23, 1.08 | blue-600          | +3 steps           | 5.58, 5.58, 4.89                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.63             | cyan-700          | +1 steps           | 3.61                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.65, 1.45       | blue-600          | +1 steps           | 5.58, 4.89                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-1000         | ΔE 31.64; ~5 steps | 4.18                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 30.01; ~4 steps | 3.84                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 3.33             | grey-200          | ΔE 13.81; ~0 steps | 4.69                              |
| dark   | chart-other/base                                    | grey-700           | 1.33             | grey-400          | +3 steps           | 3.72                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.37             | blue-700          | +3 steps           | 3.32                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.67             | grey-400          | +2 steps           | 3.72                              |
| dark   | level-1/base                                        | blue-1100          | 1.10             | blue-700          | +4 steps           | 3.32                              |
| dark   | level-1/level-0                                     | blue-1100          | 1.05             | blue-600          | +5 steps           | 3.79                              |
| dark   | level-2/base                                        | blue-900           | 1.82             | blue-700          | +2 steps           | 3.32                              |
| dark   | level-2/level-0                                     | blue-900           | 1.57             | blue-600          | +3 steps           | 3.79                              |
| dark   | edge/base                                           | border-border-base | 1.36             | grey-400          | ΔE 26.71; ~4 steps | 3.72                              |
| dark   | edge/layer-01                                       | border-border-base | 1.37             | grey-400          | ΔE 23.07; ~3 steps | 3.21                              |

</details>

<details>
<summary>Cursor (cursor)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | chart-4/base, kind-reasoning/base                   | purple-600         | 2.93, 2.93       | purple-700        | +1 steps           | 3.86, 3.86                        |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.27, 1.27       | grey-900          | +4 steps           | 3.19, 3.19                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.19, 1.19, 1.02 | blue-600          | +3 steps           | 6.10, 6.10, 5.20                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.60             | cyan-700          | +1 steps           | 3.43                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.60, 1.37       | blue-600          | +1 steps           | 6.10, 5.20                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-900          | ΔE 22.75; ~4 steps | 3.19                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 36.56; ~4 steps | 5.24                              |
| dark   | text-muted/deep                                     | text-text-muted    | 2.95             | grey-300          | ΔE 19.56; ~1 steps | 5.91                              |
| dark   | text-muted/base                                     | text-text-muted    | 2.96             | grey-300          | ΔE 18.77; ~1 steps | 5.77                              |
| dark   | text-muted/layer-01                                 | text-text-muted    | 2.95             | grey-300          | ΔE 16.05; ~1 steps | 5.22                              |
| dark   | text-muted/layer-02                                 | text-text-muted    | 2.70             | grey-200          | ΔE 23.43; ~2 steps | 6.70                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 2.38             | grey-200          | ΔE 18.85; ~1 steps | 5.00                              |
| dark   | chart-other/base                                    | grey-700           | 1.23             | grey-400          | +3 steps           | 3.21                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.91             | blue-800          | +2 steps           | 3.97                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.48             | grey-400          | +2 steps           | 3.21                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.38, 1.25       | blue-800          | +3 steps           | 3.97, 3.59                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.68, 2.43       | blue-800          | +1 steps           | 3.97, 3.59                        |
| dark   | edge/base                                           | border-border-base | 1.32             | grey-400          | ΔE 19.64; ~3 steps | 3.21                              |
| dark   | edge/layer-01                                       | border-border-base | 1.36             | grey-300          | ΔE 33.57; ~3 steps | 5.22                              |

</details>

<details>
<summary>Dracula (dracula)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 3.62, 3.79, 3.46, 3.27 | blue-700          | +1 steps           | 5.03, 5.27, 4.81, 4.55            |
| light  | chart-3/base, outcome-succeeded/base                       | green-700          | 2.97, 2.97             | green-800         | +1 steps           | 4.31, 4.31                        |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.25, 1.25             | grey-1000         | +5 steps           | 4.90, 4.90                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.17, 1.17, 1.01       | blue-600          | +3 steps           | 3.79, 3.79, 3.27                  |
| light  | kind-cache-write/base                                      | cyan-600           | 2.41                   | cyan-700          | +1 steps           | 3.17                              |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.60, 1.38             | blue-600          | +1 steps           | 3.79, 3.27                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 35.16; ~5 steps | 4.90                              |
| light  | edge/layer-01                                              | border-border-base | 1.26                   | grey-1000         | ΔE 33.21; ~4 steps | 4.48                              |
| dark   | chart-other/base                                           | grey-700           | 1.27                   | grey-400          | +3 steps           | 3.64                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.65                   | blue-800          | +2 steps           | 3.36                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.57                   | grey-400          | +2 steps           | 3.64                              |
| dark   | level-1/base                                               | blue-1100          | 1.23                   | blue-800          | +3 steps           | 3.36                              |
| dark   | level-1/level-0                                            | blue-1100          | 1.08                   | blue-700          | +4 steps           | 4.30                              |
| dark   | level-2/base                                               | blue-900           | 2.30                   | blue-800          | +1 steps           | 3.36                              |
| dark   | level-2/level-0                                            | blue-900           | 2.03                   | blue-700          | +2 steps           | 4.30                              |
| dark   | edge/base                                                  | border-border-base | 1.33                   | grey-400          | ΔE 24.12; ~3 steps | 3.64                              |
| dark   | edge/layer-01                                              | border-border-base | 1.37                   | grey-400          | ΔE 20.55; ~2 steps | 3.21                              |

</details>

<details>
<summary>Everforest (everforest)</summary>

| Scheme | Role / background                                                      | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01                  | text-text-muted    | 2.06, 2.12, 2.00             | grey-1200         | ΔE 25.13; ~3 steps | 4.77, 4.90, 4.63                  |
| light  | text-muted/layer-02, text-muted/layer-03                               | text-text-muted    | 1.93, 1.85                   | **none**          | —                  | 4.46, 4.28                        |
| light  | accent/deep, accent/base, accent/layer-01                              | text-text-accent   | 2.66, 2.73, 2.58             | blue-800          | +2 steps           | 4.71, 4.85, 4.58                  |
| light  | accent/layer-02                                                        | text-text-accent   | 2.49                         | blue-900          | +3 steps           | 5.98                              |
| light  | inverse/inverse                                                        | text-text-inverse  | 2.52                         | **none**          | —                  | 2.68                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.66, 2.73, 2.58, 2.49, 2.39 | blue-700          | +1 steps           | 3.52, 3.62, 3.42, 3.29, 3.16      |
| light  | chart-4/base, kind-reasoning/base                                      | purple-600         | 2.98, 2.98                   | purple-700        | +1 steps           | 3.95, 3.95                        |
| light  | chart-5/base                                                           | cyan-700           | 2.95                         | cyan-800          | +1 steps           | 4.28                              |
| light  | chart-other/base, outcome-stopped/base                                 | grey-500           | 1.14, 1.14                   | grey-1100         | +6 steps           | 3.64, 3.64                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                    | blue-300           | 1.13, 1.13, 1.03             | blue-700          | +4 steps           | 3.62, 3.62, 3.29                  |
| light  | kind-cache-write/base                                                  | cyan-600           | 2.18                         | cyan-800          | +2 steps           | 4.28                              |
| light  | level-2/base, level-2/level-0                                          | blue-500           | 1.52, 1.38                   | blue-700          | +2 steps           | 3.62, 3.29                        |
| light  | edge/base                                                              | border-border-base | 1.26                         | grey-1100         | ΔE 28.54; ~5 steps | 3.64                              |
| light  | edge/layer-01                                                          | border-border-base | 1.26                         | grey-1100         | ΔE 27.17; ~5 steps | 3.44                              |
| dark   | text-muted/deep                                                        | text-text-muted    | 4.14                         | grey-300          | ΔE 4.18; ~0 steps  | 4.52                              |
| dark   | text-muted/base, text-muted/layer-01, text-muted/layer-02              | text-text-muted    | 4.00, 3.58, 2.74             | grey-200          | ΔE 14.94; ~1 steps | 6.76, 6.04, 4.63                  |
| dark   | text-muted/layer-03                                                    | text-text-muted    | 2.16                         | grey-100          | ΔE 22.84; ~2 steps | 4.81                              |
| dark   | chart-other/base                                                       | grey-700           | 1.23                         | grey-300          | +4 steps           | 4.37                              |
| dark   | kind-cache-read/base                                                   | blue-1000          | 1.59                         | blue-800          | +2 steps           | 3.32                              |
| dark   | outcome-stopped/base                                                   | grey-600           | 1.46                         | grey-300          | +3 steps           | 4.37                              |
| dark   | level-1/base                                                           | blue-1100          | 1.17                         | blue-800          | +3 steps           | 3.32                              |
| dark   | level-1/level-0                                                        | blue-1100          | 1.04                         | blue-700          | +4 steps           | 4.28                              |
| dark   | level-2/base                                                           | blue-900           | 2.25                         | blue-800          | +1 steps           | 3.32                              |
| dark   | level-2/level-0                                                        | blue-900           | 2.01                         | blue-700          | +2 steps           | 4.28                              |
| dark   | edge/base                                                              | border-border-base | 1.37                         | grey-300          | ΔE 31.26; ~4 steps | 4.37                              |
| dark   | edge/layer-01                                                          | border-border-base | 1.38                         | grey-300          | ΔE 28.67; ~3 steps | 3.90                              |

</details>

<details>
<summary>Flexoki (flexoki)</summary>

| Scheme | Role / background                                             | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ------------------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 4.49, 4.22, 3.88 | grey-1000         | ΔE 6.24; ~0 steps  | 5.53, 5.19, 4.78                  |
| light  | chart-other/base, outcome-stopped/base                        | grey-500           | 1.28, 1.28       | grey-900          | +4 steps           | 3.33, 3.33                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0           | blue-300           | 1.19, 1.19, 1.01 | blue-600          | +3 steps           | 6.41, 6.41, 5.42                  |
| light  | kind-cache-write/base                                         | cyan-600           | 2.61             | cyan-700          | +1 steps           | 3.47                              |
| light  | level-2/base, level-2/level-0                                 | blue-500           | 1.62, 1.37       | blue-600          | +1 steps           | 6.41, 5.42                        |
| light  | edge/base                                                     | border-border-base | 1.26             | grey-900          | ΔE 23.97; ~4 steps | 3.33                              |
| light  | edge/layer-01                                                 | border-border-base | 1.26             | grey-900          | ΔE 21.63; ~3 steps | 3.00                              |
| dark   | text-muted/deep, text-muted/base                              | text-text-muted    | 3.87, 3.77       | grey-300          | ΔE 7.08; ~0 steps  | 4.91, 4.80                        |
| dark   | text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 3.50, 2.79, 2.17 | grey-200          | ΔE 20.82; ~1 steps | 7.62, 6.06, 4.71                  |
| dark   | chart-other/base                                              | grey-700           | 1.16             | grey-300          | +4 steps           | 4.80                              |
| dark   | kind-cache-read/base                                          | blue-1000          | 1.52             | blue-700          | +3 steps           | 3.66                              |
| dark   | outcome-stopped/base                                          | grey-600           | 1.35             | grey-300          | +3 steps           | 4.80                              |
| dark   | level-1/base, level-1/level-0                                 | blue-1100          | 1.23, 1.15       | blue-700          | +4 steps           | 3.66, 3.40                        |
| dark   | level-2/base, level-2/level-0                                 | blue-900           | 2.01, 1.87       | blue-700          | +2 steps           | 3.66, 3.40                        |
| dark   | edge/base                                                     | border-border-base | 1.29             | grey-300          | ΔE 30.78; ~3 steps | 4.80                              |
| dark   | edge/layer-01                                                 | border-border-base | 1.33             | grey-300          | ΔE 28.35; ~3 steps | 4.45                              |

</details>

<details>
<summary>GitHub (github)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.24, 1.24       | grey-1000         | +5 steps           | 4.64, 4.64                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.23, 1.23, 1.07 | blue-600          | +3 steps           | 5.21, 5.21, 4.53                  |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.66, 1.44       | blue-600          | +1 steps           | 5.21, 4.53                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-1000         | ΔE 32.66; ~5 steps | 4.64                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 30.76; ~4 steps | 4.25                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 3.57             | grey-200          | ΔE 7.84; ~1 steps  | 4.84                              |
| dark   | chart-other/base                                    | grey-700           | 1.17             | grey-300          | +4 steps           | 4.98                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.93             | blue-800          | +2 steps           | 3.96                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.36             | grey-300          | +3 steps           | 4.98                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.42, 1.31       | blue-800          | +3 steps           | 3.96, 3.68                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.69, 2.50       | blue-800          | +1 steps           | 3.96, 3.68                        |
| dark   | edge/base                                           | border-border-base | 1.28             | grey-300          | ΔE 31.77; ~3 steps | 4.98                              |
| dark   | edge/layer-01                                       | border-border-base | 1.33             | grey-300          | ΔE 29.35; ~3 steps | 4.62                              |

</details>

<details>
<summary>Gruvbox (gruvbox)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | inverse/inverse                                     | text-text-inverse  | 3.82             | **none**          | —                  | 4.19                              |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.21, 1.21       | grey-1000         | +5 steps           | 3.82, 3.82                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.11, 1.11, 1.03 | blue-600          | +3 steps           | 5.76, 5.76, 5.06                  |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.47, 1.30       | blue-600          | +1 steps           | 5.76, 5.06                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-1000         | ΔE 28.83; ~5 steps | 3.82                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 27.02; ~4 steps | 3.54                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 4.29             | grey-100          | ΔE 7.70; ~1 steps  | 5.91                              |
| dark   | chart-other/base                                    | grey-700           | 1.25             | grey-400          | +3 steps           | 3.09                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.70             | blue-800          | +2 steps           | 3.53                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.49             | grey-400          | +2 steps           | 3.09                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.24, 1.10       | blue-800          | +3 steps           | 3.53, 3.13                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.40, 2.12       | blue-800          | +1 steps           | 3.53, 3.13                        |
| dark   | edge/base                                           | border-border-base | 1.36             | grey-400          | ΔE 19.96; ~3 steps | 3.09                              |
| dark   | edge/layer-01                                       | border-border-base | 1.38             | grey-300          | ΔE 32.41; ~3 steps | 4.64                              |

</details>

<details>
<summary>Kanagawa (kanagawa)</summary>

| Scheme | Role / background                                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | -------------------------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02 | text-text-muted    | 2.92, 3.03, 2.82, 2.69 | grey-1100         | ΔE 17.12; ~1 steps | 4.98, 5.17, 4.81, 4.59            |
| light  | text-muted/layer-03                                                        | text-text-muted    | 2.54                   | grey-1200         | ΔE 25.20; ~2 steps | 6.26                              |
| light  | inverse/inverse                                                            | text-text-inverse  | 3.24                   | **none**          | —                  | 3.77                              |
| light  | chart-4/base, kind-reasoning/base                                          | purple-600         | 2.56, 2.56             | purple-700        | +1 steps           | 3.39, 3.39                        |
| light  | chart-other/base, outcome-stopped/base                                     | grey-500           | 1.19, 1.19             | grey-1000         | +5 steps           | 3.24, 3.24                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                        | blue-300           | 1.05, 1.05, 1.07       | blue-600          | +3 steps           | 5.55, 5.55, 4.94                  |
| light  | kind-cache-write/base                                                      | cyan-600           | 2.79                   | cyan-700          | +1 steps           | 3.71                              |
| light  | level-2/base, level-2/level-0                                              | blue-500           | 1.42, 1.26             | blue-600          | +1 steps           | 5.55, 4.94                        |
| light  | edge/base                                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 23.92; ~4 steps | 3.24                              |
| light  | edge/layer-01                                                              | border-border-base | 1.25                   | grey-1000         | ΔE 22.26; ~4 steps | 3.02                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01                      | text-text-muted    | 3.77, 3.66, 3.33       | grey-300          | ΔE 14.80; ~1 steps | 5.22, 5.07, 4.62                  |
| dark   | text-muted/layer-02, text-muted/layer-03                                   | text-text-muted    | 2.55, 1.96             | grey-200          | ΔE 23.67; ~2 steps | 5.95, 4.56                        |
| dark   | chart-other/base                                                           | grey-700           | 1.22                   | grey-300          | +4 steps           | 5.07                              |
| dark   | kind-cache-read/base                                                       | blue-1000          | 1.76                   | blue-800          | +2 steps           | 3.65                              |
| dark   | outcome-stopped/base                                                       | grey-600           | 1.43                   | grey-300          | +3 steps           | 5.07                              |
| dark   | level-1/base, level-1/level-0                                              | blue-1100          | 1.30, 1.18             | blue-800          | +3 steps           | 3.65, 3.33                        |
| dark   | level-2/base, level-2/level-0                                              | blue-900           | 2.48, 2.26             | blue-800          | +1 steps           | 3.65, 3.33                        |
| dark   | edge/base                                                                  | border-border-base | 1.33                   | grey-300          | ΔE 34.08; ~4 steps | 5.07                              |
| dark   | edge/layer-01                                                              | border-border-base | 1.36                   | grey-300          | ΔE 31.68; ~3 steps | 4.62                              |

</details>

<details>
<summary>Lucent Orng (lucent-orng)</summary>

| Scheme | Role / background                                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | -------------------------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02 | text-text-muted    | 3.09, 3.26, 2.95, 2.79 | grey-1000         | ΔE 13.82; ~1 steps | 5.04, 5.31, 4.82, 4.55            |
| light  | text-muted/layer-03                                                        | text-text-muted    | 2.59                   | grey-1100         | ΔE 28.27; ~2 steps | 8.02                              |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02                 | text-text-accent   | 3.10, 3.27, 2.97, 2.80 | blue-800          | +2 steps           | 5.46, 5.76, 5.22, 4.93            |
| light  | focus/layer-01, focus/layer-02, focus/layer-03                             | blue-600           | 2.97, 2.80, 2.59       | blue-700          | +1 steps           | 3.89, 3.68, 3.40                  |
| light  | chart-other/base, outcome-stopped/base                                     | grey-500           | 1.26, 1.26             | grey-900          | +4 steps           | 3.03, 3.03                        |
| light  | kind-cache-read/base, level-1/base                                         | blue-300           | 1.17, 1.17             | blue-600          | +3 steps           | 3.27, 3.27                        |
| light  | kind-cache-write/base                                                      | cyan-600           | 2.36                   | cyan-700          | +1 steps           | 3.08                              |
| light  | level-1/level-0                                                            | blue-300           | 1.00                   | blue-700          | +4 steps           | 3.68                              |
| light  | level-2/base                                                               | blue-500           | 1.61                   | blue-600          | +1 steps           | 3.27                              |
| light  | level-2/level-0                                                            | blue-500           | 1.38                   | blue-700          | +2 steps           | 3.68                              |
| light  | edge/base                                                                  | border-border-base | 1.26                   | grey-900          | ΔE 21.59; ~4 steps | 3.03                              |
| light  | edge/layer-01                                                              | border-border-base | 1.26                   | grey-1000         | ΔE 34.47; ~4 steps | 4.82                              |
| dark   | text-muted/layer-01                                                        | text-text-muted    | 4.09                   | grey-300          | ΔE 8.60; ~0 steps  | 5.50                              |
| dark   | text-muted/layer-02, text-muted/layer-03                                   | text-text-muted    | 3.03, 2.21             | grey-200          | ΔE 21.47; ~1 steps | 7.08, 5.15                        |
| dark   | chart-other/base                                                           | grey-700           | 1.25                   | grey-400          | +3 steps           | 3.40                              |
| dark   | kind-cache-read/base                                                       | blue-1000          | 1.67                   | blue-700          | +3 steps           | 3.95                              |
| dark   | outcome-stopped/base                                                       | grey-600           | 1.51                   | grey-400          | +2 steps           | 3.40                              |
| dark   | level-1/base, level-1/level-0                                              | blue-1100          | 1.27, 1.14             | blue-700          | +4 steps           | 3.95, 3.53                        |
| dark   | level-2/base, level-2/level-0                                              | blue-900           | 2.22, 1.98             | blue-700          | +2 steps           | 3.95, 3.53                        |
| dark   | edge/base                                                                  | border-border-base | 1.32                   | grey-400          | ΔE 21.37; ~3 steps | 3.40                              |
| dark   | edge/layer-01                                                              | border-border-base | 1.36                   | grey-400          | ΔE 18.28; ~2 steps | 3.04                              |

</details>

<details>
<summary>Material (material)</summary>

| Scheme | Role / background                                                                               | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 2.38, 2.48, 2.29, 2.17, 2.02 | grey-1100         | ΔE 31.59; ~2 steps | 7.19, 7.51, 6.94, 6.57, 6.11      |
| light  | accent/deep, accent/layer-01, accent/layer-02                                                   | text-text-accent   | 2.47, 2.38, 2.25             | blue-900          | +3 steps           | 6.32, 6.10, 5.78                  |
| light  | accent/base                                                                                     | text-text-accent   | 2.58                         | blue-800          | +2 steps           | 4.51                              |
| light  | inverse/inverse                                                                                 | text-text-inverse  | 4.23                         | **none**          | —                  | 4.41                              |
| light  | focus/deep, focus/base, focus/layer-01                                                          | blue-600           | 2.47, 2.58, 2.38             | blue-700          | +1 steps           | 3.24, 3.38, 3.13                  |
| light  | focus/layer-02, focus/layer-03                                                                  | blue-600           | 2.25, 2.09                   | blue-800          | +2 steps           | 3.94, 3.66                        |
| light  | chart-4/base, kind-reasoning/base                                                               | purple-600         | 2.58, 2.58                   | purple-700        | +1 steps           | 3.38, 3.38                        |
| light  | chart-other/base, outcome-stopped/base                                                          | grey-500           | 1.23, 1.23                   | grey-1000         | +5 steps           | 4.23, 4.23                        |
| light  | kind-cache-read/base, level-1/base                                                              | blue-300           | 1.15, 1.15                   | blue-700          | +4 steps           | 3.38, 3.38                        |
| light  | kind-cache-write/base                                                                           | cyan-600           | 2.55                         | cyan-700          | +1 steps           | 3.51                              |
| light  | level-1/level-0                                                                                 | blue-300           | 1.01                         | blue-800          | +5 steps           | 3.94                              |
| light  | level-2/base                                                                                    | blue-500           | 1.53                         | blue-700          | +2 steps           | 3.38                              |
| light  | level-2/level-0                                                                                 | blue-500           | 1.34                         | blue-800          | +3 steps           | 3.94                              |
| light  | level-3/level-0                                                                                 | blue-700           | 2.96                         | blue-800          | +1 steps           | 3.94                              |
| light  | edge/base                                                                                       | border-border-base | 1.26                         | grey-1000         | ΔE 30.56; ~5 steps | 4.23                              |
| light  | edge/layer-01                                                                                   | border-border-base | 1.26                         | grey-1000         | ΔE 28.80; ~4 steps | 3.91                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01                                           | text-text-muted    | 3.04, 2.90, 2.51             | grey-300          | ΔE 21.78; ~1 steps | 6.66, 6.35, 5.50                  |
| dark   | text-muted/layer-02, text-muted/layer-03                                                        | text-text-muted    | 1.78, 1.30                   | grey-200          | ΔE 33.60; ~2 steps | 6.52, 4.77                        |
| dark   | chart-other/base                                                                                | grey-700           | 1.32                         | grey-400          | +3 steps           | 3.62                              |
| dark   | kind-cache-read/base                                                                            | blue-1000          | 1.59                         | blue-800          | +2 steps           | 3.33                              |
| dark   | outcome-stopped/base                                                                            | grey-600           | 1.63                         | grey-400          | +2 steps           | 3.62                              |
| dark   | level-1/base                                                                                    | blue-1100          | 1.16                         | blue-800          | +3 steps           | 3.33                              |
| dark   | level-1/level-0                                                                                 | blue-1100          | 1.01                         | blue-700          | +4 steps           | 4.17                              |
| dark   | level-2/base                                                                                    | blue-900           | 2.25                         | blue-800          | +1 steps           | 3.33                              |
| dark   | level-2/level-0                                                                                 | blue-900           | 1.95                         | blue-700          | +2 steps           | 4.17                              |
| dark   | edge/base                                                                                       | border-border-base | 1.37                         | grey-400          | ΔE 22.85; ~3 steps | 3.62                              |
| dark   | edge/layer-01                                                                                   | border-border-base | 1.38                         | grey-400          | ΔE 19.74; ~2 steps | 3.14                              |

</details>

<details>
<summary>Matrix (matrix)</summary>

| Scheme | Role / background                                                                               | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 3.42, 3.58, 3.29, 3.12, 2.92 | grey-1100         | ΔE 19.02; ~1 steps | 7.27, 7.61, 7.00, 6.62, 6.20      |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02                                      | text-text-accent   | 2.06, 2.15, 1.98, 1.88       | green-900         | +3 steps           | 5.79, 6.06, 5.57, 5.27            |
| light  | inverse/inverse                                                                                 | text-text-inverse  | 4.31                         | grey-50           | +1 steps           | 4.76                              |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02, focus/layer-03                          | blue-600           | 2.11, 2.20, 2.03, 1.92, 1.79 | blue-800          | +2 steps           | 4.14, 4.33, 3.98, 3.77, 3.53      |
| light  | chart-1/base, kind-input/base, level-3/base, level-3/level-0                                    | blue-700           | 3.00, 3.00, 3.00, 2.61       | blue-800          | +1 steps           | 4.33, 4.33, 4.33, 3.77            |
| light  | chart-3/base, outcome-succeeded/base                                                            | green-700          | 2.81, 2.81                   | green-800         | +1 steps           | 4.10, 4.10                        |
| light  | chart-4/base, kind-reasoning/base                                                               | purple-600         | 2.64, 2.64                   | purple-700        | +1 steps           | 3.60, 3.60                        |
| light  | chart-5/base                                                                                    | cyan-700           | 2.95                         | cyan-800          | +1 steps           | 4.28                              |
| light  | chart-6/base                                                                                    | pink-700           | 3.00                         | pink-800          | +1 steps           | 4.33                              |
| light  | chart-other/base, outcome-stopped/base                                                          | grey-500           | 1.23, 1.23                   | grey-1000         | +5 steps           | 4.31, 4.31                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                                             | blue-300           | 1.10, 1.10, 1.04             | blue-800          | +5 steps           | 4.33, 4.33, 3.77                  |
| light  | kind-cache-write/base                                                                           | cyan-600           | 2.18                         | cyan-800          | +2 steps           | 4.28                              |
| light  | level-2/base, level-2/level-0                                                                   | blue-500           | 1.48, 1.29                   | blue-800          | +3 steps           | 4.33, 3.77                        |
| light  | edge/base                                                                                       | border-border-base | 1.26                         | grey-1000         | ΔE 31.35; ~5 steps | 4.31                              |
| light  | edge/layer-01                                                                                   | border-border-base | 1.26                         | grey-1000         | ΔE 29.45; ~4 steps | 3.96                              |
| dark   | text-muted/layer-03                                                                             | text-text-muted    | 3.88                         | grey-200          | ΔE 20.35; ~1 steps | 5.44                              |
| dark   | chart-other/base                                                                                | grey-700           | 1.17                         | grey-400          | +3 steps           | 3.07                              |
| dark   | kind-cache-read/base                                                                            | blue-1000          | 1.97                         | blue-800          | +2 steps           | 4.09                              |
| dark   | outcome-stopped/base                                                                            | grey-600           | 1.39                         | grey-400          | +2 steps           | 3.07                              |
| dark   | level-1/base, level-1/level-0                                                                   | blue-1100          | 1.44, 1.33                   | blue-800          | +3 steps           | 4.09, 3.79                        |
| dark   | level-2/base, level-2/level-0                                                                   | blue-900           | 2.78, 2.58                   | blue-800          | +1 steps           | 4.09, 3.79                        |
| dark   | edge/base                                                                                       | border-border-base | 1.27                         | grey-400          | ΔE 26.10; ~4 steps | 3.07                              |
| dark   | edge/layer-01                                                                                   | border-border-base | 1.32                         | grey-300          | ΔE 37.95; ~4 steps | 5.29                              |

</details>

<details>
<summary>Mercury (mercury)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/layer-02, text-muted/layer-03            | text-text-muted    | 4.29, 4.00       | grey-1100         | ΔE 9.98; ~1 steps  | 6.19, 5.77                        |
| light  | inverse/inverse                                     | text-text-inverse  | 4.02             | **none**          | —                  | 4.02                              |
| light  | chart-4/base, kind-reasoning/base                   | purple-600         | 2.52, 2.52       | purple-700        | +1 steps           | 3.46, 3.46                        |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.22, 1.22       | grey-1000         | +5 steps           | 4.02, 4.02                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.23, 1.23, 1.08 | blue-600          | +3 steps           | 5.93, 5.93, 5.21                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.77             | cyan-700          | +1 steps           | 3.65                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.67, 1.47       | blue-600          | +1 steps           | 5.93, 5.21                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-1000         | ΔE 29.30; ~5 steps | 4.02                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 27.71; ~4 steps | 3.72                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 3.64             | grey-200          | ΔE 7.85; ~1 steps  | 4.96                              |
| dark   | chart-other/base                                    | grey-700           | 1.21             | grey-400          | +3 steps           | 3.06                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.81             | blue-800          | +2 steps           | 3.75                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.44             | grey-400          | +2 steps           | 3.06                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.34, 1.22       | blue-800          | +3 steps           | 3.75, 3.42                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.53, 2.30       | blue-800          | +1 steps           | 3.75, 3.42                        |
| dark   | edge/base                                           | border-border-base | 1.31             | grey-400          | ΔE 18.71; ~3 steps | 3.06                              |
| dark   | edge/layer-01                                       | border-border-base | 1.35             | grey-300          | ΔE 32.24; ~3 steps | 5.04                              |

</details>

<details>
<summary>Monokai (monokai)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 2.55, 2.67, 2.44, 2.31 | blue-800          | +2 steps           | 5.11, 5.34, 4.89, 4.63            |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02     | blue-600           | 2.55, 2.67, 2.44, 2.31 | blue-700          | +1 steps           | 3.47, 3.63, 3.32, 3.14            |
| light  | focus/layer-03                                             | blue-600           | 2.13                   | blue-800          | +2 steps           | 4.27                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.25, 1.25             | grey-1000         | +5 steps           | 4.81, 4.81                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.18, 1.18, 1.02       | blue-700          | +4 steps           | 3.63, 3.63, 3.14                  |
| light  | kind-cache-write/base                                      | cyan-600           | 2.29                   | cyan-700          | +1 steps           | 3.10                              |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.62, 1.41             | blue-700          | +2 steps           | 3.63, 3.14                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 33.72; ~5 steps | 4.81                              |
| light  | edge/layer-01                                              | border-border-base | 1.26                   | grey-1000         | ΔE 31.81; ~4 steps | 4.40                              |
| dark   | chart-other/base                                           | grey-700           | 1.30                   | grey-400          | +3 steps           | 3.61                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.50                   | blue-800          | +2 steps           | 3.06                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.58                   | grey-400          | +2 steps           | 3.61                              |
| dark   | level-1/base                                               | blue-1100          | 1.14                   | blue-800          | +3 steps           | 3.06                              |
| dark   | level-1/level-0                                            | blue-1100          | 1.00                   | blue-700          | +4 steps           | 3.82                              |
| dark   | level-2/base                                               | blue-900           | 2.10                   | blue-800          | +1 steps           | 3.06                              |
| dark   | level-2/level-0                                            | blue-900           | 1.84                   | blue-700          | +2 steps           | 3.82                              |
| dark   | edge/base                                                  | border-border-base | 1.36                   | grey-400          | ΔE 22.41; ~3 steps | 3.61                              |
| dark   | edge/layer-01                                              | border-border-base | 1.38                   | grey-400          | ΔE 19.30; ~2 steps | 3.15                              |

</details>

<details>
<summary>Night Owl (nightowl)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 3.80, 3.94, 3.66, 3.50 | blue-700          | +1 steps           | 5.13, 5.32, 4.94, 4.73            |
| light  | inverse/inverse                                            | text-text-inverse  | 3.49                   | **none**          | —                  | 3.94                              |
| light  | chart-5/base                                               | cyan-700           | 3.00                   | cyan-800          | +1 steps           | 4.32                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.20, 1.20             | grey-1000         | +5 steps           | 3.49, 3.49                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.09, 1.09, 1.03       | blue-600          | +3 steps           | 3.94, 3.94, 3.50                  |
| light  | kind-cache-write/base                                      | cyan-600           | 2.27                   | cyan-800          | +2 steps           | 4.32                              |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.48, 1.31             | blue-600          | +1 steps           | 3.94, 3.50                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 26.93; ~5 steps | 3.49                              |
| light  | edge/layer-01                                              | border-border-base | 1.25                   | grey-1000         | ΔE 25.55; ~4 steps | 3.25                              |
| dark   | chart-other/base                                           | grey-700           | 1.20                   | grey-400          | +3 steps           | 3.04                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.85                   | blue-800          | +2 steps           | 3.83                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.41                   | grey-400          | +2 steps           | 3.04                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.37, 1.26             | blue-800          | +3 steps           | 3.83, 3.52                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.60, 2.39             | blue-800          | +1 steps           | 3.83, 3.52                        |
| dark   | edge/base                                                  | border-border-base | 1.29                   | grey-400          | ΔE 18.91; ~3 steps | 3.04                              |
| dark   | edge/layer-01                                              | border-border-base | 1.33                   | grey-300          | ΔE 32.38; ~3 steps | 5.08                              |

</details>

<details>
<summary>Nord (nord)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base                            | text-text-accent   | 3.41, 3.56       | blue-700          | +1 steps           | 4.57, 4.77                        |
| light  | accent/layer-01, accent/layer-02                    | text-text-accent   | 3.28, 3.13       | blue-800          | +2 steps           | 5.92, 5.64                        |
| light  | inverse/inverse                                     | text-text-inverse  | 3.92             | **none**          | —                  | 4.44                              |
| light  | focus/layer-03                                      | blue-600           | 2.93             | blue-700          | +1 steps           | 3.93                              |
| light  | chart-3/base, outcome-succeeded/base                | green-700          | 2.89, 2.89       | green-800         | +1 steps           | 4.17, 4.17                        |
| light  | chart-5/base                                        | cyan-700           | 2.91             | cyan-800          | +1 steps           | 4.22                              |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.22, 1.22       | grey-1000         | +5 steps           | 3.92, 3.92                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.08, 1.08, 1.05 | blue-600          | +3 steps           | 3.56, 3.56, 3.13                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.16             | cyan-800          | +2 steps           | 4.22                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.47, 1.29       | blue-600          | +1 steps           | 3.56, 3.13                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-1000         | ΔE 28.74; ~5 steps | 3.92                              |
| light  | edge/layer-01                                       | border-border-base | 1.25             | grey-1000         | ΔE 26.91; ~4 steps | 3.62                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 4.27             | grey-100          | ΔE 7.49; ~1 steps  | 5.84                              |
| dark   | chart-other/base                                    | grey-700           | 1.29             | grey-400          | +3 steps           | 3.23                              |
| dark   | kind-cache-read/base                                | blue-1000          | 1.58             | blue-800          | +2 steps           | 3.27                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.55             | grey-400          | +2 steps           | 3.23                              |
| dark   | level-1/base                                        | blue-1100          | 1.15             | blue-800          | +3 steps           | 3.27                              |
| dark   | level-1/level-0                                     | blue-1100          | 1.00             | blue-700          | +4 steps           | 4.13                              |
| dark   | level-2/base                                        | blue-900           | 2.22             | blue-800          | +1 steps           | 3.27                              |
| dark   | level-2/level-0                                     | blue-900           | 1.94             | blue-700          | +2 steps           | 4.13                              |
| dark   | edge/base                                           | border-border-base | 1.37             | grey-400          | ΔE 19.76; ~3 steps | 3.23                              |
| dark   | edge/layer-01                                       | border-border-base | 1.38             | grey-300          | ΔE 33.87; ~3 steps | 4.82                              |

</details>

<details>
<summary>OpenCode (oc-2)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | chart-2/base, kind-output/base                      | orange-700         | 2.95, 2.95       | orange-800        | +1 steps           | 3.77, 3.77                        |
| light  | chart-3/base, outcome-succeeded/base                | green-700          | 2.84, 2.84       | green-800         | +1 steps           | 4.36, 4.36                        |
| light  | chart-7/base                                        | yellow-800         | 2.46             | yellow-900        | +1 steps           | 3.32                              |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 2.22, 2.22       | grey-600          | +1 steps           | 3.95, 3.95                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.48, 1.48, 1.33 | blue-600          | +3 steps           | 5.19, 5.19, 4.63                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.72             | cyan-700          | +1 steps           | 3.47                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 2.73, 2.44       | blue-600          | +1 steps           | 5.19, 4.63                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-600          | ΔE 28.14; ~3 steps | 3.95                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-600          | ΔE 27.20; ~2 steps | 3.78                              |
| dark   | chart-other/base                                    | grey-700           | 2.71             | grey-600          | +1 steps           | 4.58                              |
| dark   | kind-cache-read/base                                | blue-1000          | 2.04             | blue-600          | +4 steps           | 3.49                              |
| dark   | level-1/base                                        | blue-1100          | 1.75             | blue-600          | +5 steps           | 3.49                              |
| dark   | level-1/level-0                                     | blue-1100          | 1.50             | blue-500          | +6 steps           | 5.68                              |
| dark   | level-2/base                                        | blue-900           | 2.45             | blue-600          | +3 steps           | 3.49                              |
| dark   | level-2/level-0                                     | blue-900           | 2.10             | blue-500          | +4 steps           | 5.68                              |
| dark   | level-3/level-0                                     | blue-600           | 2.99             | blue-500          | +1 steps           | 5.68                              |
| dark   | edge/base                                           | border-border-base | 1.33             | grey-600          | ΔE 29.04; ~3 steps | 4.58                              |
| dark   | edge/layer-01                                       | border-border-base | 1.37             | grey-600          | ΔE 25.20; ~2 steps | 3.93                              |

</details>

<details>
<summary>One Dark (one-dark)</summary>

| Scheme | Role / background                                                                               | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 2.36, 2.47, 2.28, 2.18, 2.03 | grey-1100         | ΔE 27.64; ~2 steps | 6.29, 6.57, 6.07, 5.80, 5.40      |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02                                      | text-text-accent   | 3.72, 3.89, 3.60, 3.44       | blue-700          | +1 steps           | 5.12, 5.35, 4.95, 4.73            |
| light  | inverse/inverse                                                                                 | text-text-inverse  | 3.86                         | **none**          | —                  | 4.03                              |
| light  | chart-other/base, outcome-stopped/base                                                          | grey-500           | 1.22, 1.22                   | grey-1000         | +5 steps           | 3.86, 3.86                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                                             | blue-300           | 1.18, 1.18, 1.04             | blue-600          | +3 steps           | 3.89, 3.89, 3.44                  |
| light  | kind-cache-write/base                                                                           | cyan-600           | 2.84                         | cyan-700          | +1 steps           | 3.73                              |
| light  | level-2/base, level-2/level-0                                                                   | blue-500           | 1.60, 1.41                   | blue-600          | +1 steps           | 3.89, 3.44                        |
| light  | edge/base                                                                                       | border-border-base | 1.26                         | grey-1000         | ΔE 28.04; ~5 steps | 3.86                              |
| light  | edge/layer-01                                                                                   | border-border-base | 1.26                         | grey-1000         | ΔE 26.31; ~4 steps | 3.56                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01                                           | text-text-muted    | 2.85, 2.76, 2.51             | grey-200          | ΔE 20.56; ~2 steps | 5.93, 5.74, 5.23                  |
| dark   | text-muted/layer-02                                                                             | text-text-muted    | 2.03                         | grey-100          | ΔE 27.29; ~3 steps | 5.57                              |
| dark   | text-muted/layer-03                                                                             | text-text-muted    | 1.64                         | grey-50           | ΔE 45.09; ~4 steps | 9.91                              |
| dark   | chart-other/base                                                                                | grey-700           | 1.19                         | grey-300          | +4 steps           | 3.71                              |
| dark   | kind-cache-read/base                                                                            | blue-1000          | 1.68                         | blue-800          | +2 steps           | 3.47                              |
| dark   | outcome-stopped/base                                                                            | grey-600           | 1.36                         | grey-300          | +3 steps           | 3.71                              |
| dark   | level-1/base, level-1/level-0                                                                   | blue-1100          | 1.22, 1.11                   | blue-800          | +3 steps           | 3.47, 3.16                        |
| dark   | level-2/base, level-2/level-0                                                                   | blue-900           | 2.35, 2.14                   | blue-800          | +1 steps           | 3.47, 3.16                        |
| dark   | edge/base                                                                                       | border-border-base | 1.36                         | grey-300          | ΔE 23.30; ~3 steps | 3.71                              |
| dark   | edge/layer-01                                                                                   | border-border-base | 1.37                         | grey-300          | ΔE 21.11; ~2 steps | 3.38                              |

</details>

<details>
<summary>One Dark Pro (onedarkpro)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 2.89, 3.02, 2.79, 2.65 | blue-800          | +2 steps           | 5.33, 5.57, 5.13, 4.87            |
| light  | inverse/inverse                                            | text-text-inverse  | 4.19                   | **none**          | —                  | 4.49                              |
| light  | focus/deep, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.89, 2.79, 2.65, 2.46 | blue-700          | +1 steps           | 3.89, 3.74, 3.56, 3.30            |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.23, 1.23             | grey-1000         | +5 steps           | 4.19, 4.19                        |
| light  | kind-cache-read/base, level-1/base                         | blue-300           | 1.15, 1.15             | blue-600          | +3 steps           | 3.02, 3.02                        |
| light  | kind-cache-write/base                                      | cyan-600           | 2.26                   | cyan-700          | +1 steps           | 3.07                              |
| light  | level-1/level-0                                            | blue-300           | 1.01                   | blue-700          | +4 steps           | 3.56                              |
| light  | level-2/base                                               | blue-500           | 1.55                   | blue-600          | +1 steps           | 3.02                              |
| light  | level-2/level-0                                            | blue-500           | 1.35                   | blue-700          | +2 steps           | 3.56                              |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 30.26; ~5 steps | 4.19                              |
| light  | edge/layer-01                                              | border-border-base | 1.26                   | grey-1000         | ΔE 28.47; ~4 steps | 3.86                              |
| dark   | text-muted/layer-03                                        | text-text-muted    | 3.99                   | grey-100          | ΔE 4.99; ~1 steps  | 4.87                              |
| dark   | chart-other/base                                           | grey-700           | 1.17                   | grey-300          | +4 steps           | 3.84                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.79                   | blue-800          | +2 steps           | 3.70                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.34                   | grey-300          | +3 steps           | 3.84                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.31, 1.20             | blue-800          | +3 steps           | 3.70, 3.41                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.51, 2.31             | blue-800          | +1 steps           | 3.70, 3.41                        |
| dark   | edge/base                                                  | border-border-base | 1.33                   | grey-300          | ΔE 24.15; ~3 steps | 3.84                              |
| dark   | edge/layer-01                                              | border-border-base | 1.36                   | grey-300          | ΔE 21.93; ~3 steps | 3.53                              |

</details>

<details>
<summary>Orng (orng)</summary>

| Scheme | Role / background                                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | -------------------------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02 | text-text-muted    | 3.28, 3.45, 3.14, 2.95 | grey-1000         | ΔE 12.60; ~1 steps | 5.14, 5.41, 4.92, 4.62            |
| light  | text-muted/layer-03                                                        | text-text-muted    | 2.72                   | grey-1100         | ΔE 27.93; ~2 steps | 8.28                              |
| light  | accent/deep, accent/layer-01, accent/layer-02                              | text-text-accent   | 3.29, 3.15, 2.96       | blue-800          | +2 steps           | 5.80, 5.55, 5.21                  |
| light  | accent/base                                                                | text-text-accent   | 3.46                   | blue-700          | +1 steps           | 4.54                              |
| light  | focus/layer-02, focus/layer-03                                             | blue-600           | 2.96, 2.73             | blue-700          | +1 steps           | 3.88, 3.57                        |
| light  | chart-other/base, outcome-stopped/base                                     | grey-500           | 1.27, 1.27             | grey-900          | +4 steps           | 3.07, 3.07                        |
| light  | kind-cache-read/base, level-1/base                                         | blue-300           | 1.24, 1.24             | blue-600          | +3 steps           | 3.46, 3.46                        |
| light  | kind-cache-write/base                                                      | cyan-600           | 2.50                   | cyan-700          | +1 steps           | 3.26                              |
| light  | level-1/level-0                                                            | blue-300           | 1.06                   | blue-700          | +4 steps           | 3.88                              |
| light  | level-2/base                                                               | blue-500           | 1.71                   | blue-600          | +1 steps           | 3.46                              |
| light  | level-2/level-0                                                            | blue-500           | 1.46                   | blue-700          | +2 steps           | 3.88                              |
| light  | edge/base                                                                  | border-border-base | 1.26                   | grey-900          | ΔE 21.69; ~4 steps | 3.07                              |
| light  | edge/layer-01                                                              | border-border-base | 1.26                   | grey-1000         | ΔE 34.57; ~4 steps | 4.92                              |
| dark   | text-muted/layer-02, text-muted/layer-03                                   | text-text-muted    | 3.54, 2.58             | grey-200          | ΔE 20.67; ~1 steps | 8.01, 5.85                        |
| dark   | chart-other/base                                                           | grey-700           | 1.18                   | grey-400          | +3 steps           | 3.28                              |
| dark   | kind-cache-read/base                                                       | blue-1000          | 1.83                   | blue-800          | +2 steps           | 3.24                              |
| dark   | outcome-stopped/base                                                       | grey-600           | 1.41                   | grey-400          | +2 steps           | 3.28                              |
| dark   | level-1/base, level-1/level-0                                              | blue-1100          | 1.39, 1.29             | blue-800          | +3 steps           | 3.24, 3.01                        |
| dark   | level-2/base, level-2/level-0                                              | blue-900           | 2.42, 2.24             | blue-800          | +1 steps           | 3.24, 3.01                        |
| dark   | edge/base                                                                  | border-border-base | 1.27                   | grey-400          | ΔE 21.04; ~3 steps | 3.28                              |
| dark   | edge/layer-01                                                              | border-border-base | 1.32                   | grey-400          | ΔE 18.26; ~2 steps | 3.04                              |

</details>

<details>
<summary>Osaka Jade (osaka-jade)</summary>

| Scheme | Role / background                                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | -------------------------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/layer-03                                                        | text-text-muted    | 4.39                   | grey-1100         | ΔE 13.79; ~1 steps | 7.90                              |
| light  | accent/deep, accent/base                                                   | text-text-accent   | 2.56, 2.68             | blue-800          | +2 steps           | 4.57, 4.79                        |
| light  | accent/layer-01, accent/layer-02                                           | text-text-accent   | 2.45, 2.30             | blue-900          | +3 steps           | 5.94, 5.58                        |
| light  | focus/deep, focus/base, focus/layer-01, focus/layer-02                     | blue-600           | 2.56, 2.68, 2.45, 2.30 | blue-700          | +1 steps           | 3.39, 3.55, 3.24, 3.04            |
| light  | focus/layer-03                                                             | blue-600           | 2.12                   | blue-800          | +2 steps           | 3.79                              |
| light  | chart-5/base                                                               | cyan-700           | 2.92                   | cyan-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base                                     | grey-500           | 1.26, 1.26             | grey-900          | +4 steps           | 3.02, 3.02                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                        | blue-300           | 1.10, 1.10, 1.06       | blue-700          | +4 steps           | 3.55, 3.55, 3.04                  |
| light  | kind-cache-write/base                                                      | cyan-600           | 2.15                   | cyan-800          | +2 steps           | 4.24                              |
| light  | level-2/base, level-2/level-0                                              | blue-500           | 1.45, 1.24             | blue-700          | +2 steps           | 3.55, 3.04                        |
| light  | edge/base                                                                  | border-border-base | 1.26                   | grey-900          | ΔE 21.96; ~4 steps | 3.02                              |
| light  | edge/layer-01                                                              | border-border-base | 1.26                   | grey-1000         | ΔE 34.92; ~4 steps | 4.83                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02 | text-text-muted    | 3.15, 3.08, 2.83, 2.28 | grey-200          | ΔE 25.15; ~2 steps | 7.37, 7.20, 6.62, 5.32            |
| dark   | text-muted/layer-03                                                        | text-text-muted    | 1.78                   | grey-100          | ΔE 32.87; ~3 steps | 5.71                              |
| dark   | chart-other/base                                                           | grey-700           | 1.18                   | grey-300          | +4 steps           | 4.38                              |
| dark   | kind-cache-read/base                                                       | blue-1000          | 1.91                   | blue-800          | +2 steps           | 4.01                              |
| dark   | outcome-stopped/base                                                       | grey-600           | 1.35                   | grey-300          | +3 steps           | 4.38                              |
| dark   | level-1/base, level-1/level-0                                              | blue-1100          | 1.39, 1.28             | blue-800          | +3 steps           | 4.01, 3.69                        |
| dark   | level-2/base, level-2/level-0                                              | blue-900           | 2.72, 2.50             | blue-800          | +1 steps           | 4.01, 3.69                        |
| dark   | edge/base                                                                  | border-border-base | 1.31                   | grey-300          | ΔE 29.33; ~3 steps | 4.38                              |
| dark   | edge/layer-01                                                              | border-border-base | 1.35                   | grey-300          | ΔE 26.77; ~3 steps | 4.03                              |

</details>

<details>
<summary>Palenight (palenight)</summary>

| Scheme | Role / background                                                                               | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 2.74, 2.87, 2.63, 2.49, 2.33 | grey-1100         | ΔE 29.34; ~2 steps | 7.43, 7.77, 7.12, 6.75, 6.32      |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02                                      | text-text-accent   | 3.81, 3.98, 3.65, 3.46       | blue-700          | +1 steps           | 5.32, 5.56, 5.10, 4.83            |
| light  | inverse/inverse                                                                                 | text-text-inverse  | 4.38                         | grey-50           | +1 steps           | 4.57                              |
| light  | chart-4/base, kind-reasoning/base                                                               | purple-600         | 2.62, 2.62                   | purple-700        | +1 steps           | 3.48, 3.48                        |
| light  | chart-other/base, outcome-stopped/base                                                          | grey-500           | 1.23, 1.23                   | grey-1000         | +5 steps           | 4.38, 4.38                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                                             | blue-300           | 1.18, 1.18, 1.02             | blue-600          | +3 steps           | 3.98, 3.98, 3.46                  |
| light  | kind-cache-write/base                                                                           | cyan-600           | 2.55                         | cyan-700          | +1 steps           | 3.51                              |
| light  | level-2/base, level-2/level-0                                                                   | blue-500           | 1.59, 1.38                   | blue-600          | +1 steps           | 3.98, 3.46                        |
| light  | edge/base                                                                                       | border-border-base | 1.26                         | grey-1000         | ΔE 32.18; ~5 steps | 4.38                              |
| light  | edge/layer-01                                                                                   | border-border-base | 1.26                         | grey-1000         | ΔE 30.36; ~4 steps | 4.02                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01                                           | text-text-muted    | 3.44, 3.33, 3.06             | grey-200          | ΔE 13.92; ~1 steps | 5.63, 5.45, 5.00                  |
| dark   | text-muted/layer-02                                                                             | text-text-muted    | 2.48                         | grey-100          | ΔE 20.40; ~2 steps | 5.31                              |
| dark   | text-muted/layer-03                                                                             | text-text-muted    | 2.00                         | grey-50           | ΔE 42.16; ~3 steps | 9.90                              |
| dark   | chart-other/base                                                                                | grey-700           | 1.18                         | grey-300          | +4 steps           | 3.59                              |
| dark   | kind-cache-read/base                                                                            | blue-1000          | 1.59                         | blue-800          | +2 steps           | 3.30                              |
| dark   | outcome-stopped/base                                                                            | grey-600           | 1.34                         | grey-300          | +3 steps           | 3.59                              |
| dark   | level-1/base, level-1/level-0                                                                   | blue-1100          | 1.18, 1.08                   | blue-800          | +3 steps           | 3.30, 3.02                        |
| dark   | level-2/base, level-2/level-0                                                                   | blue-900           | 2.24, 2.05                   | blue-800          | +1 steps           | 3.30, 3.02                        |
| dark   | edge/base                                                                                       | border-border-base | 1.36                         | grey-300          | ΔE 22.64; ~3 steps | 3.59                              |
| dark   | edge/layer-01                                                                                   | border-border-base | 1.37                         | grey-300          | ΔE 20.62; ~3 steps | 3.29                              |

</details>

<details>
<summary>Rose Pine (rosepine)</summary>

| Scheme | Role / background                                                                               | Original token     | Original ratio               | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base, text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 2.66, 2.75, 2.57, 2.49, 2.35 | grey-1200         | ΔE 24.42; ~2 steps | 6.04, 6.24, 5.84, 5.64, 5.32      |
| light  | accent/layer-02                                                                                 | text-text-accent   | 4.36                         | blue-700          | +1 steps           | 5.86                              |
| light  | inverse/inverse                                                                                 | text-text-inverse  | 2.94                         | **none**          | —                  | 3.18                              |
| light  | chart-4/base, kind-reasoning/base                                                               | purple-600         | 2.67, 2.67                   | purple-700        | +1 steps           | 3.54, 3.54                        |
| light  | chart-5/base                                                                                    | cyan-700           | 2.97                         | cyan-800          | +1 steps           | 4.31                              |
| light  | chart-other/base, outcome-stopped/base                                                          | grey-500           | 1.17, 1.17                   | grey-1100         | +6 steps           | 4.47, 4.47                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0                                             | blue-300           | 1.13, 1.13, 1.02             | blue-600          | +3 steps           | 4.83, 4.83, 4.36                  |
| light  | kind-cache-write/base                                                                           | cyan-600           | 2.19                         | cyan-800          | +2 steps           | 4.31                              |
| light  | level-2/base, level-2/level-0                                                                   | blue-500           | 1.51, 1.37                   | blue-600          | +1 steps           | 4.83, 4.36                        |
| light  | edge/base                                                                                       | border-border-base | 1.26                         | grey-1100         | ΔE 36.57; ~6 steps | 4.47                              |
| light  | edge/layer-01                                                                                   | border-border-base | 1.26                         | grey-1100         | ΔE 35.02; ~5 steps | 4.18                              |
| dark   | text-muted/deep, text-muted/base, text-muted/layer-01                                           | text-text-muted    | 3.73, 3.64, 3.31             | grey-300          | ΔE 12.93; ~1 steps | 5.79, 5.65, 5.15                  |
| dark   | text-muted/layer-02, text-muted/layer-03                                                        | text-text-muted    | 2.53, 1.90                   | grey-200          | ΔE 25.86; ~2 steps | 6.74, 5.04                        |
| dark   | chart-other/base                                                                                | grey-700           | 1.20                         | grey-400          | +3 steps           | 3.12                              |
| dark   | kind-cache-read/base                                                                            | blue-1000          | 1.93                         | blue-800          | +2 steps           | 4.00                              |
| dark   | outcome-stopped/base                                                                            | grey-600           | 1.44                         | grey-400          | +2 steps           | 3.12                              |
| dark   | level-1/base, level-1/level-0                                                                   | blue-1100          | 1.40, 1.27                   | blue-800          | +3 steps           | 4.00, 3.64                        |
| dark   | level-2/base, level-2/level-0                                                                   | blue-900           | 2.72, 2.47                   | blue-800          | +1 steps           | 4.00, 3.64                        |
| dark   | edge/base                                                                                       | border-border-base | 1.30                         | grey-400          | ΔE 19.30; ~3 steps | 3.12                              |
| dark   | edge/layer-01                                                                                   | border-border-base | 1.35                         | grey-300          | ΔE 32.93; ~3 steps | 5.15                              |

</details>

<details>
<summary>Shades of Purple (shadesofpurple)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 3.87, 4.03, 3.73, 3.53 | blue-700          | +1 steps           | 5.53, 5.77, 5.33, 5.05            |
| light  | inverse/inverse                                            | text-text-inverse  | 3.93                   | **none**          | —                  | 4.39                              |
| light  | chart-3/base, outcome-succeeded/base                       | green-700          | 2.82, 2.82             | green-800         | +1 steps           | 4.10, 4.10                        |
| light  | chart-4/base, kind-reasoning/base                          | purple-600         | 2.48, 2.48             | purple-700        | +1 steps           | 3.48, 3.48                        |
| light  | chart-5/base                                               | cyan-700           | 2.94                   | cyan-800          | +1 steps           | 4.23                              |
| light  | chart-6/base                                               | pink-700           | 2.92                   | pink-800          | +1 steps           | 4.24                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.22, 1.22             | grey-1000         | +5 steps           | 3.93, 3.93                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.10, 1.10, 1.03       | blue-600          | +3 steps           | 4.03, 4.03, 3.53                  |
| light  | kind-cache-write/base                                      | cyan-600           | 2.18                   | cyan-800          | +2 steps           | 4.23                              |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.51, 1.33             | blue-600          | +1 steps           | 4.03, 3.53                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 29.95; ~5 steps | 3.93                              |
| light  | edge/layer-01                                              | border-border-base | 1.25                   | grey-1000         | ΔE 28.14; ~4 steps | 3.63                              |
| dark   | chart-other/base                                           | grey-700           | 1.23                   | grey-400          | +3 steps           | 3.45                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.73                   | blue-800          | +2 steps           | 3.54                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.48                   | grey-400          | +2 steps           | 3.45                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.31, 1.18             | blue-800          | +3 steps           | 3.54, 3.20                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.41, 2.18             | blue-800          | +1 steps           | 3.54, 3.20                        |
| dark   | edge/base                                                  | border-border-base | 1.29                   | grey-400          | ΔE 21.91; ~3 steps | 3.45                              |
| dark   | edge/layer-01                                              | border-border-base | 1.34                   | grey-400          | ΔE 18.68; ~2 steps | 3.11                              |

</details>

<details>
<summary>Solarized (solarized)</summary>

| Scheme | Role / background                                             | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ------------------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/deep, text-muted/base                              | text-text-muted    | 4.37, 4.50       | grey-1200         | ΔE 1.71; ~0 steps  | 4.59, 4.73                        |
| light  | text-muted/layer-01, text-muted/layer-02, text-muted/layer-03 | text-text-muted    | 4.25, 4.10, 3.93 | **none**          | —                  | 4.47, 4.31, 4.13                  |
| light  | accent/deep, accent/layer-01, accent/layer-02                 | text-text-accent   | 3.37, 3.27, 3.16 | blue-800          | +2 steps           | 6.05, 5.88, 5.67                  |
| light  | accent/base                                                   | text-text-accent   | 3.46             | blue-700          | +1 steps           | 4.61                              |
| light  | inverse/inverse                                               | text-text-inverse  | 2.48             | **none**          | —                  | 2.63                              |
| light  | chart-5/base                                                  | cyan-700           | 2.98             | cyan-800          | +1 steps           | 4.35                              |
| light  | chart-other/base, outcome-stopped/base                        | grey-500           | 1.14, 1.14       | grey-1100         | +6 steps           | 3.54, 3.54                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0           | blue-300           | 1.15, 1.15, 1.05 | blue-600          | +3 steps           | 3.46, 3.46, 3.16                  |
| light  | kind-cache-write/base                                         | cyan-600           | 2.22             | cyan-800          | +2 steps           | 4.35                              |
| light  | level-2/base, level-2/level-0                                 | blue-500           | 1.54, 1.41       | blue-600          | +1 steps           | 3.46, 3.16                        |
| light  | edge/base                                                     | border-border-base | 1.26             | grey-1100         | ΔE 28.30; ~7 steps | 3.54                              |
| light  | edge/layer-01                                                 | border-border-base | 1.26             | grey-1100         | ΔE 26.88; ~5 steps | 3.35                              |
| dark   | text-muted/layer-02                                           | text-text-muted    | 4.35             | grey-100          | ΔE 3.19; ~0 steps  | 4.90                              |
| dark   | text-muted/layer-03                                           | text-text-muted    | 3.59             | grey-50           | ΔE 27.79; ~1 steps | 11.12                             |
| dark   | chart-other/base                                              | grey-700           | 1.15             | grey-300          | +4 steps           | 3.20                              |
| dark   | kind-cache-read/base                                          | blue-1000          | 1.23             | blue-600          | +4 steps           | 3.93                              |
| dark   | outcome-stopped/base                                          | grey-600           | 1.29             | grey-300          | +3 steps           | 3.20                              |
| dark   | level-1/base, level-1/level-0                                 | blue-1100          | 1.03, 1.05       | blue-600          | +5 steps           | 3.93, 3.64                        |
| dark   | level-2/base, level-2/level-0                                 | blue-900           | 1.60, 1.48       | blue-600          | +3 steps           | 3.93, 3.64                        |
| dark   | edge/base                                                     | border-border-base | 1.33             | grey-300          | ΔE 19.66; ~3 steps | 3.20                              |
| dark   | edge/layer-01                                                 | border-border-base | 1.35             | grey-200          | ΔE 29.24; ~3 steps | 4.48                              |

</details>

<details>
<summary>Synthwave '84 (synthwave84)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/layer-01, accent/layer-02              | text-text-accent   | 2.17, 2.08, 1.97       | blue-900          | +3 steps           | 6.33, 6.05, 5.74                  |
| light  | accent/base                                                | text-text-accent   | 2.27                   | blue-800          | +2 steps           | 4.50                              |
| light  | focus/deep, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.17, 2.08, 1.97, 1.82 | blue-800          | +2 steps           | 4.31, 4.12, 3.91, 3.61            |
| light  | focus/base                                                 | blue-600           | 2.27                   | blue-700          | +1 steps           | 3.09                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.25, 1.25             | grey-1000         | +5 steps           | 4.76, 4.76                        |
| light  | kind-cache-read/base, level-1/base                         | blue-300           | 1.16, 1.16             | blue-700          | +4 steps           | 3.09, 3.09                        |
| light  | kind-cache-write/base                                      | cyan-600           | 2.52                   | cyan-700          | +1 steps           | 3.46                              |
| light  | level-1/level-0                                            | blue-300           | 1.01                   | blue-800          | +5 steps           | 3.91                              |
| light  | level-2/base                                               | blue-500           | 1.53                   | blue-700          | +2 steps           | 3.09                              |
| light  | level-2/level-0                                            | blue-500           | 1.32                   | blue-800          | +3 steps           | 3.91                              |
| light  | level-3/level-0                                            | blue-700           | 2.69                   | blue-800          | +1 steps           | 3.91                              |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 34.40; ~5 steps | 4.76                              |
| light  | edge/layer-01                                              | border-border-base | 1.26                   | grey-1000         | ΔE 32.65; ~4 steps | 4.35                              |
| dark   | text-muted/layer-02, text-muted/layer-03                   | text-text-muted    | 3.28, 2.35             | grey-200          | ΔE 27.86; ~2 steps | 7.35, 5.28                        |
| dark   | chart-other/base                                           | grey-700           | 1.28                   | grey-400          | +3 steps           | 3.72                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.75                   | blue-800          | +2 steps           | 3.71                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.59                   | grey-400          | +2 steps           | 3.72                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.28, 1.13             | blue-800          | +3 steps           | 3.71, 3.27                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.50, 2.21             | blue-800          | +1 steps           | 3.71, 3.27                        |
| dark   | edge/base                                                  | border-border-base | 1.35                   | grey-400          | ΔE 24.26; ~3 steps | 3.72                              |
| dark   | edge/layer-01                                              | border-border-base | 1.37                   | grey-400          | ΔE 21.12; ~2 steps | 3.29                              |

</details>

<details>
<summary>Tokyonight (tokyonight)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 3.13, 3.25, 3.01, 2.85 | blue-800          | +2 steps           | 5.60, 5.82, 5.39, 5.11            |
| light  | inverse/inverse                                            | text-text-inverse  | 3.78                   | grey-50           | +1 steps           | 4.71                              |
| light  | focus/layer-02, focus/layer-03                             | blue-600           | 2.85, 2.69             | blue-700          | +1 steps           | 3.82, 3.60                        |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.21, 1.21             | grey-1000         | +5 steps           | 3.78, 3.78                        |
| light  | kind-cache-read/base, level-1/base                         | blue-300           | 1.02, 1.02             | blue-600          | +3 steps           | 3.25, 3.25                        |
| light  | kind-cache-write/base                                      | cyan-600           | 2.57                   | cyan-700          | +1 steps           | 3.44                              |
| light  | level-1/level-0                                            | blue-300           | 1.16                   | blue-700          | +4 steps           | 3.82                              |
| light  | level-2/base                                               | blue-500           | 1.33                   | blue-600          | +1 steps           | 3.25                              |
| light  | level-2/level-0                                            | blue-500           | 1.17                   | blue-700          | +2 steps           | 3.82                              |
| light  | edge/base                                                  | border-border-base | 1.25                   | grey-1000         | ΔE 29.58; ~5 steps | 3.78                              |
| light  | edge/layer-01                                              | border-border-base | 1.25                   | grey-1000         | ΔE 27.83; ~4 steps | 3.50                              |
| dark   | chart-other/base                                           | grey-700           | 1.19                   | grey-300          | +4 steps           | 4.74                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.77                   | blue-800          | +2 steps           | 3.66                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.39                   | grey-300          | +3 steps           | 4.74                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.31, 1.20             | blue-800          | +3 steps           | 3.66, 3.35                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.49, 2.28             | blue-800          | +1 steps           | 3.66, 3.35                        |
| dark   | edge/base                                                  | border-border-base | 1.32                   | grey-300          | ΔE 31.04; ~4 steps | 4.74                              |
| dark   | edge/layer-01                                              | border-border-base | 1.36                   | grey-300          | ΔE 28.63; ~3 steps | 4.33                              |

</details>

<details>
<summary>Vercel (vercel)</summary>

| Scheme | Role / background                                   | Original token     | Original ratio   | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | --------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/layer-01, accent/layer-02       | text-text-accent   | 4.30, 4.11, 3.86 | blue-700          | +1 steps           | 5.79, 5.54, 5.21                  |
| light  | chart-other/base, outcome-stopped/base              | grey-500           | 1.27, 1.27       | grey-900          | +4 steps           | 3.15, 3.15                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0 | blue-300           | 1.23, 1.23, 1.05 | blue-600          | +3 steps           | 4.52, 4.52, 3.86                  |
| light  | kind-cache-write/base                               | cyan-600           | 2.63             | cyan-700          | +1 steps           | 3.43                              |
| light  | level-2/base, level-2/level-0                       | blue-500           | 1.66, 1.42       | blue-600          | +1 steps           | 4.52, 3.86                        |
| light  | edge/base                                           | border-border-base | 1.26             | grey-900          | ΔE 22.33; ~4 steps | 3.15                              |
| light  | edge/layer-01                                       | border-border-base | 1.26             | grey-1000         | ΔE 35.83; ~4 steps | 5.14                              |
| dark   | text-muted/layer-03                                 | text-text-muted    | 3.89             | grey-200          | ΔE 16.39; ~1 steps | 7.43                              |
| dark   | chart-other/base                                    | grey-700           | 1.05             | grey-300          | +4 steps           | 5.61                              |
| dark   | kind-cache-read/base                                | blue-1000          | 2.08             | blue-800          | +2 steps           | 4.30                              |
| dark   | outcome-stopped/base                                | grey-600           | 1.16             | grey-300          | +3 steps           | 5.61                              |
| dark   | level-1/base, level-1/level-0                       | blue-1100          | 1.54, 1.52       | blue-800          | +3 steps           | 4.30, 4.23                        |
| dark   | level-2/base, level-2/level-0                       | blue-900           | 2.93, 2.88       | blue-800          | +1 steps           | 4.30, 4.23                        |
| dark   | edge/base                                           | border-border-base | 1.21             | grey-300          | ΔE 36.45; ~3 steps | 5.61                              |
| dark   | edge/layer-01                                       | border-border-base | 1.22             | grey-300          | ΔE 35.67; ~3 steps | 5.51                              |

</details>

<details>
<summary>Vesper (vesper)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 2.14, 2.26, 2.05, 1.92 | blue-900          | +3 steps           | 6.15, 6.49, 5.87, 5.50            |
| light  | focus/deep, focus/layer-01, focus/layer-02, focus/layer-03 | blue-600           | 2.14, 2.05, 1.92, 1.78 | blue-800          | +2 steps           | 4.21, 4.02, 3.76, 3.48            |
| light  | focus/base                                                 | blue-600           | 2.26                   | blue-700          | +1 steps           | 3.08                              |
| light  | chart-3/base, outcome-succeeded/base                       | green-700          | 2.81, 2.81             | green-800         | +1 steps           | 4.10, 4.10                        |
| light  | chart-5/base                                               | cyan-700           | 2.98                   | cyan-800          | +1 steps           | 4.32                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.27, 1.27             | grey-900          | +4 steps           | 3.22, 3.22                        |
| light  | kind-cache-read/base, level-1/base                         | blue-300           | 1.10, 1.10             | blue-700          | +4 steps           | 3.08, 3.08                        |
| light  | kind-cache-write/base                                      | cyan-600           | 2.21                   | cyan-800          | +2 steps           | 4.32                              |
| light  | level-1/level-0                                            | blue-300           | 1.07                   | blue-800          | +5 steps           | 3.76                              |
| light  | level-2/base                                               | blue-500           | 1.50                   | blue-700          | +2 steps           | 3.08                              |
| light  | level-2/level-0                                            | blue-500           | 1.27                   | blue-800          | +3 steps           | 3.76                              |
| light  | level-3/level-0                                            | blue-700           | 2.61                   | blue-800          | +1 steps           | 3.76                              |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-900          | ΔE 23.31; ~4 steps | 3.22                              |
| light  | edge/layer-01                                              | border-border-base | 1.25                   | grey-1000         | ΔE 37.59; ~4 steps | 5.28                              |
| dark   | chart-other/base                                           | grey-700           | 1.22                   | grey-400          | +3 steps           | 3.65                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.87                   | blue-800          | +2 steps           | 3.82                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.50                   | grey-400          | +2 steps           | 3.65                              |
| dark   | level-1/base, level-1/level-0                              | blue-1100          | 1.38, 1.25             | blue-800          | +3 steps           | 3.82, 3.47                        |
| dark   | level-2/base, level-2/level-0                              | blue-900           | 2.61, 2.37             | blue-800          | +1 steps           | 3.82, 3.47                        |
| dark   | edge/base                                                  | border-border-base | 1.29                   | grey-400          | ΔE 23.23; ~3 steps | 3.65                              |
| dark   | edge/layer-01                                              | border-border-base | 1.34                   | grey-400          | ΔE 20.18; ~2 steps | 3.31                              |

</details>

<details>
<summary>Zenburn (zenburn)</summary>

| Scheme | Role / background                                          | Original token     | Original ratio         | Nearest candidate | Distance           | Resulting ratio (or best if none) |
| ------ | ---------------------------------------------------------- | ------------------ | ---------------------- | ----------------- | ------------------ | --------------------------------- |
| light  | text-muted/layer-02, text-muted/layer-03                   | text-text-muted    | 4.42, 4.12             | grey-1100         | ΔE 5.87; ~0 steps  | 5.54, 5.17                        |
| light  | accent/deep, accent/base, accent/layer-01, accent/layer-02 | text-text-accent   | 4.03, 4.21, 3.89, 3.72 | blue-700          | +1 steps           | 5.44, 5.68, 5.26, 5.03            |
| light  | inverse/inverse                                            | text-text-inverse  | 3.72                   | **none**          | —                  | 3.74                              |
| light  | chart-other/base, outcome-stopped/base                     | grey-500           | 1.21, 1.21             | grey-1000         | +5 steps           | 3.72, 3.72                        |
| light  | kind-cache-read/base, level-1/base, level-1/level-0        | blue-300           | 1.22, 1.22, 1.08       | blue-600          | +3 steps           | 4.21, 4.21, 3.72                  |
| light  | kind-cache-write/base                                      | cyan-600           | 2.48                   | cyan-700          | +1 steps           | 3.37                              |
| light  | level-2/base, level-2/level-0                              | blue-500           | 1.64, 1.45             | blue-600          | +1 steps           | 4.21, 3.72                        |
| light  | edge/base                                                  | border-border-base | 1.26                   | grey-1000         | ΔE 26.75; ~5 steps | 3.72                              |
| light  | edge/layer-01                                              | border-border-base | 1.26                   | grey-1000         | ΔE 25.03; ~4 steps | 3.44                              |
| dark   | text-muted/layer-02                                        | text-text-muted    | 3.47                   | grey-200          | ΔE 10.68; ~1 steps | 4.83                              |
| dark   | text-muted/layer-03                                        | text-text-muted    | 2.69                   | grey-100          | ΔE 16.78; ~2 steps | 4.99                              |
| dark   | chart-other/base                                           | grey-700           | 1.27                   | grey-300          | +4 steps           | 4.70                              |
| dark   | kind-cache-read/base                                       | blue-1000          | 1.44                   | blue-800          | +2 steps           | 3.01                              |
| dark   | outcome-stopped/base                                       | grey-600           | 1.52                   | grey-300          | +3 steps           | 4.70                              |
| dark   | level-1/base                                               | blue-1100          | 1.04                   | blue-800          | +3 steps           | 3.01                              |
| dark   | level-1/level-0                                            | blue-1100          | 1.09                   | blue-700          | +4 steps           | 3.80                              |
| dark   | level-2/base                                               | blue-900           | 2.03                   | blue-800          | +1 steps           | 3.01                              |
| dark   | level-2/level-0                                            | blue-900           | 1.78                   | blue-700          | +2 steps           | 3.80                              |
| dark   | edge/base                                                  | border-border-base | 1.38                   | grey-300          | ΔE 32.56; ~4 steps | 4.70                              |
| dark   | edge/layer-01                                              | border-border-base | 1.38                   | grey-300          | ΔE 30.03; ~3 steps | 4.13                              |

</details>

## 2. Chart distinctness per theme and scheme

Each row evaluates **all 28 unordered series+more pairs** and **all 10 token-kind pairs** under each vision condition. Cell format is **number of pairs below 10; minimum ΔE00 (pair)**. Series labels 1–7 follow chart-1…7; **m** is more. Kinds: **I** input, **C** cache read, **W** cache write, **O** output, **R** reasoning. Values are from the original prototype mappings. A pair is counted using its unrounded value; at a displayed 10.00, membership can differ. Minimum pairs give concrete collision examples; complete pairwise values remain in scratch outputs.

| Theme ID               | Scheme | Series normal  | Series protanopia | Series deuteranopia | Series tritanopia | Kinds normal   | Kinds protanopia | Kinds deuteranopia | Kinds tritanopia |
| ---------------------- | ------ | -------------- | ----------------- | ------------------- | ----------------- | -------------- | ---------------- | ------------------ | ---------------- |
| `amoled`               | light  | 1; 6.03 (5/6)  | 2; 3.56 (5/6)     | 2; 2.90 (5/6)       | 4; 1.56 (5/6)     | 0; 29.83 (C/W) | 0; 16.35 (C/W)   | 0; 18.54 (O/R)     | 1; 5.60 (O/R)    |
| `amoled`               | dark   | 0; 12.13 (2/7) | 5; 2.09 (2/7)     | 3; 0.55 (2/7)       | 1; 6.87 (1/5)     | 0; 20.28 (I/R) | 1; 7.23 (W/R)    | 0; 11.79 (W/R)     | 0; 10.89 (O/R)   |
| `aura`                 | light  | 1; 5.80 (5/6)  | 2; 1.67 (2/7)     | 4; 3.86 (5/6)       | 5; 1.22 (5/6)     | 0; 23.11 (O/R) | 0; 11.10 (O/R)   | 1; 3.97 (O/R)      | 1; 9.78 (O/R)    |
| `aura`                 | dark   | 0; 12.28 (2/7) | 4; 5.82 (1/6)     | 2; 0.73 (1/6)       | 3; 3.40 (2/7)     | 0; 18.69 (O/R) | 0; 10.12 (W/R)   | 0; 14.94 (O/R)     | 0; 11.20 (I/W)   |
| `ayu`                  | light  | 3; 2.75 (1/5)  | 5; 2.31 (2/7)     | 5; 2.69 (1/5)       | 7; 2.41 (1/5)     | 0; 10.61 (I/W) | 0; 10.47 (I/W)   | 0; 10.52 (I/W)     | 1; 8.99 (O/R)    |
| `ayu`                  | dark   | 3; 0.59 (1/6)  | 5; 0.20 (1/6)     | 6; 0.16 (1/6)       | 4; 0.37 (1/6)     | 0; 10.54 (I/W) | 0; 10.54 (I/W)   | 0; 10.43 (I/W)     | 0; 10.03 (I/W)   |
| `carbonfox`            | light  | 2; 8.88 (1/6)  | 5; 4.36 (3/4)     | 4; 3.46 (4/7)       | 2; 5.72 (1/5)     | 0; 15.44 (I/W) | 0; 11.07 (I/W)   | 1; 7.17 (O/R)      | 0; 12.13 (I/W)   |
| `carbonfox`            | dark   | 3; 0.89 (1/6)  | 6; 0.82 (1/6)     | 6; 0.16 (2/7)       | 4; 0.93 (1/6)     | 0; 10.55 (I/W) | 1; 9.10 (I/W)    | 0; 10.09 (I/W)     | 0; 10.53 (I/W)   |
| `catppuccin`           | light  | 1; 6.52 (5/6)  | 3; 2.73 (2/7)     | 8; 1.69 (3/4)       | 4; 3.17 (5/6)     | 0; 18.88 (O/R) | 0; 13.76 (O/R)   | 1; 4.23 (O/R)      | 1; 7.80 (O/R)    |
| `catppuccin`           | dark   | 2; 9.83 (5/6)  | 7; 3.79 (2/7)     | 6; 0.44 (2/3)       | 3; 5.32 (2/7)     | 0; 23.23 (I/W) | 1; 5.39 (W/R)    | 0; 14.66 (W/R)     | 1; 9.66 (O/R)    |
| `catppuccin-frappe`    | light  | 1; 6.52 (5/6)  | 3; 2.73 (2/7)     | 8; 1.69 (3/4)       | 4; 3.17 (5/6)     | 0; 18.88 (O/R) | 0; 13.76 (O/R)   | 1; 4.23 (O/R)      | 1; 7.80 (O/R)    |
| `catppuccin-frappe`    | dark   | 2; 4.92 (5/6)  | 5; 4.04 (3/7)     | 6; 1.12 (2/3)       | 4; 0.85 (5/6)     | 0; 23.32 (I/R) | 1; 5.59 (I/R)    | 1; 9.56 (I/R)      | 0; 12.24 (O/R)   |
| `catppuccin-macchiato` | light  | 1; 6.52 (5/6)  | 3; 2.73 (2/7)     | 8; 1.69 (3/4)       | 4; 3.17 (5/6)     | 0; 18.88 (O/R) | 0; 13.76 (O/R)   | 1; 4.23 (O/R)      | 1; 7.80 (O/R)    |
| `catppuccin-macchiato` | dark   | 2; 4.06 (5/6)  | 5; 3.64 (2/7)     | 6; 0.43 (2/3)       | 4; 2.92 (5/6)     | 0; 22.86 (I/R) | 1; 5.35 (I/R)    | 1; 9.09 (I/R)      | 0; 12.09 (O/R)   |
| `cobalt2`              | light  | 1; 4.67 (2/6)  | 3; 0.92 (6/7)     | 7; 1.08 (2/6)       | 3; 1.92 (2/6)     | 0; 19.88 (W/O) | 0; 17.28 (C/R)   | 0; 14.90 (W/O)     | 0; 12.63 (W/O)   |
| `cobalt2`              | dark   | 0; 11.72 (5/6) | 5; 2.30 (2/7)     | 3; 0.59 (2/7)       | 3; 5.50 (5/6)     | 0; 15.28 (W/O) | 0; 15.99 (W/O)   | 0; 14.17 (W/O)     | 1; 9.36 (W/O)    |
| `cursor`               | light  | 1; 7.81 (1/6)  | 1; 8.40 (1/6)     | 2; 7.13 (2/7)       | 4; 2.94 (4/5)     | 0; 10.80 (W/R) | 0; 11.33 (W/R)   | 0; 10.52 (W/R)     | 1; 6.33 (W/R)    |
| `cursor`               | dark   | 3; 4.34 (5/6)  | 7; 0.54 (5/6)     | 7; 0.24 (5/6)       | 7; 1.53 (4/5)     | 1; 9.59 (I/R)  | 1; 7.16 (I/R)    | 1; 4.78 (I/R)      | 1; 3.42 (I/R)    |
| `dracula`              | light  | 0; 15.90 (2/7) | 3; 3.73 (2/7)     | 2; 8.87 (1/6)       | 2; 6.74 (2/4)     | 0; 29.35 (I/R) | 0; 14.74 (I/R)   | 0; 18.63 (I/W)     | 1; 6.74 (O/R)    |
| `dracula`              | dark   | 0; 14.41 (2/7) | 5; 5.86 (4/6)     | 6; 2.52 (1/6)       | 2; 2.51 (2/7)     | 0; 14.87 (I/R) | 1; 7.38 (I/R)    | 0; 11.54 (W/R)     | 0; 12.30 (I/W)   |
| `everforest`           | light  | 2; 0.00 (1/3)  | 3; 0.00 (1/3)     | 8; 0.00 (1/3)       | 2; 0.00 (1/3)     | 0; 22.87 (I/W) | 0; 13.61 (C/W)   | 1; 3.39 (I/O)      | 0; 22.06 (O/R)   |
| `everforest`           | dark   | 3; 5.07 (5/6)  | 4; 1.04 (1/5)     | 6; 1.60 (1/5)       | 4; 3.56 (5/6)     | 0; 11.70 (I/W) | 1; 8.92 (I/W)    | 2; 5.69 (W/O)      | 0; 15.20 (I/W)   |
| `flexoki`              | light  | 0; 14.35 (4/7) | 2; 1.06 (3/4)     | 3; 3.14 (2/7)       | 1; 7.16 (2/7)     | 0; 21.47 (O/R) | 0; 19.81 (O/R)   | 0; 17.13 (O/R)     | 0; 14.74 (O/R)   |
| `flexoki`              | dark   | 1; 5.84 (5/6)  | 3; 2.50 (1/4)     | 5; 0.42 (1/4)       | 3; 0.97 (5/6)     | 0; 15.56 (I/R) | 1; 2.50 (I/R)    | 1; 0.42 (I/R)      | 0; 11.43 (I/W)   |
| `github`               | light  | 2; 9.09 (2/7)  | 7; 2.90 (2/7)     | 6; 1.27 (2/7)       | 2; 6.29 (2/7)     | 0; 26.64 (I/R) | 0; 19.64 (I/R)   | 0; 16.67 (I/R)     | 0; 10.51 (I/R)   |
| `github`               | dark   | 1; 7.64 (5/6)  | 8; 3.72 (2/7)     | 6; 1.12 (2/7)       | 5; 1.50 (5/6)     | 1; 3.27 (W/O)  | 2; 1.97 (W/O)    | 2; 1.16 (W/O)      | 2; 1.98 (W/O)    |
| `gruvbox`              | light  | 0; 10.55 (2/7) | 6; 2.40 (3/7)     | 7; 0.70 (2/7)       | 2; 6.40 (2/7)     | 0; 13.71 (O/R) | 1; 4.50 (O/R)    | 1; 2.14 (O/R)      | 0; 11.97 (O/R)   |
| `gruvbox`              | dark   | 1; 4.90 (5/6)  | 6; 2.77 (2/7)     | 7; 0.36 (3/7)       | 5; 1.04 (5/6)     | 0; 21.18 (W/R) | 1; 6.43 (I/R)    | 0; 10.87 (I/W)     | 1; 7.32 (W/O)    |
| `kanagawa`             | light  | 1; 7.88 (1/6)  | 3; 4.98 (2/7)     | 4; 1.71 (2/7)       | 2; 5.78 (1/6)     | 0; 26.54 (C/W) | 0; 15.04 (W/R)   | 0; 23.71 (C/R)     | 0; 24.67 (C/W)   |
| `kanagawa`             | dark   | 1; 4.39 (5/6)  | 3; 3.34 (5/6)     | 4; 3.78 (5/6)       | 3; 5.85 (5/6)     | 0; 27.98 (I/R) | 0; 11.19 (W/O)   | 1; 7.72 (W/O)      | 0; 15.98 (I/W)   |
| `lucent-orng`          | light  | 3; 1.28 (1/4)  | 3; 1.61 (1/4)     | 4; 1.05 (1/4)       | 7; 0.48 (2/7)     | 1; 1.28 (I/R)  | 1; 1.61 (I/R)    | 1; 1.05 (I/R)      | 3; 1.11 (I/R)    |
| `lucent-orng`          | dark   | 1; 5.34 (5/6)  | 3; 4.58 (5/6)     | 1; 3.04 (5/6)       | 2; 1.54 (5/6)     | 0; 18.08 (I/R) | 1; 9.90 (I/R)    | 0; 12.43 (I/R)     | 0; 17.95 (I/R)   |
| `material`             | light  | 1; 7.19 (1/4)  | 4; 3.72 (6/7)     | 8; 0.92 (2/3)       | 4; 4.87 (2/5)     | 1; 7.19 (I/R)  | 1; 7.01 (I/R)    | 1; 7.25 (I/R)      | 2; 6.38 (W/O)    |
| `material`             | dark   | 1; 0.00 (1/4)  | 5; 0.00 (1/4)     | 5; 0.00 (1/4)       | 2; 0.00 (1/4)     | 1; 0.00 (I/R)  | 1; 0.00 (I/R)    | 1; 0.00 (I/R)      | 1; 0.00 (I/R)    |
| `matrix`               | light  | 3; 0.00 (1/6)  | 7; 0.00 (1/6)     | 7; 0.00 (1/6)       | 6; 0.00 (1/6)     | 0; 10.80 (I/W) | 2; 6.34 (I/R)    | 3; 6.74 (I/R)      | 1; 6.98 (I/W)    |
| `matrix`               | dark   | 3; 0.00 (1/6)  | 9; 0.00 (1/6)     | 9; 0.00 (1/6)       | 3; 0.00 (1/6)     | 0; 10.64 (I/W) | 3; 4.87 (I/R)    | 1; 0.18 (I/R)      | 1; 9.54 (I/W)    |
| `mercury`              | light  | 0; 14.00 (2/7) | 2; 6.74 (2/7)     | 1; 3.90 (2/7)       | 2; 8.80 (3/6)     | 0; 21.64 (C/R) | 0; 15.40 (W/R)   | 0; 11.88 (W/R)     | 1; 9.81 (W/R)    |
| `mercury`              | dark   | 2; 0.00 (1/4)  | 4; 0.00 (1/4)     | 8; 0.00 (1/4)       | 3; 0.00 (1/4)     | 1; 0.00 (I/R)  | 1; 0.00 (I/R)    | 1; 0.00 (I/R)      | 1; 0.00 (I/R)    |
| `monokai`              | light  | 1; 8.95 (5/6)  | 3; 5.61 (2/7)     | 5; 5.27 (2/3)       | 4; 4.73 (2/4)     | 0; 25.71 (I/R) | 0; 15.56 (C/W)   | 0; 12.17 (I/W)     | 1; 4.73 (O/R)    |
| `monokai`              | dark   | 1; 9.05 (5/6)  | 5; 5.37 (4/5)     | 5; 1.54 (1/6)       | 2; 8.93 (5/6)     | 0; 20.21 (I/R) | 1; 6.21 (W/R)    | 0; 13.56 (I/W)     | 0; 20.85 (I/R)   |
| `nightowl`             | light  | 2; 0.00 (1/6)  | 1; 0.00 (1/6)     | 1; 0.00 (1/6)       | 3; 0.00 (1/6)     | 1; 9.89 (O/R)  | 0; 11.38 (O/R)   | 0; 15.71 (I/R)     | 1; 4.48 (O/R)    |
| `nightowl`             | dark   | 3; 0.00 (1/6)  | 5; 0.00 (1/6)     | 6; 0.00 (1/6)       | 6; 0.00 (1/6)     | 0; 10.39 (I/W) | 1; 9.23 (I/W)    | 1; 9.99 (I/W)      | 1; 9.02 (O/R)    |
| `nord`                 | light  | 2; 5.64 (5/6)  | 2; 2.35 (5/6)     | 4; 1.59 (5/6)       | 6; 2.37 (2/7)     | 1; 7.81 (O/R)  | 1; 4.98 (O/R)    | 1; 8.14 (O/R)      | 1; 7.94 (O/R)    |
| `nord`                 | dark   | 2; 4.34 (5/6)  | 4; 0.54 (5/6)     | 4; 0.24 (5/6)       | 4; 1.53 (1/5)     | 0; 12.44 (I/W) | 0; 11.43 (I/W)   | 0; 11.81 (I/W)     | 0; 10.11 (I/W)   |
| `oc-2`                 | light  | 0; 10.85 (1/4) | 4; 5.97 (3/7)     | 1; 2.71 (2/7)       | 3; 4.95 (1/4)     | 0; 10.85 (I/R) | 1; 7.06 (I/R)    | 0; 10.76 (I/R)     | 1; 4.95 (I/R)    |
| `oc-2`                 | dark   | 0; 13.06 (1/4) | 2; 6.72 (3/7)     | 3; 7.74 (2/7)       | 2; 5.29 (2/6)     | 0; 13.06 (I/R) | 2; 8.91 (I/R)    | 2; 7.36 (I/W)      | 1; 7.00 (I/W)    |
| `one-dark`             | light  | 1; 3.70 (6/7)  | 6; 0.13 (2/6)     | 8; 1.57 (2/7)       | 4; 3.67 (6/7)     | 0; 18.24 (I/R) | 1; 10.00 (I/R)   | 1; 9.76 (I/R)      | 0; 10.64 (I/R)   |
| `one-dark`             | dark   | 1; 5.63 (5/6)  | 6; 3.78 (5/6)     | 5; 1.47 (2/3)       | 5; 1.00 (5/6)     | 1; 4.55 (W/O)  | 2; 2.99 (W/O)    | 2; 2.12 (W/O)      | 2; 0.82 (W/O)    |
| `onedarkpro`           | light  | 1; 6.22 (5/6)  | 3; 5.68 (5/6)     | 6; 4.32 (2/7)       | 5; 2.49 (5/6)     | 0; 18.44 (O/R) | 0; 10.66 (O/R)   | 1; 6.25 (O/R)      | 0; 10.04 (O/R)   |
| `onedarkpro`           | dark   | 1; 5.34 (5/6)  | 5; 4.58 (5/6)     | 6; 1.47 (2/3)       | 4; 1.54 (5/6)     | 0; 21.66 (I/W) | 1; 9.78 (W/R)    | 0; 12.04 (I/W)     | 0; 10.20 (I/W)   |
| `orng`                 | light  | 3; 1.28 (1/4)  | 3; 1.61 (1/4)     | 4; 1.05 (1/4)       | 7; 0.48 (2/7)     | 1; 1.28 (I/R)  | 1; 1.61 (I/R)    | 1; 1.05 (I/R)      | 3; 1.11 (I/R)    |
| `orng`                 | dark   | 1; 5.34 (5/6)  | 3; 4.58 (5/6)     | 1; 3.04 (5/6)       | 2; 1.54 (5/6)     | 0; 18.08 (I/R) | 1; 9.90 (I/R)    | 0; 12.43 (I/R)     | 0; 17.95 (I/R)   |
| `osaka-jade`           | light  | 4; 0.00 (1/6)  | 8; 0.00 (1/6)     | 5; 0.00 (1/6)       | 7; 0.00 (1/6)     | 0; 12.63 (I/R) | 1; 9.18 (O/R)    | 0; 12.31 (O/R)     | 1; 9.14 (I/R)    |
| `osaka-jade`           | dark   | 2; 5.69 (4/5)  | 6; 2.78 (2/7)     | 4; 1.41 (2/7)       | 7; 2.03 (5/6)     | 0; 11.60 (W/R) | 1; 8.50 (W/R)    | 0; 10.94 (W/R)     | 2; 3.06 (I/R)    |
| `palenight`            | light  | 0; 13.71 (5/6) | 3; 3.72 (6/7)     | 7; 0.92 (2/3)       | 3; 4.87 (2/5)     | 0; 22.64 (W/O) | 0; 15.91 (W/O)   | 0; 11.41 (W/O)     | 1; 6.38 (W/O)    |
| `palenight`            | dark   | 1; 6.86 (5/6)  | 5; 3.02 (2/7)     | 5; 0.66 (1/4)       | 3; 3.14 (5/6)     | 0; 14.30 (I/R) | 1; 3.04 (I/R)    | 1; 0.66 (I/R)      | 1; 8.58 (W/O)    |
| `rosepine`             | light  | 1; 3.70 (1/3)  | 3; 2.27 (2/7)     | 3; 3.56 (1/3)       | 3; 3.78 (1/3)     | 0; 20.36 (O/R) | 0; 14.80 (C/W)   | 0; 13.93 (O/R)     | 0; 10.37 (O/R)   |
| `rosepine`             | dark   | 3; 0.00 (1/6)  | 5; 0.00 (1/6)     | 4; 0.00 (1/6)       | 4; 0.00 (1/6)     | 0; 11.27 (I/W) | 1; 9.04 (I/W)    | 1; 9.83 (I/W)      | 0; 10.42 (I/W)   |
| `shadesofpurple`       | light  | 1; 9.75 (5/6)  | 3; 7.07 (4/6)     | 1; 10.00 (4/5)      | 3; 5.56 (3/6)     | 0; 25.06 (C/W) | 0; 13.33 (I/R)   | 1; 5.66 (W/R)      | 0; 12.09 (O/R)   |
| `shadesofpurple`       | dark   | 0; 11.92 (5/6) | 5; 4.53 (2/7)     | 3; 0.75 (1/6)       | 1; 5.12 (2/7)     | 0; 13.85 (I/R) | 2; 8.00 (I/R)    | 0; 10.61 (W/R)     | 0; 13.14 (O/R)   |
| `solarized`            | light  | 1; 9.98 (5/6)  | 2; 3.21 (2/7)     | 5; 1.22 (2/7)       | 3; 6.26 (1/6)     | 0; 28.76 (C/W) | 0; 11.34 (I/R)   | 0; 11.64 (W/R)     | 0; 14.76 (O/R)   |
| `solarized`            | dark   | 1; 6.21 (5/6)  | 3; 1.97 (3/7)     | 6; 0.47 (4/5)       | 1; 1.04 (5/6)     | 0; 22.72 (I/R) | 0; 10.96 (I/R)   | 0; 10.24 (W/R)     | 0; 19.23 (I/W)   |
| `synthwave84`          | light  | 1; 4.67 (2/6)  | 3; 0.92 (6/7)     | 7; 1.08 (2/6)       | 4; 1.92 (2/6)     | 0; 19.88 (W/O) | 0; 20.71 (W/O)   | 0; 14.90 (W/O)     | 0; 12.63 (W/O)   |
| `synthwave84`          | dark   | 1; 7.73 (5/6)  | 4; 2.38 (2/7)     | 3; 0.67 (2/7)       | 3; 2.83 (5/6)     | 0; 19.94 (W/O) | 0; 15.08 (I/R)   | 1; 6.44 (I/R)      | 1; 4.49 (W/O)    |
| `tokyonight`           | light  | 1; 9.14 (2/7)  | 3; 2.92 (2/7)     | 3; 1.36 (2/7)       | 2; 6.39 (2/7)     | 0; 17.05 (O/R) | 0; 15.36 (O/R)   | 0; 16.91 (I/W)     | 0; 14.66 (I/W)   |
| `tokyonight`           | dark   | 1; 9.25 (5/6)  | 4; 2.15 (1/6)     | 5; 0.70 (1/6)       | 5; 3.83 (1/5)     | 0; 13.24 (O/R) | 0; 13.62 (I/W)   | 0; 12.38 (O/R)     | 0; 10.03 (I/W)   |
| `vercel`               | light  | 1; 0.00 (1/6)  | 6; 0.00 (1/6)     | 6; 0.00 (1/6)       | 1; 0.00 (1/6)     | 0; 22.51 (I/R) | 1; 4.06 (I/R)    | 1; 6.03 (I/R)      | 0; 21.83 (I/W)   |
| `vercel`               | dark   | 3; 0.00 (1/6)  | 9; 0.00 (1/6)     | 7; 0.00 (1/6)       | 4; 0.00 (1/6)     | 0; 10.90 (I/W) | 3; 3.11 (I/R)    | 1; 0.90 (I/R)      | 0; 10.55 (I/W)   |
| `vesper`               | light  | 1; 0.00 (1/6)  | 4; 0.00 (1/6)     | 5; 0.00 (1/6)       | 3; 0.00 (1/6)     | 0; 11.98 (I/O) | 1; 8.47 (I/O)    | 1; 5.83 (I/O)      | 1; 1.79 (I/O)    |
| `vesper`               | dark   | 1; 0.00 (1/6)  | 4; 0.00 (1/6)     | 6; 0.00 (1/6)       | 4; 0.00 (1/6)     | 0; 13.41 (O/R) | 1; 9.50 (W/R)    | 2; 8.99 (I/R)      | 1; 2.79 (I/R)    |
| `zenburn`              | light  | 3; 6.44 (2/6)  | 7; 2.59 (2/7)     | 6; 0.81 (3/6)       | 3; 5.41 (2/6)     | 0; 17.82 (I/R) | 0; 15.50 (I/R)   | 0; 14.07 (I/R)     | 0; 13.24 (I/R)   |
| `zenburn`              | dark   | 3; 1.44 (1/4)  | 5; 0.44 (1/4)     | 4; 0.70 (1/4)       | 4; 1.59 (1/4)     | 1; 1.44 (I/R)  | 2; 0.44 (I/R)    | 2; 0.70 (I/R)      | 2; 1.59 (I/R)    |

### Equal seeds and misleading ramp names

The resolver's source mapping is exact: blue ← **interactive ?? primary**; green ← success; yellow ← warning; red ← error; purple ← **accent ?? info**; pink ← info; orange ← warning shifted by h −22°, l −0.082 and chroma ×0.94; cyan ← info shifted by h −12°, l +0.128 and chroma ×1.12. Thus a label such as “pink” can produce blue, and a pair of different names can be the same generated ramp.

The next table lists every non-default palette with any seed pair below **ΔE00 3** in normal D65 vision. Identical seeds imply identical generated hue ramps within that variant; near seeds are a warning, not proof that every corresponding output step has exactly the same ΔE. **No non-default theme omits accent in this package.** The fallback accent/info equality happens for oc-2's inputs, but oc-2 overrides both ramps, so its actual purple and pink are distinct. It must not be flagged as an actual equal-ramp theme. Cyan's derivation from info still couples it to pink for every non-default theme.

| Theme ID               | Scheme | Identical / near-identical seed pairs                                                       |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `aura`                 | light  | red/purple: identical                                                                       |
| `aura`                 | dark   | red/purple: identical                                                                       |
| `ayu`                  | dark   | red/purple: 1.11                                                                            |
| `carbonfox`            | light  | red/purple: identical                                                                       |
| `carbonfox`            | dark   | red/purple: identical                                                                       |
| `catppuccin`           | light  | red/purple: identical                                                                       |
| `catppuccin`           | dark   | red/purple: identical                                                                       |
| `catppuccin-frappe`    | light  | red/purple: identical                                                                       |
| `catppuccin-macchiato` | light  | red/purple: identical                                                                       |
| `cobalt2`              | dark   | pink/orange: 1.76                                                                           |
| `everforest`           | light  | blue/green: identical                                                                       |
| `everforest`           | dark   | blue/green: identical                                                                       |
| `flexoki`              | light  | yellow/purple: identical                                                                    |
| `gruvbox`              | light  | red/purple: identical                                                                       |
| `gruvbox`              | dark   | red/purple: identical                                                                       |
| `lucent-orng`          | light  | blue/yellow: identical                                                                      |
| `lucent-orng`          | dark   | blue/yellow: identical                                                                      |
| `material`             | light  | blue/purple: identical                                                                      |
| `material`             | dark   | blue/purple: identical; yellow/pink: identical                                              |
| `matrix`               | light  | blue/pink: identical                                                                        |
| `matrix`               | dark   | blue/pink: identical                                                                        |
| `mercury`              | dark   | blue/purple: identical                                                                      |
| `monokai`              | dark   | red/purple: identical                                                                       |
| `nightowl`             | light  | blue/pink: identical                                                                        |
| `nightowl`             | dark   | blue/pink: identical                                                                        |
| `nord`                 | light  | red/purple: identical                                                                       |
| `one-dark`             | dark   | pink/orange: 2.22                                                                           |
| `onedarkpro`           | dark   | red/purple: identical                                                                       |
| `orng`                 | light  | blue/yellow: identical                                                                      |
| `orng`                 | dark   | blue/yellow: identical                                                                      |
| `osaka-jade`           | light  | blue/pink: identical; green/purple: identical                                               |
| `osaka-jade`           | dark   | green/purple: identical                                                                     |
| `rosepine`             | dark   | blue/pink: identical                                                                        |
| `shadesofpurple`       | light  | red/purple: identical                                                                       |
| `shadesofpurple`       | dark   | red/purple: identical                                                                       |
| `vercel`               | light  | blue/pink: identical                                                                        |
| `vercel`               | dark   | blue/pink: identical                                                                        |
| `vesper`               | light  | blue/yellow: identical; blue/pink: identical; yellow/pink: identical                        |
| `vesper`               | dark   | blue/yellow: identical; blue/pink: identical; yellow/pink: identical; red/purple: identical |

Theme names do not constrain hue. For example, Dracula's “blue” uses primary **#7c6bf5 light / #bd93f9 dark**, its “purple” uses accent **#d16090 / #ff79c6**, and its “pink” uses info **#1d7fc5 / #8be9fd**. That is purple / rose / blue-cyan respectively, not the ramp labels' conventional hues. Everforest's blue and green share success/interactive seeds; Orng/Lucent Orng's blue and yellow share an orange warning/primary seed; Vesper shares that seed across blue, yellow and pink. This is source behaviour, not a theme bug.

For transparency the table gives each non-default variant's **blue / purple / pink seed hex**, not subjective colour-name classifications. The full hue-seed mapping above tells what all nine ramps mean.

| Theme ID               | Light blue / purple / pink seeds  | Dark blue / purple / pink seeds   |
| ---------------------- | --------------------------------- | --------------------------------- |
| `amoled`               | `#6200ff` / `#ff0080` / `#00b0ff` | `#b388ff` / `#ff4081` / `#18ffff` |
| `aura`                 | `#a277ff` / `#d94f4f` / `#5bb8d9` | `#a277ff` / `#ff6767` / `#82e2ff` |
| `ayu`                  | `#4aa8c8` / `#ef7d71` / `#2f9bce` | `#3fb7e3` / `#f2856f` / `#66c6f1` |
| `carbonfox`            | `#0f62fe` / `#da1e28` / `#0043ce` | `#4589ff` / `#ff8389` / `#78a9ff` |
| `catppuccin`           | `#7287fd` / `#d20f39` / `#04a5e5` | `#b4befe` / `#f38ba8` / `#89dceb` |
| `catppuccin-frappe`    | `#7287fd` / `#d20f39` / `#04a5e5` | `#8caaee` / `#f4b8e4` / `#81c8be` |
| `catppuccin-macchiato` | `#7287fd` / `#d20f39` / `#04a5e5` | `#8aadf4` / `#f5bde6` / `#8bd5ca` |
| `cobalt2`              | `#0066cc` / `#00acc1` / `#ff5722` | `#0088ff` / `#2affdf` / `#ff9d00` |
| `cursor`               | `#206595` / `#6f9ba6` / `#3c7cab` | `#82D2CE` / `#88c0d0` / `#81a1c1` |
| `dracula`              | `#7c6bf5` / `#d16090` / `#1d7fc5` | `#bd93f9` / `#ff79c6` / `#8be9fd` |
| `everforest`           | `#8da101` / `#df69ba` / `#35a77c` | `#a7c080` / `#d699b6` / `#83c092` |
| `flexoki`              | `#205EA6` / `#BC5215` / `#24837B` | `#4385BE` / `#8B7EC8` / `#3AA99F` |
| `github`               | `#0969da` / `#1b7c83` / `#bc4c00` | `#58a6ff` / `#39c5cf` / `#d29922` |
| `gruvbox`              | `#076678` / `#9d0006` / `#8f3f71` | `#83a598` / `#fb4934` / `#d3869b` |
| `kanagawa`             | `#2D4F67` / `#D27E99` / `#4d699b` | `#7E9CD8` / `#D27E99` / `#76946A` |
| `lucent-orng`          | `#EC5B2B` / `#c94d24` / `#318795` | `#EC5B2B` / `#FFF7F1` / `#56b6c2` |
| `material`             | `#39adb5` / `#39adb5` / `#f4511e` | `#89ddff` / `#89ddff` / `#ffcb6b` |
| `matrix`               | `#30b3ff` / `#c770ff` / `#30b3ff` | `#30b3ff` / `#c770ff` / `#30b3ff` |
| `mercury`              | `#465bd1` / `#8da4f5` / `#007f95` | `#8da4f5` / `#8da4f5` / `#77becf` |
| `monokai`              | `#bf7bff` / `#d9487c` / `#2d9ad7` | `#ae81ff` / `#f92672` / `#66d9ef` |
| `nightowl`             | `#4876d6` / `#aa0982` / `#4876d6` | `#82aaff` / `#f78c6c` / `#82aaff` |
| `nord`                 | `#5e81ac` / `#bf616a` / `#81a1c1` | `#88c0d0` / `#d57780` / `#81a1c1` |
| `one-dark`             | `#4078f2` / `#0184bc` / `#986801` | `#61afef` / `#56b6c2` / `#d19a66` |
| `onedarkpro`           | `#528bff` / `#d85462` / `#61afef` | `#61afef` / `#e06c75` / `#56b6c2` |
| `orng`                 | `#EC5B2B` / `#c94d24` / `#318795` | `#EC5B2B` / `#FFF7F1` / `#56b6c2` |
| `osaka-jade`           | `#1faa90` / `#3d7a52` / `#1faa90` | `#8CD3CB` / `#549e6a` / `#2DD5B7` |
| `palenight`            | `#4976eb` / `#00acc1` / `#f4511e` | `#82aaff` / `#89ddff` / `#f78c6c` |
| `rosepine`             | `#31748f` / `#d7827e` / `#56949f` | `#9ccfd8` / `#ebbcba` / `#9ccfd8` |
| `shadesofpurple`       | `#7a5af8` / `#ff6bd5` / `#62d4ff` | `#c792ff` / `#ff7ac6` / `#7dd4ff` |
| `solarized`            | `#268bd2` / `#d33682` / `#2aa198` | `#6c71c4` / `#d33682` / `#2aa198` |
| `synthwave84`          | `#00bcd4` / `#9c27b0` / `#ff5722` | `#36f9f6` / `#b084eb` / `#ff8b39` |
| `tokyonight`           | `#2e7de9` / `#b15c00` / `#007197` | `#7aa2f7` / `#ff9e64` / `#7dcfff` |
| `vercel`               | `#0070F3` / `#8E4EC6` / `#0070F3` | `#52A8FF` / `#8E4EC6` / `#52A8FF` |
| `vesper`               | `#FFC799` / `#B30000` / `#FFC799` | `#FFC799` / `#FF8080` / `#FFC799` |
| `zenburn`              | `#5f7f8f` / `#5f8f8f` / `#8f7f5f` | `#8cd0d3` / `#93e0e3` / `#dfaf8f` |

The three Catppuccin themes have exactly the same **light variant JSON object**, so their resolved light CSS/colour measurements are identical; their dark variants differ. Equal seed pairs **within** a theme are distinct from that cross-theme duplication.

### Contrast repair is not a distinctness repair

For this diagnostic, each chart role moves to its nearest passing step against **all** its required backgrounds, not a separate candidate for each comparison. The seven series+more still have normal-vision collisions in **60/72** palettes, and kinds in **40/72** (originally 11). Below are the per-palette counts after that contrast-only repair, with all CVD conditions. This is not an optimized categorical palette.

| Theme ID               | Scheme | Series low pairs N/P/D/T | Kinds low pairs N/P/D/T | Passing blue steps for contribution (base + empty)                             |
| ---------------------- | ------ | ------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| `amoled`               | light  | 1/5/2/4                  | 1/2/1/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `amoled`               | dark   | 0/5/3/1                  | 0/1/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `aura`                 | light  | 1/4/6/5                  | 1/1/2/2                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `aura`                 | dark   | 0/4/2/3                  | 0/0/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `ayu`                  | light  | 3/6/6/7                  | 3/4/4/4                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `ayu`                  | dark   | 3/5/6/4                  | 0/0/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `carbonfox`            | light  | 3/7/5/3                  | 1/3/3/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `carbonfox`            | dark   | 3/6/6/4                  | 0/1/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600                     |
| `catppuccin`           | light  | 1/4/8/6                  | 1/1/2/4                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `catppuccin`           | dark   | 2/7/6/3                  | 0/1/0/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `catppuccin-frappe`    | light  | 1/4/8/6                  | 1/1/2/4                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `catppuccin-frappe`    | dark   | 2/5/6/4                  | 0/1/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `catppuccin-macchiato` | light  | 1/4/8/6                  | 1/1/2/4                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `catppuccin-macchiato` | dark   | 2/5/6/4                  | 0/1/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `cobalt2`              | light  | 1/3/7/4                  | 1/1/1/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `cobalt2`              | dark   | 0/5/3/3                  | 0/0/0/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600                     |
| `cursor`               | light  | 1/2/3/4                  | 1/1/2/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `cursor`               | dark   | 3/7/7/7                  | 1/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `dracula`              | light  | 0/4/2/2                  | 1/1/2/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `dracula`              | dark   | 0/5/6/2                  | 0/1/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `everforest`           | light  | 2/5/7/2                  | 1/3/3/1                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `everforest`           | dark   | 3/5/6/4                  | 0/1/2/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `flexoki`              | light  | 0/3/4/1                  | 1/1/1/1                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `flexoki`              | dark   | 1/3/5/3                  | 0/1/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `github`               | light  | 2/8/6/2                  | 1/1/1/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `github`               | dark   | 1/8/6/5                  | 1/2/2/2                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `gruvbox`              | light  | 0/6/7/2                  | 1/2/2/1                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `gruvbox`              | dark   | 1/6/7/5                  | 0/1/0/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `kanagawa`             | light  | 1/3/5/2                  | 1/2/1/1                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `kanagawa`             | dark   | 1/3/4/3                  | 0/0/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `lucent-orng`          | light  | 3/4/4/7                  | 3/3/3/5                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `lucent-orng`          | dark   | 1/4/1/2                  | 0/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `material`             | light  | 1/4/8/4                  | 3/3/4/4                 | blue-800, blue-900, blue-1000, blue-1100, blue-1200                            |
| `material`             | dark   | 1/5/5/2                  | 1/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `matrix`               | light  | 3/8/4/7                  | 3/5/3/3                 | blue-800, blue-900, blue-1000, blue-1100, blue-1200                            |
| `matrix`               | dark   | 3/9/9/3                  | 0/3/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `mercury`              | light  | 0/3/1/3                  | 1/1/1/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `mercury`              | dark   | 2/4/8/3                  | 1/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `monokai`              | light  | 1/3/5/4                  | 1/1/3/2                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `monokai`              | dark   | 1/5/5/2                  | 0/1/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `nightowl`             | light  | 2/4/4/6                  | 3/3/3/4                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `nightowl`             | dark   | 3/5/6/6                  | 0/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `nord`                 | light  | 3/4/6/8                  | 4/4/4/4                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `nord`                 | dark   | 2/4/4/4                  | 0/0/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |
| `oc-2`                 | light  | 0/4/2/2                  | 1/3/2/3                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `oc-2`                 | dark   | 0/2/3/2                  | 0/3/2/2                 | blue-100, blue-200, blue-300, blue-400, blue-500                               |
| `one-dark`             | light  | 1/6/8/4                  | 1/3/3/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `one-dark`             | dark   | 1/6/5/5                  | 1/2/2/2                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `onedarkpro`           | light  | 1/3/6/5                  | 1/2/3/3                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `onedarkpro`           | dark   | 1/5/6/4                  | 0/1/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `orng`                 | light  | 3/4/4/7                  | 3/3/3/5                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `orng`                 | dark   | 1/4/1/2                  | 0/1/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `osaka-jade`           | light  | 5/12/8/8                 | 4/5/4/6                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `osaka-jade`           | dark   | 2/6/5/7                  | 0/1/0/2                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `palenight`            | light  | 0/3/7/3                  | 0/1/2/3                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `palenight`            | dark   | 1/5/5/3                  | 0/1/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `rosepine`             | light  | 2/6/5/4                  | 1/1/2/3                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `rosepine`             | dark   | 3/6/4/4                  | 0/1/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `shadesofpurple`       | light  | 1/5/4/3                  | 0/3/1/1                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `shadesofpurple`       | dark   | 0/5/3/1                  | 0/2/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `solarized`            | light  | 1/5/9/4                  | 1/1/2/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `solarized`            | dark   | 1/3/6/1                  | 0/0/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600                     |
| `synthwave84`          | light  | 1/3/7/4                  | 1/1/1/2                 | blue-800, blue-900, blue-1000, blue-1100, blue-1200                            |
| `synthwave84`          | dark   | 1/4/3/3                  | 0/0/1/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `tokyonight`           | light  | 1/4/4/2                  | 1/1/1/3                 | blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200                  |
| `tokyonight`           | dark   | 1/4/5/5                  | 0/0/0/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `vercel`               | light  | 1/6/6/1                  | 1/4/5/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `vercel`               | dark   | 3/9/7/4                  | 0/3/1/0                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `vesper`               | light  | 2/7/7/4                  | 1/3/3/3                 | blue-800, blue-900, blue-1000, blue-1100, blue-1200                            |
| `vesper`               | dark   | 1/4/6/4                  | 0/1/2/1                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700, blue-800 |
| `zenburn`              | light  | 3/8/6/3                  | 1/2/2/2                 | blue-600, blue-700, blue-800, blue-900, blue-1000, blue-1100, blue-1200        |
| `zenburn`              | dark   | 3/5/5/4                  | 1/2/2/2                 | blue-100, blue-200, blue-300, blue-400, blue-500, blue-600, blue-700           |

In **every** palette the independent nearest choices for level-1 and level-2 coincide. The candidate column shows at least five passing blue steps per palette, so four different passing intensities can be selected, ordered by **actual luminance**, not blindly by step number (oc-2's override blue ramp is not perfectly monotonic). The final choice must preserve ordering and test all four against base and empty. Nearest-only repair also does not ensure eight distinguishable series or five distinguishable kinds, even though their marks pass 3:1.

As an additional ordering check for #25's “confused colours never sit next to each other” rule, a depth-first search tested permutations of the eight token IDs, blocking a pair if it falls below ΔE00 10 in **any** of normal/protanopia/deuteranopia/tritanopia. Every original and repaired palette has at least one permitted order. But there is **no common order across all 72 palettes**: the original union blocks 21 of 28 possible pairs, and the repaired union blocks **all 28**. Thus a single fixed sequence of these theme-derived token IDs cannot meet this screening rule everywhere. One can instead assign colours per theme to a fixed data/stack order; this research does not propose changing the data's order. The full search output remains in scratch storage as `check-order.mjs` / `results.json`.

### Holding chart colours constant across themes

A diagnostic copies the **oc-2 contrast-repaired chart recipe**, separately for light and dark, as literal colours, onto each theme's base and empty surface. This recipe is not a final chart palette: it still has the just-described contribution-level collapse and categorical collisions. It isolates whether **fixed colours that pass on oc-2** pass on the other theme surfaces. **56/72** palettes pass all these contrast comparisons; **16** do not. The failing pairs are below. A fixed chart **surface** would remove that surface variability but would introduce an explicit dashboard-owned visual region; this research does not choose it.

| Theme ID               | Scheme | Failed fixed-oc-2 chart comparisons (ratio)                      |
| ---------------------- | ------ | ---------------------------------------------------------------- |
| `amoled`               | light  | chart-7/base 2.94                                                |
| `carbonfox`            | light  | chart-5/base 2.99; chart-7/base 2.86; kind-cache-write/base 2.99 |
| `carbonfox`            | dark   | kind-cache-read/base 2.80                                        |
| `catppuccin`           | light  | chart-7/base 2.99                                                |
| `catppuccin-frappe`    | light  | chart-7/base 2.99                                                |
| `catppuccin-frappe`    | dark   | kind-cache-read/base 2.96                                        |
| `catppuccin-macchiato` | light  | chart-7/base 2.99                                                |
| `cobalt2`              | dark   | kind-cache-read/base 2.98                                        |
| `kanagawa`             | light  | chart-5/base 2.98; chart-7/base 2.86; kind-cache-write/base 2.98 |
| `nightowl`             | light  | chart-7/base 2.94                                                |
| `nord`                 | light  | chart-7/base 2.93                                                |
| `nord`                 | dark   | kind-cache-read/base 2.96                                        |
| `shadesofpurple`       | light  | chart-7/base 2.97                                                |
| `tokyonight`           | light  | chart-5/base 2.78; chart-7/base 2.66; kind-cache-write/base 2.78 |
| `vesper`               | light  | chart-7/base 2.94                                                |
| `zenburn`              | dark   | kind-cache-read/base 2.69                                        |

These findings distinguish two decisions: **UI contrast per theme**, and **chart encoding**. Passing 3:1 is not enough to keep colour-only chart series apart; #25's fixed stack order/readout/highlighting and non-colour cues remain necessary either way. Varying charts with every theme means validating 72 palettes, including their CVD-confusion pairs and level ordering. Keeping literal chart colours means validating those colours against 72 chart backgrounds, or deliberately fixing the chart background too. Merely carrying across oc-2's ramp-step names does neither.

## 3. Compact scorecard: all 72 palettes

**A** = all roles pass as supplied (none); **S** = every measured comparison has a same-ramp foreground solution (54); **X** = at least one lacks one (18). This is a contrast score, not a claim of complete AA. “Text” includes base, muted, accent, warning and inverse (16 light / 17 dark); “marks” includes the 24 chart comparisons; focus is 5, edges 2. `s + ~p` is exact ramp steps plus the non-step movement proxies defined in the method. `+?` means unrepairable comparisons excluded from that partial sum. The full per-role alternatives above explain every failure.

| Theme ID               | Scheme | Text pass | Focus pass | Marks pass | Edges pass | All pass / total | No ramp candidate | No 100–1200 candidate | Step movement | Class |
| ---------------------- | ------ | --------- | ---------- | ---------- | ---------- | ---------------- | ----------------- | --------------------- | ------------- | ----- |
| `amoled`               | light  | 16        | 5          | 12         | 0          | 33/47            | 0                 | 0                     | 25 + ~7       | S     |
| `amoled`               | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~6       | S     |
| `aura`                 | light  | 11        | 0          | 12         | 0          | 23/47            | 0                 | 1                     | 46 + ~9       | S     |
| `aura`                 | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~5       | S     |
| `ayu`                  | light  | 11        | 0          | 14         | 0          | 25/47            | 1                 | 1                     | 48 + ~10 +?   | X     |
| `ayu`                  | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~6       | S     |
| `carbonfox`            | light  | 12        | 5          | 15         | 0          | 32/47            | 0                 | 0                     | 25 + ~8       | S     |
| `carbonfox`            | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 22 + ~7       | S     |
| `catppuccin`           | light  | 11        | 0          | 15         | 0          | 26/47            | 1                 | 1                     | 42 + ~9 +?    | X     |
| `catppuccin`           | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~6       | S     |
| `catppuccin-frappe`    | light  | 11        | 0          | 15         | 0          | 26/47            | 1                 | 1                     | 42 + ~9 +?    | X     |
| `catppuccin-frappe`    | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 19 + ~6       | S     |
| `catppuccin-macchiato` | light  | 11        | 0          | 15         | 0          | 26/47            | 1                 | 1                     | 42 + ~9 +?    | X     |
| `catppuccin-macchiato` | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~6       | S     |
| `cobalt2`              | light  | 14        | 5          | 14         | 0          | 33/47            | 1                 | 1                     | 24 + ~9 +?    | X     |
| `cobalt2`              | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 22 + ~7       | S     |
| `cursor`               | light  | 16        | 5          | 14         | 0          | 35/47            | 0                 | 0                     | 22 + ~8       | S     |
| `cursor`               | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 15 + ~12      | S     |
| `dracula`              | light  | 12        | 5          | 14         | 0          | 31/47            | 0                 | 0                     | 28 + ~9       | S     |
| `dracula`              | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~5       | S     |
| `everforest`           | light  | 6         | 0          | 13         | 0          | 19/47            | 3                 | 3                     | 47 + ~19 +?   | X     |
| `everforest`           | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 19 + ~12      | S     |
| `flexoki`              | light  | 13        | 5          | 16         | 0          | 34/47            | 0                 | 0                     | 20 + ~7       | S     |
| `flexoki`              | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 22 + ~9       | S     |
| `github`               | light  | 16        | 5          | 17         | 0          | 38/47            | 0                 | 0                     | 21 + ~9       | S     |
| `github`               | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 17 + ~7       | S     |
| `gruvbox`              | light  | 15        | 5          | 17         | 0          | 37/47            | 1                 | 1                     | 21 + ~9 +?    | X     |
| `gruvbox`              | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 15 + ~7       | S     |
| `kanagawa`             | light  | 10        | 5          | 14         | 0          | 29/47            | 1                 | 1                     | 24 + ~14 +?   | X     |
| `kanagawa`             | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 17 + ~14      | S     |
| `lucent-orng`          | light  | 7         | 2          | 16         | 0          | 25/47            | 0                 | 0                     | 33 + ~14      | S     |
| `lucent-orng`          | dark   | 14        | 5          | 17         | 0          | 36/48            | 0                 | 0                     | 20 + ~7       | S     |
| `material`             | light  | 6         | 0          | 13         | 0          | 19/47            | 1                 | 1                     | 50 + ~19 +?   | X     |
| `material`             | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 17 + ~12      | S     |
| `matrix`               | light  | 6         | 0          | 6          | 0          | 12/47            | 0                 | 1                     | 66 + ~14      | S     |
| `matrix`               | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 15 + ~9       | S     |
| `mercury`              | light  | 13        | 5          | 14         | 0          | 32/47            | 1                 | 1                     | 24 + ~11 +?   | X     |
| `mercury`              | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 15 + ~7       | S     |
| `monokai`              | light  | 12        | 0          | 16         | 0          | 28/47            | 0                 | 0                     | 41 + ~9       | S     |
| `monokai`              | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~5       | S     |
| `nightowl`             | light  | 11        | 5          | 15         | 0          | 31/47            | 1                 | 1                     | 28 + ~9 +?    | X     |
| `nightowl`             | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 15 + ~6       | S     |
| `nord`                 | light  | 11        | 4          | 13         | 0          | 28/47            | 1                 | 1                     | 33 + ~9 +?    | X     |
| `nord`                 | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 17 + ~7       | S     |
| `oc-2`                 | light  | 16        | 5          | 11         | 0          | 32/47            | 0                 | 0                     | 19 + ~5       | S     |
| `oc-2`                 | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 24 + ~5       | S     |
| `one-dark`             | light  | 6         | 5          | 16         | 0          | 27/47            | 1                 | 1                     | 26 + ~19 +?   | X     |
| `one-dark`             | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 1                     | 17 + ~18      | S     |
| `onedarkpro`           | light  | 11        | 1          | 16         | 0          | 28/47            | 1                 | 1                     | 36 + ~9 +?    | X     |
| `onedarkpro`           | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 17 + ~7       | S     |
| `orng`                 | light  | 7         | 3          | 16         | 0          | 26/47            | 0                 | 0                     | 31 + ~14      | S     |
| `orng`                 | dark   | 15        | 5          | 17         | 0          | 37/48            | 0                 | 0                     | 15 + ~7       | S     |
| `osaka-jade`           | light  | 11        | 0          | 15         | 0          | 26/47            | 0                 | 0                     | 43 + ~9       | S     |
| `osaka-jade`           | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 17 + ~17      | S     |
| `palenight`            | light  | 6         | 5          | 14         | 0          | 25/47            | 0                 | 1                     | 29 + ~19      | S     |
| `palenight`            | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 1                     | 17 + ~14      | S     |
| `rosepine`             | light  | 9         | 5          | 13         | 0          | 27/47            | 1                 | 1                     | 29 + ~21 +?   | X     |
| `rosepine`             | dark   | 12        | 5          | 17         | 0          | 34/48            | 0                 | 0                     | 15 + ~13      | S     |
| `shadesofpurple`       | light  | 11        | 5          | 10         | 0          | 26/47            | 1                 | 1                     | 33 + ~9 +?    | X     |
| `shadesofpurple`       | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 15 + ~5       | S     |
| `solarized`            | light  | 6         | 5          | 15         | 0          | 26/47            | 4                 | 4                     | 33 + ~12 +?   | X     |
| `solarized`            | dark   | 15        | 5          | 17         | 0          | 37/48            | 0                 | 1                     | 27 + ~7       | S     |
| `synthwave84`          | light  | 12        | 0          | 15         | 0          | 27/47            | 0                 | 0                     | 50 + ~9       | S     |
| `synthwave84`          | dark   | 15        | 5          | 17         | 0          | 37/48            | 0                 | 0                     | 15 + ~9       | S     |
| `tokyonight`           | light  | 11        | 3          | 16         | 0          | 30/47            | 0                 | 1                     | 35 + ~9       | S     |
| `tokyonight`           | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 17 + ~7       | S     |
| `vercel`               | light  | 13        | 5          | 16         | 0          | 34/47            | 0                 | 0                     | 23 + ~8       | S     |
| `vercel`               | dark   | 16        | 5          | 17         | 0          | 38/48            | 0                 | 0                     | 17 + ~7       | S     |
| `vesper`               | light  | 12        | 0          | 12         | 0          | 24/47            | 0                 | 0                     | 53 + ~8       | S     |
| `vesper`               | dark   | 17        | 5          | 17         | 0          | 39/48            | 0                 | 0                     | 15 + ~5       | S     |
| `zenburn`              | light  | 9         | 5          | 16         | 0          | 30/47            | 1                 | 1                     | 26 + ~9 +?    | X     |
| `zenburn`              | dark   | 15        | 5          | 17         | 0          | 37/48            | 0                 | 0                     | 19 + ~10      | S     |

Themes that can pass these comparisons with step moves in **both schemes**: **AMOLED, Aura, Carbonfox, Cursor, Dracula, Flexoki, GitHub, Lucent Orng, Matrix, Monokai, OpenCode, Orng, Osaka Jade, Palenight, Synthwave '84, Tokyonight, Vercel, Vesper**. Every other theme has a light-mode failure requiring the named extension or a declared gap. Original control edges fail in every palette; no theme is “already AA” merely because its text passes.

Across all light palettes **1,010/1,692** comparisons pass as supplied; dark **1,338/1,728**. The movement estimate is **20–80 adjacent-step units per palette**; the combined per-theme totals are in the cost table. This scale should not be confused with changing 20–80 unique CSS variables. The stock colours remain untouched wherever the measured role passes, but this policy is visibly not “every colour exactly as supplied”.

### What the two proposed policies actually imply

- **Apply ADR 0014 per theme:** the 54 palettes have a measured foreground-ramp route; the other 18 need a precisely named extension (inverse-background moves; base text for the five muted uses), or a gap. A dashboard-owned alias layer can leave the published theme JSONs/provider output unchanged while choosing passing colours for dashboard roles. That preserves theme identity, not literal equality for every rendered role.
- **Promise AA only for oc-2:** this is an explicit narrowing of the accepted dashboard-wide promise, not a consequence of themes being immutable. Non-default themes would need a public gap even though much of their failing contrast is repairable. Oc-2 itself still needs the agreed overrides, chart selection and full accessibility tests. None of the numerical measurements makes an AA-conformance claim for it by itself.
- **Separate chart encoding from theme identity:** fixed chart colours plus an explicitly stable chart surface can avoid categorical remapping on theme changes, but are a new visual policy. Fixed colours on variable theme surfaces do not automatically pass; per-theme chart ramps need substantially more distinctness/order work than nearest-step contrast correction.

No ADR, issue resolution or implementation is changed by this research.

## 4. Switching, cached CSS and build cost

### Bytes: the JSONs and the provider's CSS strings

Raw bytes are the published JSON files exactly, including whitespace. Gzip uses the runtime's default `gzipSync` options, separately per file or on the concatenation; these are **not** minified JavaScript bundle sizes. Cached CSS is exactly `themeToCss(legacy) + "\n  " + themeV2ToCss(v2)`, including the provider's spaces/newlines and unresolved `var()` declarations. Those references are what the browser receives; replacing them with hex would measure a different payload.

| Theme ID               | JSON raw B | JSON gzip B | Cached CSS light B | Cached CSS dark B | Cache gzip light / dark B | Both-scheme step estimate |
| ---------------------- | ---------- | ----------- | ------------------ | ----------------- | ------------------------- | ------------------------- |
| `amoled`               | 1197       | 402         | 17073              | 17090             | 3652 / 3568               | 42 + ~13                  |
| `aura`                 | 1257       | 431         | 17079              | 17096             | 3702 / 3629               | 63 + ~14                  |
| `ayu`                  | 1255       | 464         | 17077              | 17093             | 3689 / 3677               | 65 + ~16 +?               |
| `carbonfox`            | 1331       | 432         | 17074              | 17095             | 3596 / 3620               | 47 + ~15                  |
| `catppuccin`           | 1065       | 400         | 17078              | 17098             | 3686 / 3661               | 59 + ~15 +?               |
| `catppuccin-frappe`    | 1831       | 593         | 17078              | 17056             | 3686 / 3709               | 61 + ~15 +?               |
| `catppuccin-macchiato` | 1837       | 597         | 17078              | 17055             | 3686 / 3704               | 59 + ~15 +?               |
| `cobalt2`              | 2622       | 662         | 17037              | 17052             | 3690 / 3652               | 46 + ~16 +?               |
| `cursor`               | 2767       | 706         | 17053              | 17065             | 3653 / 3654               | 37 + ~20                  |
| `dracula`              | 1199       | 438         | 17077              | 17096             | 3722 / 3695               | 45 + ~14                  |
| `everforest`           | 2687       | 682         | 17035              | 17055             | 3635 / 3603               | 66 + ~31 +?               |
| `flexoki`              | 2595       | 662         | 17034              | 17049             | 3678 / 3703               | 42 + ~16                  |
| `github`               | 2561       | 669         | 17038              | 17051             | 3690 / 3682               | 38 + ~16                  |
| `gruvbox`              | 1059       | 377         | 17078              | 17096             | 3656 / 3615               | 36 + ~16 +?               |
| `kanagawa`             | 2683       | 700         | 17037              | 17056             | 3733 / 3687               | 41 + ~28 +?               |
| `lucent-orng`          | 2633       | 646         | 17034              | 17050             | 3657 / 3629               | 53 + ~21                  |
| `material`             | 2629       | 664         | 17038              | 17055             | 3658 / 3553               | 67 + ~31 +?               |
| `matrix`               | 3691       | 740         | 17044              | 17055             | 3667 / 3623               | 81 + ~23                  |
| `mercury`              | 2599       | 672         | 17039              | 17059             | 3696 / 3618               | 39 + ~18 +?               |
| `monokai`              | 1199       | 445         | 17077              | 17096             | 3705 / 3659               | 58 + ~14                  |
| `nightowl`             | 1096       | 404         | 17078              | 17094             | 3672 / 3598               | 43 + ~15 +?               |
| `nord`                 | 1087       | 379         | 17078              | 17095             | 3686 / 3673               | 50 + ~16 +?               |
| `oc-2`                 | 23342      | 3214        | 17528              | 17503             | 3758 / 3678               | 43 + ~10                  |
| `one-dark`             | 2683       | 703         | 17038              | 17055             | 3724 / 3651               | 43 + ~37 +?               |
| `onedarkpro`           | 1067       | 421         | 17078              | 17095             | 3711 / 3642               | 53 + ~16 +?               |
| `orng`                 | 2619       | 635         | 17034              | 17046             | 3608 / 3589               | 46 + ~21                  |
| `osaka-jade`           | 2660       | 669         | 17035              | 17053             | 3593 / 3649               | 60 + ~26                  |
| `palenight`            | 2567       | 650         | 17038              | 17056             | 3702 / 3665               | 46 + ~33                  |
| `rosepine`             | 2566       | 663         | 17037              | 17055             | 3694 / 3621               | 44 + ~34 +?               |
| `shadesofpurple`       | 1279       | 469         | 17078              | 17095             | 3690 / 3663               | 48 + ~14 +?               |
| `solarized`            | 1203       | 393         | 17076              | 17094             | 3708 / 3702               | 60 + ~19 +?               |
| `synthwave84`          | 2632       | 687         | 17036              | 17054             | 3696 / 3651               | 65 + ~18                  |
| `tokyonight`           | 1137       | 431         | 17078              | 17096             | 3714 / 3687               | 52 + ~16                  |
| `vercel`               | 2711       | 705         | 17034              | 17049             | 3609 / 3568               | 40 + ~15                  |
| `vesper`               | 1258       | 379         | 17076              | 17089             | 3504 / 3409               | 68 + ~13                  |
| `zenburn`              | 2622       | 638         | 17038              | 17055             | 3701 / 3666               | 45 + ~19 +?               |

Totals: **93,226 B raw**, **22,822 B separately gzipped**, **13,190 B concatenated then gzipped**. Cached declarations are **17,034–17,528 B per variant**. The runtime `:root` wrapper adds **70 B light / 73 B dark**; the pre-paint wrapper adds **57 B light / 60 B dark**. The table reports declaration strings, not either wrapper.

Important implementation facts from [context.tsx](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/context.tsx#L133-L170) and [preload.js](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/public/oc-theme-preload.js#L1-L33):

- Only **the current non-default theme's two variants**, not 36 themes, are stored as `opencode-theme-css-light` / `-dark`. They are recomputed/written on selection; the current scheme is also resolved when applied. This is storage of two CSS strings, not a resolver memoization cache.
- **Oc-2 is special:** the provider skips CSS-cache writes and clears these keys when selecting it. The oc-2 size rows measure what the same resolution path produces, not a cache entry it actually stores.
- The pre-paint script reads the saved ID and scheme, resolves System with `matchMedia`, inserts the matching cached declaration string, and returns without injection for oc-2. It does **not** resolve JSON/ramp colours on the pre-paint path. The provider removes that preload style when its own CSS is ready.
- The provider writes document background and theme-color metadata to **#fafafa / #080808 according to scheme**, not to the selected theme's deep colour. That small edge/chrome behaviour is “as OpenCode is”; copying only theme JSONs would not reproduce it.
- `setTheme` caches both variants; applying the current variant resolves it again. A typical non-default switch can therefore do **three variant resolutions**, not just one. The exact reactive/load scheduling and write/repaint cost were not benchmarked here.

### Resolver and style calculation timings

Hardware: **Apple M4, arm64 macOS**. Runtime **Bun 1.4.2**, **Playwright 1.63.0**, headless **Chromium 153.0.8010.12**, **Vite 8.3.2** and **vite-plugin-solid 2.11.14**. Both timing runs use the exact published legacy/v2 resolution + serialization functions, with JSONs already loaded. Ten full 72-palette sweeps warm up; **50 measured sweeps**, **3,600 variant resolutions**, pooled across all 72. Median is the sorted middle sample; p95 uses the nearest-rank 95th percentile. The browser timer has coarse (about 0.1 ms) resolution, so its zeros/minima are not zero-cost resolutions. No network fetch, JSON parsing, framework mounting or localStorage write is included.

| Operation                                                                | Samples | Median ms | p95 ms | Maximum ms |
| ------------------------------------------------------------------------ | ------- | --------- | ------ | ---------- |
| Bun: one variant → legacy + v2 CSS                                       | 3600    | 0.171     | 0.218  | 0.808      |
| Chromium: same functions and CSS serialization                           | 3600    | 0.20      | 0.30   | 0.40       |
| Chromium: replace CSS + force style calculation, synthetic 1,000-row DOM | 72      | 5.00      | 5.40   | 5.80       |

The synthetic calculation uses already resolved CSS, inserts it into a style element, then forces `getComputedStyle` on a generated row; each switch starts after a `requestAnimationFrame`. Rows use base background, muted text and base border. The timing does **not** include the next frame's raster/compositor paint, real charts, fonts or actual dashboard DOM. It demonstrates that style application can cost more than seed resolution; it is not a 16.7 ms guarantee for theme switching. Browser page errors: **0**.

### Does Vite 8 make a chunk per theme?

Yes. A tiny production build imports **the actual published ThemeProvider**, retains it on `window` so it is not tree-shaken, and uses the Solid plugin. No package source was patched. The default `import.meta.glob("./themes/*.json")` produces lazy imports. Build output inspection finds **35 separate non-default theme chunks**, and **oc-2 in the entry**, because the provider statically imports it too. The glob's oc-2 import points back to that entry; it is not a 36th separately downloaded theme file. Opening Appearance calls `loadThemes()`, which will eagerly request all remaining lazy theme chunks at that point.

| Fixture build        | JS files | Entry raw B | Entry gzip B | All JS raw B | Sum of JS gzip B |
| -------------------- | -------- | ----------- | ------------ | ------------ | ---------------- |
| Default splitting    | 36       | 74065       | 19502        | 128089       | 39921            |
| codeSplitting: false | 1        | 130289      | 31776        | 130289       | 31776            |

In this fixture the one-file entry adds **56,224 raw / 12,274 gzip B** to the initial entry. That is the observed provider-fixture delta, not the eventual dashboard bundle delta; shared Solid/resolver/tree-shaking decisions can differ. Each non-default lazy chunk is **805–2,895 raw / 405–768 gzip B** here. All 36 original JSONs are larger than those minified generated modules.

The verified Vite 8 setting is:

```ts
build: {
  rolldownOptions: {
    output: { codeSplitting: false },
  },
}
```

This keeps dynamic theme modules **in the same emitted JS file** even though the provider's source still uses a lazy glob. `inlineDynamicImports: true` also worked in a preliminary build, but the installed Rolldown warned that it is deprecated in favour of `codeSplitting: false`. `build.rollupOptions` is likewise an alias deprecated in Vite 8. `assetsInlineLimit` does not make JSON modules one bundle; `cssCodeSplit: false` affects CSS assets, not these JavaScript imports. Changing the glob to `{ eager: true }` would require a source-level/provider integration change; the global build setting avoids that. Its effects on other dynamic imports would need review in the real app.

## 5. OpenCode's presented theme list and selection behaviour

Read-only source at the pinned commit confirms [appearance.tsx](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/settings/appearance/appearance.tsx#L79-L121): **“Color scheme”** is a Select with **System, Light, Dark**, in that order; **“Theme”** is another Select with IDs as values and names as labels. English strings are in [en.ts](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/runtime/i18n/en.ts#L754-L758).

[The controller](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/settings/general/controllers.ts#L71-L86) builds options from `theme.ids().map(id => ({ id, name: theme.name(id) }))`, loads all themes on mount, and calls **setColorScheme / setTheme immediately** on selection. [themeIDs()](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/context.tsx#L26-L83) sorts IDs lexicographically, not names, and does not place OpenCode first. The initial names map avoids having to load a theme JSON just to label it. After loading, `theme.name(id)` prefers its JSON `name`; all 36 JSON names match the names map in this package.

Exact displayed order:

| Position | ID                     | Name                 |
| -------- | ---------------------- | -------------------- |
| 1        | `amoled`               | AMOLED               |
| 2        | `aura`                 | Aura                 |
| 3        | `ayu`                  | Ayu                  |
| 4        | `carbonfox`            | Carbonfox            |
| 5        | `catppuccin`           | Catppuccin           |
| 6        | `catppuccin-frappe`    | Catppuccin Frappe    |
| 7        | `catppuccin-macchiato` | Catppuccin Macchiato |
| 8        | `cobalt2`              | Cobalt2              |
| 9        | `cursor`               | Cursor               |
| 10       | `dracula`              | Dracula              |
| 11       | `everforest`           | Everforest           |
| 12       | `flexoki`              | Flexoki              |
| 13       | `github`               | GitHub               |
| 14       | `gruvbox`              | Gruvbox              |
| 15       | `kanagawa`             | Kanagawa             |
| 16       | `lucent-orng`          | Lucent Orng          |
| 17       | `material`             | Material             |
| 18       | `matrix`               | Matrix               |
| 19       | `mercury`              | Mercury              |
| 20       | `monokai`              | Monokai              |
| 21       | `nightowl`             | Night Owl            |
| 22       | `nord`                 | Nord                 |
| 23       | `oc-2`                 | OpenCode             |
| 24       | `one-dark`             | One Dark             |
| 25       | `onedarkpro`           | One Dark Pro         |
| 26       | `orng`                 | Orng                 |
| 27       | `osaka-jade`           | Osaka Jade           |
| 28       | `palenight`            | Palenight            |
| 29       | `rosepine`             | Rose Pine            |
| 30       | `shadesofpurple`       | Shades of Purple     |
| 31       | `solarized`            | Solarized            |
| 32       | `synthwave84`          | Synthwave '84        |
| 33       | `tokyonight`           | Tokyonight           |
| 34       | `vercel`               | Vercel               |
| 35       | `vesper`               | Vesper               |
| 36       | `zenburn`              | Zenburn              |

Defaults are **oc-2 / System** if storage is absent (or an unknown theme ID is normalized); System resolves with `prefers-color-scheme: dark`. The app's [ThemeProvider mount](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/app.tsx#L48-L62) supplies no `defaultTheme`, so the provider's fallback is the actual app default. Both variants exist for every one of the 36 themes, including themes whose names suggest only dark mode, such as AMOLED.

The provider exports [previewTheme, previewColorScheme, commitPreview, cancelPreview](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/ui/src/theme/context.tsx#L334-L377). An exact-symbol search of **all `packages/app/src`** at this commit found **no uses of any of the four**. The appearance selectors do not preview on hover/focus and then commit/cancel. This is a source-search conclusion, not a manually driven settings interaction test.

## Not verified

- **Not full WCAG conformance.** No screen reader, keyboard traversal, browser axe audit, focus geometry/occlusion, forced-colours mode, reflow, touch-target, thin-line anti-aliasing or human CVD evaluation was run. The ratios are evidence for the requested token roles only.
- **Not every possible component surface.** Warning is measured on base, outcomes on chart base, and inverse text on inverse background, as requested. Outcomes on raised table-row layers, text over gradients/transparency, inverse-button icons, hover/pressed/selected fills, chart tooltip backgrounds and other component-specific cases still need their actual adjacency tests. The ADR's “everything drawn” promise is broader than this scorecard.
- **No final palette was selected.** Nearest contrast moves are independent diagnostics; they can collapse contribution levels or categorical hues. The ordered four-level and category palettes need a chosen policy and tests. ΔE00 ≥10 itself is not a WCAG guarantee.
- **No complete switching/paint benchmark.** Cold chunks/network, JSON parse, localStorage latency/quota/security errors, reactive scheduling, pre-paint flicker, the provider's repeated resolutions, real chart repaint and lower-end/mobile hardware were not timed. No Firefox/WebKit timing comparison was made.
- **A tiny build, not the dashboard production bundle.** Chunk observations and setting were verified in Vite 8.3.2 against the published provider, not the eventual application integration. Disabling code splitting can affect all other lazy imports too.
- **Only @opencode/ui 2.0.21 and the pinned app source.** An upgrade can change seeds, semantics, ordering or runtime behaviour. The measurements are reproducible inputs for a future 72-palette guard, not an installed guard.

## Sources

- [Published @opencode/ui 2.0.21 metadata](https://registry.npmjs.org/@opencode/ui/2.0.21) and [tarball](https://registry.npmjs.org/@opencode/ui/-/ui-2.0.21.tgz): exact package/version/integrity authority.
- [Earlier oc-2 contrast measurements](https://github.com/ysm-dev/opencode-stats/blob/research/accessibility-contrast/docs/research/accessibility-contrast.md); [#25 colour/contrast resolution](https://github.com/ysm-dev/opencode-stats/issues/25); [ADR 0014](https://github.com/ysm-dev/opencode-stats/blob/352aefb/docs/adr/0014-the-dashboard-meets-wcag-2-2-aa-even-where-opencodes-look-falls-short.md): accepted role/threshold policy and control results.
- [Prototype chart mappings, pinned 726a30c](https://github.com/ysm-dev/opencode-stats/blob/726a30caed5bf44a9b6a63128ed3c3b252b4f9c9/prototype/dashboard/src/style.css#L18-L66).
- Published sources: [ThemeProvider](https://unpkg.com/@opencode/ui@2.0.21/src/theme/context.tsx), [legacy resolver](https://unpkg.com/@opencode/ui@2.0.21/src/theme/resolve.ts), [v2 resolver](https://unpkg.com/@opencode/ui@2.0.21/src/theme/v2/resolve.ts), [mapping](https://unpkg.com/@opencode/ui@2.0.21/src/theme/v2/mapping.ts), [foreground](https://unpkg.com/@opencode/ui@2.0.21/src/theme/v2/foreground.ts), [default primitives](https://unpkg.com/@opencode/ui@2.0.21/src/theme/v2/default-primitives.ts), [static colours/alpha](https://unpkg.com/@opencode/ui@2.0.21/src/styles/tokens/colors.css), [oc-2](https://unpkg.com/@opencode/ui@2.0.21/src/theme/themes/oc-2.json), [Dracula](https://unpkg.com/@opencode/ui@2.0.21/src/theme/themes/dracula.json).
- App at **d9d094a54378a8af4852a6c3594e0a8a91e2d498**: [Appearance selects](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/settings/appearance/appearance.tsx), [controller](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/settings/general/controllers.ts#L71-L86), [default provider mount](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/app.tsx#L48-L62), [pre-paint script](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/public/oc-theme-preload.js), [English scheme labels](https://github.com/anomalyco/opencode/blob/d9d094a54378a8af4852a6c3594e0a8a91e2d498/packages/app/src/runtime/i18n/en.ts#L24-L26).
- [WCAG 2.2 relative luminance and contrast](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance); [Understanding non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): formula and the limits of numerical conformance claims.
- [Machado et al. supplementary severity matrices](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html); [Color.js 0.6.0 CIEDE2000 implementation](https://github.com/color-js/color.js/blob/v0.6.0/src/deltaE/deltaE2000.js); [Sharma test data](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/).
- [Vite 8.3.2 build option docs, pinned release](https://github.com/vitejs/vite/blob/v8.3.2/docs/config/build-options.md); [Rolldown codeSplitting source, pinned docs commit](https://github.com/rolldown/rolldown/blob/45e407b177f5885d04a9795f37f8be71d91f6f17/packages/rolldown/src/options/output-options.ts#L635): build setting and deprecated aliases. The chunk counts/bytes above are direct measurements, not estimates from the docs.
