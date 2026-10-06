# Preparation deadlines and privileged cleanup (#27 / #37)

## Cause

Hosted run `37420040421` reached the newly added Playwright browser/library
installation before the old 500ms e2e canary's stalled OpenCode preparation.
Consequently the canary ran real apt work instead of its intended fixture.
Recursive cleanup stopped an owned sudo ancestor, then threw `EPERM` while
stopping a root descendant. The exception escaped the timer callback; elevated
work retained output pipes and continued beyond expiry. The canary took about
49s, post-job cleanup added about 34s, and the unchanged full-attempt check
correctly rejected the 313s attempt.

## Fix

- The public e2e regression uses an isolated workspace containing the real
  `scripts/e2e.ts` and public package command. Fixture workspace commands control
  OS, browser, OpenCode and test workloads. Each phase blocks independently under
  the same externally injected 500ms deadline, creates a detached child, and must
  terminate promptly. Browser arguments still require Chromium, WebKit and Linux
  `--with-deps`; a planted omitted-preparation control must fail. No production
  bypass flag, download, apt invocation or user configuration is involved.
- Cleanup still freezes parents before discovering children and kills children
  first, preserving ancestry through sudo monitors and detached sessions. Only
  Linux descendants discovered beneath an owned frozen parent can recover from
  `EPERM` using noninteractive `sudo /bin/kill` against that exact positive PID.
  The initial PID cannot elevate; process groups and unrelated processes are not
  targets. Inventory and elevated signalling share a one-second cleanup budget.
- Partial failures do not skip ordinary siblings. A failed kill attempts to
  resume the stopped process/monitor and propagates an error. `runTimed` handles
  cleanup failure through its awaited promise, closes captured pipes and removes
  interrupt listeners rather than throwing from a timer and hanging on `close`.
  This applies to expiry, AbortSignal, SIGINT and SIGTERM.

Privileged cleanup requires authorization for the noninteractive signal command.
If permission is denied, it reports failure, not successful cleanup. Denial
fixtures explicitly rescue only their recorded owned PIDs using their disposable
context's authorized supervisor; successful-path assertions precede any rescue.

## Real Linux regression

Debian 12 ARM64, Bun 1.4.2, Node 24.21.0; test actor UID 1000. Disposable,
network-disabled containers use Docker init and a fixture-only passwordless-sudo
account. A native `script` PTY reaches a real sudo monitor with UID 0. Root
fixtures ignore TERM, HUP and output-pipe errors, so closing pipes cannot fake
their termination. Process state, including zombie detection, proves exit;
`kill(pid, 0)` alone would incorrectly hide live root children behind `EPERM`.

The baseline `fd7dda3` process-tree helper leaves three recorded owned processes
alive after the PTY deadline. The corrected helper passes all seven controls:

| Control                                       | Elapsed | Required result                                      |
| --------------------------------------------- | ------: | ---------------------------------------------------- |
| Root sudo PTY monitor and detached root leaf  |   561ms | Owned descendants and monitor terminate              |
| Expiry without PTY                            |   573ms | Owned descendants terminate                          |
| AbortSignal                                   |   549ms | Interrupted; owned descendants terminate             |
| SIGINT                                        |   561ms | Interrupted; owned descendants terminate             |
| SIGTERM                                       |   573ms | Interrupted; owned descendants terminate             |
| Elevated signals denied                       |   575ms | Explicit failure; ordinary sibling stopped           |
| Kill denied after privileged freeze, with PTY |   622ms | Explicit failure; no stranded frozen process/monitor |

Every control preserves both unrelated user and root processes. The initial-PID
control also refuses elevation against the unrelated root process. Linux gate
verification invokes this regression from `scripts/testing/time-budgets.ts`;
it requires a non-root runner with passwordless sudo, as provided by hosted CI.

## Timing and acceptance evidence

Cold public Linux fixture phases took OS **528ms**, browser **519ms**, OpenCode
**520ms**, and tests **527ms**. The complete changed public verification canary
took **1.8s** on macOS, versus the hosted accidental installation's approximately
49s. The omitted-preparation control was rejected in **0.2s**. Removing apt from
the canary removes that observed installation/cleanup waste; the real elevated
cleanup regression independently prevents hiding the underlying permission bug.
No new hosted end-to-end timing is claimed.

Before the subsequently integrated #35 harness change, public verification 16/16
passed in **35.41s**. Verification 1/16 reached and passed the omitted-preparation
control, then failed the unrelated native-runtime 5s test (**31.03s** total).
The preparation-inclusive local aggregate passed 615 source tests with per-file
100% coverage, eight Bun contracts, release and all 28 e2e tests, then failed the
same native test in verification 2/16 (**109.76s** total). An earlier aggregate
failed that native test in ordinary source testing (**27.18s**, 614/615 passed).
These are not full-green claims.

After reconciling integration `18184f0` (including the independently owned #35
bounded harness), candidate `8fc0b24` passed the complete public `bun run ci` in
**297.49s**: **632 source tests / 100% per-file coverage**, eight Bun contracts,
release, **28 e2e tests**, and **all 16 verification shards**, with verification
last. The preparation canary took **1.9s** under parallel verification; ordinary
time-budget/descendant controls took **7.7s**. The unchanged aggregate limit left
only **2.51s** margin. This is local evidence for this reconciled candidate, not a
claim that the former native blocker is fixed on every platform or that a new
hosted workflow passes its end-to-end deadline. No unchanged aggregate was
retried until green; each aggregate attempt reconciled a different integration
baseline.

All 16 verification partitions and ordinary gate families remain exhaustive and
balanced. The 300s public/job/full-attempt boundaries, 5s unit/Bun, 30s e2e and
10s hooks/teardown limits remain unchanged. No mutation tooling, waiver, skipped
case, production preference/plugin change or dependency update was added.

Logs under the approved temporary `opencode/` directory:

- `verification-privileged-cleanup-pty-{red,green}.log`: real root-monitor differential.
- `verification-linux-e2e-preparation-final.log`: all four cold public phases.
- `verification-preparation-cleanup-shard{1,16}.log`: actual public verification.
- `verification-preparation-cleanup-{ci,reconciled-ci,final-ci}.log`: bounded aggregate attempts.

Earlier probes lacked `ps`, or exhausted their disposable context's 300s lifetime
while additional work was performed. Those incomplete probes are not pass evidence.
The final differential uses a prepared image and a separate 9s bound per fresh
container; its tooling preparation took 2.7s under a separate 45s bound.
