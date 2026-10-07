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
A tab-local reply sequence rejects a completion superseded while waiting. Each
retry also rechecks the pending request identity **before** reading its shared
record or scheduling another retry: a replaced sender that never completes or
writes a bad ready flag is inert while the current request remains eligible. This
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
seam; the workflow stage dependencies and all test, hook, stage and job caps are
unchanged. Linux uses three balanced file shards for the added independent
timing/load seams; the complete-partition proof is updated with the matrix.
Load barriers, observed interactions and observer-free timing now have separate
browser files. Both interaction tours still make every current kind twice; the
load cases keep both first-visit and reload barriers. This isolates the load work
from the 30-second interaction-case budget rather than dropping repetitions or
raising a limit.
Phone actions use native taps, desktop actions use native mouse clicks, and
checklist search uses actual key input. Checklist expansion and single-key
shortcut choices are covered too, beyond the issue's listed kinds.
The tour also changes the system light/dark sensor while following System and
crosses the existing CSS-only 768 px layout breakpoint in both directions. It
does not add the future phone shell, height breakpoint or page-column features.

The observer starts before navigation. Its early rAF queues a native
MessageChannel task; the task reads the DOM after the **whole rendering turn**,
not in a guessed last microtask or a wrapped rAF callback. That includes native
ResizeObserver rounds and arbitrary nested microtasks, and reads actual control
properties as well as text/attributes. It checks:

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
  During the held first-visit font, three bounded native-task checkpoints assert
  both an unavailable required face and an entirely empty root. They record RAF,
  MessageChannel-sample, blank and font-status evidence using counters, not content.
  The font wait does not require two RAFs: a render-blocked document may deliver
  none. Counters are not fabricated, and after release the real observer must
  record the complete page; reload's held-copy phase still requires two observed
  blank frames.
- `whole-paint:animation`: native animations and nonzero computed animation or
  transition durations, including pseudo-elements, are rejected.

`whole-paint-canaries.test.ts` first accepts three genuine complete states during
one preset action, the last a new minute's Today comparison cut. It then plants
a mixed region mark, a partial number **without changing its mark**, a real filter-triggered
request, partial content during a held load, and an important CSS transition.
Each must be observed and rejected by its corresponding named check in both
engines. Gate helpers, tours, canaries and timing proof tests have exact
CODEOWNERS lines.
It additionally plants a late-rAF number corruption restored in a later local
MessageChannel task. Both one- and two-level microtask restoration must be
accepted as unpainted intermediates. A native ResizeObserver canary changes a
parent's width in rAF, causes a second deeper RO delivery in the same turn, then
corrupts a headline until a later MessageChannel task. Both that text corruption
and a property-only checkbox corruption must be rejected; neither callback nor
the renderer is replaced by a stand-in.

## Separate timing seam

An observed tour's raw rAF-to-task measures include real test-only probe work;
they are **not** uncontaminated dashboard-own-work measurements. The probe
records its actual cost as `opencode-stats:whole-paint-probe`, without subtracting
it from the dashboard's four summed parts or altering its performance clock.

`change-time-chromium.test.ts` and `change-time-webkit.test.ts` run the same seeded
actions independently at both widths, in fresh observer-free browser fixtures.
Only the on-demand pause/hidden snapshot helper is present: no per-frame scans,
style walks or rAF wrappers. Every change still checks its actual User Timing
parts and their exact sum. `readCleanChangeMeasures` is the timing consumer seam:
it rejects an enabled observer, recorded probe samples, or probe timing entries.
The canary rejects a contaminated page even with its mode marker cleared; the
clean tours require zero probe samples/entries and every current change kind.
The reference/performance programme remains #60/#61, not implemented here.

## Test controls and limitations

### What the portable frame boundary establishes

The [HTML rendering algorithm](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering)
runs rAF, ResizeObserver delivery loops and microtask checkpoints in one
rendering task before updating the UI. Its
[unshipped-port queue](https://html.spec.whatwg.org/multipage/web-messaging.html#message-ports)
orders locally created, untransferred MessageChannel tasks in posting order.
The probe is queued before the rendering-turn canaries' restoration tasks, so it
reads after all prepaint callbacks and before those restorations. A
MutationObserver alone would not cover property-only updates, and a fixed
microtask nesting depth would not close a rendering turn.

**This is not an all-task-source or physical-pixel paint oracle.** HTML permits
other task sources to interleave before a queued port task, and browsers can
skip/coalesce rendering opportunities. A live DOM read cannot reconstruct an
earlier presented frame after an unrelated task changes it. These tests establish
the native rendering-turn cases above and the current controlled tour; they do
not prove every possible task interleaving or compositor presentation in both
engines. No portable after-paint atomic DOM snapshot API is used or claimed.
Stronger universal frame coverage remains an explicit limitation, not a presumed
guarantee provided by wrapping another callback.

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

The follow-up native-RO, nested-microtask, obsolete-receipt and clean-consumer
regressions are red-capable source additions only until hosted Actions run them.
No red/green outcome is inferred from source inspection or the HTML algorithm.
Run 37549613418 supplies the held-font RAF-wait red signal in WebKit at both
widths and the Intel phone-tour 30-second miss. The bounded task/RAF evidence and
the independently budgeted load/interaction seams address those harness
assumptions; the precise WebKit suppression behaviour still needs the new hosted
counters. No timeout was raised, and no unavailable-font/early-page assertion or
tour action was removed.
