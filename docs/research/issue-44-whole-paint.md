# Whole-paint enforcement (#44)

The dashboard's clock measures synchronous input handling on the page thread,
worker decoding/selection/computation, its actual synchronous reply clone, and
fact/index slices on the worker thread, and the
complete page commit on the page thread. A paint starts **inside** rAF and ends in
its MessageChannel task. These parts are summed in
`opencode-stats:change:<kind>` User Timing measures, with numeric `input`,
`compute`, `page`, and `paint` detail. Network, worker reply, yield and next-frame
waits are not part of that sum. The separate input-to-paint measure is an elapsed
rendering proxy, **not** screen presentation (the #24 measurement spike).

Each reply shares a 20-byte completion record: two elapsed times and an atomic
ready flag. The worker fills it after its single native `postMessage` returns.
The client validates its layout and finite nonnegative contents before drawing;
if it arrives before the sender finishes, it yields without counting that wait.
A tab-local reply sequence rejects a completion superseded while waiting. This
does not benchmark, guess, or serialize the complete state a second time, and
needs no chain of timing acknowledgements. The packed tests already require
cross-origin isolation on both channel ends.

Copy diagnostics reads the same measures and emits only kind, sample count,
nearest-rank median and p95, keeping the most recent 100 samples per kind. Timing
names and detail contain no addresses, copy identifiers, filters, labels, content
or metric values. No performance threshold or exception is added by this ticket.

Regions derive tab-local serial marks from the exact immutable object their
drawing expressions read. A mark is not assigned by walking the DOM after a
commit. Checklist search/expansion has its own drawing object and local marks;
Settings marks its actual provider choices, whose CSS colours are also sampled.
An unanswered replacement leaves the drawn controls, properties and marks alone.
Native preference choices draw from one marked preference object. Later native
palette applications join the pending theme/scheme change as page work, without
charging the intervening microtask wait or emitting a separate change time.

## Packed-browser gate

`packages/e2e/tests/testing/change-tour.ts` is the shared current-kind tour. Future
tickets add their kind and action there. Chromium and WebKit each run it twice
at 360 px with touch and 1280 px with mouse input, on an npm-installed tarball
with install scripts disabled. The existing release, filter, history, preference,
plugin and source cases remain in place. The tour uses the existing file/shard
seam; the workflow DAG and all test, hook, stage and job caps are unchanged.
Phone actions use native taps, desktop actions use native mouse clicks, and
checklist search uses actual key input. Checklist expansion and single-key
shortcut choices are covered too, beyond the issue's listed kinds.
The tour also changes the system light/dark sensor while following System and
crosses the existing CSS-only 768 px layout breakpoint in both directions. It
does not add the future phone shell, height breakpoint or page-column features.

The observer starts before navigation and retains each rendering frame's last
rAF drawing, including later callbacks and their immediate microtasks. It checks
that immutable snapshot in a post-paint MessageChannel task, not the possibly
already changed live DOM. Pending snapshots are queued per frame. It checks:

- `whole-paint:mixed-frame`: each global region and each checklist's local marks
  agree. Actual numbers, ticks, amounts, bars, chips, controls and search values
  cannot change while their drawing-object marks stay the same. The palette has
  its own applied-object mark, and its drawn theme/scheme must agree with the
  provider choices. A WeakMap retains only each region's latest fingerprint.
  Any number of coherent complete states is allowed during an action: a clock
  tick or live update is not a mixed frame. Fingerprints never appear in diagnostics.
  Browser-chrome URL changes are not painted regions; the final URL must instead
  equal the range control's drawn address after a worker action completes.
- `whole-paint:user-change-network`: only the live stream is always allowed;
  changes-since requests are allowed only in live/resume/visible phases.
- `whole-paint:early-load-paint`: the required font is held on the fresh browser's
  first visit, with the copy response complete and the actual face verified
  unavailable; the copy is independently held on reload. Both waits remain blank,
  and the first drawn frame must have all current page regions and its loaded
  font. A cached WebKit face is not confused with a redundant preload on reload.
- `whole-paint:animation`: native animations and nonzero computed animation or
  transition durations, including pseudo-elements, are rejected.

`whole-paint-canaries.test.ts` first accepts three genuine complete states during
one preset action, the last a new minute's Today comparison cut. It then plants
a mixed region mark, a partial number **without changing its mark**, a real filter-triggered
request, partial content during a held load, and an important CSS transition.
Each must be observed and rejected by its corresponding named check in both
engines. Gate helpers, tours, canaries and timing proof tests have exact
CODEOWNERS lines.
It additionally plants a late-rAF number corruption restored in a post-paint
task: exactly one partial frame must be rejected. The same corruption restored
in a microtask before paint must be accepted, retaining the distinction between
unpainted intermediate DOM work and a frame a user could actually see.

## Test controls and limitations

All data and writes are synthetic. The installed worker bundle gets a **test-only**
Date.now prelude via Playwright routing. BroadcastChannel advances its wall clock;
the real second/minute/day schedulers notice the boundary. Neither worker
computation nor performance.now nor the packed algorithm is replaced. Tests
explicitly check crossOriginIsolated on the page and its actual worker.

Headless Playwright foregrounding does not portably hide another document (see
the existing WebKit assessment). The tour therefore sets the document's hidden
and visibilityState sensors and dispatches its ordinary visibilitychange event.
It proves suspend/catch-up through the installed dashboard's existing listener,
not OS occlusion or background-throttling policy. It waits for the real stats
store to contain a synthetic write before Resume/show, so that those actions
actually have something to catch up. The readiness poll runs in the test host,
not in the tab.

Source/property tests vary simulated yield and frame waits independently of
work, test nested local handling, discarded answers and drawing-object identity,
and use real engine/reference totals and DOM control properties. They do not
substitute for the hosted per-file 100% coverage check. The broader real-data
reference run and Chromium trace attribution from ADR 0016 remain separate work;
this ticket does not claim to implement that release-runner programme.

## Verification

No CI, individual gate, contract test or browser test was run locally. Hosted
verification must run the unchanged public source/coverage/contracts and packed
e2e gates, including both tour files and the planted cases, then the complete
aggregate/gate verification under the existing five-minute deadline. The new
e2e workload costs are conservative estimates until the first hosted sample.

The existing packed range case also uses the shared controlled worker clock,
without pausing live updates or dropping its exact numbers/captions/history and
no-network assertions. Its real minute and local-day scheduler assertions run
after the legacy exact before/after tour, through the state-coherence observer.
This avoids rejecting a third valid minute-cut frame inside the old observer
while explicitly retaining unpaused clock coverage.
The existing hosted failure in run 37538927650 supplies the original red signal:
a valid Today minute-cut frame was outside the old two-snapshot whitelist. The
new native three-state case is the regression seam; no local red/green claim is
made because all gate execution is reserved for hosted Actions.

Hosted run 37546332444 supplies a second red signal: removing a fixed range
incorrectly fell through to All time on every required platform. The worker now
dispatches `remove-fixed` with its preset, retaining the existing public-channel
and packed-range exact assertions. That run also exposed the native switch's
hidden input as an invalid pointer target; the tour now clicks/taps its visible
associated label. All review regressions and repairs still need a hosted green
run; none was run locally.
