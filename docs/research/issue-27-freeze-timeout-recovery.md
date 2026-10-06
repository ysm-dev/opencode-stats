# Freeze-timeout recovery follow-up (#27 / #37)

## Cause and correction

The merger's retained real-Linux probe reproduced on the preserved `ee2c2a0`
baseline: a real sudo helper successfully froze its exact owned root descendant,
then timed out. STOP occurred outside the protected termination path, leaving the
child in `Tl` after **1528ms**. A second control independently exhausted inventory
while the privileged child was stopped; neither KILL nor CONT could launch using
the expired deadline. Immediate permission-denial tests did not cover either
uncertain completion or actual budget exhaustion.

`bc587d2` puts STOP acquisition inside the protected path. An owned descendant
still receives termination/recovery when STOP's completion is uncertain. The
initial target cannot acquire elevated authority through that path. One shared
absolute deadline still limits the entire tree to **1000ms**: STOP/inventory uses
the first **600ms**, KILL can use through **800ms**, and CONT can use through
**1000ms**. No phase, node or recovery renews that deadline. Ordinary siblings
continue cleanup even after a privileged descendant fails, and failure still
propagates through `runTimed` with captured pipes closed and interrupt listeners
removed.

## Process-boundary proof

Disposable Debian ARM64 Linux, UID 1000, cached tooling image
`opencode-stats-merger-cleanup-audit`, network disabled, Docker init, real
`/usr/bin/sudo`, root Bun fixtures, and native `script` PTYs. Fixtures signal only
their exact recorded owned positive PIDs. Every existing unrelated user/root
survivor assertion and the initial-target EPERM control remain intact.

The retained original reproducer's only changed success assertion requires exit
or zombie state before its finally-rescue. It now passes in **1163ms**, with the
owned root child absent from `ps`. The original fixture/setup and post-success
STOP-helper delay are unchanged. The new committed regressions also fail against
the preserved baseline: STOP timeout strands a frozen child; inventory timeout
strands a frozen process/monitor; the KILL-timeout control proves the baseline
cannot even launch the recovery helper after exhausted inventory.

| Control                                       | Elapsed | Result before fixture rescue                                                                   |
| --------------------------------------------- | ------: | ---------------------------------------------------------------------------------------------- |
| Root sudo PTY monitor and detached root leaf  |   590ms | Owned descendants/monitor exited                                                               |
| Expiry without PTY                            |   575ms | Owned descendants exited                                                                       |
| AbortSignal                                   |   552ms | Interrupted; owned descendants exited                                                          |
| SIGINT                                        |   563ms | Interrupted; owned descendants exited                                                          |
| SIGTERM                                       |   550ms | Interrupted; owned descendants exited                                                          |
| Elevated signals denied                       |   587ms | Explicit failure; ordinary sibling exited; no frozen owned process                             |
| Kill denied after freeze, with PTY            |   612ms | Explicit failure; no frozen process/monitor                                                    |
| Post-success privileged STOP-helper timeout   |  1150ms | Explicit failure; owned descendants exited                                                     |
| Frozen privileged inventory timeout, with PTY |  1163ms | Explicit failure; owned descendants/monitor exited                                             |
| Inventory then KILL-helper timeout, with PTY  |  1412ms | Explicit failure; actual KILL launch and successful privileged CONT; no frozen process/monitor |

The last control intentionally withholds its exact leaf's KILL, verifies a real
successful CONT within the remaining shared budget, and then rescues only its
recorded owned fixture PIDs. Denial controls retain the same explicit rescue
policy. STOP and inventory timeout controls require exit **before any rescue**;
rescue cannot turn their failed cleanup into a pass. Marker assertions prove the
fault follows a successful real privileged STOP, that inventory stalls while
frozen, and (for KILL timeout) that both recovery helpers actually launch and CONT
succeeds. Captured output is active in every control; listener counts must return
to their original values.

Full ordinary Linux regression command (read-only checkout):

```sh
docker run --rm --init --network=none --user node \
  --name opencode-stats-recovery-controls \
  --mount type=bind,src="$CANDIDATE",dst=/candidate,readonly \
  --workdir /candidate opencode-stats-merger-cleanup-audit \
  timeout --kill-after=2 12 bun scripts/testing/privileged-cleanup.ts
```

The original differential uses the retained stdin-fed reproducer under an
external **9s** bound plus **2s** kill grace. The new complete ten-control run has
an external **12s** bound plus **2s** kill grace; individual baseline inventory
and KILL controls also used **9s** plus **2s**. Each context was removed after its
exact-PID rescue and assertions. No audit container remains.

## Acceptance evidence

The one new complete public `bun run ci` attempt on `bc587d2` passed in
**296.52s**, measured by `/usr/bin/time -p` around an external GNU
`gtimeout --kill-after=2s 300s`. It includes public preparation, **632 source
tests / 100% per-file coverage**, **eight Bun contracts**, release, **28 e2e
tests**, and **all 16 verification shards**, with verification last. The public
four-phase preparation deadline canary took **1.9s** and omitted-preparation
rejection **0.2s**. There were no aggregate failures or retries in this session.
The unchanged aggregate deadline left only **3.48s** margin. This is local
macOS aggregate proof plus separate real-Linux process-boundary proof, not a new
hosted workflow or root integration aggregate claim.

Integration `18184f0` was confirmed as an ancestor of the preserved seed and
the corrected candidate. Merging latest integration reported already up to date;
integration remained `18184f0` after CI. The later documentation-only commit
records this exact tested source tree; formatting is checked separately afterward.

Logs and retained differential artifacts under the approved temporary
`opencode/` directory:

- `merger-cleanup-freeze-timeout.ts` and its original blocker log (unchanged).
- `merger-cleanup-freeze-timeout-green.ts` (same fixture, exit-before-rescue assertion).
- `verification-freeze-recovery-original-green.log`.
- `verification-freeze-recovery-inventory-red.log`.
- `verification-freeze-recovery-kill-red.log`.
- `verification-freeze-recovery-privileged-green.log`.
- `verification-freeze-recovery-ci.log`.

The deterministic four-phase public e2e preparation fixtures and omitted-prep
rejection are unchanged. Source/product features, readonly behavior, native
preferences, all coverage requirements and eight runtime contracts are unchanged.
The 300s public/job/full-attempt, 5s unit/Bun, 30s e2e and 10s hooks/teardown limits
are unchanged. Mutation tooling remains retired; no waiver, broad signalling
authority, dependency update, push, issue closure, ruleset edit or integration
merge was added.
