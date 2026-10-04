# Stats store

`stayInSync(options, runtime, announce)` builds once at startup, announces the
committed copy, and returns `read()`. Reads contain UTC step starts and five
independently nullable token kinds, not totals or message content. Following
source writes belongs to #35.

- The server and its worker select `./bun`; Node tests select `./node` or
  `./testing`'s `inThreadRuntime`. The package root loads no Bun built-ins.
- Source connections use native readonly, disableWAL and a 20 ms busy timeout.
  A fully consumed scalar SELECT has no explicit read transaction. Busy reads
  back off for 20, 40 and 80 ms before stopping this startup build.
  ADR 0017 selects the controlled universal macOS SQLite library before any
  native client opens, including `node:sqlite` and the sync worker. The library
  is prepared by root tooling in source and shipped in the tarball; no setting,
  Homebrew lookup, install hook or runtime download is used. Both live and
  companion-free inactive WAL sources pass the same unsuppressed contracts.
  [Native provenance and update policy](../../native/sqlite/README.md) records
  the verified source, arm64/x64 build, hashes and notice. Linux/Windows retain
  Bun's native library; Node tests retain their Node adapter.
- The resolved source path names a SHA-256 SQLite file under
  `${XDG_CACHE_HOME:-~/.cache}/opencode-stats/`. The directory is 0700; the
  database and existing WAL/SHM files are 0600. Only the derived store enables
  WAL and `synchronous=NORMAL`. Another store version or a corrupt file rebuilds.
- `bun run generate` commits Drizzle Kit's create statements. Runtime code
  executes statements individually and never loads Kit or runs migrations.
- `fingerprints.json` pins generated statements plus the fixed synthetic
  fixture's counted facts. Counting/layout changes must change the stats-store
  version, not replace its old fingerprint.

The four declaration-only Drizzle substitutions are pinned in
`patches/drizzle-orm@1.0.0-rc.5-5935859.patch`. Both drivers' transaction probes
infer success and error channels and assert nullable selected fields. The type
test verifies all four stable import paths and compiles a private deliberately
widened driver copy to prove the not-any guard rejects it; it never modifies the
installed dependencies shared by other worktrees.

## Synthetic OpenCode databases

`./testing` creates actual temporary databases, projects synthetic sessions and
messages atomically with `event_sequence`, and supplies the in-thread worker.
`bun run dev` provisions `.dev/synthetic-opencode-v1.db` with this builder. Pass
`--db <path>` to develop against an explicitly chosen existing file, readonly.

`src/source-schema/2.0.22.json` preserves the complete public OpenCode bootstrap
(35 statements) and all 48 migration IDs, **not** our production reader's partial
definitions. It comes from OpenCode's MIT-licensed source at
[`d259ae716379a67bcc35943ba75590f1fc7a1b26`](https://github.com/anomalyco/opencode/tree/d259ae716379a67bcc35943ba75590f1fc7a1b26),
`packages/core/src/database/{schema,migration}.gen.ts`; statements are whitespace
normalized. The schema/journal match published `@opencode/core` 2.0.22. This is
fixture provenance, not the future supported-schema allowlist. No real database
or private data is used.
