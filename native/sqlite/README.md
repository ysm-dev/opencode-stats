# Controlled macOS SQLite

ADR 0017 approves one universal Mach-O library containing **arm64 and x86_64**
slices in the single dependency-free tarball. Source package exports stay
TypeScript. Only `scripts/release.ts` bundles JavaScript.

## Pin and provenance

`manifest.json` is the authoritative pin: SQLite **3.53.4**, released
**2026-07-24**, was the newest release on the official
[download page](https://sqlite.org/download.html) on 2026-10-04 and was older than
the three-day minimum. The page's scripted CSV publishes the source archive's
SHA3-256. The [release log](https://sqlite.org/releaselog/3_53_4.html) publishes
the source ID and `sqlite3.c` SHA3-256. Both are checked by the root builder.
Archive SHA-256, build compiler/SDK, flags, deployment target, signed slice
checksums and complete library checksum are recorded too.

`bun run native:build` is a maintainer/contributor operation on macOS with
Xcode command-line tools: download and verify the unmodified amalgamation,
compile both architectures, combine with `lipo`, and sign ad hoc. Source paths
are prefix-mapped out of the binary. The shipped library depends only on
`/usr/lib/libSystem.B.dylib`, not Homebrew or other external packages. Its notice
records SQLite's public-domain dedication and source blessing.

`bun run native:prepare` verifies the committed whole-file and architecture
slice hashes, then prepares `.dev/native/sqlite/` for source development and
contracts. It never downloads or compiles. The release calls the same root tool
with the package's `native/sqlite/` destination. Installed users need neither
preparation, a compiler, an install hook nor an external library setting.

## Updates and lifting

Updates are manual, newest eligible upstream release only (at least three days
old). Inspect the official download/release metadata, replace the pin and its
source checksums, run the root builder, review the source/build provenance and
native dependencies, then run source gates, both architecture contracts,
installed/embedded-Bun tests and gate canaries. Commit source/build metadata and
the controlled binary together under CODEOWNERS. Never silently use Homebrew,
an environment override or a runtime download.

Lift bundling only after a maintainer decision and a verified default-runtime
solution passes the same inactive companion-free WAL, live WAL, write-rejection,
missing-file and source-byte contracts across supported macOS architectures.
Increasing Bun's version alone is not evidence while it loads Apple's dylib.

## Execution and CI evidence

The universal artifact was executed locally with Bun 1.4.2 on arm64 and with the
official checksum-verified x64 Bun 1.4.2 under Rosetta. Both live/inactive public
contracts and installed tarball cases pass. OpenCode 2.0.21's embedded Bun 1.4.2
also executes the installed server/worker via `BUN_BE_BUN=1` in both architectures.
The test runtime pin is the newest eligible executable when selected; the
younger 2.0.22 schema fixture remains a separate source-schema provenance pin.
`OPENCODE_TEST_ARCH` controls only diagnostic/test executable preparation, never
the product's native-library path or selection.

CI packages one complete tarball on Linux, transports that identical artifact,
and runs source contracts plus installed/embedded tests on `macos-latest`
(arm64) and `macos-15-intel` (x64); Linux blocks and Windows reports as before.
Hosted runs of this change are not claimed executed by local verification.
