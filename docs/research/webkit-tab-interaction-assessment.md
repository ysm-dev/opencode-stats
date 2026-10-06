# WebKit two-tab interaction: cause not established

## Reported failure and scope

Hosted run `37438191578` on integration `469eabc8a5af3fef176734de6dcc93b4a26d2f8e`
failed only the Linux WebKit cold-stored-theme/cross-tab preference case. The
Theme trigger resolved, then `locator.click` exceeded its existing 3000ms
visible/enabled/stable check at `preferences.test.ts:92`. The other 27 Linux
cases and all macOS ARM cases passed. This report does **not** establish a fix
or a fully green hosted run.

The public installed-dashboard test is the agreed seam. Both engines, all
28 cases, native `maxConcurrency: 2`, and every assertion and cap are unchanged.
No forced or JavaScript click, added sleep, retry-to-green, timeout increase,
product edit, process-tree edit, or time-budget edit was made.

## Feedback loop and probes

All artifacts below live under the approved temporary OpenCode directory:
`/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode`.
The external `webkit-linux-loop.ts` archives the current tree, copies its fresh
release, installs frozen dependencies, and runs public e2e in an owned 2-CPU
Linux container with an initially empty browser installation. Its preparation
and tests share one external 300-second deadline. Each actual test retains
the repository's 30-second cap and browser actions retain 3000ms.

The tight prepared command was actually run:

```sh
bun run scripts/time-budget.ts docker exec opencode-stats-webkit-loop \
  bun run vitest run --config packages/e2e/vitest.config.ts \
  packages/e2e/tests/preferences.test.ts -t 'paints a cold' \
  --reporter=verbose --silent=false
```

This drives the exact original cold-load, second-tab Settings, first-tab
Theme click, whole-paint and cross-tab/no-request assertions. It is capable
of catching the reported timeout, but **did not reproduce it locally**.
Selective invocations are diagnostic isolation, not reduced acceptance suites.

Temporary instrumentation was confined to archived snapshots, never repository
source. At first-tab load, second-tab creation, second-tab Settings, first-tab
observation, Settings completion, and Theme-click start/end, it captured:

- `performance.now()`, visibility state and `document.hasFocus()`;
- active-element identity and geometry of the actual Theme trigger;
- frame count, latest RAF time, last four frame geometry samples;
- visibility/focus/blur events and active animations.

The ranked falsifiable hypotheses were:

1. Foreground/frame lifecycle race: stale/suspended frames at the handoff,
   relieved by completing a real foreground lifecycle.
2. Deferred Settings layout/focus: moving bounds or focus churn while frames
   continue; foreground completion alone would not cure it.
3. Workload contention: large frame gaps without a visibility change, amplified
   by the original independent overlapping workload rather than tab state alone.

## Actual observations

| Probe                                                   | Result                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| Clean ARM Linux, original affected WebKit case          | Pass; 4.949s, preparation-inclusive 92.88s   |
| ARM Linux, original cold pair, fixed ten-run batch      | 20/20 pass; 43.86s total                     |
| ARM Linux, instrumented complete preference file        | 12/12 pass; 29.08s                           |
| ARM Linux, instrumented complete e2e, two workers       | 28/28 pass; 60.13s                           |
| ARM Linux, instrumented cold pair at 0.5 CPU            | 2/2 pass; 22.71s                             |
| Emulated x64 Linux, clean original WebKit case          | Pass; 15.103s, preparation-inclusive 141.05s |
| Emulated x64 Linux, instrumented original pair          | 2/2 pass; 18.99s                             |
| Emulated x64 Linux, original pair, fixed five-run batch | 9/10 pass; different navigation failure      |

In the ordinary ARM Linux probe, first-tab focus remained true and visibility
remained visible through the entire handoff. Frames advanced 11 → 12 → 27 → 28
→ 31 → 32 → 36. The first Settings heading owned focus before Theme input; the
selected Matrix option owned it afterward. The trigger stayed at
`x=1192.234375, y=116, width=71.765625, height=28`, no animation was present, and
the Theme click took approximately 74ms.

In the emulated x64 probe, first-tab frames advanced 32 → 71 → 206 → 207 → 214
→ 215 → 222, again with true focus, visible state, no lifecycle event, no
animation and identical trigger geometry. The click took approximately 275ms.
The last four pre-click geometry samples and all four post-click samples were
identical. Under ARM 0.5-CPU contention the WebKit click still completed in
approximately 111ms. These are **passing-run observations**, not failing-run
evidence: they lower confidence in a simple, always-present background-tab or
layout explanation but cannot falsify a rare lifecycle/frame stall on the
physical hosted runner.

