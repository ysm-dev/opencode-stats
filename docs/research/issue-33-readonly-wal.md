# #33: companion-free WAL native-reader blocker

2026-10-04. Synthetic databases only; no OpenCode installation was read. This is
an unresolved runtime choice, not completion of #33 and not a source-write
workaround.

## Regression and scope

`bun test ./packages/stats-store/src/runtime.bun.contract.test.ts` now includes
both a successful live-writer case and a desired-behavior inactive-WAL case.
The latter uses the real pinned-schema builder on Node, closes its writer,
asserts both companions are absent, and calls the **public `bunRuntime`** through
`readBuilt`. It is red on the default macOS runtime with `Stats store build
failed.` The reduced native query fails with `SQLITE_CANTOPEN` (14).

The inactive test is neither skipped nor replaced with a permanently retained
writer. Its main-file byte assertion runs even when the public build fails.
The live case also checks main and WAL bytes, write rejection, and failure to
create a missing source. SHM bytes are intentionally not required to remain
unchanged: native SQLite coordination is not message projection or a checkpoint.

## Differential evidence

Each readonly-form test received a freshly produced, checkpointed source with no
`-wal` or `-shm`. Directory mode was 0700, main-file mode 0644; native `access`
checks confirmed directory write and main-file read permission. The main-file
hash remained unchanged after every failed read.

| Native reader / change                                        | Read result               | Safety observation                                                   |
| ------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| Bun 1.4.2: `{ readonly:true, readwrite:false, create:false }` | `SQLITE_CANTOPEN`         | Main hash unchanged; no companions fabricated                        |
| Bun: `{ readonly:true }`                                      | Same failure              | Same main-file safety                                                |
| Bun: numeric `SQLITE_OPEN_READONLY`                           | Same failure              | Same main-file safety                                                |
| Bun: numeric readonly + URI `mode=ro`                         | Same failure              | No `immutable` or `nolock`                                           |
| Bun's `node:sqlite`, `readOnly:true`                          | Same failure              | Same library/runtime, no writable fallback                           |
| `/usr/bin/sqlite3 -readonly`                                  | Same failure (14)         | Same Apple runtime                                                   |
| Node 24.15.0 `node:sqlite`, `readOnly:true`                   | Reads the expected scalar | Writes rejected; main hash unchanged                                 |
| Bun with an already-installed upstream SQLite dylib           | Reads the expected scalar | Writes rejected; missing main file not created; main bytes unchanged |

Additional single-variable probes did not fix the default reader: connection
`locking_mode` already reported `normal`, explicitly choosing `NORMAL` did not
help, and WAL persistence file-control values 0/1 did not help. A readonly URI
attachment to an in-memory database also failed. These are diagnostic probes,
not product settings.

The default Bun/macOS and system CLI report Apple SQLite **3.51.0**, source ID:

```text
2025-06-12 13:14:41 f0ca7bba1c5e232e5d279fad6338121ab55af0c8c68c84cdfb18ba5114dcaapl
```

Node reports upstream **3.51.3**, source ID:

```text
2026-03-13 10:38:09 737ae4a34738ffa0c3ff7f9bb18df914dd1cad163f28fd6b6e114a344fe6d618
```

The installed Homebrew library reports upstream **3.53.1**. Selecting it with
`Database.setCustomSQLite` in a fresh process, before any SQLite connection,
passes the **public Bun runtime** differential: correct step start and nullable
tokens, rejected source write, unchanged main bytes, and no missing-main-file
creation. It still uses stable Effect 4 and the real Bun adapter/worker.

This establishes a native-library/build difference, not a proven upstream
3.51.0 bug: Apple's source ID and compile options differ from upstream. The
precise Apple VFS implementation defect has not been identified.

## Primary-source constraints

