# Linux private-plugin cleanup diagnosis (#37)

The three Linux plugin timeouts were cleanup failures, not failed OpenCode
activation or a missing browser. `stopProcess()` sent SIGTERM and busy-polled
`kill(pid, 0)` indefinitely. An exited detached dashboard server, adopted by a
non-reaping container PID 1, remains a zombie: `kill(pid, 0)` succeeds forever.

## Differential evidence

All comparisons used the same Debian 12 ARM64 image
`sha256:4df6c8f937e1f4d109191dc740cdcac907247c37d365c9c360e7e741c7d584c2`,
Docker's 8 CPUs / 8,393,605,120 bytes, Node 24.21.0 and Bun 1.4.2. Each used
an archived commit, frozen dependencies and private OpenCode 2.0.0/2.0.22
executables verified as ARM64 / embedded Bun 1.4.2. No container init shim was
added. All homes, databases, configuration, passwords and processes were synthetic
and owned; containers were removed on success and failure.

| Scenario                                                          | Result                                                  | Phase evidence                                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `f05fc71`, public e2e narrowed to the three plugin cases          | 3/3 hit 30s; 172.65s including preparation              | First activation/copy finished within 2.1s; both hosts exited within 2.7s; last-hold endpoint shutdown by 12.8s; then cleanup stalled                        |
| Integration `4a37d0b`, rebuilt baseline release, same three cases | 3/3 hit 30s; 104.07s including preparation/release      | Copy served by 1.5s, last-hold shutdown by 12.1s, then cleanup stalled; source server already `Z`, PPID 1                                                    |
| `f05fc71`, complete concurrent public e2e                         | 25/28 pass; 155.37s including preparation               | First case's copy served at 2.656s, both hosts exited at 4.138s, last-hold shutdown at 14.307s; all three owned server PIDs were `Z`, PPID 1, during cleanup |
| `d328cb7`, complete public e2e, no diagnostic instrumentation     | 28/28 pass; 129.72s including preparation, 59.08s tests | Plugin cases 15.824s / 13.049s / 11.683s                                                                                                                     |
| Combined inverse-palette companion and cleanup fix, `f7a69d1`     | 28/28 pass; 120.43s including preparation, 56.87s tests | All browsers, preference/paint/axe cases, cleanup cases, plugin versions/modes, smokes, lifecycle, cold source, native and notices retained                  |

The candidate broad run sampled each owned `/proc/<pid>/stat` at cleanup entry
and one second later. Packed latest/source changed from `S`/`R` to `Z`; minimum
packed was already `Z`. Contention increased startup time but did not explain
the infinite cleanup wait. A missing executable, authentication failure, hold
failure, wrong architecture or delayed ten-second product shutdown predicts an
earlier failing phase; those phases succeeded in the reproductions.

One discarded baseline probe used `ps`, absent from the minimal image. Its
instrumentation threw inside the old blanket cleanup catch, accidentally bypassing
termination and producing an `ENOTEMPTY` teardown failure. It is **not** baseline
or green evidence. The corrected baseline probe read only owned `/proc` records;
its three original timeouts are the baseline evidence above.

## Fix and regression

The shared testing helper now distinguishes a Linux zombie from a running
process, yields 10ms between polls, permits one second for SIGTERM, then escalates
the **owned fixture PID** to SIGKILL with one further second for exit. Already
reaped processes and exit/signal races are accepted; other cleanup errors propagate.
This changes no product idle/shutdown semantics or production source.

Three ordinary launcher tests cover an orphaned detached process, an orphan
ignoring SIGTERM and an already reaped process. In the same non-reaping Linux
container, the old helper fails all three (two unchanged 5s timeouts and ESRCH);
the corrected helper passes all three in 1.54s. The orphan test drives the actual
process boundary, not a mocked PID check. On a reaping host, the same test remains
enabled and exercises ordinary process termination.

Plugin e2e now registers its home and each host with `AsyncDisposableStack` as
soon as acquired, looks up an owned server record even after an earlier failure,
and does not swallow cleanup errors. Installation and all test actions remain
inside the unchanged 30s test clock. The natural last-hold shutdown assertion
still precedes disposal and retains its 15s wait for the product's roughly 10s
shutdown. Nothing moves into hooks or outside preparation-inclusive deadlines.

## Combined acceptance status

At `f7a69d1` (includes finalized inverse correction `524c7f5` and integration
`4a37d0b`), public `bun run ci` passed ordinary gates, 615 source tests with
100% in all four measures per file, eight Bun contracts, a fresh release and
all 28 macOS ARM64 e2e cases. It then **failed** verification shard 1/16:
`stats-store/src/runtime.bun.test.ts:46` exceeded its unchanged 5s cap; 614
other verification-source tests passed. This is the independently owned #35
blocker, not full aggregate/hosted green. No #35 file, limit, waiver, dependency
or gate was changed. No hosted run or push was attempted.

The final combined Linux run used the fresh aggregate-built tarball, SHA256
`9ecf70f2e910a6646944d941d9181bb914eb2436b4f64575732e29add4e8798d`, with an
empty `/browsers` cache and real Linux libraries installed by public `bun run e2e`
inside the external preparation-inclusive 300s deadline.

## Reproduction artifacts

External diagnostic scripts/logs are retained under the approved temporary
directory `/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode/`:

- `issue37-linux-plugin-loop.ts`: archived public-e2e loop with phase probes for
  original/baseline revisions; `green` runs the archived suite without probes.
  From this worktree, `bun <directory>/issue37-linux-plugin-loop.ts f05fc71 all`
  reproduces the original broad failure; `bun <directory>/issue37-linux-plugin-loop.ts
f7a69d1 green` checks the final candidate using its already built `.release`.
- `issue37-cleanup-check.ts red` / `green`: bounded differential regression using
  the original helper or current helper, after a frozen install in the same image.
- `issue37-plugin-loop-KLIIPz/run.log`: isolated candidate red.
- `issue37-plugin-loop-dDXgSt/run.log`: valid rebuilt integration baseline red.
- `issue37-plugin-loop-m4tcpX/run.log`: broad red and owned process-state probes.
- `issue37-plugin-loop-pIwxWW/run.log`: first uninstrumented broad green.
- `issue37-plugin-loop-goAr7n/run.log`: final combined broad Linux green.
- `opencode-stats-setup/issue37-linux-plugin-combined-ci.log`: combined public
  aggregate and exact remaining #35 failure.

The committed source contains no temporary diagnostic probes. No retries-until-green,
skipped cases/platforms, shortened idle semantics or relaxed clocks were used.
