# Intel watchdog cleanup diagnostic follow-up

## Status: physical Intel cause unproven

Hosted run **37438191578**, job **112185232358**, fails before e2e in the
public `bun run scripts/testing/time-budgets.ts` command. The command fixture
expects a deadline rejection, but receives `Command cleanup failed:
AggregateError: Owned process cleanup failed`. The log has no nested exception.
The native e2e concurrency change did not modify this watchdog. Neither a
regression source nor an inventory-performance cause has been established.

The exact public command passes locally on ARM64 (**7.46s** before changes).
Its original command/Vitest/coordinator worker and detached-descendant checks
also pass under translated Bun 1.4.2 x64 and two bounded, owned CPU siblings.
Translation and contention are supporting evidence, **not physical Intel proof**.
There is no justified behavioral/performance fix for the hosted symptom. The
next physical failure must supply the new phase/cause evidence below; no timer,
expectation, inventory algorithm or signalling authority is relaxed.

## Minimal diagnostic and failure-preservation change

`scripts/process-tree.ts` reports only owned numeric PIDs, fixed phase names,
elapsed/remaining milliseconds, inventory milliseconds/status, signal/helper
milliseconds/status and allowlisted native error codes. It does not print process
arguments, inventory contents, environment values, stderr or arbitrary exception
messages. Original exceptions remain accessible through `cause` and aggregate
members; safe nested summaries survive callers' existing `String(error)`.

An inventory failure followed by a termination/recovery failure formerly lost
the first exception through the `finally` throw. Both failures now propagate,
with the original inventory exception retained as the primary cause. Cleanup
failure remains `Command cleanup failed`, **not** an accepted deadline rejection.
The original watchdog fixture's `/exceeded its time budget/` check is unchanged.

Failure evidence distinguishes:

- Slow inventory: `phase=inventory`, `inventoryMs`, inventory exit status and
  `code=ETIMEDOUT`, or `deadline=exhausted` before another inventory can launch.
  Parent summaries retain their successful inventory cost too.
- Signal/helper failure: stop/termination phase, signal name, helper duration,
  helper exit status and native code, including both KILL and CONT failures.
- Process exit races: the established native `ESRCH` and elevated-helper
  gone-after-failure paths remain unchanged; their genuine exit still succeeds.

## RED → GREEN at the agreed process boundaries

The public watchdog diagnostic control injects a bounded inventory timeout into
one recorded owned worker. It demands safe phase/timing/code output, the original
native `ETIMEDOUT` cause, no stderr sentinel, no false deadline acceptance, owned
worker exit and unrelated control survival. A root-inventory fault deliberately
has no unobserved child: ownership safety cannot promise discovery when the very
first inventory fails. The original detached-descendant cases remain intact.

The final public diagnostic seam is RED against unchanged `469eabc` process-tree
source in an owned temporary snapshot: no phase/timing information. The initial
nested timeout control also captured the exact opaque aggregate shape from the
hosted log. The corrected public command is GREEN. Translated x64 is **9.31s**;
the bounded two-CPU-sibling probe is **8.31s**, with both unrelated synthetic
siblings alive before their own final cleanup.

The real non-root Linux/root sudo PTY ten-control suite is RED on unchanged
baseline source: its combined inventory/KILL timeout fails the original-inventory
cause assertion. Corrected source is GREEN: the primary native syscall remains
`spawnSync ps` even after the KILL helper times out, and both safe phase summaries
are present. All ten original controls retain actual signal markers, sibling
cleanup, denied-signal/resume checks, unrelated user/root survivors and initial
root-target refusal. Successful termination is required before rescue except in
the established intentionally denied/KILL-timeout controls. Those controls prove
resumption and explicit failure, then rescue only recorded owned PIDs; they are
not termination proof for the deliberately withheld leaf.

The retained original uncertain-STOP probe passes (**1119ms**, owned root child
absent before rescue). Four Linux public preparation phases pass (**535/516/519/
513ms**). Native public watchdog/preparation/aggregate/verification-cleanup/shard
controls pass together in **13.97s**.

All containers use the cached audit image, Docker init, network disabled, UID
1000, read-only owned source and external 9–20s bounds with 2s kill grace. Local
probes have explicit 8–60s outer bounds. Fixture finally paths restore PATH,
rescue only their recorded owned fixtures, stop their own unrelated controls and
remove their own temporary directories. No broad kill or broad sudo is added.

## Preserved policy and evidence

Exactly one complete public `bun run ci` attempt hit the unchanged outer deadline
at **300.14s** (external exit 124). Source gates passed **632 tests / 100% per-file
coverage**, formatting, lint/types, budgets, both dead-code modes, duplication,
exceptions, shape and freshness. **Eight Bun contracts**, release and **all 28
e2e cases** passed; e2e took **27.32s**. Verification ran last: **1–15/16**
reported pass, including the public watchdog control (**9.1s**). Shard 16 was
interrupted during its synthetic dependency-hold controls. This is an aggregate
budget blocker, **not full-CI green** and not the hosted Intel cleanup symptom.
No aggregate retry, time-budget increase or unrelated optimization was made.

The one remaining owned snapshot was identified by this new report and matching
candidate source bytes. A first isolated invocation incorrectly reused its two
interrupted planted manifest/hold files and failed freshness; it is not a valid
clean-seed result. Restoring only those proven-owned synthetic fixtures made
every tracked source file byte-identical to the candidate. The independent public
**16/16** invocation then passed in **29.79s**, under its own unchanged 300s cap.
This completes independent shard evidence, not an aggregate-green claim. The
exact owned snapshot was removed after verifying no remaining process used its
working directory; other sessions' snapshots were preserved.

One shared 1000ms cleanup deadline still ends STOP/inventory at 600ms, KILL at
800ms and CONT at 1000ms. STOP remains protected, including uncertain helper
completion. Linux elevation remains exact-discovered-descendant-only; initial
targets and process groups never acquire it. All 300s aggregate/stage/job/full
hosted caps, 5s unit/Bun, 30s e2e and 10s hooks remain unchanged, as do native
concurrency two, all 28 e2e cases, 16 verification shards last and retired
mutation-testing policy. No Linux WebKit files are changed.

Evidence under the approved temporary `opencode/` directory:

- `ci-concurrency-hosted-failures.log`, lines 1450–1492 (physical symptom).
- `intel-watchdog-diagnostics-red.log` (initial nested opaque aggregate).
- `intel-watchdog-final-seam-red.log` (final public seam, unchanged source).
- `intel-watchdog-original-cause-{red,green}.log` (actual Linux cause differential).
- `intel-watchdog-original-freeze-green.log` (retained uncertain-STOP probe).
- `intel-watchdog-translated-x64-final.log` and `intel-watchdog-owned-contention.log`.
- `intel-watchdog-affected-public.log` and `intel-watchdog-linux-prep.log`.
- `intel-watchdog-full-ci.log` (one aggregate deadline failure).
- `intel-watchdog-isolated-shard16-clean.log` (independent clean-seed last shard).

An early translated probe's extra injected nested fixture timed out its first
inventory, before child discovery. Its finally path rescued that recorded child;
this is not a hosted reproduction or green termination proof. The final fault
control above avoids creating an undiscoverable child. Two Linux attempts hit a
stale/truncated bind-mounted source parse while files were being formatted;
source read/import verification separated that tooling issue before the final
ten-control GREEN. No source timer was changed and no flaky test was retried
until green.