The fifth-batch x64 failure occurred in run 4 at `preferences.test.ts:85`:
`second.goto`, waiting for `load`, exceeded 3000ms. It occurred **before** the
reported Settings/Theme handoff. It is not RED for the reported bug and was
not used to justify a fix. x64 here is Docker emulation, not physical hosted
x64 evidence.

## Shared seam inspection

`observePreferences` already calls the public `page.bringToFront()` before
installing its RAF observer. Its only caller is the cross-tab preference case;
`wholePreferenceChange` serves that case's Theme, colour-scheme and System-media
changes. The related Settings/contrast/focus cases also already use
`bringToFront` at each viewport. All were inspected before considering an edit.
Adding another identical foreground call is not evidence-based correction.

Settings synchronously focuses its heading on mount. The published Select's
deferred autofocus protection concerns the **opened listbox**, whereas this
hosted failure stopped before the first Theme pointer input. No local probe
observed deferred focus/layout churn at that point.

Playwright 1.63.0 initializes each WebKit page proxy with
`Emulation.setActiveAndFocused({ active: true })`; its public foreground call
uses `Target.activate`. Therefore a second tab's creation alone does not prove
that the first document became hidden or lost emulated focus. Neither source
inspection nor passing focus samples establish actual hosted RAF progress.

## Verification and blocker

Fresh worktree `bun run ci:checks` passed all ordinary source gates, including
632 tests and enforced 100% per-file coverage. A new complete **clean** public
Linux run stopped during OS-package preparation (exit 255 after 98.36s), before
tests began. Immediately afterward Docker's API socket was absent and
`orb status` reported `Stopped`. Do not count this as a full clean-Linux pass,
a test failure, or a completed acceptance run. The prior instrumented 28-case
pass is separate evidence, not a replacement.

No causal RED/GREEN exists for the hosted Theme-click failure. Required next
evidence is a failing physical Linux/x64 trace or the above passive lifecycle,
RAF and geometry samples **during that same stable-element timeout**. Docker
also needs to be restored for a new preparation-inclusive clean full-suite
proof and owned-container removal. No speculative foreground synchronization
or concurrency reduction is proposed without that evidence.

Latest integration was reconciled before reporting; it remained `469eabc`.
Only this assessment is committed. No aggregate CI or hosted-green claim,
ticket closure, push, main merge or ruleset change was made.

## Artifact index

- `webkit-linux-loop.ts`, `webkit-linux-loop-location.json` and x64/full variants:
  snapshot/container ownership and initial public commands.
- `webkit-linux-baseline.log`, `webkit-linux-baseline-x64.log`:
  fresh affected public preparation/test runs.
- `webkit-diagnostics.ts`, `webkit-linux-diagnostics.log`,
  `webkit-linux-full-diagnostics.log`, `webkit-linux-contention-diagnostics.log`,
  `webkit-x64-diagnostics.log`: snapshot-only probes and actual outputs.
- `webkit-repeat.ts`, `webkit-repeat-affected.log` and individual run logs:
  fixed ARM ten-run experiment, not retries until green.
- `webkit-repeat-x64-affected.log`, `webkit-repeat-x64-affected-4.log`:
  fixed x64 five-run experiment and the distinct navigation failure.
- `webkit-linux-clean-full-summary.log`, `webkit-linux-baseline-full.log`:
  interrupted clean preparation, not test proof.
- `webkit-ordinary-checks.log`: fresh ordinary source-gate proof.
- `webkit-x64-build.log`: bounded x64 diagnostic image build.

Temporary probes are absent from the repository. Owned containers are named
`opencode-stats-webkit-loop`, `opencode-stats-webkit-loop-x64` and
`opencode-stats-webkit-loop-full`; their stopped runtime currently prevents
Docker inventory/removal. Unrelated containers and the independent Intel
watchdog owner's files were not touched.

## Retained passive failure evidence

Follow-up branch `implement/webkit-failure-evidence` descends from the preserved
documentation-only assessment above. It adds **diagnostics, not a behavioral
fix**. The physical hosted Theme-click cause remains unestablished.

`packages/e2e/tests/testing/preference-evidence.ts` instruments only the synthetic
installed-page cold-preference case. It records ordered host phase/action times
and page load/close/crash events, plus document visibility/focus/lifecycle events.
The existing cold-background and whole-paint RAF callbacks supply frame samples;
there is no added RAF loop, network request, focus call, forced click, readiness
barrier, retry or pre-action evaluation. Samples contain Theme/colour-scheme
trigger geometry, computed style, connection/disabled/focus state and a centre
hit-test observation. These observations are not a replacement for Playwright's
own actionability checks. Active focus is classified without reading text or
arbitrary element identifiers. Content, browser-copy values, URLs, storage,
headers and authentication are never included in the added report.

