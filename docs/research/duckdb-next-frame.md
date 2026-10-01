# Can DuckDB make every view render on the next frame?

Research for [ticket #4](https://github.com/ysm-dev/opencode-stats/issues/4), under [map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Measured 2026-10-01.

## Answer and recommendation

**No: DuckDB does not establish the requirement that every view, including an unseen filter combination, is on screen within one frame with no loading state.** Native DuckDB is fast, but a server query fails the deciding criterion: the interaction must be answered in the browser without asking the server. DuckDB-WASM satisfies locality, not the complete frame budget. A six-query unfiltered view already exceeds the budget before charts render.

**Recommend no DuckDB for v1:** a SQLite stats store, using `bun:sqlite` / `node:sqlite`, and a complete, dictionary-encoded columnar browser snapshot, queried in a Web Worker using dense typed-array accumulators and transferable results. Keep step-level facts, not just previously requested answers. A previously unseen intersection then needs no server request. This was the smallest tested implementation with useful full-view headroom. It is a recommendation, **not a certification of the absolute “every interaction” target**: there were outliers above one frame even here, and SolidJS/TanStack Charts rendering was not benchmarked.

The comparison below uses the same **191,946 real assistant steps**, numbers only. Query numbers are milliseconds: **median of five trial medians / highest trial p95**, each trial containing 50 unfiltered or filtered repetitions. Unseen combinations have 100 repetitions per trial. Startup and build distributions have their own sample counts below. All sizes are decimal MB unless labelled MiB. Sources for measurements are the benchmark methodology and essential code below; no estimates are substituted for measurements.

| Criterion                                                               | Native DuckDB on server                                                          | DuckDB-WASM in browser                                                                                           | SQLite stats store + browser typed arrays                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Interaction answered without server                                     | **No**                                                                           | **Yes**, after full local facts are resident                                                                     | **Yes**, after full local facts are resident                                                  |
| Unseen filtered daily series                                            | Not browser-local; engine latency below                                          | **4.2 / 6.4 ms**                                                                                                 | **4.0 / 5.7 ms**                                                                              |
| Six aggregates, all history                                             | Not browser-local                                                                | **20.7 / 23.9 ms**, max **44.6 ms**                                                                              | Dense fused pass: **8.1 / 11.1 ms**, max **27.6 ms**                                          |
| Six aggregates, unseen filtered range                                   | Not browser-local                                                                | **7.3 / 10.7 ms**                                                                                                | **1.2 / 1.7 ms**                                                                              |
| First browser acquisition/build, localhost, one observation             | Not applicable; needs another browser architecture                               | **658.5 ms** including engine fetch/instantiation and OPFS fact persistence                                      | **78.3 ms** including fact fetch/persistence, worker creation, and column setup               |
| OPFS restore + fresh worker, median / p95, n=4                          | Not applicable                                                                   | **483.6 / 486.4 ms**; CSV import repeated                                                                        | **19.7 / 20.3 ms**                                                                            |
| Initial extraction shared by all choices, median / p95, n=3 per runtime | Bun **16.16 / 16.78 s**; Node **24.32 / 25.98 s**                                | Same server-side extraction required                                                                             | Same extraction required                                                                      |
| Populate persistent stats store after extraction, median / p95, n=5     | Bun **173.7 / 293.8 ms**; Node **194.0 / 321.6 ms**                              | Browser CSV-to-table + OPFS restore: **252 / 252 ms**, n=4; first acquisition/import **312.1 ms**, n=1           | Bun **184.0 / 193.8 ms**; Node **214.6 / 221.8 ms**                                           |
| Persistent size, actual file bytes                                      | **7.35 MB**, facts + unique ID index                                             | Cached numeric CSV in OPFS **18.01 MB**; in-memory SQL table                                                     | SQLite facts + ID/time/filter indexes **18.02 MB**; OPFS column snapshot **29.18 MB**         |
| Browser fact download, gzip / Brotli                                    | Not measured for a server-only architecture                                      | Numeric CSV **4.38 / 3.05 MB**                                                                                   | Numeric columns **3.79 / 2.77 MB**                                                            |
| Extra browser engine download, gzip / Brotli                            | None, but substantial native install                                             | Selected EH engine + worker + bundled JS/Arrow: **8.37 / 5.65 MB**                                               | No database engine; dense worker source **1.02 / 0.89 kB**, excluding shared helper/page code |
| Runtime memory                                                          | Cold native process RSS: Node **78.1 / 78.3 MiB**, Bun **52.4 / 52.5 MiB**, n=10 | `duckdb_memory()` **45.1 MiB** tracked database allocations; browser process-tree RSS **804.8 / 831.0 MiB**, n=5 | Exact fact backing buffer **27.82 MiB**; browser process-tree RSS **475.8 / 476.1 MiB**, n=5  |
| Does the experiment prove every view is on screen next frame?           | **No**                                                                           | **No**                                                                                                           | **No**; best candidate, substantial rendering work still unmeasured                           |

The full-view workload deliberately requests totals, daily and hourly series, and top ten by model, project and agent. It is a stress case, not an assertion that the future dashboard places all six on every page. A naïve JS `Map` implementation also failed: six unfiltered aggregates took approximately **18.7 ms median**, with trial p95s around **20 ms**. Replacing hash maps/nested row cloning with dense accumulators and transferred chart-ready vectors mattered more than replacing SQLite with DuckDB.

### Consequences for the build-ready spec

- **Cache the input domain in the browser**, including every filter dimension and the whole supported history. A cache of previously requested answers has no entry for never-seen combinations; remote Parquet range reads also fail the “no server on interaction” rule. Navigation modules/assets must likewise be ready, not lazily downloaded after clicking.
- Use one snapshot revision for facts, dictionaries, visible result caches and deltas. Apply updates/upserts/deletions, invalidate affected answers, and publish a coherent revision. Do not treat streaming assistant steps as immutable appends. This is an architectural recommendation; revision/delta correctness was not implemented here.
- Precompute default/unfiltered visible answers during initialization and refresh, fuse uncached filtered work, and transfer compact result buffers. Do **not** precompute the Cartesian product of all filters. The exact cache invalidation/prefetch contract belongs to the cache-design ticket.
- Leave budget for reactive updates, chart layout, paint and scheduling, not just SQL. Target a smaller query budget than the whole frame. Maintain the map's strict target until an end-to-end dashboard test proves it; do not quietly redefine “next frame” as “SQL under 16 ms” or as a p95 promise.
- A full raw extraction remains a first-build operation. Existing stats store startup is fast; rebuilding it on each launch or scanning the raw JSON for each interaction is incompatible with the targets. Dirty-step discovery and the complete write-to-screen **2 s** target remain unverified by these microbenchmarks.

## Benchmark environment and privacy

- Apple M4, **16 GiB RAM**; macOS/Darwin **25.6.0**, arm64. `uname -a` reported Darwin kernel `25.6.0`, build `xnu-12377.161.14~5/RELEASE_ARM64_T8132`; hostname omitted. CPU/RAM obtained with `sysctl -n machdep.cpu.brand_string hw.memsize`.
- Node **24.15.0**, npm **11.19.1**, Bun **1.4.2**. Node SQLite **3.51.3**; Bun SQLite **3.51.0**, confirmed by `sqlite_version()` rather than inferred from a package version.
- `@duckdb/node-api` and bindings **1.5.6-r.1**, native engine **v1.5.6**; threads fixed to **2**. `@duckdb/duckdb-wasm` **1.33.1-dev57.0** (what npm `latest` installed), engine confirmed by SQL as **v1.5.4**. Do not assume native and WASM package tags denote identical engines or a stable-looking version string.
- Playwright **1.63.0**, bundled headless Chromium **153.0.8010.12**; actual browser workers and OPFS, **not** a Node WASM proxy. Single-threaded **EH** bundle, no COOP/COEP headers. Package version was read from the installed package manifest; Chromium version comes from `browser.version()`.
- Scratch work ran outside `packages/`, under the requested `scratch-duckdb-next-frame` directory. The live OpenCode database was never opened by the benchmarks. One `cp -c` invocation cloned its `.db`, `-wal` and `-shm` together. Clone sizes were **17,762,873,344 / 902,312 / 32,768 bytes** respectively. All extraction connections opened the clone read-only; the DuckDB SQLite extension also attached the clone with `READ_ONLY`. No checkpoint was issued against the OpenCode database or its clone. `CHECKPOINT` was used only on newly created DuckDB stats stores.
- Cloning a live file set is not an atomic SQLite backup. Results are for the successfully read cloned snapshot, not a claim to have captured every concurrent commit at a precise instant. Repeated extractions all returned the same row count. A production backup/sync contract is a separate concern.
- **No message content was selected, printed or stored.** SQLite selected only specific JSON paths; neither `$.content` nor a whole `data` value entered JS, CSV or browser facts. Dimension strings/IDs were assigned numeric dictionary codes in memory, never printed. Facts include numeric cost for the aggregation workload, but **no spend figures** are published. Public numbers are counts, sizes, versions and timings only.
- The snapshot had **89 project codes, 107 provider/model pairs, 20 session-agent codes, 12 provider codes, 8 variant codes, 12,401 session codes and 7 finish codes**. Names and dictionary contents are not included. Human-readable dictionaries, titles, parent-session relationships and tool facts were omitted, so the measured file/download sizes are **not the size of a complete future v1 payload**.

## Method: what the measurements mean

### Facts and initialization

Each fact has 19 columns: synthetic row ID; created timestamp; local calendar-day and hour bins; project, provider/model, agent, provider, variant, session and finish codes; input/output/reasoning/cache-read/cache-write tokens; numeric cost; streamed/completed timestamps. Missing numeric values became zero **for this workload only**, not a decision about the product's metric definitions. Agent grouping used `session_v2.agent`; authoritative step-agent semantics are for the schema/metrics research.

SQLite did one multi-path `json_extract` per assistant step, joined session metadata, and JS dictionary-encoded the selected fields. Three full extraction runs per runtime measured parsing plus dictionary/fact construction, excluding later CSV/binary serialization. The first successful Node run was **24.27 s** and the first Bun run **16.16 s**; these are process-first observations with warm/uncontrolled OS file cache, **not** power-on disk-cold timings. An earlier five-scan attempt timed out at 240 s; it is not included in the successful distributions. Other research workloads could run on the same machine: this was not an isolated performance lab.

Five subsequent store builds populated only the derived facts, adding appropriate indexes and committing/closing. Native DuckDB used explicit CSV column types, then a unique ID index and a checkpoint of **its own** file; this is the ticket's permitted “extract through SQLite, then insert” architecture. A raw DuckDB SQLite-extension JSON build was **not** benchmarked. The extension's ability to read the clone was separately verified.

Browser columns were 19 contiguous `Float64Array`s over one **29,175,792-byte** buffer: intentionally simple and exact for this fixture's integer values, not an optimized mixed-width serialization. The dense worker built numeric bin offsets once and used dense `Float64Array` accumulators. Its result buffers were transferred, not copied as nested row objects. The reference Map worker materialized sorted nested rows. For dimension results, both computed top ten by output tokens. Gaps in dense time vectors are zero-filled; SQL/Map series return occupied bins only.

A separate runnable `check.mjs` cross-checked the dense worker's all-history totals against DuckDB SQL over the extracted CSV, then checked that counts and all six metric sums agreed across all six dense grouping vectors. It also checked **10 nonempty filter intersections** against a direct column scan. Both checks passed; no metric totals were printed. This is a kernel check, not a full product test suite.

Local bins were computed once with JS `Date` in the machine's **Asia/Seoul** timezone. No per-row date conversion occurred inside a timed query. These measurements do **not** validate DST handling: production must retain epoch timestamps, distinguish repeated local hours using offsets/instants where appropriate, and rebuild timezone-dependent bins after a timezone change. WASM would otherwise need suitable timezone support; `icu` is an extension, not a free implicit guarantee.

WASM persisted **the safe numeric CSV facts in OPFS**, re-registered those bytes and recreated the in-memory SQL table after reload. This is a real persistent local copy, not direct OPFS database-page I/O. An attempted `copyFileToBuffer` of an open virtual DuckDB database failed, so no direct DuckDB-file OPFS persistence result is claimed. Arrow/Parquet or native OPFS handles could change startup/size; they were **not** benchmarked. Native and WASM engine versions differed, making a shared DuckDB database file an additional compatibility concern.

### Repetitions, filters and clock boundaries

- `performance.now()` timed all operations. Quantiles use sorted nearest-rank p95 and the upper middle element for even-n median. No timer subtraction.
- Native and derived SQLite queries: one first query per family, then **100** warm invocations alternating unfiltered whole history with a last-90-local-day filter on sets of project/model/agent codes; **50** samples for each condition. Preparation/planning and conversion to JS objects are included. No HTTP overhead is included.
- Browser query trials: **five** fresh worker/page initializations, each with the same **101** queries per family. Timing begins in the page and ends after the worker answer and materialization arrive, including worker messaging; it is not an internal SQL execution timer. Browser tables report median of the five per-trial medians and the **largest** per-trial p95, not a falsely pooled percentile.
- Each trial also tested **100 previously unused daily-series filter/range intersections**, selected from actual rows so every intersection had at least one matching step, with additional codes and varying lower bounds. No memoized result lookup was used. These are varied intersections, not an exhaustive enumeration of possible filters.
- Each trial tested **100 six-aggregate requests**, alternating **50** whole-history and **50** unseen/intersected filters. WASM ran six queries sequentially on one connection; the JS workers made one pass. This is not an upper bound on optimized DuckDB SQL: `GROUPING SETS`, multiple connections or more specialized preprocessing may improve it; **unverified** until measured.
- Browser initialization includes a localhost fetch and OPFS write on the first run, then OPFS read and fresh worker construction on four reloads. Assets were served uncompressed with **no explicit HTTP-cache policy**. Disk/OS caches and Wasm compilation caches were not flushed. First acquisition is one cold-context observation; “restore” means persisted facts with a newly initialized worker, **not** an already-running warmed engine.
- The timing ends with data available to JS. A separate tiny DOM-text/rAF proxy armed the next callback before issuing the query; it observed **7 misses / 500** WASM requests and **5 / 500** dense-worker requests even for the individual daily-series workload. This is **not pixel presentation proof**. rAF callbacks run before rendering, and main-thread/worker scheduling can miss a deadline despite small elapsed compute time ([HTML rendering specification](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering)). Full SolidJS hydration/navigation/chart layout/paint and actual visible-frame capture remain **unverified**.

## Representative query results

### Warm all-history, no filters

Milliseconds, median / p95. Native/SQLite columns have n=50 each. Browser columns use five n=50 trials and the conservative summary defined above. Native includes JS object materialization; WASM includes Arrow-to-JS row materialization; dense JS returns transferable chart-ready vectors.

| Query             | Native Node | Native Bun  | SQLite Node   | SQLite Bun    | Browser WASM | Browser dense JS |
| ----------------- | ----------- | ----------- | ------------- | ------------- | ------------ | ---------------- |
| Totals            | 0.87 / 1.38 | 0.62 / 0.79 | 15.11 / 15.57 | 16.50 / 16.79 | 0.90 / 1.80  | 1.90 / 2.90      |
| Local-day series  | 3.15 / 4.18 | 2.68 / 3.07 | 45.13 / 45.97 | 48.40 / 49.85 | 3.50 / 4.00  | 2.40 / 2.70      |
| Local-hour series | 5.69 / 6.88 | 4.33 / 5.39 | 47.63 / 50.06 | 52.09 / 61.61 | 7.00 / 7.60  | 2.40 / 2.80      |
| Top ten model     | 2.90 / 3.51 | 2.58 / 3.21 | 45.57 / 46.77 | 49.87 / 56.46 | 3.20 / 3.50  | 2.30 / 2.40      |
| Top ten project   | 2.61 / 2.92 | 2.56 / 2.95 | 26.47 / 27.00 | 30.82 / 31.72 | 3.20 / 3.30  | 2.30 / 2.50      |
| Top ten agent     | 2.60 / 2.94 | 2.57 / 3.00 | 44.28 / 48.60 | 39.84 / 40.44 | 3.20 / 3.50  | 2.30 / 2.40      |

### Warm filtered 90-day range

Same methods and sample counts; intersection of project, provider/model and agent sets. SQL uses the stats store, never raw OpenCode JSON. These are different from the 100 varied unseen intersections above.

| Query             | Native Node | Native Bun  | SQLite Node | SQLite Bun  | Browser WASM | Browser dense JS |
| ----------------- | ----------- | ----------- | ----------- | ----------- | ------------ | ---------------- |
| Totals            | 1.07 / 1.90 | 0.60 / 0.86 | 3.71 / 3.98 | 4.08 / 4.17 | 1.10 / 2.90  | 1.70 / 2.50      |
| Local-day series  | 1.37 / 2.10 | 0.96 / 1.38 | 6.83 / 6.92 | 7.33 / 7.68 | 1.50 / 1.80  | 1.80 / 1.90      |
| Local-hour series | 2.15 / 2.79 | 1.36 / 1.77 | 7.16 / 7.28 | 7.92 / 9.38 | 2.00 / 2.40  | 1.80 / 1.90      |
| Top ten model     | 1.12 / 1.75 | 0.89 / 0.98 | 6.83 / 6.92 | 7.39 / 7.89 | 1.30 / 1.50  | 1.70 / 1.90      |
| Top ten project   | 0.92 / 1.14 | 0.88 / 1.04 | 4.21 / 4.30 | 5.01 / 5.25 | 1.20 / 1.40  | 1.70 / 1.90      |
| Top ten agent     | 0.92 / 1.30 | 0.87 / 1.10 | 6.88 / 7.06 | 7.60 / 7.82 | 1.20 / 1.50  | 1.80 / 1.90      |

### Cold process/worker and incremental work

Server startup: **10 fresh child processes per architecture/runtime**, OS cache uncontrolled. “Open” includes importing the database API, opening an existing stats store and connecting. “Open + query” adds `count(*)`, input and output sums; “process wall” also includes process creation and shutdown. It is not HTTP-server initialization or a full dashboard startup.

| Architecture/runtime | Open, median / p95 ms | Open + query, median / p95 ms | Process wall, median / p95 ms |
| -------------------- | --------------------- | ----------------------------- | ----------------------------- |
| Native Node          | 28.51 / 142.83        | 29.53 / 150.49                | 51.95 / 174.14                |
| Native Bun           | 24.13 / 28.22         | 25.34 / 30.30                 | 38.59 / 45.57                 |
| SQLite Node          | 0.26 / 1.00           | 8.16 / 12.60                  | 29.24 / 33.67                 |
| SQLite Bun           | 1.28 / 1.47           | 9.84 / 10.18                  | 22.36 / 23.02                 |

On a just-opened native connection, the first full six-metric hourly series took **8.41 ms Node / 5.88 ms Bun** (one observation each, after that process's store-build trials). WASM's first hourly series was **10.6 / 11.2 ms** (median / p95 across five fresh workers); first totals were **3.8 / 4.1 ms**. Dense JS first totals were **2.9 / 3.6 ms** and first hourly series **2.5 / 2.5 ms** (five fresh workers; the worker had already run the totals/day families before hourly). Individual query timings do not budget a complete view. The full first browser initialization is separately reported in the comparison table.

Incremental timings below are **100 known rows**, not dirty-row discovery or full synchronization. Native/SQLite updates changed `output = output + 1`, using indexed IDs and real commit, n=50. SQLite used `journal_mode=DELETE`, `synchronous=2` (FULL). WASM changed the same column in memory, five n=50 trials. JS changed 100 loaded values and returned a worker acknowledgement, five n=50 trials. Browser persistence after each delta is excluded.

| Operation                          | Median / p95 ms         | Scope                                                      |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Read/parse 100 changed steps, Node | 0.95 / 1.10             | n=49 warm; first read 34.30 ms; IDs selected before timing |
| Read/parse 100 changed steps, Bun  | 0.96 / 1.06             | n=49 warm; first read 1.42 ms; IDs selected before timing  |
| Native stats store update, Node    | 0.20 / 0.32             | n=50, commit included; first outlier 8.02 ms               |
| Native stats store update, Bun     | 0.21 / 0.35             | n=50, commit included                                      |
| SQLite stats store update, Node    | 0.19 / 0.20             | n=50, commit included                                      |
| SQLite stats store update, Bun     | 0.20 / 0.27             | n=50, commit included                                      |
| Browser WASM update                | 0.20 / 0.40             | In-memory SQL transaction, no OPFS write                   |
| Browser dense JS update            | timer-rounded 0.0 / 0.1 | In-memory updates + worker reply; **not zero work**        |

Neither inserting new dictionary members, deleting rows, recovering a missed event, nor rebuilding a whole browser snapshot was included in those delta costs. For both browser choices, the small changed-row cost supports batching/coalescing; it does not independently establish the 2 s visibility target.

### Memory and transfer footprint

Cold process RSS was sampled after open + a small totals query, n=10: native Node **78.1 / 78.3 MiB**, native Bun **52.4 / 52.5 MiB**; SQLite Node **47.9 / 48.0 MiB**, SQLite Bun **25.2 / 25.2 MiB** (median / p95). The processes that performed five builds plus all queries ended at **272.9 MiB Node / 208.6 MiB Bun** for native DuckDB, versus **82.3 / 52.8 MiB** for derived SQLite. These are process footprints, not pure database allocations. The in-memory extraction/builder experiment retained rows/maps and peaked at roughly **438 MiB Node / 362 MiB Bun**; streaming/batching could reduce that, **unverified**.

Browser RSS sums the headless browser and all its descendant processes from `ps`, measured after each trial while its worker remains alive, n=5. Baselines were about **252 MiB** before loading facts. WASM added **552.6 / 578.8 MiB**, dense JS **223.8 / 224.1 MiB** (median / p95). This includes browser/worker/compilation/result/GC overhead and is not an engine-only memory comparison. `duckdb_memory()` reported **47,273,984 bytes** of tracked allocations before the timed workload; that does **not** include the complete WebAssembly runtime or the browser. The JS fact buffer's **29,175,792 bytes** is exact; accumulator/result allocations are additional. `performance.memory` was coarse and not used as an authoritative footprint.

Payload sizes were measured from actual generated bytes; gzip and Brotli sizes from Node `zlib` default compression, not from estimating JSON overhead. The uncompressed selected EH assets were **35,913,747-byte WASM**, **773,223-byte worker** and **230,461-byte minified JS/Arrow bundle**. Their gzip total was **8,371,940 bytes**, Brotli **5,654,205 bytes**. Only one engine flavor needs to be fetched by a given browser; the npm package contains more than that selected deployment.

## Native loading, installation and distribution

### Runtime compatibility: tested, versus inferred

| Runtime                                       | Result                                                   | What was actually verified                                                                                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 24.15.0 on macOS arm64                   | **Loads and queries**                                    | `@duckdb/node-api` import, persistent builds, query/update trials                                                                                                                               |
| Bun 1.4.2 on macOS arm64                      | **Loads and queries**                                    | Same native API and workloads, not WASM fallback                                                                                                                                                |
| Electron 44.4.5 / embedded Node 24.21.0       | **Loads and queries**                                    | Scratch-installed Electron with `ELECTRON_RUN_AS_NODE=1`, unmodified package import and `SELECT 42`                                                                                             |
| Compiled Bun 1.4.2 host                       | **Native binary loads; package integration not turnkey** | Compiled host loaded the on-disk `.node` via an absolute/relative file path, opened DuckDB and queried one row; ordinary dynamically imported `@duckdb/node-api` failed bare-package resolution |
| Actual installed OpenCode Desktop plugin mode | **Unverified end-to-end**                                | No plugin/config modifications made to the active installation                                                                                                                                  |
| Linux / Windows runtimes                      | **Unverified on hardware**                               | Published platform packages inspected; no Linux/Windows execution                                                                                                                               |

The Electron version matches OpenCode's checked-out v2 Desktop manifest ([source at commit `8433dd7`, `package.json` line 53](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/package.json#L53)). This verifies its Node/Electron runtime as a proxy, **not** ASAR packing, host permissions, code signing or the actual plugin lifecycle. Desktop's source also resolves a bundled CLI executable ([`desktop-cli.ts` lines 48–78](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/desktop-cli.ts#L48-L78)); do not assume every server plugin runs in the Electron renderer/main process simply because Desktop uses Electron.

Compiled-host detail: `bun build --compile smoke.mjs` tried resolving optional packages for other platforms and failed. Marking `@duckdb/node-api` external compiled successfully but its runtime import failed; a compiled host importing an on-disk test module likewise failed bare dependency lookup. Direct `createRequire(import.meta.url)("./node_modules/@duckdb/node-bindings-darwin-arm64/duckdb.node")` succeeded, with a one-row/one-column SQL result. OpenCode's loader normally delegates compilation/package resolution to Bun ([`source.bun.ts` lines 23–25 and 68](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/source.bun.ts#L23-L25)). This is a **packaging spike still required** if native DuckDB is chosen for plugin mode, not evidence that C bindings cannot load in a compiled binary.

### What package managers install

`@duckdb/node-api` depends on `@duckdb/node-bindings`; its manifest lists eight platform-specific binding packages as optional dependencies ([versioned node-api manifest](https://registry.npmjs.org/@duckdb/node-api/1.5.6-r.1), [bindings manifest](https://registry.npmjs.org/@duckdb/node-bindings/1.5.6-r.1)). Both a fresh npm 11.19.1 install and a fresh Bun 1.4.2 install in scratch installed **four packages** on this machine: node-api, node-bindings, node-bindings-darwin-arm64, and detect-libc. They did **not** unpack all eight architectures. Native tarballs contain the `.node` bridge plus DuckDB `.dylib`/`.so`/`.dll`; the tested install did not compile DuckDB from source or install the SQLite extension.

`bunx opencode-stats` would install/cache the published opencode-stats package and its declared dependency graph, not magically turn native dependencies into a small single binary. By default `bunx` respects a Node shebang; `bunx --bun` forces Bun ([official bunx docs](https://bun.com/docs/pm/bunx)). The future opencode-stats published manifest/bin was not available to benchmark, so its total install size is **unverified**, not the sum of DuckDB alone. Native DuckDB packages are libraries, not a `bunx`-runnable database CLI. Omitting optional packages can leave required native bindings unavailable ([npm optional-dependency documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#optionaldependencies)).

### Per-platform native bytes

Measured by downloading the actual **1.5.6-r.1 registry tarball** for each `@duckdb/node-bindings-<platform>` package, recording response bytes, reading tar-member sizes, and checking registry `dist.unpackedSize`. These are package bytes, **not executable-memory consumption**; small JS API/detect-libc dependencies and extensions are additional. macOS tarballs include the same large shared library size for both architectures.

| Platform          | Compressed tarball MB | Unpacked package MB | DuckDB library MB | `.node` bridge MB |
| ----------------- | --------------------- | ------------------- | ----------------- | ----------------- |
| macOS arm64       | 36.818                | 117.528             | 117.009           | 0.518             |
| macOS x64         | 36.818                | 117.476             | 117.009           | 0.466             |
| Linux arm64 glibc | 21.668                | 63.512              | 62.945            | 0.565             |
| Linux arm64 musl  | 22.811                | 67.348              | 66.785            | 0.561             |
| Linux x64 glibc   | 23.928                | 71.033              | 70.547            | 0.485             |
| Linux x64 musl    | 24.708                | 73.775              | 73.252            | 0.521             |
| Windows x64       | 13.626                | 38.256              | 36.698            | 1.556             |
| Windows arm64     | 14.518                | 44.624              | 42.845            | 1.778             |

Each row's primary artifact is `https://registry.npmjs.org/@duckdb/node-bindings-<platform>/-/node-bindings-<platform>-1.5.6-r.1.tgz` (substitute the platform names `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-arm64-musl`, `linux-x64`, `linux-x64-musl`, `win32-x64`, `win32-arm64`). The installed loader dispatches on `process.platform`/`process.arch`, with detect-libc on Linux (`node_modules/@duckdb/node-bindings/duckdb.js`, lines 1–47). The [official Node Neo overview](https://duckdb.org/docs/current/clients/node_neo/overview.html#platforms) still says Windows arm64 is unsupported, although this version publishes a package and dispatches to it. **Publication is not verified platform support**; Windows remains best-effort.

`@duckdb/duckdb-wasm`'s installed directory occupied approximately **149.6 MB** by `du -k`, including multiple flavors, node/browser wrappers, sourcemaps and types, before `apache-arrow`/`qs` dependencies. That is not the browser's selected-flavor network download. Its [versioned manifest](https://registry.npmjs.org/@duckdb/duckdb-wasm/1.33.1-dev57.0) owns the files/dependencies/exports; the [official deployment docs](https://duckdb.org/docs/current/clients/wasm/deploying_duckdb_wasm.html) distinguish library, worker, engine and extension components. No-DuckDB uses SQLite already present in the tested Bun/Node runtimes and a custom JS worker; it adds **no DuckDB native/WASM engine package**.

## Extensions, locking and licence

### Extensions are another distribution dependency

Native `sqlite` is **downloaded/autoloaded on first use by default**, not included merely because node-api is installed ([official SQLite extension docs](https://duckdb.org/docs/current/core_extensions/sqlite.html#installing-and-loading)). In a fresh scratch extension directory, `INSTALL sqlite; LOAD sqlite` took **3,015 ms**, one observation including download, and produced a **27,061,974-byte** `sqlite_scanner.duckdb_extension` for v1.5.6/osx_arm64. A read-only `ATTACH` and `sqlite_query` returned the same **191,946** assistant-row count as SQLite. First install latency is outside the store-build/query numbers.

It **can be bundled**: distribute a signed, matching-version/platform extension file and `LOAD '/absolute/path/sqlite_scanner.duckdb_extension'`, or configure a packaged repository. Official docs describe direct-file install/load and static linking ([advanced installation](https://duckdb.org/docs/current/extensions/advanced_installation_methods.html)). Match both engine/version and platform, preserve the signature, and disable accidental online autoinstall/autoload where appropriate. The benchmarks selected SQLite extraction through the host runtime, so native DuckDB did **not** need the extension for the chosen build pipeline.

WASM extensions have separate Wasm binaries and fetching rules. `INSTALL` is not a durable cross-session native-style install; `LOAD` fetches and dynamically loads. Self-host/mirror the matching artifacts for localhost/offline use instead of relying on a public CDN ([official WASM extension docs](https://duckdb.org/docs/current/clients/wasm/extensions.html)). The tested CSV pipeline needed no optional extension downloads. Timezone SQL/Parquet choices could add `icu`/`parquet` and should be benchmarked separately. The single-threaded default and experimental threaded/4 GB memory limitations are documented by [DuckDB-WASM](https://duckdb.org/docs/current/clients/wasm/overview.html#limitations); threaded COI requires COOP/COEP and `SharedArrayBuffer` ([deployment docs](https://duckdb.org/docs/current/clients/wasm/deploying_duckdb_wasm.html#cross-origin-isolation)). Neither multithreaded WASM nor those headers was tested.

### Reading while OpenCode writes

- DuckDB's SQLite extension uses **SQLite locking**, not native DuckDB's file concurrency model. Use `ATTACH '...' AS oc (TYPE SQLITE, READ_ONLY)` explicitly. The implementation maps that access mode to `SQLITE_OPEN_READONLY` ([owning source, `SQLiteDB::GetOpenFlags` and `OpenLocal`](https://github.com/duckdb/duckdb-sqlite/blob/main/src/sqlite_db.cpp)); plain ATTACH's default is read-write ([ATTACH options](https://duckdb.org/docs/current/sql/statements/attach.html#options)).
- SQLite WAL normally allows readers alongside a writer and presents a transaction snapshot. **Long reads can prevent checkpoint progress and grow the WAL**, even though the reader never writes logical data. Read-only WAL opens require usable existing sidecars or the documented alternatives; `SQLITE_BUSY` is still possible ([SQLite WAL, sections 2.2, 5, 6 and 9](https://www.sqlite.org/wal.html)). Never use `immutable=1` against an actively changing database as a shortcut; it is not a live-update mechanism. Never issue source checkpoints or change journal mode.
- Consequently, avoid periodic raw 16–26 s scans inside plugin mode. Build once, perform short bounded read-only delta reads, release transactions, retry bounded busy failures and offload extraction from the OpenCode event loop. Both host SQLite APIs used here are synchronous; worker/separate-process execution is required to keep OpenCode responsive ([Node DatabaseSync docs](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#class-databasesync), [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)). This ticket did **not** write to the live OpenCode database to stress-test concurrency; actual writer latency under concurrent ingestion remains **unverified**.
- The SQLite-extension docs warn about **linking multiple SQLite copies into one application** ([concurrency warning](https://duckdb.org/docs/current/core_extensions/sqlite.html#concurrency)). OpenCode/host runtime SQLite plus an additional extension is an integration risk, not an automatic incompatibility verdict. The no-DuckDB choice avoids that added copy.
- For a native DuckDB **stats store**, ordinary in-process read-write use has one owning process, with multiple connections/threads inside that process; multiple read-only processes cannot coexist with an ordinary writer in that mode ([DuckDB concurrency](https://duckdb.org/docs/current/connect/concurrency.html)). Plugin mode and standalone mode need a single store owner/coordinated server, not independent uncoordinated writers. Adding a remote protocol/catalog solely to work around this would be out of scope.
- OPFS is browser-origin local persistence. Browser cache eviction, quota failure, origins changing with the server port, cross-tab ownership and schema migrations were not exercised; the complete durable browser contract is **unverified**. The cache is rebuildable from the stats store, not a second source of truth.

### Licence

DuckDB engine, Node Neo and DuckDB-WASM are **MIT** ([engine licence](https://github.com/duckdb/duckdb/blob/main/LICENSE), [node-api manifest](https://registry.npmjs.org/@duckdb/node-api/1.5.6-r.1), [WASM licence](https://github.com/duckdb/duckdb-wasm/blob/main/LICENSE)). Preserve notices for redistributed binaries/assets and audit the packaged dependencies/extensions separately; Arrow is an additional dependency, not covered by the engine's MIT notice. SQLite is **public domain** ([SQLite's own copyright statement](https://www.sqlite.org/copyright.html)). None of the three choices requires a proprietary DuckDB service.

## Essential reproduction code and run order

All dependencies were installed in scratch, not the repository. Reproduction uses a fresh clone only; do not point a write-capable benchmark at the live OpenCode database. The essential SQL below excludes all content paths. The complete small throwaway scripts remain in the scratch directory after large-file cleanup; they are not package implementation code.

```sql
-- Read-only SQLite connection; the only JSON values crossing into JS:
SELECT m.session_id, s.project_id, s.agent, m.time_created,
  json_extract(m.data,
    '$.model.providerID', '$.model.id', '$.model.variant',
    '$.tokens.input', '$.tokens.output', '$.tokens.reasoning',
    '$.tokens.cache.read', '$.tokens.cache.write', '$.cost',
    '$.time.created', '$.time.streamed', '$.time.completed', '$.finish') AS j
FROM session_message m
JOIN session_v2 s ON s.id = m.session_id
WHERE m.type = 'assistant';

-- Representative query; replace day with hour/mid/pid/aid.
-- Top-N: ORDER BY output DESC LIMIT 10 instead of ORDER BY day.
SELECT day, count(*) AS n,
  sum(input) AS input, sum(output) AS output, sum(reasoning) AS reasoning,
  sum(cr) AS cr, sum(cw) AS cw, sum(cost) AS cost
FROM facts
WHERE day >= :local_day_lower
  AND pid IN (...) AND mid IN (...) AND aid IN (...)
GROUP BY day ORDER BY day;
```

The dense kernel's relevant shape is a single filter pass, dense accumulation of counts and six measures, and transferred result buffers. In the actual spike, `columns` are the 19 float columns listed above and dictionary/bin offsets are established once. This excerpt omits initialization, top-N sorting, serialization and boundary validation; it is not production-ready code.

```js
function add(values, key, input, output, reasoning, read, write, cost) {
  const k = key * 7;
  values[k]++;
  values[k + 1] += input;
  values[k + 2] += output;
  values[k + 3] += reasoning;
  values[k + 4] += read;
  values[k + 5] += write;
  values[k + 6] += cost;
}

for (let row = 0; row < rowCount; row++) {
  if (!matchesLocalRangeAndDimensionSets(row)) continue;
  for (const group of requestedGroups) {
    add(
      group.values,
      group.key(row),
      input[row],
      output[row],
      reasoning[row],
      read[row],
      write[row],
      cost[row],
    );
  }
}
postMessage(
  results,
  results.map((result) => result.values.buffer),
);
```

Scratch source/method anchors: `extract.mjs` (read-only JSON projection and dictionary encoding); `native.mjs` / `sqlite.mjs` (explicit store builds, repeated queries); `cold.mjs` / `cold-runner.mjs` (10 fresh processes); `increment.mjs` / `update.mjs` (known-row extraction and real commits); `browser.mjs` / `browser-page.mjs` (real Chromium, OPFS, page-to-worker clock, five trials); `typed-worker.mjs` / `dense-worker.mjs` (Map versus dense fusion); `common.mjs` (SQL and quantiles); `sizes.py` (registry tarballs); `summary.mjs` (conservative browser summary); `check.mjs` (cross-checks without disclosing totals). These file names identify measured experiments; **no scratch data files or outputs belong in a public commit**.

Run order was extraction under Node and Bun; store builds/query trials separately under each runtime; 10-process cold-start trials; 100-row delta trials; sequential browser trials for WASM, Map and dense workers; size inspection and summary. Native builds used already extracted numeric CSV, not the whole 17.7 GB SQLite file. Browser facts and code were all served from localhost, never uploaded to a third party. Browser-asset compression was calculated afterwards; the timed local fetches used raw bytes.

**Decision:** choose the SQLite stats store + dense browser columnar cache for v1. Do not add DuckDB merely to solve the frame promise. Keep the strict end-to-end next-frame target explicitly open for implementation verification, rather than presenting this research as proof that every possible view is already solved.
