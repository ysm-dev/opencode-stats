# Locating the OpenCode database and noticing writes

Research for [#3](https://github.com/ysm-dev/opencode-stats/issues/3), 2026-10-01. Vocabulary follows the main checkout's `GLOSSARY.md`. This is a recommendation, not an ADR or an implementation of stats-store sync.

## Direct answer

- **Locate exactly one database:** explicit opencode-stats database override first; otherwise reproduce OpenCode's XDG data-root and channel filename rules below. In plugin mode use `ctx.app.channel` and the host process's environment. In standalone mode use the intended OpenCode installation/channel and environment, not opencode-stats' version or an arbitrary newest database. Fail clearly when the file is missing, the channel is ambiguous, or the host uses `:memory:`. [O1–O4]
- **Default data directory on all three operating systems:** `join(XDG_DATA_HOME || join(os.homedir(), '.local', 'share'), 'opencode')`. macOS does **not** use `Library/Application Support`; Windows does **not** substitute `APPDATA` or `LOCALAPPDATA`. The Windows default is the user's home plus `.local\share\opencode`. [O2]
- **Filename:** `OPENCODE_DB` overrides it, including an absolute path, a relative path resolved against the data directory, or `:memory:`. Otherwise channels `latest`, `dev`, `beta`, `next`, `prod`, or `OPENCODE_DISABLE_CHANNEL_DB` exactly `1`/`true`, use `opencode.db`; other channels use sanitized `opencode-<channel>.db`. Thus channel `v2` uses `opencode-v2.db`, but the current official stable-release build flow selects `latest` and therefore `opencode.db`: “v2” product generation is not necessarily the literal channel. [O1, O3, O5]
- **A plugin cannot ask the public context for the database path:** it exposes app name/version/channel, location and domain APIs, but neither the host's database filename nor its global data directory. Reproduce the algorithm for the normal CLI host; require an explicit path for a custom SDK host whose injected database options differ. [O4, O6]
- **Fingerprint, do not guess:** allowlist the complete migration-ID set plus a canonical structural manifest of the tables/columns/indexes actually read. Read `migration(id,time_completed)` first; recognize `__drizzle_migrations` only through known legacy-journal layouts mapped to known migration IDs. Neither filename, app version, `user_version` nor SQLite `schema_version` is sufficient. Unknown migration IDs or an unrecognized manifest must stop sync with a clear unsupported-schema message. [O7–O10, S1]
- **Recommended signal:** one persistent, strictly read-only connection, in autocommit, polling `PRAGMA main.data_version` every **500 ms** in both modes and runtimes. Compare only on that connection. A different value schedules one coalesced sync; it is not a transaction count, row cursor or durable checkpoint. Plugin events can optionally wake that same check sooner, but are not required for v1. [S1, O11]
- **Measured:** on the live **17,762,873,344-byte** OpenCode database, warmed `data_version` calls averaged **1.34 µs/Bun** and **0.95 µs/Node** at the median batch. In the scratch concurrent-writer test, 500 ms polling observed all 20 spaced commits, with p95 detection **495 ms/Bun**, **498 ms/Node**. File watchers missed writes. Details, versions and measurement limitations are below. [Measurements]
- **Safety:** use native read-only constructor options, a short connection-local busy timeout, no `immutable`, no checkpoint, no journal-mode change, no migrations and no long/overlapping read transactions. A read-only connection still participates in WAL locking/shared-memory coordination; it is not zero interaction. Both native drivers rejected attempted writes and read the other process's committed WAL state. [S2–S4, B1, N1, Measurements]

## 1. Location algorithm

The source of truth is OpenCode's CLI `databasePath`, not the basename suggested by the ticket. The algorithm is independent of the reader's runtime. [O1–O3]

```text
if an explicit opencode-stats database path is supplied:
    use that one path, resolved by documented opencode-stats option semantics
else:
    data = join(env.XDG_DATA_HOME || join(os.homedir(), '.local', 'share'), 'opencode')
    channel = intended OpenCode host's channel
    filename = env.OPENCODE_DB ?? (
        channel in [latest, dev, beta, next, prod]
        or env.OPENCODE_DISABLE_CHANNEL_DB in ["1", "true"]
        ? 'opencode.db'
        : 'opencode-' + channel.replace(/[^a-zA-Z0-9._-]/g, '-') + '.db'
    )
    selected = filename == ':memory:' ? filename : resolve(data, filename)
reject ':memory:' for this separate-reader design
open selected read-only; never create a missing database
```

Important edges:

- `XDG_DATA_HOME` uses truthiness; an empty string falls back to home. `OPENCODE_DB` uses nullish coalescing; an empty string resolves to the data directory and should produce an invalid-database diagnostic, not silently select another file. `~` is not expanded by `path.resolve`. Relative XDG roots ultimately resolve against the process working directory; recommend absolute overrides. [O1, O2]
- `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME` affect other roots, not this data root. `OPENCODE_TEST_HOME` changes the exposed `Global.home` getter but **not** `roots()`'s `os.homedir()`-based data default. Global roots are captured at module initialization, so a plugin reading mutated environment later cannot prove it has reconstructed the original root. [O2, O12]
- The CLI's channel is a **build constant**, defaulting to `local` in an unbuilt source invocation. Merely setting runtime `OPENCODE_CHANNEL` does not override that compiled constant. The build scripts use that variable to determine what to compile. [O3, O5]
- `opencode debug paths db` is a first-party diagnostic for the database path computed by **that executable in that environment**. It does not ask an already-running service about its path. It is useful for disambiguation, but does not solve differing background-service environments or a different Desktop-bundled CLI. Do not automatically start a service or call a mutation API to discover a filename. [O13]
- In standalone mode, a different shell environment cannot reveal the service's custom `OPENCODE_DB`/XDG settings. Default to the supported stable channel when no other channel is specified; offer an explicit database override for non-default installs. Do not glob every channel database and pick the largest/newest: that violates the one-database scope and can pick the wrong history. This is a product recommendation, not a host API guarantee.

### Desktop: distinguish its preferences from its OpenCode database

The inspected Desktop source sets Electron `userData` under its application identity, but that is **not** the OpenCode database root. Desktop normally discovers/adopts a compatible background service or launches the bundled CLI with `serve --service`; that CLI supplies its normal database path. Development/onboarding test roots can replace XDG directories; onboarding can explicitly use `:memory:`. Isolated development mode changes the service-registration root, not by itself the data root. [O14–O16]

The inspected branch therefore does **not** establish that a server plugin loaded through `opencode.jsonc` runs inside Electron's Node process: normal Desktop starts/adopts the CLI service. Desktop's main-process extension system is a different surface. Keep Node first-class as required by the map, but do not infer the writer's runtime or database channel from the renderer or Electron application channel. The exact deployment topology of every stable 2.0.x artifact was not exercised. [O14–O16]

## 2. Schema recognition

### Migration journals and upgrades

Current bootstrap creates `migration(id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)` and marks every bundled migration completed after constructing the latest schema. Existing databases run missing migrations in source order, each in a transaction with its completion insert. These include data migrations, not just column changes. Importantly, the journal stores IDs, **not SQL hashes**. [O7, O8]

If the new journal is empty, OpenCode seeds it from `__drizzle_migrations`:

1. When that table has a `name` column, use non-null `name` values as migration IDs.
2. Otherwise map `created_at` Unix milliseconds to UTC `YYYYMMDDHHMMSS`, then match a known migration ID with that prefix. OpenCode fails when a timestamp cannot be mapped.
3. The legacy journal may remain present after migration; its mere presence is not evidence that the database is old or unsupported. A non-empty current journal takes precedence. [O7:54–105]

opencode-stats must **only read** these journals; never import OpenCode's `Database.layer` to inspect compatibility. That layer creates/restricts files, sets WAL/tuning pragmas, checkpoints and applies migrations. Even a read-only driver underneath does not make that bootstrap safe. [O9]

### Proposed allowlisted manifest

For each explicitly supported OpenCode schema variant, ship:

- Full sorted migration IDs, not just `max(id)`, a count or `time_completed` values. Completion times differ legitimately between installs.
- Selected table names and column-name/type/nullability/default/primary-key/hidden-column information from `PRAGMA table_xinfo`.
- Foreign-key definitions for selected tables, and index uniqueness, indexed columns/order/collation and partial predicates from `index_list`, `index_xinfo` and the relevant `sqlite_schema` index SQL.
- Explicit extraction semantics for numeric JSON fields: column shape alone cannot prove the meaning of an assistant-step payload. This ticket verifies structural compatibility, not every metric definition.

Canonicalize deterministically: sort tables/columns/index names; preserve index-key ordering and composite-PK position; group composite foreign keys before discarding their assigned IDs. Ignore physical column ordinals (`cid`) and index-list sequence numbers. Do not hash raw full `CREATE TABLE` strings: migrations append/rebuild columns and SQLite rewrites DDL, producing physically different but compatible installs. Normalize only known harmless default/predicate spelling differences; a general SQL “normalizer” must not erase string literals or semantic changes. Reject unknown expression indexes/predicates unless a supported fixture accounts for them. [O7, O10, S1]

Scope the structural manifest to the required tables, including every table later used for tool/model extraction; unrelated underscore-prefixed embedding tables are explicitly allowed by OpenCode bootstrap. Permit known legacy leftover tables only as a documented supported variant. Do not infer support for a newer migration just because the columns happen to look unchanged. [O7:24–31]

Read journal and structural metadata in one **short** read transaction, then release it before syncing rows. Revalidate on reconnect, path identity change and a changed schema/journal. `PRAGMA schema_version` is SQLite's DDL counter, not an OpenCode migration version; `user_version` is application-controlled and not a compatibility contract here. Never write either. [S1]

### Verified local structural example

The live OpenCode database has both journals, 48 current migration IDs, latest `20260923013825_project_time_active`, `user_version=0`, and `schema_version=2`. Both drivers returned identical structural fingerprints. The migration-ID list matches the inspected source manifest. [O8, Measurements]

For the four-table **example only** (`event_sequence`, `project`, `session_message`, `session_v2`), canonical columns/foreign keys/indexes matched a fresh schema constructed in memory from `schema.gen.ts`. Before removing physical index `cid`, an initial comparison falsely differed: `session_v2.time_suspended` was ordinal 31 on the existing database but 34 in fresh bootstrap. After discarding ordinals and retaining names/order/partial predicate, the manifests matched. This is concrete evidence against naive raw-DDL/physical-layout hashing; it is **not** a complete stats-extraction schema allowlist. [O10, Measurements]

## 3. Ranked change signals

Rank is suitability as the cross-mode correctness foundation, not raw wake-up speed.

| Rank / signal                               | Latency and cost                                                                                                                                                                                                               | Reliability, checkpoints and caveats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Persistent `data_version` polling**    | Choose 500 ms: two tiny statements per second; measured live per-call median batch averages 1.34 µs Bun / 0.95 µs Node. Expected latency is up to one interval **plus scheduling and sync**, not a hard real-time bound.       | Signals commits from every other connection, including another process. Coalesces many commits into “dirty”; no row identities/deletion log. Same-connection comparisons only. Works across WAL checkpoints/reset; can also wake on a checkpoint without new logical rows, as measured. No open read transaction between polls. [S1, S2]                                                                                                                                                                                                                                                                                                                                     |
| **2. Plugin `ctx.event.subscribe`**         | In-process stream delivery after publication, no database scan. Actual plugin latency/CPU was **not measured**. Encodes full event payloads and uses a live unbounded PubSub, so a slow consumer has memory/CPU risk.          | Volatile: no history before subscription or across disconnect/unload. Location/global-event filtering and public-event filtering mean it is not a database-wide commit stream. Other writers and migrations need not emit host events. Durable session events publish after projection commit, but ephemeral events are not commit proof. Checkpoints irrelevant. Inspect type/IDs only; never log/store payloads or message content. Abort on cleanup; polling remains the fallback. [O4, O11, O17]                                                                                                                                                                         |
| **3. Filesystem watching `.db` and `-wal`** | Often prompt when delivered; syscall/kernel notification rather than scanning. Measured Node file-watch p95 was 1 ms **for observed writes**, but it missed writes; Bun and directory watchers mostly saw checkpoint activity. | Not a commit signal: uncommitted writes, checkpoint writes, resets/truncation and deletion/recreation all notify/coalesce differently. Watching `.db` alone misses WAL commits. Watch directory for replacement plus file inodes for changes if used; reattach after replacement, tolerate absent WAL/null filename/errors. Linux inotify, macOS kqueue/files + FSEvents/directories, Windows ReadDirectoryChangesW differ. Network filesystems/virtualization unreliable; WAL itself requires local shared memory. Never use watcher silence to skip the periodic pragma. [S2, N2, Measurements]                                                                            |
| **4. `rowid` / `time_updated` cursors**     | An indexed cursor can be cheap, but no fixed cost without an appropriate index. Relevant v2 session/message tables have no global `time_updated` index in the inspected schema. Cursor-query latency was **not measured**.     | `rowid` catches some inserts, not updates/deletions; these tables use text primary keys without AUTOINCREMENT, and rowids can be reused. Timestamps are wall-clock milliseconds, not commit sequence: ties, clock changes and deliberately preserved timestamps exist. `>` misses ties; a `(timestamp,id)` tie-breaker still misses a later update of an already-passed row in that same millisecond. Overlap/re-read mitigates normal activity but cannot recover deletions without reconciliation. WAL checkpoints do not fix these problems; rebuild migrations can invalidate cursors. Treat as extraction optimizations, not universal change detection. [O10, O18, S5] |

`event_sequence(aggregate_id,seq)` is a useful additional **v2-specific extraction aid**: OpenCode reserves per-aggregate sequence progress with durable projections. It is neither one global append-only cursor nor a complete database change log; removal deletes sequence entries, metadata can change elsewhere, and event payload persistence defaults off in the inspected Bus. A future sync design can compare aggregate sequences without extracting event/message payloads, but still needs deletion/metadata reconciliation. [O17, O19]

### Recommended loop

1. Resolve one path; open native read-only; validate the supported manifest; establish a connection-local `data_version` baseline.
2. Poll every 500 ms. On a change set one dirty flag; do not launch overlapping syncs or keep a transaction open while waiting.
3. Run bounded read batches and update only the stats store. Capture the signal before the sync and check again afterward. If it changed while syncing, schedule another pass rather than blindly advancing the baseline and losing a racing write. Retain dirty state after errors.
4. Reconnect with backoff on transient busy/open errors and revalidate. A new connection requires a new baseline and reconciliation; never persist `data_version` as a resume cursor. Check path identity with `stat` to notice replacement rather than holding an old inode forever.
5. For v1, **omit file watchers** and keep plugin events optional. Polling leaves roughly 1.5 seconds of the map's two-second target for sync and dashboard delivery; whether that end-to-end target is met belongs to the sync/performance tickets.

## 4. Read-only WAL safety

Safe driver entrypoints (SQL settings below are connection-local): [B1, N1, S1]

```ts
// Bun: do not use default read-write/create options.
new Database(filename, { readonly: true, create: false })
// Node: constructor fails rather than creating a missing file.
new DatabaseSync(filename, { readOnly: true, timeout: 100 })
// On the reader connection:
PRAGMA busy_timeout = 100;
PRAGMA query_only = ON;
```

- Both APIs are synchronous. A busy wait blocks the calling JS thread; use bounded retry/backoff outside the database statement and keep raw reads off the host/UI latency path. The proposed 100 ms timeout is a tuning recommendation, not a measured optimum. Do not copy OpenCode's 5,000 ms writer timeout into a plugin's event-loop path. [B1, N1, O9]
- Normal WAL readers and a normal writer operate concurrently, but a snapshot pins its end mark. Long reads prevent checkpoint completion/reset and grow the WAL; overlapping readers can cause continuous starvation. Fully consume/reset/finalize statements and close iterators in `finally`; do not hold a read transaction across asynchronous work or an entire multi-second initial import. Use short batches with reader gaps. [S2]
- `mode=ro` opens the main database read-only **only if URI handling is enabled**. Both tested runtime builds recognized it, but native read-only options are the portable safety boundary. Encode URI special characters if using URI filenames; a file URL/path accepted by a JS API is not automatically a promise about SQLite query-parameter semantics. [S3, Measurements]
- Read-only WAL opening requires readable existing sidecars, the ability to create sidecars, or immutability. A live reader may coordinate via `-shm`; “never write the OpenCode database” means no changes to its durable SQL data/schema/journaling, not a promise of no lock or shared-memory bookkeeping. If opening cannot work safely under permissions, report/retry; never fix permissions, create the database, delete sidecars or checkpoint it. [S2]
- **Never `immutable=1` or `nolock=1` on the live file.** Immutability disables locking/change detection; the URI spike returned stale pre-WAL data in both drivers and `sqlite3`. SQLite explicitly warns of incorrect results/corruption when a supposedly immutable file changes. [S3, Measurements]
- In plugin mode use the host's native driver, not a second independently linked SQLite library. SQLite documents a Unix locking hazard with multiple SQLite copies in one process; raw `fs.open`/`read`/`close` of that database in the host process can also release its POSIX locks. Do schema/header recognition through SQL; `stat` does not open/close the file. An isolated **process**, not merely another thread/worker, separates that library/lock hazard if necessary. [S4, O9:83–89]
- Do not change host-global SQLite configuration: no Bun `Database.setCustomSQLite`, extensions or custom VFS. Never import host bootstrap, run migrations/`VACUUM`/`ANALYZE`/`optimize`, set WAL or execute `wal_checkpoint`, even PASSIVE. OpenCode itself owns these operations. [O9, B1, S2]
- SQLite's documented WAL-reset bug affects older engines during concurrent write/checkpoint activity, not this read-only polling design. This machine's Bun/system SQLite reports 3.51.0; Node reports patched 3.51.3. Keep runtime engine versions in diagnostics and do not add a second checkpointer. [S2 §11]
- An APFS clone of the main file alone is not a snapshot of committed WAL state. Even sequentially cloning `.db`, `-wal`, `-shm` together is not a guaranteed atomic snapshot of an actively changing database; SQLite documents the inconsistent-copy risk. No clone was needed here: live work was restricted to short metadata/pragma reads, and all write/checkpoint experiments used disposable databases. [S2 §4, S4 §1.2]

## 5. Measurements and reproducible method

### Environment and scope

All numbers below were measured on **2026-10-01**, Apple M4, arm64 macOS, Darwin **25.6.0**, kernel `xnu-12377.161.14~5/RELEASE_ARM64_T8132` (from `uname -a`; hostname omitted). CPU model came from `sysctl -n machdep.cpu.brand_string`. Bun **1.4.2** (`744846f84`), Node **v24.15.0**, system `sqlite3` **3.51.0**. SQLite engine versions were queried through each connection: Bun **3.51.0**, Node **3.51.3**. Local OpenCode branch remained `v2`, commit **8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43**; it was never modified.

All scratch code/databases lived under the approved `scratch-database-location-and-changes` temporary directory. No dependency install was needed for probes. The active OpenCode database was opened with native read-only options or `sqlite3 "file:$HOME/.local/share/opencode/opencode-v2.db?mode=ro"`. Only file size, schema/journal metadata and pragmas were read; **no message-content or spend queries**, no live writes, no live checkpoints, no aggregate row scans.

These are development-machine measurements with other agents/processes running, not isolated throughput guarantees. Percentiles use sorted observations at `floor(n*p)`; pragma costs use **batch averages**, not per-call tail latency. Detection timestamps use `Date.now()` immediately before the writer statement, so include its commit duration and have millisecond resolution. Sub-millisecond watch results of `0 ms` are not claims of zero latency.

### Cost: prepared `PRAGMA main.data_version`

Method on the environment above: one persistent native read-only connection per runtime, autocommit; prepare once, warm up 1,000 `.get()` calls, then time 20 batches of 1,000 `.get()` calls with `performance.now()`. Median/p95 are batch-average microseconds per call. The live file size from `stat` was **17,762,873,344 bytes** (17.76 decimal GB; no content scan).

| Database / run                                | Bun median / p95 batch average | Node median / p95 batch average |
| --------------------------------------------- | ------------------------------ | ------------------------------- |
| Live OpenCode database, final fingerprint run | 1.34 / 2.62 µs                 | 0.95 / 1.12 µs                  |
| One-row scratch WAL database, repeat run      | 1.14 / 2.29 µs                 | 0.95 / 1.39 µs                  |
| Scratch, earlier loaded run (same method)     | 28.85 / 70.46 µs               | 8.93 / 94.52 µs                 |

The loaded run demonstrates why these numbers are not hard bounds. Two polls per second are nevertheless negligible SQL work relative to the map's raw aggregate scan; process wake-ups and subsequent sync work are not included in these microbenchmarks.

### Concurrent WAL commits, checkpoints and watchers

Method on the environment above: a **separate Node writer process** owns a disposable WAL database with one row `(id INTEGER PRIMARY KEY,n INTEGER,ts INTEGER)`, `synchronous=NORMAL`, `wal_autocheckpoint=0`. Independent Bun and Node reader subprocesses use the native read-only constructors. Writer updates `n`/`ts`; readers poll a cached pragma, then read `n`/`ts` when the pragma changes. Simultaneous `fs.watch` probes watch the directory and directly watch `.db`/`-wal`; callbacks read the currently committed row, never assume a callback equals a commit. The writer executes `wal_checkpoint(TRUNCATE)` after every tenth write. This operation was **only on scratch databases**.

| Repeat run / signal                     | Bun observations; p50 / p95 / max | Node observations; p50 / p95 / max |
| --------------------------------------- | --------------------------------- | ---------------------------------- |
| 50 ms poll, 60 writes spaced at 71 ms   | 60/60; 27 / 50 / 52 ms            | 60/60; 26 / 49 / 51 ms             |
| 500 ms poll, 20 writes spaced at 701 ms | 20/20; 293 / 495 / 495 ms         | 20/20; 297 / 498 / 498 ms          |
| Direct file watchers during 50 ms run   | 6/60; 12 / 12 / 12 ms             | 56/60; 0 / 1 / 6 ms                |
| Direct file watchers during 500 ms run  | 2/20; 12 / 12 / 12 ms             | 16/20; 0 / 1 / 1 ms                |
| Directory watcher during 50 ms run      | 6/60; 12 / 12 / 12 ms             | 6/60; 12 / 12 / 12 ms              |
| Directory watcher during 500 ms run     | 2/20; 12 / 12 / 12 ms             | 2/20; 12 / 12 / 12 ms              |

An earlier identical loaded run returned polling p95 **148/128 ms** at 50 ms and **568/568 ms** at 500 ms (Bun/Node); the 50 ms poll observed 48/60 and 50/60 intermediate row values, respectively. That is allowed coalescing: later state remains visible, but these signals cannot reconstruct every intermediate update. Do not infer that a polling interval is a maximum under arbitrary scheduler load. The watcher mechanism causing Bun's missing notifications was **not verified**; the observed miss rate is sufficient to rule it out as the sole signal.

For both readers, baseline `data_version=2`, a committed external update changed it to 3 and exposed the new row; a writer-side truncating checkpoint changed it to 4 while the row was unchanged. Thus checkpoint noise is possible and must be harmless. No claim is made that every checkpoint increments it.

### Locking, starvation and URI proof

Method on the environment above: hold `BEGIN; SELECT ...` on one reader; the separate writer commits 200 updates, then issues a scratch-only PASSIVE checkpoint; reader rolls back; writer then truncates the WAL. Repeat separately for each runtime.

| Held reader | Successful writer commits | p95 writer statement duration | PASSIVE result while held       | WAL bytes held / after release+truncate |
| ----------- | ------------------------- | ----------------------------- | ------------------------------- | --------------------------------------- |
| Bun         | 200                       | 0.033 ms                      | busy=0, log=200, checkpointed=0 | 824,032 / 0                             |
| Node        | 200                       | 0.008 ms                      | busy=0, log=200, checkpointed=0 | 824,032 / 0                             |

All writer commits succeeded: reads did not prevent normal WAL writes, but did prevent checkpoint progress. `busy=0` on a PASSIVE checkpoint **does not mean all frames were checkpointed**. These short synthetic statement timings do not establish “no noticeable cost” on real OpenCode workloads.

Busy-timeout method on the same environment: writer first opens a second disposable WAL database in `locking_mode=EXCLUSIVE` and holds a write transaction; fresh native read-only reader subprocesses set `busy_timeout=100` and attempt SELECT. Both returned busy errors; opening/setup+query elapsed **130.1 ms/Bun**, **134.6 ms/Node**, timed inside each reader with `performance.now()` (one trial each). This is an exceptional lock mode, not normal OpenCode WAL operation; classify/retry the error rather than assuming WAL can never return busy.

URI method on the same environment: writer creates a third disposable WAL database, stores `n=0`, checkpoints it, then commits `n=1` without checkpointing and stays open. Fresh readers attempt UPDATE **without `query_only` enabled**, then SELECT through ordinary/native read-only and URI connections. Both reject UPDATE. Both ordinary/native and `file:<path>?mode=ro` return **1**; both `file:<path>?immutable=1` return stale **0**, as does system `sqlite3`. No live file was involved.

### Essential probe operations

The probes need only the runtime's standard library; IPC coordinates commands so the writer and readers are genuinely different processes. The critical statements below reproduce the safety tests against a fresh scratch file, **never the OpenCode database**:

```sql
-- Scratch writer setup, before starting reader subprocesses:
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA wal_autocheckpoint=0;
CREATE TABLE t(id INTEGER PRIMARY KEY,n INTEGER,ts INTEGER);
INSERT INTO t VALUES(1,0,0);
-- After readers capture their data_version baseline:
UPDATE t SET n=1,ts=<writer_timestamp_ms> WHERE id=1;
-- Reader: compare on the SAME connection, fully consume each statement:
PRAGMA main.data_version;
SELECT n,ts FROM t WHERE id=1;
-- Reader starvation test; hold this while writer commits more updates:
BEGIN;
SELECT n FROM t WHERE id=1;
-- Scratch writer only, inspect busy/log/checkpointed:
PRAGMA wal_checkpoint(PASSIVE);
-- Reader:
ROLLBACK;
-- Scratch writer only:
PRAGMA wal_checkpoint(TRUNCATE);
```

For fingerprint reproduction: construct an **in-memory** reference from the literal SQL statements in the pinned `schema.gen.ts`; compare the four tables named above via `table_xinfo`, `foreign_key_list`, `index_list`, `index_xinfo` and partial-index predicates. No row payloads are needed. Discard physical ordinals and hash sorted JSON. The verified migration-ID-set SHA-256 was `6945eced1fdd20595b92caada6b62c9f6693e650b6473db2853ab670ef91a2f7`; the exact four-table probe serialization is not proposed as a public fingerprint format.

### Remaining verification limits

Linux/Windows native execution, real plugin-event latency, custom SDK-host database injection and packaged Desktop 2.0.x binaries were not exercised. Their location/platform/API claims above are source-backed; measured behavior and timings are macOS-only. End-to-end two-second freshness, one-second startup, JSON extraction semantics, deletion reconciliation and initial-import chunk sizes require the downstream sync/performance design. No raw scan or large clone was needed for this ticket.

## Primary sources

All OpenCode source citations below are pinned to commit `8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43` in the read-only local `~/git/opencode` checkout. Official documentation was fetched on the research date. Bracket references in the text identify these owners, not secondary articles.

- **O1:** [`packages/cli/src/database-path.ts:4–12`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/database-path.ts#L4-L12): overrides, channel names, sanitization, resolution.
- **O2:** [`packages/util/src/global-roots.ts:4–18`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/global-roots.ts#L4-L18): cross-platform XDG roots.
- **O3:** [`packages/cli/src/version.ts:1–10`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/version.ts#L1-L10), [`server-process.ts:87–102`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/server-process.ts#L87-L102), [`script/build.ts:154`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/script/build.ts#L154): channel constant and writer options.
- **O4:** [Official V2 plugin guide, Context and Events](https://opencode.ai/v2/docs/build/plugins), [`packages/plugin/src/promise/plugin.ts:26–54`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/plugin.ts#L26-L54), [`app.ts:1–5`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/app.ts#L1-L5): public capabilities, channel but no database path.
- **O5:** [`packages/script/src/index.ts:20–48`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/script/src/index.ts#L20-L48), [`.github/workflows/publish.yml:39–40,71–77,116–124`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/.github/workflows/publish.yml#L39-L124): build/release channel selection and release version supplied to the build.
- **O6:** [`packages/sdk/src/internal/host.ts:39`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/sdk/src/internal/host.ts#L39), [`packages/core/src/database/database.ts:67–79`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/database.ts#L67-L79): injected/custom database path, default memory.
- **O7:** [`packages/core/src/database/migration.ts:22–146`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/migration.ts#L22-L146): bootstrap, current journal, legacy-journal import, transactional upgrades.
- **O8:** [`migration.gen.ts:2–100`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/migration.gen.ts#L2-L100): complete ordered migration manifest.
- **O9:** [`database.ts:33–98`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/database.ts#L33-L98): write-side tuning/checkpoint/bootstrap and POSIX-close warning.
- **O10:** [`schema.gen.ts:54–68,91–117,159–222,242–276`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/schema.gen.ts#L54-L276), [`packages/core/src/session/sql.ts:22–98`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/session/sql.ts#L22-L98): current structures, text keys and indexes.
- **O11:** [`packages/core/src/plugin/host.ts:255–264`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/host.ts#L255-L264): public/server event filtering.
- **O12:** [`packages/util/src/global.ts:12–27,47–79`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/util/src/global.ts#L12-L79): test-home getter and configuration-only override.
- **O13:** [`packages/cli/src/commands/handlers/debug/paths.ts:8–22`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/commands/handlers/debug/paths.ts#L8-L22), [`commands.ts:122–139`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/cli/src/commands/commands.ts#L122-L139): path diagnostic.
- **O14:** [`packages/desktop/src/main/lifecycle/configure.ts:15–60`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/lifecycle/configure.ts#L15-L60): Electron paths and test-only XDG/memory overrides.
- **O15:** [`packages/desktop/src/main/service/background-service.ts:30–73`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/background-service.ts#L30-L73): adopt/start CLI service and isolated registration.
- **O16:** [`packages/desktop/src/main/service/desktop-cli.ts:48–77`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/service/desktop-cli.ts#L48-L77), [`extension/host.ts:192–229`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/desktop/src/main/extension/host.ts#L192-L229): bundled/development CLI and distinct Desktop extension surface.
- **O17:** [`packages/core/src/bus.ts:121–129,193–203,317–444,450–504,703–714,726–762`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/bus.ts#L121-L762): volatile/location-scoped stream, unbounded queue, projection commit before publish, default no payload persistence and removal. [`packages/plugin/src/promise/adapter.ts:324–331`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/plugin/src/promise/adapter.ts#L324-L331): event payload encoding.
- **O18:** [`packages/core/src/database/schema.sql.ts:3–9`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/database/schema.sql.ts#L3-L9), [`packages/core/src/session/store.ts:205–248`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/session/store.ts#L205-L248): wall-clock defaults and deliberately preserved update timestamps.
- **O19:** [`packages/core/src/bus.ts:21–48,395–435`](https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/bus.ts#L21-L435): aggregate sequence reservation and transactional projections.
- **S1:** [SQLite PRAGMAs: `data_version`](https://www.sqlite.org/pragma.html#pragma_data_version), [`busy_timeout`](https://www.sqlite.org/pragma.html#pragma_busy_timeout), [`schema_version`](https://www.sqlite.org/pragma.html#pragma_schema_version), [`user_version`](https://www.sqlite.org/pragma.html#pragma_user_version), [`table_xinfo`](https://www.sqlite.org/pragma.html#pragma_table_xinfo), [`index_xinfo`](https://www.sqlite.org/pragma.html#pragma_index_xinfo).
- **S2:** [SQLite WAL §§2.2,4,5,6,9,11](https://www.sqlite.org/wal.html): concurrency, sidecars, read-only access, starvation, busy cases and WAL-reset bug.
- **S3:** [SQLite URI filenames §§2,3.3](https://www.sqlite.org/uri.html): URI opt-in, `mode=ro`, immutability and unsafe lock suppression.
- **S4:** [SQLite corruption guidance §§1.2,2.2,2.3](https://www.sqlite.org/howtocorrupt.html): inconsistent copying, POSIX-close and multiple-library hazards.
- **S5:** [SQLite AUTOINCREMENT §§2–3](https://www.sqlite.org/autoinc.html): rowid assignment/reuse, not an update log.
- **B1:** [Official Bun SQLite reference](https://bun.com/docs/runtime/sqlite): native read-only constructor, synchronous calls, statement lifecycle, platform SQLite/WAL differences and process-global custom SQLite selection.
- **N1:** [Official Node v24.15.0 SQLite reference](https://nodejs.org/download/release/v24.15.0/docs/api/sqlite.html#new-databasesyncpath-options): native read-only constructor, synchronous calls and timeout.
- **N2:** [Official Node v24.15.0 `fs.watch` caveats](https://nodejs.org/download/release/v24.15.0/docs/api/fs.html#caveats): native backends, inode replacement, null filename and unreliable environments.
- **Measurements:** original runtime/SQL experiments described in §5; only aggregate sizes/timings and synthetic values reported.
