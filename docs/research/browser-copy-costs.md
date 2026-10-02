# Complete browser facts: size, acquisition and full-page computation

Measurement spike for [#17](https://github.com/ysm-dev/opencode-stats/issues/17), under [planning map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Measured **2026-10-03**. No application implementation or design decision is landed by this branch.

## Answer

**A complete local facts copy is small enough to keep in the browser, but computing these full pages on demand does not establish next-frame rendering.** The broadest cases exceed a 60 Hz frame's 16.67 ms before any chart, DOM or paint work. A Worker removes the synchronous computation from the main thread; it does not make the answer arrive within one frame. The earlier steps-only, six-aggregate benchmark materially understated this workload.

All timing triples below are **median / p95 / max, milliseconds**. MB is decimal; MiB is binary. These are measured observations, not latency bounds.

| Decision-relevant measurement                                              | Result                                                     | n              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- |
| Complete facts, raw / gzip / Brotli                                        | **19.981 / 6.455 / 4.686 MB**                              | 1 encoding     |
| Loopback fetch, raw → typed-array views ready                              | **15.58 / 17.01 / 17.01**                                  | 10 fresh pages |
| Loopback fetch, gzip / Brotli, median                                      | **41.20 / 64.43**; browser decompression included          | 10 each        |
| OPFS restore → views ready                                                 | **6.95 / 8.04 / 8.04**                                     | 10 fresh pages |
| IndexedDB restore → views ready                                            | **11.26 / 12.25 / 12.25**                                  | 10 fresh pages |
| Local-time index, Seoul / Los Angeles, median                              | **8.49 / 8.52**; all steps, tool calls and prompts         | 50 each        |
| Overview, unfiltered 365 days, synchronous main thread / Worker round trip | **28.49 / 29.39 / 30.05** versus **22.92 / 24.00 / 24.10** | 50 each        |
| Overview, unfiltered All time, Worker round trip                           | **23.51 / 24.41 / 24.63**; slowest Worker Overview case    | 50             |
| Models, unfiltered All time, main thread / Worker round trip               | **32.03 / 33.31 / 33.75** versus **26.97 / 27.78 / 28.07** | 50 each        |
| Live batch: updates, inserts, tombstones, index rebuild and both Overviews | **74.75 / 95.03 / 95.03**                                  | 10             |
| One renderer with facts and indexes / baseline                             | **121.91 / 81.50 MiB RSS**; increment **40.41 MiB**        | 1 pair         |

**On this loopback path, raw is faster than compressed**, despite having over four times Brotli's bytes. Compression is not free: Chromium's decompression and buffer materialization are inside the acquisition clock. OPFS is the fastest tested restore path. Acquisition and timezone indexing are separate operations; add both when budgeting initialization.

## Environment and isolation

- Apple **M4**, **16 GiB RAM**, arm64; macOS **26.6.2 (25G83)**, Darwin **25.6.0**. Hardware from `sysctl`, OS from `sw_vers` and `uname`; hostname omitted.
- **Bun 1.4.2**, **Node 24.15.0**, **Playwright 1.63.0**, bundled headless **Chromium 153.0.8010.12**. Bun's SQLite reported **3.51.0** by `sqlite_version()`.
- Browser timezone **Asia/Seoul**, the machine's timezone. Acquisition, writes, index construction and correctness checks were also repeated in **America/Los_Angeles**. Page-computation and live-change timing tables use Seoul.
- Worktree based on `origin/main` at **6023498**, branch `research/browser-copy-costs`, outside the main checkout. Throwaway dependencies, scripts and private data lived under the approved temporary directory, not `packages/`.
- The live OpenCode database was **never opened by SQLite**. One `cp -c` command cloned its `.db`, `-wal` and `-shm` together; all SQL opened the clone with `new Database(path, { readonly: true })`. Clone file sizes were **17,762,873,344 / 2,208,352 / 32,768 bytes**. No checkpoint, vacuum, source write or journal-mode change was issued.
- Sequential APFS cloning is **not an atomic SQLite backup**. Two extractions returned the same aggregate counts; successful reads and assertions do not certify transaction-perfect capture. No full integrity check was run.
- A Bun HTTP server listened only on **127.0.0.1:22440**, separate from the dashboard's specified production port. Files were preloaded/precompressed; all responses had `Cache-Control: no-store`. COOP `same-origin` and COEP `require-corp` were sent. No service worker or remote data service was involved.
- The machine remained in normal development use. OS/file caches were not purged; there was no CPU pinning, power-on cold-disk test or exclusive-machine reservation. Browsers, Workers and server were stopped; private binary facts and database clones were deleted afterwards.

Only allowlisted numeric/metadata leaves crossed SQLite's boundary. **No prompt text, response text, reasoning text, attachments, tool input/output, error messages or whole message/tool objects were selected into JavaScript or stored.** Titles, project labels/directories and dimension names were encoded privately to make sizes realistic; none is published here. Neither metric amounts by model nor cost/spend values are published.

## Facts and encoding

### What the copy contains

The copy follows the grain and vocabulary settled in [#13](https://github.com/ysm-dev/opencode-stats/issues/13) and [#16](https://github.com/ysm-dev/opencode-stats/issues/16):

- **194,819 steps**, assistant messages only, excluding **26 fork copies** matching `^msg_.{26}_\d+$`. Subagent steps belong to their topmost surviving session; own-session codes remain available separately. Projects come from each step's own session's current project. Agent/provider/model/variant come from the step, not current session selections.
- **302,216 tool calls**, placed at their step's instant, with step reference, merged tool code, outcome and nullable run time. `bash`, `task`, `apply_patch` merge into `shell`, `subagent`, `patch`. Completed/error/interruption/running states become succeeded/failed/stopped/none; `invalid` is failed.
- **16,811 prompts**: delivered `user` rows in sessions only, never `synthetic`. **1,903 user rows in subagent sessions** and **3 copied user rows** are excluded. Each prompt takes the dimensions of the first later assistant step in its own session's sequence; **9** have no later step and retain missing attribution.
- **13,078 session/subagent metadata rows**: **11,401 sessions** and **1,677 subagent sessions**, including metadata rows with no steps. Parent, topmost session, project, title, fork-origin pointer and source session ID are present. Metadata rows are not the metric's session count; only a first matching step places a session in a range.
- Dictionaries: **159 projects, 12 providers, 108 provider/model pairs, 7 variants, 20 agents, 37 merged tools, 11 step error types**. Models have IDs and cached catalog display names where available, else their IDs. Project labels and directories, session titles and source session IDs share one deduplicated string pool: **25,452 strings**.

The previous sync benchmark's 18,655 “prompts” included user rows in subagent sessions; it was an extraction fixture, not the final prompt counting rule. Its snapshot also predates this one. Counts and sizes must not be compared as if the fact sets were identical.

### Layout and actual bytes

One aligned, little-endian **19,980,681-byte ArrayBuffer**, including a 64 KiB header reservation. Typed-array views reference that buffer without copying fact columns. The header holds JSON column descriptors and counts, prefixed by a little-endian Uint32 JSON length. Strings remain UTF-8 bytes plus **Uint32 offsets**; loading does not eagerly decode every title.

The encoder checks maxima, integerness and sign before choosing widths, reserving the unsigned type's maximum for missing data. Float64 uses **NaN**, not zero, for missing values. Zero remains real recorded cost/tokens/time; tool outcome zero is the valid enum value “none while running,” not a missing-number sentinel.

| Section                                     |      Raw bytes |    gzip bytes |  Brotli bytes |
| ------------------------------------------- | -------------: | ------------: | ------------: |
| Steps                                       |     11,689,148 |     4,093,706 |     2,889,962 |
| Tool calls                                  |      6,648,756 |     1,590,583 |     1,282,166 |
| Prompts                                     |        285,789 |       136,743 |        93,761 |
| Sessions/subagent sessions                  |        274,645 |       152,767 |        79,149 |
| Dictionaries/strings                        |      1,016,807 |       477,034 |       400,390 |
| Header reservation                          |         65,536 |         1,372 |         1,014 |
| **Whole payload, compressed as one stream** | **19,980,681** | **6,455,495** | **4,685,510** |

Section sizes include inter-column alignment padding. Compressed section numbers are each section compressed independently; they need not sum to the whole-stream number. Node `zlib`: **gzip level 9**, **Brotli quality 11**. Precompression time is outside acquisition measurements.

| Section              | Columns and measured widths                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steps                | Uint32 ID, response time, input/cache-read/cache-write; Uint16 output/reasoning/session/own-session; Uint8 project/provider/model/variant/agent/error/failed/interrupted; Float64 start/recorded cost/estimated cost |
| Tool calls           | Uint32 ID/step/run time; Uint8 tool/outcome; Float64 step instant                                                                                                                                                    |
| Prompts              | Uint16 ID/session; Uint8 project/provider/model/variant/agent; Float64 delivery instant                                                                                                                              |
| Session metadata     | Uint16 ID/parent/topmost/title-string/fork-origin/source-ID-string; Uint8 project; Float64 creation instant                                                                                                          |
| Dictionaries/strings | Narrow integer code/string references, Uint32 UTF-8 offsets, Uint8 UTF-8 blob                                                                                                                                        |

### Deliberate approximations and omissions

1. **Estimated cost is a deterministic token-derived stand-in**, not catalog pricing. Nonzero-token steps get an estimate; zero-token steps have a missing estimate. This exercises summation and token-weighted price coverage, not actual price lookup, tiers, repricing or real missing-price distribution. Real estimated-cost compression size can differ.
2. Response time is `streamed − created`; run time is `completed − ran`, absent when either required boundary is missing. The extractor clamps a negative difference to zero; negative-duration incidence was not separately audited. No missing migrated boundary is invented.
3. Fact identities are throwaway numeric surrogates. The copy does **not** include per-fact revisions, retained server tombstones, price catalog/provenance or an implemented generation/revision protocol. Session source IDs are retained; step/tool/prompt source text IDs are not. This measures the requested browser fact columns, not a finalized wire contract or a byte-for-byte stats-store database file.
4. Project labels use name, else folder basename, else “Global”; duplicate-basename parent-folder disambiguation is not implemented. Catalog display lookup uses exact provider/model IDs, with ID fallback. These affect label bytes, not aggregation semantics.
5. Parent/fork pointers refer to extant session metadata. Handling a dangling source pointer's full textual provenance is not implemented. Fork-copy exclusion itself uses the message ID, independent of whether its origin survives.

## Method and correctness

### Acquisition and storage clocks

Each path has **two discarded warm-ups, then ten fresh page loads** in the same timezone-specific browser context. Path order rotates. The context is retained so OPFS/IndexedDB survive page destruction; it is not ten fresh browser processes.

- **Fetch:** page clock starts immediately before `fetch`; stops after `response.arrayBuffer()`, header parse and all typed-array views. Includes loopback networking, browser decompression for `Content-Encoding: gzip`/`br`, and materialization. HTML/module loading before the call, persistence and local-time indexing are excluded.
- **OPFS restore:** includes `navigator.storage.getDirectory()`, file-handle lookup, `getFile().arrayBuffer()` and view setup, using the **main-thread asynchronous API**, not Worker-only synchronous access handles.
- **IndexedDB restore:** opens the database, reads the **entire ArrayBuffer as one value**, waits for readonly transaction completion, closes the connection and constructs views. There is no row-by-row cursor/import.
- **OPFS write:** file-handle lookup/create, `createWritable`, whole-buffer `write`, and awaited `close`. The root-directory handle is obtained before the write clock. This is API-complete replacement, not a crash/power-loss durability test.
- **IndexedDB write:** database open, whole-buffer `put`, readwrite transaction with **`durability: "strict"`**, awaited transaction completion and database close. Not just request success. First schema creation/initial seeding is outside the warm write distributions.

SHA-256 assertions, without publishing the digest, confirmed fetched/decompressed and restored buffers equal the generated bytes for every path in both timezones. Browser storage was real Chromium origin storage, not a mock. Persistence across **browser restart**, eviction and quota failure were not tested.

### Local-time index

Each section's instants are sorted. Compute local midnights using `Date.setDate(getDate() + 1)` in the browser's timezone, never `+24 hours`. Within adjacent midnights, enumerate **real hourly boundaries**; fall-back hours get distinct boundary indices even though both have local clock hour 1. Merge each sorted fact section against these boundaries once. Store local-day index, clock hour, Monday-first weekday and real-hour index.

This needs about **4.287 MB of typed index buffers** plus small calendar objects. It includes 400 days of leading calendar padding for shifted ranges, not 400 days of invented facts. The timezone-dependent index is not in the transported facts and must be rebuilt when the timezone changes.

Every real step/tool/prompt index entry was asserted against independent per-row `Date` calendar getters in both timezones. Additional Los Angeles fixtures asserted **23 hourly buckets on 2026-03-08**, **25 on 2026-11-01**, the missing spring hour and the two distinct autumn hour-1 buckets. These checks are outside timed construction. Other zones, historical non-hour transitions and timezone changes while a page is open remain unverified.

### Complete-page computation

The main-thread function is synchronous and scans resident typed arrays. One fused step pass accumulates totals, series, dense breakdowns and all five self-filter-removed checklists. Prompts and tool calls have separate passes. Session placement scans the matching history **before** applying the range: a session first matching before the range is not recounted because it has a later step in it. Per-model session markers count the same session in every matching model row, but once in the totals row.

- **Overview:** all ten headline numbers, their qualifying ratios/counts and eligible previous-period values/changes; exact response-time p50/p95 and context-size median; token contribution graph for the last 365 local days; current/longest streak over matching history; Tokens per bucket split by top six models plus more; top model/project token amounts; weekday × clock-hour steps; project/provider/model/variant/agent checklist token amounts and the self-filter-removed tool checklist.
- **Models:** one all-metrics row per model and a totals row, including token-weighted price coverage, recorded/estimated cost, steps, attributed prompts, tools by outcome, overlapping sessions, cache hit rate, exact response-time p50/p95/timed share and failure rate. Tokens and Sessions series split by model, plus all checklists. It does not compute Overview's contribution graph/context median/previous-period headline numbers.
- Buckets follow [#12](https://github.com/ysm-dev/opencode-stats/issues/12): Today → real hours; 30 days → local days; 365 days → Monday weeks; All time applies its history span, which also selects weeks here. The >365-day month branch exists but was not exercised by this history's timed cases. All time's axis anchors to the bucket containing the first activity, ignoring filters.
- Previous periods shift by the preset's local-day count and end at the same local-clock point. Comparison is hidden for All time and where the previous period starts before the first activity; here 365 days has no eligible previous period. Missing bases and changes from zero remain NaN, not fabricated percentages.
- Percentiles use **exact nearest rank**, `ceil(p × n) − 1`; in-place quickselect over matching scratch values avoids full sorts. Missing response times/context operands are omitted from their percentile population. All steps still contribute to counts.
- Cases: **Today, 30 days, 365 days, All time × none / one model / model + project + agent**. Codes are selected privately from real data: the most frequent model, then its most frequent recent project/agent intersection. Names, codes and matching metric amounts are not reported. Only single-value dimension filters were benchmarked; any-of sets are not implemented here.
- Each case: **10 discarded warm-ups, 50 measured runs**, no answer memoization. Timing includes query/range/bucket setup, accumulator allocation, selection and result creation. The main-thread clock stops at the direct return, with no promise, Worker hop or rendering.
- The same engine runs in a **dedicated Worker** for both pages. Page clock begins before `postMessage` and ends after the returned result is available on the main thread. Result ArrayBuffers are transferred, not copied as arrays of nested row objects. Requests are sequential, one outstanding at a time. Worker launch/initial copy setup are excluded from warm runs.

An intentionally straightforward reference filters row-index lists, groups with Sets, rescans independently for each checklist and **fully sorts percentile populations**. It has separately written step accumulation. **20 full-result comparisons per timezone** covered both pages, Today/30 days/All time and all three filter cases, plus provider/variant/tool-filter cases. A follow-up required **exact numeric equality** throughout (NaN equals missing NaN); all 40 passed without printing metric values. Reference and fast engine share calendar/query definitions and final ratio arithmetic, so this is not an independent proof of every product definition. Worker/main returned vectors were also cross-checked for both unfiltered All-time pages.

All measurements use `performance.now()`. Reported median and p95 use sorted **nearest-rank** observations; even-n median is the lower middle element. With n=10, nearest-rank p95 is the maximum. No timer-overhead subtraction. One final complete measurement trial is reported, not a pool of exploratory runs using earlier code.

## Results

### Acquisition, writes and timezone indexing

Milliseconds, **median / p95 / max**. Acquisition and writes: **n=10 per cell**. Index: **n=50 per timezone**, one construction following each measured acquisition.

| Operation                         | Asia/Seoul            | America/Los_Angeles   |
| --------------------------------- | --------------------- | --------------------- |
| Raw loopback fetch → views        | 15.58 / 17.01 / 17.01 | 15.25 / 16.36 / 16.36 |
| gzip loopback fetch → views       | 41.20 / 42.00 / 42.00 | 40.76 / 42.07 / 42.07 |
| Brotli loopback fetch → views     | 64.43 / 68.20 / 68.20 | 64.19 / 65.52 / 65.52 |
| OPFS restore → views              | 6.95 / 8.04 / 8.04    | 6.83 / 7.12 / 7.12    |
| IndexedDB restore → views         | 11.26 / 12.25 / 12.25 | 11.36 / 12.07 / 12.07 |
| OPFS whole-copy write             | 17.89 / 18.23 / 18.23 | 17.66 / 18.12 / 18.12 |
| IndexedDB whole-copy strict write | 22.44 / 24.39 / 24.39 | 22.38 / 23.68 / 23.68 |
| Local-time index                  | 8.49 / 9.00 / 9.05    | 8.52 / 8.97 / 9.09    |

The index buffers are **4,286,856 / 4,286,845 bytes**, respectively; calendar/hour-boundary counts differ. Restoring views and computing local-time indexes are not worker initialization. A fresh dedicated Worker received a transferred copy, decoded it and built its own index in **10.02 ms**, **n=1**; the comparison harness's preliminary `buffer.slice()` is excluded. Production need not retain the harness's duplicate main/Worker copies.

### Overview

Seoul, **n=50 per case per execution path**, milliseconds, **median / p95 / max**. “Intersection” means model + project + agent, not a different model picked for each range.

| Preset   | Filter       | Synchronous main thread | Worker round trip     |
| -------- | ------------ | ----------------------- | --------------------- |
| Today    | none         | 12.21 / 12.63 / 12.76   | 5.51 / 5.61 / 5.68    |
| Today    | model        | 10.80 / 11.10 / 11.16   | 4.81 / 4.92 / 4.99    |
| Today    | intersection | 11.80 / 12.20 / 12.24   | 7.06 / 7.13 / 7.18    |
| 30 days  | none         | 18.37 / 19.14 / 19.42   | 13.07 / 13.55 / 13.68 |
| 30 days  | model        | 12.13 / 12.51 / 12.53   | 6.93 / 7.22 / 7.30    |
| 30 days  | intersection | 12.01 / 12.49 / 12.66   | 7.42 / 7.58 / 7.83    |
| 365 days | none         | 28.49 / 29.39 / 30.05   | 22.92 / 24.00 / 24.10 |
| 365 days | model        | 14.56 / 15.26 / 15.34   | 9.26 / 9.41 / 9.89    |
| 365 days | intersection | 12.73 / 13.27 / 13.49   | 7.95 / 8.25 / 8.28    |
| All time | none         | 28.31 / 29.33 / 29.71   | 23.51 / 24.41 / 24.63 |
| All time | model        | 14.55 / 14.99 / 15.45   | 9.18 / 9.45 / 9.74    |
| All time | intersection | 12.75 / 13.24 / 13.24   | 7.87 / 8.14 / 8.41    |

### Models

Same environment, clock boundaries and **n=50 per cell**.

| Preset   | Filter       | Synchronous main thread | Worker round trip     |
| -------- | ------------ | ----------------------- | --------------------- |
| Today    | none         | 11.81 / 12.24 / 12.64   | 6.48 / 6.59 / 7.10    |
| Today    | model        | 10.80 / 11.13 / 11.24   | 5.44 / 5.57 / 5.78    |
| Today    | intersection | 11.85 / 12.22 / 12.23   | 7.00 / 7.13 / 7.34    |
| 30 days  | none         | 17.09 / 17.56 / 17.67   | 12.02 / 12.52 / 13.01 |
| 30 days  | model        | 11.36 / 11.63 / 11.93   | 5.95 / 6.00 / 6.55    |
| 30 days  | intersection | 12.05 / 12.44 / 12.97   | 7.49 / 7.56 / 8.24    |
| 365 days | none         | 31.36 / 32.72 / 33.37   | 26.66 / 27.22 / 27.84 |
| 365 days | model        | 14.79 / 15.22 / 15.41   | 9.49 / 9.95 / 10.12   |
| 365 days | intersection | 12.78 / 13.26 / 13.26   | 8.35 / 8.43 / 9.11    |
| All time | none         | 32.03 / 33.31 / 33.75   | 26.97 / 27.78 / 28.07 |
| All time | model        | 14.78 / 15.26 / 15.28   | 9.50 / 9.68 / 9.91    |
| All time | intersection | 12.80 / 13.28 / 13.41   | 8.28 / 8.47 / 8.51    |

A Worker is a separate JavaScript realm with its own JIT/GC/scheduling history. These timings do not isolate a causal “Worker makes JavaScript faster” effect. They compare the two observed paths, including Worker messaging. Short ranges still scan matching step history for session placement and, on Overview, the contribution graph/streaks; this implementation has no dimension posting lists or cached answer reuse.

### Live change

**100 existing steps changed**, **10 new steps with one tool call each**, **5 step tombstones**; tool calls belonging to deleted steps are removed too. New instants fall between existing rows, forcing a sorted merge rather than append-only work. Updates change output tokens/stand-in estimates, not dimensions or instants. Each trial starts from an independent copy; that setup copy is outside the delta clock. Two warm-ups discarded, **n=10** main-thread trials.

| Part                                                    | Median / p95 / max ms            |
| ------------------------------------------------------- | -------------------------------- |
| Apply 100 changes                                       | timer-rounded 0.00 / 0.01 / 0.01 |
| Merge step inserts/tombstones and allocate columns      | 8.81 / 15.01 / 15.01             |
| Merge tools/remove dependent tools/remap step positions | 8.77 / 25.73 / 25.73             |
| Rebuild every local-time index                          | 3.63 / 5.85 / 5.85               |
| Recompute Overview, 30 days, no filters                 | 19.25 / 20.05 / 20.05            |
| Recompute Overview, All time, no filters                | 31.49 / 32.46 / 32.46            |
| **Whole batch, both recomputations**                    | **74.75 / 95.03 / 95.03**        |

The batch asserts sorted step/tool instants, valid remapped tool-step links and the expected net step count. Index rebuilds are faster here than on fresh pages because code is warmed; they are not incremental-index timings. This is a deliberately simple full-column merge/rebuild, not an optimized delta layout. No dictionary insertion, timestamp-moving update, prompt reattribution, generation/revision reconciliation, persistence write or server sync was timed. Medians of parts need not sum to the median of their total.

### Memory

`performance.measureUserAgentSpecificMemory()` existed but rejected with **SecurityError**, despite the isolation headers. The reason was not diagnosed, so no successful API-derived heap number is claimed. Fallback used CDP `SystemInfo.getProcessInfo` to identify Chromium's **one renderer process**, then macOS `ps` RSS before and after OPFS acquisition/indexing, before reference/page/Worker workloads.

- Seoul, **one paired observation**: baseline **81.50 MiB**, loaded **121.91 MiB**, increment **40.41 MiB**.
- Exact fact buffer **19.06 MiB**; exact typed index buffers **4.09 MiB**; combined **23.14 MiB**. The rest of RSS includes renderer/runtime, calendar/header objects, I/O temporaries and uncollected allocation overhead.
- Los Angeles cross-check, one pair: baseline **81.38 MiB**, loaded **121.73 MiB**. RSS is process residency, **not attributable live JS heap**.
- These samples do not include a resident Worker, full-page percentile scratch allocations or post-live-change peaks. The comparison harness temporarily holds both main and Worker copies; a production sole-owner Worker architecture's footprint remains unmeasured.

## Essential code excerpts

These excerpts describe the measured throwaway layout/kernel, not production-ready parsing or wire validation. The experiment's scripts remain outside the repository; only this Markdown file is committed.

### Aligned mixed-width encoding and zero-copy view setup

```js
// Each maximum must fit below the reserved missing sentinel.
const type =
  forcedType ??
  (max < 255 ? "Uint8" : max < 65535 ? "Uint16" : max < 4294967295 ? "Uint32" : "Float64");
const T = globalThis[type + "Array"];
const missing = type === "Float64" ? NaN : 2 ** (8 * T.BYTES_PER_ELEMENT) - 1;
offset = Math.ceil(offset / T.BYTES_PER_ELEMENT) * T.BYTES_PER_ELEMENT;
const column = new T(values.map((v) => (v == null ? missing : v)));
descriptors.push({ section, name, type, offset, length: column.length });
bytes.set(new Uint8Array(column.buffer), offset);
offset += column.byteLength;

// Float64 is forced for instants/costs; strings use Uint32 offsets + Uint8 blob.
// At acquisition: only the small header is decoded, not the facts or titles.
for (const c of header.columns) {
  data[c.section][c.name] = new globalThis[c.type + "Array"](buffer, c.offset, c.length);
}
```

### Fused step pass: filter masks, first-matching placement and dense results

```js
for (let i = 0; i < steps.instant.length; i++) {
  const inRange = steps.instant[i] >= q.start && steps.instant[i] < q.end;
  const mismatch = dimensionMismatchMask(steps, i, q.filters);
  const tokens = fiveKindTotalWithMissingSentinels(steps, i);

  if (inRange) {
    for (let d = 0; d < 5; d++) {
      // Remove only this checklist's own filter; preserve the other dimensions.
      if ((mismatch & ~(1 << d)) === 0) {
        const code = steps[dimensions[d]][i];
        if (code < checklists[d].length) checklists[d][code] += tokens;
      }
    }
  }
  if (mismatch) continue;

  if (overview) addContributionAndActivityAcrossHistory(i, tokens);
  const target = inRange ? current : inPreviousPeriod(i) ? previous : null;
  const session = steps.session[i];
  if (!firstSession[session]) {
    firstSession[session] = 1; // Set even when the first match is before the range.
    if (target) target.values.sessions++;
  }
  markOwnSessionAndPerModelFirstMatch(i, target);
  if (!target) continue;

  addStepTotalsAndPercentileScratch(target, i);
  if (inRange) addDenseSeriesBreakdownsAndModelRow(i, tokens);
}
// Separate prompt/tool passes; exact selection; top-six + more; final ratios.
// Worker only: transfer every result buffer, keeping the input copy resident.
postMessage(result, collectDistinctResultArrayBuffers(result));
```

Actual code uses the layout-specific token sentinels (Uint32 input/cache, Uint16 output/reasoning), Uint8 session markers, dense numeric arrays and ordinary matching-value scratch arrays. The excerpt's named helpers stand for the inlined/static checks and accumulation in the throwaway engine; they do not imply a reusable framework or per-row object allocation.

## Limitations and what remains unverified

- **No chart rendering, DOM work, Solid reactivity, label decoding, layout, paint, visible-frame capture or whole dashboard initialization.** No assertion that a request below 16.67 ms presents pixels on the next frame; the broadest measured requests already exceed it.
- One machine, one person's current history, one final warmed trial per case; not a hard bound, multi-year scaling curve, low-end hardware, background-tab/throttled browser or contention stress test. Safari/Firefox/Linux/Windows are untested.
- No cache of computed pages, alternate percentile indexes, dimension posting lists, precomputation, scratch-buffer reuse or incremental bucket maintenance was compared. These numbers are for this competent but straightforward fused engine, **not a lower bound** on all possible implementations.
- Real price estimation, wire revisions, newly added dictionary codes, dangling pointer provenance, arbitrary multi-select/session filters and production delta reconciliation are outside the spike. The copy includes the requested fact fields, not every internal SQLite stats-store column.
- Browser disk-cold restore, browser-restart persistence, cross-tab coordination, eviction/quota handling and power-loss durability are unverified. Whole-copy OPFS/IndexedDB writes are measured; writing on every live batch was not proposed or tested.
- Exact reference equality checks aggregation output for selected cases, not every possible filter intersection; shared calendar/query/ratio helpers limit independence. Synthetic DST tests cover the requested Los Angeles transitions, not all timezone history.
- Worker runs include message transfer but no simultaneous main-thread rendering workload. Repeated queued interactions, cancellation, stale answers, coalescing and the complete OpenCode-write-to-visible-dashboard freshness path remain unverified.

**Decision evidence:** the complete input domain is practical to fetch and retain locally. This alone, and offloading it to a Worker, is insufficient evidence for “every page renders on the next frame.” The design still needs a measured answer-readiness/rendering strategy for broad, uncached cases.

## Sources and reproduction anchors

- **Measured primary evidence:** `extract.mjs`, `engine.mjs`, `reference.mjs`, `page.mjs`, `worker.mjs`, `live.mjs`, `server.mjs`, `run.mjs`, encoding/browser reports in the approved `browser-copy-costs-20261003` scratch directory; all clocks/counts/sizes above come from those experiments. No private data artifact or benchmark implementation is committed.
- [Prior browser benchmark](https://github.com/ysm-dev/opencode-stats/blob/research/duckdb-next-frame/docs/research/duckdb-next-frame.md): Playwright/nearest-rank method; its steps-only payload and six-aggregate workload are not this complete-page measurement.
- [Prior stats-store extraction benchmark](https://github.com/ysm-dev/opencode-stats/blob/research/stats-store-sync/docs/research/stats-store-sync.md): read-only scalar projections and source counts.
- [OpenCode field/lifecycle research](https://github.com/ysm-dev/opencode-stats/blob/research/opencode-database-fields/docs/research/opencode-database-fields.md), with pinned first-party sources: allowlisted paths, step/tool timestamps and fork shapes. Definitions: [#13](https://github.com/ysm-dev/opencode-stats/issues/13), [#12](https://github.com/ysm-dev/opencode-stats/issues/12), [#14](https://github.com/ysm-dev/opencode-stats/issues/14), [#16](https://github.com/ysm-dev/opencode-stats/issues/16); root glossary and ADRs 0001–0006.
- [WHATWG File System](https://fs.spec.whatwg.org/#api-filesystemfilehandle): async file reads, writable replacement/close and Worker-only synchronous access handles.
- [IndexedDB values](https://w3c.github.io/IndexedDB/#values) and [transaction lifecycle/durability](https://w3c.github.io/IndexedDB/#transaction-lifecycle): stored values are cloned, request success is not transaction completion, strict durability is a hint rather than this spike's crash test.
- [HTML structured transfer](https://html.spec.whatwg.org/multipage/structured-data.html#transferable-objects): transferred buffers detach in the sender; this is not copied nested data or SharedArrayBuffer sharing.
- [Measure Memory API](https://wicg.github.io/performance-measure-memory/) and [CDP process information](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getProcessInfo): memory API requirements and the renderer RSS fallback's process selection.

Reproduction order: approved APFS clone → read-only scalar extraction/encoding/compression → loopback server → Playwright fresh-page storage/index trials → correctness assertions → warmed main/Worker cases → live batch → stop browser/server → format/check the Markdown-only branch → publish → remove private binaries/clone/worktree. Never point this experiment at the live database with a writable API.
