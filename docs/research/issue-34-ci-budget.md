# #34: shortening the hosted critical path

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

Only the matrix count, corresponding check names, partition assertions and
documentation change. Verification still starts after source, all six mutation
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
