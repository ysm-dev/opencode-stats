# Bounded e2e concurrency and the complete CI deadline

## Baseline (2026-10-06)

Integration `eea07531f740e85dab8bdb950405e7820351a11f` passed all functional
required hosted checks in run `37432267982`, but failed the unchanged complete
attempt deadline: start 07:51:15Z, final budget check 07:56:15Z, completed
07:56:18Z. This is not a fully passing hosted run. No infrastructure retry was
used as performance evidence.

The critical path was release (14s), Intel packed job (196s), final verification
setup plus longest shard (69s), and Quality gates queue/setup/check (13s). Intel
public e2e consumed 137s: browser installation about 22s, pinned OpenCode
installation about 8s, tests about 106s. Actual test-file times:

| Intel file       | Cases | Time    |
| ---------------- | ----- | ------- |
| Preferences      | 12    | 103.86s |
| Private plugins  | 3     | 57.84s  |
| Installed smokes | 4     | 49.19s  |
| Cold source      | 1     | 26.32s  |

Other files also ran; this table identifies the expensive phases, not a reduced
suite. The pre-change root local CI passed in 288.12s (historical parent proof).
An actual 303-second start-time input to `scripts/ci-duration.ts` was rejected
with `Five-minute time budget exceeded or invalid start time` before changes.

## Measurement and falsifiable candidates

Targeted temporary timing around preference fixture acquisition measured 4.54s
total npm installation and 4.64s server readiness across the 12 local cases;
the whole preference file took approximately 25.2s under the complete suite.
The largest cost was browser assertions, not redundant npm preparation.
All profiling statements were removed before validation.

1. Two concurrent preference cases should shorten the sequential preference
   file without sharing any browser, context, home, install or server.
2. Two concurrent plugin cases should overlap independent real ten-second
   last-hold shutdowns without changing each case's waits or assertions.
3. Sharing an installed fixture would save little locally and introduce new
   ownership/cleanup state; do not add it without better evidence.

The first experiment alone shortened isolated preferences but did not shorten
complete constrained Linux e2e. This negative result motivated testing the
second candidate rather than claiming isolated speedup fixed the critical path.

## Chosen change and measured results

Vitest's existing `it.concurrent.each` runs preferences and private plugin
cases with `maxConcurrency: 2` per worker. No new scheduler, library, preparation
cache, resource reuse, workflow matrix, runner or gate is introduced. Other
cases remain sequential within their files. Existing file-worker concurrency
is unchanged. All preparation remains inside the public external deadline.

| Scenario                                      | Sequential | Preferences only | Both concurrent |
| --------------------------------------------- | ---------- | ---------------- | --------------- |
| macOS isolated preference test time           | 21.59s     | 13.28s           | —               |
| macOS isolated plugin test time               | 36.08s     | —                | 24.42s          |
| macOS complete default-worker test time       | 37.45s     | —                | 27.54s          |
| Clean Linux 2-CPU / 2-worker test time        | 66.70s     | 69.26s           | 61.52s          |
| Clean Linux 2-CPU public e2e incl preparation | 142.84s    | 144.29s          | 135.06s         |

Linux comparisons used separate archived baseline snapshots, the identical
fresh release tarball, frozen dependency installs, the same Debian ARM64 image
`opencode-stats-issue37-clean-linux`, `--cpus=2`, and `--maxWorkers=2`.
Each container began with an empty `/browsers`; public e2e installed actual OS
libraries, Chromium shell, WebKit and both pinned OpenCode executables inside
the measured deadline. Total external snapshot/install/preparation/test times
were 157.53s / 159.09s / 149.96s. All three suites passed all 28 cases.

The unmodified macOS default-worker suite passed all 28 cases before and after;
public after-change e2e took 28.36s. The isolated plugin improvement overlaps
waits rather than removing them: individual cases still took approximately
12s; concurrent file time fell by 11.66s.

## Preserved correctness and negative controls

- Every original case, assertion and timeout remains: unit/Bun 5s, e2e 30s,
  hooks/teardown 10s, every process/job/complete local/hosted attempt 300s.
- Each concurrent preference fixture still installs its own tarball, builds a
  synthetic database, launches its own dashboard process and browser, creates
  its own context/storage, and disposes its resources with `await using`.
  No test mutates process environment in the concurrent file. Both engines
  still execute cold blocked-module/blocked-copy paint, atomic frame sampling,
  cross-tab no-request propagation, denied storage, and all six viewport axe
  audits for each original palette.
