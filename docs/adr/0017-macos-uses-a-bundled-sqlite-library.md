# macOS uses a bundled SQLite library

The tested Bun 1.4.2/macOS combination loads Apple's SQLite 3.51.0 and cannot read a valid checkpointed WAL database after its writer closes and removes the WAL/SHM files, even with a writable directory. An upstream SQLite library passes the same public Bun contracts with native read-only access, rejected writes and unchanged source bytes. The maintainer chose to ship a controlled upstream library for macOS arm64 and x64 in the existing tarball, preserving one-step installation and the read-only contract (#33).

## Considered Options

- **Require an external library.** The native mechanism works, but adds installation and configuration to every affected user's setup.
- **Wait for a Bun or Apple fix.** Leaves valid inactive OpenCode databases unreadable; a version increase alone is not evidence of a fix while Bun loads the same system library.

## Consequences

- The root release pipeline includes pinned, verified upstream SQLite artifacts for both macOS architectures, with source/build provenance, checksums and the SQLite notice. Choose the newest release eligible under the dependency policy and verify it; the diagnostic Homebrew version is not the release pin.
- macOS selects the shipped library through Bun's supported API before the first SQLite open in the dashboard server process, including its worker threads and `node:sqlite`. The launcher and TUI still load no SQLite. Linux and Windows use Bun's native SQLite; Node tests use their Node adapter.
- Native source connections stay read-only with `disableWAL`. The live-writer and companion-free WAL cases, write rejection, missing-file safety and source-byte checks remain real-Bun contracts. Source journal changes, checkpoints, writable fallbacks and `immutable`/`nolock` remain outside the design.
- Root-owned tooling prepares the same controlled library for source development and tests. Workspace exports remain source; packages gain no build scripts. The installed tarball needs no compiler, extra package, install hook, external-library lookup or new user setting.
- Release checks cover the native assets and actual initialization order in the installed server and sync worker, including OpenCode's embedded Bun on macOS. ADR 0012's bundle-only contents are extended by this native library; one dependency-free tarball remains the release boundary.