- [Bun 1.4.2 SQLite JS implementation](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/js/bun/sqlite.ts): `readonly` selects native `SQLITE_OPEN_READONLY`; **`create:true` replaces it with `READWRITE|CREATE`**. That apparent workaround is unsafe and is not used.
- [Bun native open](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/jsc/bindings/sqlite/JSSQLStatement.cpp): passes the selected flags to `sqlite3_open_v2`.
- [Bun SQLite build policy](https://github.com/oven-sh/bun/blob/bun-v1.4.2/scripts/build/deps/sqlite.ts): macOS dynamically loads Apple's system SQLite; Linux/Windows normally statically link upstream SQLite.
- [Bun shared lazy-library loader](https://github.com/oven-sh/bun/blob/bun-v1.4.2/src/jsc/bindings/sqlite/lazy_sqlite3.h): `bun:sqlite` and `node:sqlite` share one library per process. Custom selection must precede **either** module's first open, including opens in worker threads.
- [Bun SQLite documentation](https://github.com/oven-sh/bun/blob/bun-v1.4.2/docs/runtime/sqlite.mdx): documents system SQLite and persistent WAL on macOS, and `Database.setCustomSQLite` before creating databases.
- [SQLite WAL §5](https://sqlite.org/wal.html#read_only_databases): native readonly access is intended to work when readable companions exist **or** the containing directory permits their creation. No manual sidecar creation is required by the upstream contract.
- [SQLite changes](https://sqlite.org/changes.html): newest published upstream release observed here is **3.53.4**. The locally installed 3.53.1 library is differential evidence only, not a proposed release pin.
- [Effect 4 Bun client](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql/sqlite-bun/src/SqliteClient.ts): source configuration remains `readonly:true`, `disableWAL:true`, short busy timeout. Its native readonly constructor explicitly sets `readwrite:false`, `create:false`.

## Viable maintainer choices

1. **Ship a controlled upstream SQLite dylib for macOS.** Verified mechanism:
   choose it through Bun's supported custom-library API before the first native
   open. Keeps Bun 1.4.2, stable Effect/Drizzle, native readonly, native WAL
   coordination and source safety. Requires a release decision: pinned newest
   eligible SQLite, native arm64/x64 artifacts, provenance/licenses/checksums,
   process-wide initialization ordering, and real platform/tarball contracts.
   No production code currently searches Homebrew or silently changes libraries.
2. **Require an externally supplied upstream dylib on affected macOS hosts.**
   The same verified native mechanism, but adds an installation/configuration
   requirement beyond the current dependency-free, zero-extra-settings spec.
3. **Wait for an upstream runtime/platform solution and keep #33 blocked.**
   A Bun release that changes the macOS SQLite build/loader, or a verified Apple
   fix, must pass the inactive public contract. Merely increasing Bun's minimum
   version is not an evidenced fix while it still loads the same Apple dylib.

Moving sync to a Node process also has a working readonly reader in this
environment, but changes the Bun worker-thread/runtime requirements and is not
an in-spec fallback. Writable source opens, source journal changes/checkpoints,
`immutable`/`nolock`, manual companion fabrication and a forever-live writer are
not viable fixes under the maintainer's constraints.

## Reproduction resources

Foreground `bun run ci` on this blocker candidate passed the source gates
(130 tests, 100% per-file coverage in all four measures, formatting/lint/types,
normal and production-strict dead code, duplication, exceptions, shape and
freshness), then correctly stopped at the new inactive Bun contract: one live
case passes, one inactive case fails. Later CI phases were not reached and are
not claimed green. The diagnostic upstream-library run passes both contracts
with 12 assertions; it is not the default runtime or an approved shipped fix.

Synthetic-only diagnostic scripts remain in the supplied temporary context
directory `opencode-stats-spec-27/`:

- `debug-issue-33-readonly-wal-read.ts`: desired reduced native read/write probe,
  currently red with the default runtime.
- `debug-issue-33-wal-matrix.ts`: independent readonly forms and native readers.
- `debug-issue-33-wal-controls.ts`: connection-control differentials.
- `debug-issue-33-public-runtime-upstream.ts`: verified public-runtime success
  using the installed upstream dylib; deliberately not a product configuration.
- `debug-issue-33-upstream-selector.ts`: diagnostic-only selection before the
  real Bun contracts load. Both live and inactive public cases pass with:
  `bun test --preload <selector> ./packages/stats-store/src/runtime.bun.contract.test.ts`.

All scripts create their own synthetic temporary files and remove them. No
debug logging or source-write workaround was added to product modules.
