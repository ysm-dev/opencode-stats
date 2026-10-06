# #34: shortening the hosted critical path

**Policy update (2026-10-06):** Mutation testing is retired. The mutation shard
plans, required-check lists and local sequential-aggregate allowance below are
obsolete historical measurements, not instructions to restore that system.
Current CI runs only the remaining gates, with one external 300-second deadline
around the entire local aggregate and the unchanged hosted full-attempt deadline.
The cold-worker dependency-discovery evidence below remains current and intact.

The initial measurements below describe the **139-test baseline**. They are
historical evidence, not proof for the larger #39 suite. The combined-suite
reassessment later in this report supersedes the original headroom projection.

## Measured failure

Hosted run [37264585252](https://github.com/ysm-dev/opencode-stats/actions/runs/37264585252)
passed every mandatory functional gate but failed the unchanged 300-second
end-to-end budget: attempt start 04:41:02 UTC, deadline check 04:46:38, **336 s**.

Intel packing ran 04:41:31–04:44:35 (184 s). Verification then ran
04:44:37–04:46:29; its four command durations were approximately 94, 70, 96 and
81 seconds. Mutation's slowest shard finished at 04:43:39 and was not the
critical predecessor. The final Quality gates check includes all setup,
inter-job waiting and advisory jobs, as before.

Intel e2e's 76-second public command included about 26 seconds of cold embedded
OpenCode preparation and 48 seconds of Vitest. Source and live-WAL smoke tests
took 28.675 and 28.155 seconds; inactive-WAL smoke took 12.198 seconds. None of
their tests, browser assertions or preparation may be removed from the clock.

## Bounded e2e comparison

On the available arm64 Mac, every sample ran the public `bun run e2e` command
under its existing watchdog. Preparation remained inside the deadline and
verified the existing warm embedded runtime each time. Each sample passed all
six tests; installed folders, browser contexts and synthetic sources remained
isolated. These are local measurements, **not Intel or hosted proof**.

Initial comparison:

| Arrangement                            | Public command elapsed |
| -------------------------------------- | ---------------------: |
| Default                                |                 9.53 s |
| `--maxWorkers=2`                       |                 7.98 s |
| `--maxWorkers=1 --no-file-parallelism` |                13.53 s |

A preplanned default/two/two/default/default/two comparison checked the apparent
two-worker improvement rather than rerunning until green:

| Arrangement | Samples             | Median |
| ----------- | ------------------- | -----: |
| Default     | 9.24, 7.48, 7.40 s  | 7.48 s |
| Two workers | 11.55, 9.68, 9.13 s | 9.68 s |

There is no supported worker-count improvement to ship. Cold preparation stays
unchanged; no new cache, unchecked output reuse or clock boundary is introduced.

## Chosen change: sixteen verification shards

Replay the **237 actual static canaries** through the existing one-based modulo
partition using their hosted per-canary durations. Leave the freshness controls
running in every shard, as before (measured 1.7 seconds per shard). The four-shard
replay reconstructs the measured command durations, validating the model:

| Shards | Largest replayed command duration |
| ------ | --------------------------------: |
| 4      |                            96.4 s |
| 6      |                           104.5 s |
| 8      |                            70.3 s |
| 10     |                            54.4 s |
| 12     |                            56.4 s |
| 14     |                            45.9 s |
| 15     |                            44.7 s |
| **16** |                        **42.2 s** |

Sixteen is the smallest evaluated existing-modulo configuration that projects
at least 18 seconds of headroom without assuming any Intel improvement:
**336 − 96.4 + 42.2 = 281.8 seconds**. This is an estimate: extra scheduling or
setup variance still requires a fresh hosted attempt. It is not a guarantee or
a claim that hosted CI now passes.

Bounded public-command comparisons on the local arm64 Mac corroborate the
reduction: `VERIFICATION_SHARD=3/4 bun run verify-gates` took **70.84 s**, while
`VERIFICATION_SHARD=9/16 bun run verify-gates` (the new replay's slowest shard)
took **33.26 s**. Both passed their complete selected canaries and retained
freshness controls under the existing shared five-minute deadline. The
unsharded full local `bun run ci` additionally exercises every canary; the
partition assertions prove none is omitted or assigned twice by the new matrix.

The initial change touched only the matrix count, corresponding check names,
partition assertions and documentation. Verification still starts after source, all six mutation
shards, contracts and all packed jobs. Every canary, actual exclusion/waiver
intersection and killed positive control remains unchanged. All per-job,
whole-run, test/hook and end-to-end caps remain fixed.

`scripts/testing/shards.ts` checks all sixteen workflow indices and their
selector, the unique/exhaustive partition of actual canary names, all six
source partitions, the full-run behaviour and invalid selectors. Existing
`/scripts/` and workflow CODEOWNERS entries cover these checks/configuration.

The parent must replace required `Gate verification (1/4)` through `(4/4)` with
**`Gate verification (1/16)` through `Gate verification (16/16)`** before hosted
validation. Other required check names do not change. Hosted proof must include
both macOS architectures and the end-to-end Quality gates deadline; Windows
remains advisory but is still counted by that deadline.

## Combined #39 baseline: 255 tests

Integration `0ea42c52742d92f7eac04c16a287a54e4e3462a0` adds the singleton
lifecycle, logging/privacy, native lock, race and hold assertions. Its local CI
orchestrator initially still selected four verification shards. Reconciliation
changes that to sixteen, retains all six mutation shards, and tests clearing
**both** inherited selectors. A planted count-drift canary rejects a regression
to four local verification shards.

Bounded public measurements on the same available arm64 Mac, with all existing
limits and warm-but-reverified runtime preparation intact:

| Command / selected shard                  | Elapsed | Workload / outcome                                       |
| ----------------------------------------- | ------: | -------------------------------------------------------- |
| `bun run test`                            | 19.34 s | 255 tests, 100% per-file coverage                        |
| `bun run e2e`                             | 14.58 s | Nine independent source/installed/live/race/hold tests   |
| Original-order `VERIFICATION_SHARD=2/4`   | 85.02 s | Complete selected canaries and freshness controls passed |
| Original-order `VERIFICATION_SHARD=12/16` | 46.76 s | Complete selected canaries and freshness controls passed |
| Balanced `VERIFICATION_SHARD=13/16`       | 31.63 s | Complete selected canaries and freshness controls passed |

The original sixteen-shard partition clustered two full-suite coverage canaries
on some shards and none on others. Its 46.76-second local candidate is larger
than the old suite's 33.26-second candidate; the earlier 281.8-second hosted
projection therefore cannot be carried forward.

The final reconciliation keeps sixteen shards but sorts static canaries by
public command family, then stable gate name, before the existing modulo
partition. This distributes every command family with counts differing by at
most one. All sixteen `test` canaries now occupy different shards. The partition
assertion checks this balance, and a planted zero-comparator canary proves
silent clustering is rejected. All **241 static canaries**, actual
exclusions/waivers, killed positive controls and per-shard freshness controls
remain present. No lifecycle or browser assertion, timeout, cache or clock
boundary changes.

The balanced candidate is materially faster on the actual larger suite, but
the combined Intel packed-job duration and sixteen hosted verification jobs
still require a fresh hosted attempt. There is **no measured combined hosted
under-300-second result yet**. The final local aggregate runs all six mutation
and sixteen verification shards sequentially under separate 300-second
boundaries; local and hosted selectors/check names agree.

## Combined hosted mutation predecessor: twelve shards

On integration `11fafd5`, hosted run
[37272872281](https://github.com/ysm-dev/opencode-stats/actions/runs/37272872281)
exposed separate #39 behavioral defects. Its `5/6` mutation command processed
524 valid mutants (525 instrumented, including one compile error) in **280 s**
and correctly failed on a survivor. Other completed command durations were
157 s (`1/6`), 220 s (`2/6`), 144 s (`3/6`) and 98 s (`6/6`). `4/6` failed its
dry run; its short duration is **not** successful throughput evidence. These
failures must remain visible and are owned by #39, not fixed by this scheduling
change.

Rank the completed six-shard inventory by per-file instrumented counts, using
the unchanged tree's complete local mutation reports. All **1,737 instrumented
mutants**, including compile-error sources, are represented. The largest files
are launcher `record.ts` (155), launcher `join.ts` (151), browser-copy `binary.ts`
(137), launcher `hold.ts` (111) and dashboard-server `server.ts` (92).

Replay the existing sorted-source modulo selector, without changing any common
exclusion or waiver:

| Shards | Per-shard instrumented counts                                         | Largest |
| ------ | --------------------------------------------------------------------- | ------: |
| 6      | 194, 331, 506, 114, 525, 67                                           |     525 |
| 8      | 247, 24, 375, 102, 224, 106, 379, 280                                 |     379 |
| 10     | 81, 99, 665, 59, 122, 157, 76, 134, 281, 63                           |     665 |
| **12** | **100, 126, 342, 112, 207, 2, 94, 205, 164, 2, 318, 65**              | **342** |
| 16     | 156, 22, 184, 35, 82, 92, 106, 141, 91, 2, 191, 67, 142, 14, 273, 139 |     273 |

Twelve is the smallest **tested** change with a substantial reduction and a
simple retention proof: new shards `i/12` and `(i+6)/12` together equal old shard
`i/6` exactly. The Stryker source enumeration, exclusions, error-source handling,
coverage analysis, thresholds and all test/time limits remain unchanged. File
counts are planning evidence, not a claim of uniform mutant execution cost.

Bounded public-command probes on the available arm64 Mac used the same tree and
uncached mutation execution, including each dry run:

| Selector                   | Instrumented mutants | Full command elapsed | Local result                                              |
| -------------------------- | -------------------: | -------------------: | --------------------------------------------------------- |
| Old `MUTATION_SHARD=5/6`   |                  525 |             137.23 s | 100%, including three timeout kills and one compile error |
| New `MUTATION_SHARD=11/12` |                  318 |              77.15 s | 100%, including three timeout kills and one compile error |
| New `MUTATION_SHARD=3/12`  |                  342 |              58.71 s | 100%, all killed                                          |

The nested half of the known slow predecessor is 44% faster locally. This is
evidence for the scheduling change, **not** resolution of Linux-only survivors,
the five-second HTTP-hold failure, or hosted under-five-minute proof. No #39
runtime or test file is changed. No file with uncovered/error mutants is removed,
no cache/worker policy is introduced, and no clock boundary moves.

The final hosted/local plan is **twelve mutation shards and sixteen balanced
verification shards**. Partition assertions check both matrices, their selector
and check-name notation, complete disjoint source/canary sets, and each new
mutation pair's equality with its old source set. Orchestration assertions still
clear both inherited selectors, demand every shard, and stop on failure; a
planted count regression rejects silently returning local mutation to six.
Existing CODEOWNERS entries cover the modified workflow, scripts and this report.

Final combined exhaustive validation is pending #39's real fixes, followed by
the parent push and a fresh hosted attempt. That attempt must exercise all
twelve mutation and sixteen verification checks plus the unchanged end-to-end
Quality gates clock, including setup, preparation, inter-job/advisory waiting and
verification-last ordering. No green full pipeline is claimed for the known
failing hosted baseline.

Local validation of this independent scheduling change: formatting, lint,
types, budgets, orchestration/partition assertions, normal and production-strict
dead-code analysis, duplication, exceptions, shape and freshness passed. Seven
targeted controls ran through the public bounded `verify-gates` command and
passed: source/canary partitions, exhaustive isolated orchestration, omitted-last
shard rejection, mutation and verification count drift, command-family clustering
rejection, and overdue-command/process cleanup. These targeted controls are not
reported as a complete verification or mutation run.

A single source-check attempt additionally stopped on an unchanged
`packages/stats-store/src/types.test.ts` individual timeout (5.36 seconds against
the existing five-second cap): 254 tests passed and one timed out. The test was
not edited, its limit was not raised, and no rerun-until-green was performed.
That validation blocker, alongside #39's hosted survivors/hold timeout, must be
resolved or diagnosed before final combined proof is claimed.

Replace required `Mutation (1/6)` through `(6/6)` with these exact names;
verification's sixteen names below remain unchanged:

```text
Mutation (1/12)
Mutation (2/12)
Mutation (3/12)
Mutation (4/12)
Mutation (5/12)
Mutation (6/12)
Mutation (7/12)
Mutation (8/12)
Mutation (9/12)
Mutation (10/12)
Mutation (11/12)
Mutation (12/12)
```

## #35 Intel source-load failure: cold worker dependency discovery

The full failure JSON from hosted run `37334376285` identifies the first
**copy gate at 360 px**, not a missing font/style URL match. Its sequence is:

1. The initial document loads and creates the real engine worker.
2. Worker dependency `effect_http-api_HttpApiSchema.js` returns **HTTP 504** with
   the original Vite optimization hash.
3. A second document load begins with a new optimization hash. The first worker
   is gone; the replacement has not started. Effect/UI scripts and styles remain
   pending when the original ten-second gate deadline expires.

The cause is Vite's initial HTML dependency scan omitting the module worker's
HttpApi import graph. First worker use discovers those dependencies, starts a
second optimization, invalidates the old module hash and forces a full reload.
On the faster local Mac this had silently recovered before the original gate
assertion; Intel contention exposed the same restart as a missing copy request.

The fix adds the engine's **public worker export** to native Vite
`optimizeDeps.entries`, alongside `index.html`. The same cold work remains in
startup; there is no preparatory browser visit, unverified cache, fake readiness,
URL exclusion or timeout change. The healthy-browser assertion now rejects
failed script responses, including the original 504, even when Vite recovers.

The source fixture now explicitly starts with an empty **owned** Vite cache on
every run, saves/restores any prior development cache, rejects caches outside
the current worktree, checks the two source ports are free, and closes its owned
process before restoring the cache. Synthetic `.dev` data, forced colors,
workers, all six width/asset gates, axe and whole-paint assertions stay intact.

Bounded cold RED→GREEN evidence on integration `5ee4e91`, with concurrent source,
installed browser and lifecycle e2e load, using the same public `bun run e2e`
deadline and existing individual limits:

| Initial scan                 | Planned samples | Public command elapsed | Result                                             |
| ---------------------------- | --------------- | ---------------------- | -------------------------------------------------- |
| HTML only (old)              | 3               | 14.82, 14.71, 14.86 s  | **3/3 RED**, identical HttpApiSchema HTTP 504      |
| HTML + public worker (fixed) | 3               | 14.03, 17.93, 13.76 s  | **3/3 GREEN**, all nine tests; no stale-module 504 |

An initial isolated cold probe also failed on the same 504 in 2.92 seconds,
and passed with the worker scan. This reproduces the recorded mechanism rather
than manufacturing a missing route or changing the deadline.

The Intel log also showed the single installed live smoke crossing its
30-second individual cap. Its Overview and sync-reload exercises are now
independent fresh installed fixtures under the same 30-second cap, not one
cumulative case. Each retains dependency-free tarball installation, bin/native
checks, synthetic WAL source safety and shutdown/embedded-Bun cleanup. Live
and inactive Overview still exercise every width/asset gate; sync reload still
asserts Tokens **15→30**, generation retention and a higher revision.

The partitioned public suite passes **ten tests**. A verbose local profile
recorded cold source 3.574 s, live Overview 4.267 s, inactive Overview 2.918 s,
sync reload 2.817 s, and the real final-hold idle shutdown 10.933 s. A separate
worker-orchestration comparison favored the existing default: 20.19 s elapsed
versus 57.75 s with one worker/serial files. **No worker policy changes** ship.

These local measurements establish the cold-load mechanism and preserve all
work/assertions, but are not actual Intel hosted proof. The parent must push the
combined tree and validate cold source, both packed WAL forms, independent sync
reload and the unchanged full workflow clock. #35's separate native/property
five-second failures remain owned by its implementer; no stats-store runtime
or test file is edited here.

Exact replacement required-check names:

```text
Gate verification (1/16)
Gate verification (2/16)
Gate verification (3/16)
Gate verification (4/16)
Gate verification (5/16)
Gate verification (6/16)
Gate verification (7/16)
Gate verification (8/16)
Gate verification (9/16)
Gate verification (10/16)
Gate verification (11/16)
Gate verification (12/16)
Gate verification (13/16)
Gate verification (14/16)
Gate verification (15/16)
Gate verification (16/16)
```