- Plugin cases retain private homes/configuration/passwords and real pinned
  OpenCode versions 2.0.0 / 2.0.22 in packed/source modes. Within each case the
  two hosts must still share exactly one server; the surviving hold must keep
  it live; closing the last hold must make the actual endpoint unavailable
  naturally before cleanup. Per-case PID ownership and cleanup are unchanged.
- Original negative controls passed on macOS and clean Linux: missing browser,
  failed npm install and launch rejection must reject and leave no fixture
  directory/server; forbidden release imports/bin dependencies must fail;
  unauthorized lifecycle hold/stop requests must not terminate the server;
  real WAL/source read-only checks and deliberately cold source loading remain.
- Verification remains last, exhaustive and isolated, with the existing 16
  hosted names/selectors/ownership/planted controls unchanged.

## Final acceptance evidence

`501fa93` was reconciled with the latest integration `eea0753` before final
checks (`git merge --no-edit integration/opencode-stats-v1`: already up to
date). One actual public `bun run ci` passed, exit 0, **278.04s**, leaving
21.96s under the external 300s preparation-inclusive aggregate deadline.
It passed all source gates, 632 ordinary tests with 100% coverage in all four
measures per file, eight real Bun contracts, release, all 28 e2e cases, and
all 16 isolated verification shards last. This is candidate local proof,
not a new root-integration or physical hosted result.

Original meaningful negative controls were exercised, not just counted:

| Control, retained unchanged                               | Final macOS | Clean 2-CPU Linux |
| --------------------------------------------------------- | ----------- | ----------------- |
| Missing browser rejects and removes owned fixture         | 2.715s      | 2.457s            |
| Failed npm install rejects and removes owned fixture      | 2.469s      | 0.677s            |
| Browser launch rejection stops server/removes directory   | 1.652s      | 1.065s            |
| Forbidden bundle imports/bin dependencies rejected        | 0.716s      | 0.240s            |
| Unauthorized holds/stops refused; real last-hold shutdown | 12.338s     | 11.125s           |

Full local verification additionally passed the aggregate deadline/fail-closed
control (1.6s), public e2e preparation omission rejection (0.2s), and shared
e2e preparation/test deadline control (1.8s), along with every other existing
gate family and both extensions. Production elevated-signalling/cleanup code
is byte-unchanged from `eea0753`; its parent's real Linux privileged recovery
proof remains applicable, rather than relabeling macOS controls as sudo proof.

An external assertion over the measured public plugin runs rejects the original
sequential result with `Independent shutdown waits did not genuinely overlap`
(exit 1). It accepts the concurrent run (exit 0): wall 24,420ms versus case
times 12,092 / 12,404 / 12,170ms. It also demands all three original version/mode
cases and at least ten seconds per case. This distinguishes genuine overlap
from a faster machine or shortened shutdown. It is diagnostic evidence, not a
new CI threshold or gate.

The aggregate's fresh tarball and Linux differential tarball have identical
SHA256 `9ecf70f2e910a6646944d941d9181bb914eb2436b4f64575732e29add4e8798d`.
No owned validation container or worktree process remains; unrelated containers
were left untouched. No matrix/context changes, dependency changes, waivers,
ticket changes or pushes were made.

## Artifacts

External evidence under the approved temporary OpenCode directory:

- `combined-final-ci-hosted-timings.json`, `combined-final-ci-deadline-failure.log`
  (historical hosted baseline), `ci-critical-path-hosted-intel.log` (full job).
- `ci-critical-path-baseline-profile.log` (temporary phase profile, all 28).
- `ci-critical-path-{preferences,plugin}-{sequential,concurrent}.log`.
- `ci-critical-path-linux-{sequential,concurrent,both}.log`; each names its
  snapshot's complete `run.log`. The `concurrent` experiment means preferences
  only; `both` is the final candidate. An initial discarded harness attempt
  failed because the minimal image has no `/usr/bin/time`; it is not test proof.
- `ci-critical-path-final-macos-e2e.log`.
- `ci-critical-path-final-ci.log` (complete actual 278.04s aggregate).
- `ci-critical-path-overlap.ts`, `ci-critical-path-overlap-{red,green}.log`
  (assertions against the measured original/final public plugin runs).
- `ci-critical-path-linux.ts` (external archived differential harness; containers
  removed on completion/failure).

No physical hosted improvement or guaranteed queue-time headroom is claimed
until the parent runs the final candidate on GitHub Actions.
