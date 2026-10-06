# #27: retired mutation testing and bounded local CI

The maintainer's 2026-10-06 policy retires mutation testing entirely. Ordinary
behavioral, unit and property tests and every other gate remain required.

## Removal inventory

Removed Stryker dependencies and transitive lock entries, both configurations,
the runner patch, mutation commands/shards/canaries, subprocess mutant injection,
the workflow job/dependencies/status check, manifest mutation fields and pairing
constraints, and obsolete ownership/ignore/dead-code/budget inventories. The five
existing human-approved coverage waivers retain their paths and reasons; no new
waiver was introduced. Engine source resolves through normal workspace exports.

Active README/AGENTS/glossary/package docs describe the current policy. The old
mutation plans in `issue-34-ci-budget.md` are explicitly historical; its current
cold-worker evidence is unchanged. Prototype UI writes are unrelated and retained.

## Deadline and isolation

`bun run ci` starts one external 300,000 ms watchdog before the entire aggregate.
Preparation, source gates, contracts, release, e2e and final verification receive
only its remaining time. Independently invoked public CI stages also have external
watchdogs. The watchdog kills blocked workers and detached descendants; verification
failure aborts active siblings and prevents further scheduling.

Local verification snapshots the current working tree into sixteen independent
temporary checkouts, installs frozen dependencies with scripts off, and runs two
workers. Workspace links and planted fixtures are never shared. Snapshot preparation
is inside the deadline. Every static canary is retained except retired mutation
controls, and every shard runs freshness controls. The caller's source is untouched
by planted files, including on hard expiry.

Hosted verification remains last with unchanged required names
`Gate verification (1/16)` through `Gate verification (16/16)`. Every job retains
`timeout-minutes: 5`; the Quality gates full-attempt check retains setup/inter-job/
advisory waits and fails closed on missing, invalid, overdue or future timing data.
Unit/Bun tests remain 5 s, e2e 30 s, hooks/teardown 10 s.

## Measured local evidence

Implementation `a743ee9`, reconciled with integration `a669ec2`, available arm64 Mac:

| Control/run                                             | Result                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Old public sequential aggregate, injected 450 ms budget | RED: exited 0 after the aggregate budget; regression assertion rejected it                                                                |
| Corrected public aggregate, same short fixture          | GREEN: aggregate expiry, ordered exhaustive stages, fail-fast status, inherited-selector clearing and blocked/detached descendant cleanup |
| Public verification fixture                             | GREEN: all 16 isolated shards; failed shard 2 cancels blocked shard 1 and its detached worker promptly                                    |
| First full sequential `bun run ci`                      | Correctly failed at **300.21 s**, during final verification; demonstrated that sequential verification cannot fit                         |
| Final full isolated `bun run ci`                        | **Passed, 293.22 s**, under the actual 300 s outer watchdog                                                                               |

The final run passed 362 source tests with all four coverage measures at 100%
(per-file enforcement unchanged), 8 real Bun contracts, release/bundle checks,
13 e2e tests, all 16 verification partitions, **231 static controls** and the
freshness controls in every partition. Planted controls rejected missing watchdogs,
an omitted final CI gate/shard, clustering, raised/removed timeouts and stalled
preparation. No product/test timeout fix, skipped assertion, retry, clock-boundary
change or threshold reduction was used. Headroom is **6.78 s**, not a hosted result
or a guarantee for future workloads.

Clean dependency directories were removed before successful
`bun install --frozen-lockfile`. Inventory checked configs, patch paths, public
commands, installed runner paths, lock entries and executable canary commands.
Remaining text references are policy documentation, explicitly obsolete research
and ordinary prototype UI writes, not active mutation testing.

Detailed local logs are in the coordinator's `opencode-stats-setup/` directory:
`no-mutation-ci-{red,green,isolation-green,frozen-install,inventory,removal-proof,final}.log`.
The working tree was clean and no checks remained running after the final run.