The first failed action writes one `[preference-failure-evidence]` JSON line to
stderr, then rethrows the **same original error**, retaining its stack and cause.
There are at most 64 host records, 32 lifecycle events and eight frame samples.
Host times are `performance.timeOrigin + performance.now()`; browser `time` and
`rafTime` are relative to the reported browser `timeOrigin`. Use that origin to
align the action timeline with lifecycle events and frame progress. A zero RAF
count before the original observers start is not evidence of browser suspension.
Compare the last sampled RAF time with the current snapshot time to see whether
frames stopped progressing during the failed action.

Failure capture and disposal evaluations each have their own 100ms reporting
bound because Playwright evaluation otherwise has no timeout. An unavailable
renderer yields the host timeline and an explicit `unavailable`/`pageClosed`
result, not a fabricated browser snapshot. Capture or stderr failure cannot
replace the original error. Disposal removes the owned listeners and cancels
the existing observer; the owned browser context remains responsible for final
renderer teardown if evaluation is unavailable.

`packages/e2e/tests/preference-evidence.test.ts` checks this seam with an installed
synthetic dashboard. A deliberately `aria-disabled` Theme trigger produces a
real native 3000ms click timeout. It proves failed-action capture, original
error/stack identity, bounded histories, no headline/URL leakage, and listener
disposal. Separate controlled cases preserve original error/stack/cause when
the page closes, evaluation rejects or never settles, or stderr reporting
throws. These controls **do not reproduce or explain the hosted stable-element
timeout**. All original 28 cases, both engines, native concurrency two, cold
prepaint, whole-paint/data-identity, no-request, cross-tab, denied-storage and axe
assertions remain; five diagnostics checks are added without changing any cap.

### Follow-up verification and remaining proof

- The focused installed-page diagnostics command passed five controls:
  `bun run scripts/time-budget.ts bun run vitest run --config packages/e2e/vitest.config.ts packages/e2e/tests/preference-evidence.test.ts`.
  Initial RED was the absent diagnostics module; the controlled action then
  exposed an overly broad geometry selector, corrected to the actual
  `role="button"` trigger. Neither RED was the physical hosted bug.
- Public macOS `bun run e2e` passed all 33 tests (28 original + five controls),
  test duration 33.35s. The subsequent complete public `bun run ci` independently
  passed ordinary gates (632 tests, 100% per-file coverage), all eight real-Bun
  contract tests, release and all 33 e2e tests (28.72s test duration).
- **The complete aggregate failed at final gate verification.** Verification
  shard 2/16's `manifest does not waive neighbour test (tsx)` expected the
  planted coverage rejection, but the existing
  `packages/stats-store/src/types.test.ts` timed out at its unchanged 5000ms cap
  (reported 5603ms), so the expected result was absent. No cap, canary, watchdog,
  process-tree or unrelated test was edited; this was not retried until green.
  The earlier standalone ordinary-check attempt also rejected a new unsupported
  suppression spelling; the final candidate uses native stderr without any new
  suppression and passed that gate in the aggregate.
- Logs: `webkit-failure-evidence-checks.log`,
  `webkit-failure-evidence-macos-e2e.log`, and
  `webkit-failure-evidence-macos-ci.log`, under the approved temporary OpenCode
  directory used above. The last log contains the final candidate's controlled
  checks and the exact aggregate failure; no full-CI green claim is made.
- Read-only follow-up `orb status` reported `Running`, and Docker inventory
  filtered to the three legacy diagnostic container names was empty. This
  session did not restart the shared runtime, remove containers or run a new
  Linux workload. No new clean Linux or physical hosted acceptance exists for
  this candidate. The earlier stopped-runtime limitation explains the prior
  interrupted preparation, not the macOS verification failure.
- After the aggregate exited, process inventory found no matching owned
  `webkit-failure-evidence`, `stats-preferences-` fixture or
  `verification-WDlCWA` worker. No owned checks were left running.

Latest integration was reconciled (`469eabc`, already up to date). Linux/physical
hosted acceptance and a matching failure-time trace remain required; macOS
checks and deliberate diagnostic controls cannot establish the missing hosted
cause. There is no behavioral fix, push, issue closure, ruleset change or
integration/main merge in this branch. Any subsequent handoff requires a new
session.
