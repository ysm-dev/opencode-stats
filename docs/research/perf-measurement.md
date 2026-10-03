# Input-to-paint clocks: frame waits, presentation and asynchronous results

Synthetic measurement spike for [ADR 0007](../adr/0007-every-change-appears-whole.md), measured **2026-10-04** on the maintainer's Mac (hosted jobs have 2026-10-03 UTC timestamps). No application implementation, budget amendment or design decision is landed. **No OpenCode database or usage data was opened, read or copied.**

## Answer

**There is no interchangeable, cross-browser “input-to-paint” clock that proves this budget. A rAF followed by a MessageChannel task measures a main-thread rendering boundary, not presentation. The proposed idle-subtracted “cost” is not CPU work.**

All timing triples are **median / p95 / max, milliseconds**, with nearest-rank percentiles. “After” below is the MessageChannel proxy, deliberately not a claim about pixels on a physical display.

| Decision-relevant observation                                               | Measured result                                                               | n                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Text-only click, no animation: input → after, Chromium / WebKit / Firefox   | **2.00 / 15.90 / 24.30**; **9.00 / 18.00 / 21.00**; **3.00 / 15.00 / 26.00**  | 320 each                               |
| Same, continuous animation: p95 input → rAF / after                         | Chromium **21.00 / 21.40**; WebKit **18.00 / 19.00**; Firefox **2.00 / 3.00** | 320 each                               |
| Chromium after 150–250 ms idle: input → rAF / after, p95                    | **1.10 / 2.00**, not a uniform full-frame wait                                | 60                                     |
| Chromium animated text-only click, trace presentation vs after              | **25.81 / 33.42 / 37.47** vs **10.60 / 20.00 / 21.80**                        | 30 paired                              |
| Headed Chromium, same traced text-only case                                 | Presentation **31.39 / 40.09 / 40.15**; after **8.90 / 18.80 / 19.20**        | 30 paired                              |
| Worker 5 ms + 300 SVG elements: cost minus attributed main/worker task time | **0.02 / 12.05 / 13.09**: close at the median, not within 1 ms at p95         | 30 paired                              |
| Hover with Worker 5 ms: proposed cost, Chromium / Firefox                   | **17.10 / 26.00 / 29.20**; **20.00 / 28.00 / 30.00**                          | 100 each                               |
| Timer quantum, ordinary → isolated pages                                    | Chromium **0.100 → 0.005**; WebKit and Firefox **1.000 → 0.020**              | 1,000 positive ticks per clock/context |
| Hosted animated Chromium after-proxy p95 range across runs                  | Ubuntu **16.2–16.6 ms**, macOS VM **63.2–96.7 ms**                            | 4 × 320 per OS                         |

**Inference:** a literal 16.7 ms p95 presentation budget cannot be established from computation or the MessageChannel proxy. Even this trivial text change misses it in the traced animated Chromium cases. This does not prove every idle click is slow, nor prove the dashboard cannot be optimized: idle Chromium is often very fast. It does prove that engine scheduling, frame phase, display/compositor buffering and the endpoint matter independently of application work.

Under an **idealized** continuously paced 60 Hz model with independent uniform input phase and no pipeline delay, the next-frame wait alone has median **8.33 ms**, p95 **15.83 ms**, maximum approaching **16.67 ms**. Adding a fixed work cost leaves only about **0.87 ms** at p95 under 16.7 ms. At 30 Hz, ideal p95 wait alone is **31.67 ms**. These are arithmetic, **not the measured distributions**: the actual input paths below are not universally uniform. “Whatever the display's refresh rate” cannot be a refresh-independent presentation guarantee without specifying supported environments and an endpoint.

## Environment and isolation

- Apple **M4**, **10 logical CPUs**, **16 GiB RAM**, arm64, hardware model **Mac16,10**; macOS **26.6.2 (25G83)**, Darwin **25.6.0**. Hardware from `sysctl`, OS from `sw_vers`; no hostname. Main display resolution **1920 × 1080**; its physical refresh rate was not independently established.
- **Node 24.15.0**, **Bun 1.4.2**, newest npm Playwright **1.63.0**; bundled **Chromium 153.0.8010.12** (revision 1243), **WebKit 26.6** (2359), **Firefox 155.0** (1543). Browser compatibility snapshot **@mdn/browser-compat-data 8.1.4**.
- Worktree based on `origin/main` **352aefb**, branch **research/perf-measurement**, outside the main checkout. Playwright/BCD dependencies and dedicated browser installs were in approved scratch storage, not the repo's manifest. The first local headless trial used the same-version Playwright browser cache; subsequent trials used the scratch browser installation. No package/application files were changed.
- A Node loopback server bound **127.0.0.1**, an ephemeral port. Fixture, Worker and responses were synthetic. Only the timer/memory isolated cases received **COOP `same-origin` + COEP `require-corp`**; `crossOriginIsolated` was checked. A–D used ordinary non-isolated pages.
- Viewport **900 × 600** for the primary runs; `hasTouch: true`, desktop mode. One browser/engine at a time, one outstanding change. No DevTools frontend, screenshots, video, CPU throttling or virtual clock. Traces were separate trials after untraced measurements. The Mac was in ordinary development use, not exclusively reserved.
- Headless Chromium here means Playwright's default **headless shell**, not full Chrome's new headless mode. Headed uses full bundled Chromium. Playwright also patches WebKit and Firefox; WebKit is not branded Safari. [Playwright browser documentation](https://playwright.dev/docs/browsers) explicitly distinguishes these cases.

## Method and clock boundaries

Committed reproduction: [`scripts/perf-measurement.mjs`](../../scripts/perf-measurement.mjs), [`perf-measurement.html`](./perf-measurement.html), and the branch-only [hosted workflow](../../.github/workflows/perf-measurement.yml). Raw reports/traces remain in scratch, not git. This fixture is not SolidJS and is not a production chart benchmark.

1. Create 300 visible SVG `rect` elements and one button with a text node. A synchronous click changes only that text node. For C, the handler posts to a **dedicated Worker**; its `performance.now()` busy loop occupies W = **2, 5, 10, 14 ms**, replies with a tiny object, then the page updates **height and fill on all 300 rectangles** and the text synchronously. Worker construction/loading is outside warmed clocks.
2. For each change record event creation timestamp **E**, handler start/end, DOM-update start/end **D**, start of the first rAF callback requested **after the DOM change**, **R**, and the start of its MessageChannel task **M**. The callback start is `performance.now()`, **not the rAF callback's timestamp argument**. Dedicated-Worker clocks are translated using the two `performance.timeOrigin`s only for trace attribution, not for the cost formula.
3. A: **10 discarded warm-ups + 320 measured clicks**, with seeded random **5–45 ms** Node delays **after the previous measurement completes**. Test both no animation and a continuous rAF loop moving a 4 px div. Also **60** long-idle clicks with **150–250 ms** random delays. These random delays do not guarantee uniform phase after browser/protocol scheduling.
4. C: **10 + 100** per W/engine, no continuous animation. D: **10 + 100** per keyboard/touch/hover path, with continuous animation; click comparison reuses A's animated case. Primary inputs are `page.mouse.click`, `page.keyboard.press('ArrowRight')`, `page.touchscreen.tap`, and alternating 1 px `page.mouse.move`.
5. Primary completion checks use `page.waitForFunction` with **1 ms polling**. A separate poll-free follow-up waits for a single page promise, and tests down/up without the implicit mouse move. Its differences are reported, not pooled into the primary trial.
6. Nearest-rank median is the lower middle observation for even n. No outlier removal or timer-overhead subtraction; cold/JIT effects can change across cases, which run in listed order. The fixture is small enough that timer quantization is visible.

The requested clocks are:

```js
elapsedProxy = M - E;
frameStart = R - E;
costProxy = D - E + (M - R);
```

`costProxy` removes **only D→R**. It retains input queueing, Worker startup-to-task/reply queueing, main-thread scheduling and the rAF→MessageChannel tail. It excludes the later compositor/presentation tail. Overlapping work on different threads is also not generally represented by adding these elapsed intervals. It is useful as a **readiness + main-render proxy**, not as a sum of attributable CPU time.

The [HTML event loop](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model) puts rAF callbacks in update-the-rendering; the next MessageChannel task cannot interleave that synchronous callback/rendering work. This **does not** wait for the compositor or OS to present the resulting frame. [Paint Timing](https://w3c.github.io/paint-timing/#the-paint-timing-mixin) separately defines `paintTime` (end of rendering update) and implementation-defined `presentationTime`.

## A. A change with essentially no work

Primary local headless trials. Two rightmost columns are **median / p95 / max ms**.

| Engine   | Page / inter-click delay | n   | E → rAF start         | E → after proxy       |
| -------- | ------------------------ | --- | --------------------- | --------------------- |
| Chromium | idle, 5–45 ms            | 320 | 1.10 / 15.30 / 23.80  | 2.00 / 15.90 / 24.30  |
| Chromium | continuous animation     | 320 | 8.30 / 21.00 / 22.80  | 9.00 / 21.40 / 23.80  |
| Chromium | idle, 150–250 ms         | 60  | 1.00 / 1.10 / 1.20    | 1.80 / 2.00 / 2.30    |
| WebKit   | idle, 5–45 ms            | 320 | 9.00 / 17.00 / 19.00  | 9.00 / 18.00 / 21.00  |
| WebKit   | continuous animation     | 320 | 10.00 / 18.00 / 20.00 | 11.00 / 19.00 / 22.00 |
| WebKit   | idle, 150–250 ms         | 60  | 10.00 / 18.00 / 20.00 | 11.00 / 18.00 / 21.00 |
| Firefox  | idle, 5–45 ms            | 320 | 2.00 / 14.00 / 24.00  | 3.00 / 15.00 / 26.00  |
| Firefox  | continuous animation     | 320 | 1.00 / 2.00 / 2.00    | 2.00 / 3.00 / 3.00    |
| Firefox  | idle, 150–250 ms         | 60  | 1.00 / 32.00 / 39.00  | 3.00 / 33.00 / 41.00  |

**Measured:** WebKit looks closest to the proposed phase-wait picture; Chromium idle has a large immediate-response mode, and its animated tail exceeds one nominal interval. Firefox's animated synthesized clicks cluster just before rAF rather than sampling uniform phase. This is repeated on hosted runners too. It is **not evidence that physical Firefox clicks always present in 3 ms**, nor evidence of presentation at all.

**Documented mechanism:** Chromium's [`DelayBasedBeginFrameSource::AddObserver`](https://github.com/chromium/chromium/blob/153.0.8010.12/components/viz/common/frame_sinks/begin_frame_source.cc) can immediately issue a **MISSED BeginFrame** when observation resumes. The disabling feature [`kNoLateBeginFrames`](https://github.com/chromium/chromium/blob/153.0.8010.12/components/viz/common/features.cc) is disabled by default in this revision. **Inference:** this is consistent with the measured long-idle fast path; the spike did not experimentally toggle the feature to establish sole causation. Adding continuous animation removes the long-idle condition and materially changes Chromium's distribution.

### Poll-free / no implicit move follow-up

One outstanding page promise, no 1 ms completion polling; mouse position set once, then **sequential `mouse.down()` / `mouse.up()`**, still real browser-generated trusted click events. **n=320** per row. These are independent trials, not controlled subtraction of polling overhead.

| Engine   | Animation | E → rAF start        | E → after proxy       |
| -------- | --------- | -------------------- | --------------------- |
| Chromium | off       | 9.90 / 19.20 / 21.80 | 10.50 / 20.00 / 22.50 |
| Chromium | on        | 7.50 / 16.00 / 17.00 | 8.10 / 16.60 / 18.00  |
| WebKit   | off       | 8.00 / 17.00 / 19.00 | 9.00 / 18.00 / 20.00  |
| WebKit   | on        | 7.00 / 16.00 / 19.00 | 8.00 / 17.00 / 20.00  |
| Firefox  | off       | 2.00 / 13.00 / 16.00 | 3.00 / 15.00 / 17.00  |
| Firefox  | on        | 1.00 / 5.00 / 14.00  | 2.00 / 6.00 / 16.00   |

Poll-free Firefox **`mouse.click`** cross-check: off **3.00 / 16.00 / 18.00**, on **2.00 / 3.00 / 3.00**, n=320 each. Thus even changing the synthesis sequence affects the apparent phase distribution. Do not assume random Node sleeps prove a uniform physical-input experiment. Chromium's idle short-delay mode also depends on the input sequence and task activity.

## B. Chromium presentation ground truth

CDP **`Tracing.start`**, `ReturnAsStream`, with `devtools.timeline`, `blink.user_timing`, `input`, `latencyInfo`, `benchmark`, `cc`, `viz`, `toplevel`, `disabled-by-default-devtools.timeline`, `disabled-by-default-devtools.timeline.frame`, and `disabled-by-default-latencyInfo`. Ten warm-ups then **30** traced observations per case. Tracing itself adds overhead; do not substitute these p95s for the n=320 untraced distributions.

The useful boundary was **`AnimationFrame::Presentation`**, which is available for **short frames in traces**, despite the web Long Animation Frames API's 50 ms threshold. The matching is important:

1. Put User Timing marks inside input, DOM update, rAF and MessageChannel callbacks.
2. Find the `AnimationFrame` interval enclosing the result's rAF/render phase. Match its **`args.id`** string to `AnimationFrame::Presentation.args.id`, **and renderer pid**. Its timestamp is the browser's presentation feedback for that rendering update. **Do not match on `id2.local` alone**: it is a reused track identifier, and can select the preceding compositor-only frame.
3. For synchronous clicks, match `EventLatency` **MOUSE_RELEASED** and `EventTiming` click to the event timestamp. Their presentation endpoints agree with this joined frame's endpoint within the ordinary page clock's ~0.1 ms quantization.
4. `PipelineReporter` supplies frame sequence/source, presented/partial/no-update states, and presentation-stage endpoints. `Graphics.Pipeline` connects surface submission, aggregation, draw/swap and feedback by surface/display IDs. **Preserve 64-bit IDs as strings** when parsing JSON; ordinary JS numbers lose precision. `DrawFrame` is a draw/submission marker, **not presentation**. `Display::FrameDisplayed` corroborates the feedback timestamp, but has no input identity by itself.

Primary source: Chromium's [animation frame timing monitor](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/core/frame/animation_frame_timing_monitor.cc) calls `NotifyPresentationTime` and records the feedback timestamp with that trace ID; its comment says all frames are traced, only long ones go to UKM. [Display feedback source](https://github.com/chromium/chromium/blob/153.0.8010.12/components/viz/service/display/display.cc) records `Display::FrameDisplayed` with the feedback's timestamp. [EventLatency source](https://github.com/chromium/chromium/blob/153.0.8010.12/cc/metrics/event_latency_tracing_recorder.cc) distinguishes actual presentation stages from termination without a frame.

| Chromium configuration, animated text-only click | n   | E → rAF/MessageChannel proxy | E → joined presentation | Presentation − proxy, paired |
| ------------------------------------------------ | --- | ---------------------------- | ----------------------- | ---------------------------- |
| Default headless shell                           | 30  | 10.60 / 20.00 / 21.80        | 25.81 / 33.42 / 37.47   | 16.17 / 21.80 / 22.01        |
| Headed, GPU compositing                          | 30  | 8.90 / 18.80 / 19.20         | 31.39 / 40.09 / 40.15   | 22.17 / 23.46 / 24.23        |

These are **browser-reported presentation**, not a photodiode/camera measurement. Headless shell has no physical display presentation: its software compositor feedback is the pipeline endpoint exposed by this browser. Headed feedback is also an implementation/OS estimate. Nevertheless, both clearly demonstrate that a MessageChannel task can finish **a whole frame or more before the corresponding presentation**.

### Event Timing comparison

All three measured engines expose Event Timing and nonzero **`interactionId`** for eligible click/key/tap interactions. The observer uses **`durationThreshold: 16`**; the default is 104 ms and the minimum is 16 ms. `duration` is rounded to the **nearest 8 ms**, even with isolation; `processingStart` and `processingEnd` delimit synchronous dispatch, not the Worker's later computation. Continuous `pointermove`/`mousemove`/wheel events are excluded. These are [specified semantics](https://w3c.github.io/event-timing/), not bugs in the fixture.

For the 30 headless synchronous traced clicks, Event Timing's unrounded trace duration was **25.81 / 33.39 / 37.54** and all 30 produced public event entries. Public duration minus trace duration ranged **−3.60 to +3.76 ms**, as expected from 8 ms rounding. Public processing times and `interactionId` were present. **`paintTime` / `presentationTime` were absent on `PerformanceEventTiming` in all three tested engines**, including Chromium 153. The Chrome 145 [release note](https://developer.chrome.com/release-notes/145#add_presentationtime_and_painttime_to_performance_entries) explicitly excludes Event Timing from its Paint Timing Mixin launch, and Chromium's [Event Timing IDL](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/core/timing/performance_event_timing.idl) confirms this.

**Consequences:** a censored, 8 ms-rounded event-entry population cannot enforce a 16.7 ms p95 over all changes. Event Timing also has no identity for a later Worker answer's paint, a page-load completion or a live-data-only update.

## C. Worker computation followed by a whole SVG update

Local headless, **n=100 per row**. “DOM” is attribute/text mutation time only; deferred style/layout/paint remains in the tail. W is a synthetic wall-clock busy loop, not representative database computation.

| Engine   | W ms | E → after proxy       | Cost proxy            | DOM mutations      |
| -------- | ---- | --------------------- | --------------------- | ------------------ |
| Chromium | 2    | 18.70 / 32.60 / 42.40 | 5.30 / 17.90 / 25.20  | 0.50 / 0.70 / 0.70 |
| Chromium | 5    | 20.20 / 34.40 / 39.10 | 7.90 / 19.50 / 22.00  | 0.30 / 0.60 / 0.60 |
| Chromium | 10   | 20.10 / 30.90 / 34.00 | 11.20 / 16.40 / 19.00 | 0.10 / 0.30 / 0.50 |
| Chromium | 14   | 17.50 / 31.20 / 41.30 | 14.80 / 17.60 / 24.30 | 0.10 / 0.20 / 0.20 |
| WebKit   | 2    | 14.00 / 20.00 / 21.00 | 4.00 / 6.00 / 7.00    | 1.00 / 1.00 / 1.00 |
| WebKit   | 5    | 15.00 / 23.00 / 24.00 | 7.00 / 9.00 / 9.00    | 0.00 / 1.00 / 1.00 |
| WebKit   | 10   | 19.00 / 27.00 / 29.00 | 11.00 / 13.00 / 14.00 | 0.00 / 1.00 / 1.00 |
| WebKit   | 14   | 23.00 / 32.00 / 34.00 | 15.00 / 17.00 / 18.00 | 1.00 / 1.00 / 1.00 |
| Firefox  | 2    | 18.00 / 24.00 / 27.00 | 7.00 / 11.00 / 15.00  | 1.00 / 1.00 / 2.00 |
| Firefox  | 5    | 18.00 / 22.00 / 26.00 | 9.00 / 12.00 / 15.00  | 0.00 / 1.00 / 2.00 |
| Firefox  | 10   | 18.00 / 29.00 / 32.00 | 14.00 / 17.00 / 18.00 | 0.00 / 1.00 / 2.00 |
| Firefox  | 14   | 21.00 / 36.00 / 38.00 | 17.00 / 20.00 / 21.00 | 0.00 / 1.00 / 2.00 |

The non-monotonic Chromium medians do **not** mean adding work accelerates a change. Different W values/phase/task scheduling change which frame is caught; JIT/DOM work also warms during these sequential cases. A deadline comparison cannot subtract medians from separate trials.

### Paired Chromium trace: busy time and the result's presentation

Attributed busy time is the sum of **non-duplicated `RunTask.dur`** intervals containing input handling, Worker message delivery/DOM update, result rAF/rendering and the MessageChannel callback, plus the dedicated Worker's request task. It includes browser rendering in the containing main task, excludes completion polling and unrelated tasks, and avoids summing nested trace slices twice. This is **occupied task wall time**, not hardware CPU utilization; preemption can lengthen a task. Main-thread commit notifications outside the selected containing tasks, compositor/raster/Viz work and their queues are not included. Worker clocks were matched with ≤0.5 ms translation tolerance; worker-task selection also checks duration against W.

| W ms | n   | Main tasks         | Worker task           | Combined busy         | Cost proxy            | Cost − busy, paired  | E → result presentation |
| ---- | --- | ------------------ | --------------------- | --------------------- | --------------------- | -------------------- | ----------------------- |
| 2    | 30  | 3.43 / 4.43 / 4.63 | 2.04 / 2.12 / 2.14    | 5.42 / 6.51 / 6.77    | 5.50 / 19.80 / 26.90  | 0.22 / 14.95 / 20.60 | 23.99 / 38.37 / 39.01   |
| 5    | 30  | 3.00 / 4.26 / 4.43 | 5.05 / 5.16 / 5.21    | 8.07 / 9.35 / 9.60    | 8.50 / 19.40 / 21.90  | 0.02 / 12.05 / 13.09 | 21.02 / 35.96 / 36.72   |
| 10   | 30  | 1.46 / 2.98 / 2.99 | 10.00 / 10.14 / 10.16 | 11.42 / 13.10 / 13.12 | 11.70 / 14.80 / 15.90 | 0.05 / 3.41 / 4.34   | 20.44 / 32.21 / 33.86   |
| 14   | 30  | 0.95 / 1.52 / 1.72 | 13.97 / 14.09 / 14.11 | 14.94 / 15.63 / 15.79 | 15.00 / 16.30 / 20.20 | 0.04 / 1.63 / 5.42   | 21.44 / 36.44 / 36.64   |

**Measured answer to “within about 1 ms?”: no at p95.** The paired median discrepancy is small, but the upper tail retains idle queues before DOM readiness. The gap from MessageChannel to presentation is also nonzero: paired median / p95 **2.11 / 16.64**, **2.03 / 2.62**, **1.02 / 1.61**, **0.70 / 0.99 ms**, respectively. That tail is excluded by the cost proxy altogether.

For comparison, headed Chromium's result-presentation triples were W2 **40.90 / 66.23 / 71.20**, W5 **41.15 / 55.05 / 60.65**, W10 **40.04 / 54.11 / 54.37**, W14 **44.15 / 55.92 / 58.02**, **n=30 each**. Its paired cost-minus-busy p95s were **12.11, 10.03, 4.42, 1.49 ms**: the same basic failure, not merely a headless-shell artifact.

### What Event Timing does with the Worker result

Headless click Event Timing **unrounded trace** durations: W2 **3.83 / 17.56 / 24.33**, W5 **2.86 / 17.95 / 20.05**, W10 **2.45 / 13.89 / 15.08**, W14 **3.43 / 15.89 / 19.88**, n=30 each. Event Timing ended **before DOM readiness** in **14/30, 22/30, 26/30, 26/30** observations. Only **7, 5, 3, 6** clicks, respectively, cleared the public observer's 16 ms minimum.

**Confirmed:** Event Timing follows the next rendering/presentation associated with event dispatch, not an application completion token. The button's default pressed/released/focus behavior can produce that earlier frame while the Worker is computing. If the Worker result happens to arrive before the first relevant frame, Event Timing may incidentally include it; it does **not always** exclude asynchronous work, and it does **not guarantee** measuring its completion. `EventLatency` can also terminate without a presentation stage or attach to the handler's earlier frame. Join the **result's render trace**, not just the click's latency event, for C's completion endpoint.

## D. Playwright inputs and continuous-event alignment

Local headless, continuous animation. First clock is timestamp → **handler**, not an independent browser/renderer-receipt timestamp. All values use the page's monotonic time origin; no epoch-millisecond timestamps or negative ages appeared.

| Engine   | Input → observed event        | n   | E → handler           | E → after proxy       | Cost proxy            |
| -------- | ----------------------------- | --- | --------------------- | --------------------- | --------------------- |
| Chromium | mouse.click → click           | 320 | 0.40 / 0.60 / 1.20    | 9.00 / 21.40 / 23.80  | 1.20 / 1.70 / 2.30    |
| Chromium | keyboard.press → keydown      | 100 | 0.10 / 0.20 / 0.20    | 9.40 / 17.00 / 21.40  | 0.30 / 0.50 / 15.00   |
| Chromium | touchscreen.tap → pointerdown | 100 | 8.50 / 18.00 / 22.20  | 25.10 / 33.60 / 36.70 | 8.60 / 18.20 / 22.60  |
| Chromium | mouse.move → pointermove      | 100 | 8.30 / 17.10 / 22.30  | 8.40 / 17.50 / 22.50  | 8.30 / 17.40 / 22.50  |
| Chromium | mouse.move; Worker 5 ms       | 100 | 10.10 / 19.50 / 22.00 | 28.20 / 36.60 / 40.50 | 17.10 / 26.00 / 29.20 |
| WebKit   | mouse.click → click           | 320 | 1.00 / 4.00 / 9.00    | 11.00 / 19.00 / 22.00 | 2.00 / 5.00 / 10.00   |
| WebKit   | keyboard.press → keydown      | 100 | 0.00 / 1.00 / 1.00    | 8.00 / 18.00 / 19.00  | 1.00 / 3.00 / 3.00    |
| WebKit   | touchscreen.tap → pointerdown | 100 | 0.00 / 1.00 / 1.00    | 8.00 / 16.00 / 19.00  | 1.00 / 2.00 / 3.00    |
| WebKit   | mouse.move → pointermove      | 100 | 1.00 / 4.00 / 8.00    | 8.00 / 17.00 / 19.00  | 2.00 / 5.00 / 8.00    |
| WebKit   | mouse.move; Worker 5 ms       | 100 | 0.00 / 3.00 / 5.00    | 16.00 / 25.00 / 27.00 | 6.00 / 10.00 / 13.00  |
| Firefox  | mouse.click → click           | 320 | 1.00 / 1.00 / 2.00    | 2.00 / 3.00 / 3.00    | 2.00 / 3.00 / 3.00    |
| Firefox  | keyboard.press → keydown      | 100 | 0.00 / 1.00 / 2.00    | 9.00 / 18.00 / 19.00  | 1.00 / 3.00 / 4.00    |
| Firefox  | touchscreen.tap → pointerdown | 100 | 0.00 / 1.00 / 1.00    | 10.00 / 16.00 / 17.00 | 1.00 / 2.00 / 4.00    |
| Firefox  | mouse.move → pointermove      | 100 | 8.00 / 17.00 / 18.00  | 9.00 / 18.00 / 20.00  | 9.00 / 18.00 / 19.00  |
| Firefox  | mouse.move; Worker 5 ms       | 100 | 11.00 / 17.00 / 19.00 | 32.00 / 38.00 / 41.00 | 20.00 / 28.00 / 30.00 |

**Measured:** Chromium and Firefox dispatch the synthesized moves just before their next rAF: handler→rAF is near zero while timestamp→handler has a frame-like wait. WebKit does not show that alignment here; its handler usually runs promptly and then waits for rAF. Chromium's emulated touch start has a substantial pre-handler wait too. The timestamp remains useful precisely because it includes these queues; it is **not always “close to handler entry.”**

This skews the cost clock: move input waiting for dispatch is **before D**, so it is retained even though it is idle time. W5 hover costs at p95 are **26 ms Chromium / 28 ms Firefox**, with the Worker actually busy for about 5 ms. Starting at handler entry instead would hide user-visible queueing, not correct end-to-end latency.

**Documented:** Playwright injects browser input, not `dispatchEvent` in the document. Its [Chromium](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/chromium/crInput.ts), [WebKit](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/webkit/wkInput.ts) and [Firefox](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/firefox/ffInput.ts) implementations send different protocol commands without supplying artificial event timestamps. Firefox's [browser-side mouse handler](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/protocol/PageHandler.js) also flushes scrolling/APZ as needed before synthesis. These are meaningful **browser-generated synthetic-input timestamps**, not OS hardware timestamps and not the start of the Node API call. Independent renderer-receipt timing for every input/engine was not instrumented; short stamp→handler ages are an upper-bound indication of prompt delivery, not proof of the exact receipt point. Do not generalize these synthesized-input phase distributions to a physical pointer.

## E. Browser environments and hosted-runner variation

### Local headless versus headed

Continuous rAF callback **start-to-start** intervals (not rAF timestamp-argument deltas), sampled throughout A's 330-click animated trial:

| Configuration           | Intervals n | Median / p95 / max ms | Compositing evidence                                                                       |
| ----------------------- | ----------- | --------------------- | ------------------------------------------------------------------------------------------ |
| Chromium headless shell | 744         | 15.70 / 22.80 / 24.10 | CDP: `gpu_compositing: disabled_software`, rasterization software; SwiftShader GL renderer |
| Chromium headed         | 731         | 16.70 / 18.40 / 18.80 | CDP: GPU compositing/rasterization enabled; ANGLE Metal, Apple M4                          |
| WebKit headless         | 772         | 17.00 / 18.00 / 33.00 | Page compositor GPU/software choice not independently measured                             |
| Firefox headless        | 1189        | 15.00 / 18.00 / 20.00 | Page compositor GPU/software choice not independently measured                             |

The Chromium trace reported nominal BeginFrame **16.666 ms**. Thus the tested path is roughly 60 Hz paced, with callback scheduling jitter; this is not a calibration of physical display vsync. Headless is **not universally “GPU disabled”**: this is the measured default shell on this Mac. Full headed Chromium used the GPU. No measurement of full Chrome's **new headless** channel was made.

Headed untraced text-only input→after: idle **2.30 / 16.10 / 23.30**, animated **8.20 / 17.80 / 19.30**, n=320 each; long idle **1.80 / 2.20 / 2.70**, n=60. Its W2/5/10/14 SVG after p95s were **33.60 / 32.00 / 33.60 / 31.20 ms**, n=100 each. See B/C for the much later **presentation** endpoints.

**Occlusion not measured.** Playwright's [default Chromium switches](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/chromium/chromiumSwitches.ts) include `--disable-backgrounding-occluded-windows`, `--disable-background-timer-throttling` and `--disable-renderer-backgrounding`. Consequently these trials cannot answer how an ordinarily launched, occluded Chrome window throttles. For hidden/background documents, rAF is commonly paused; [MDN's rAF documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) also says its frequency generally matches the display's refresh rate. Actual macOS occlusion behavior requires a separate test with production-like flags and controlled window visibility.

### GitHub-hosted runners

The workflow exists **only on this research branch**, triggered by pushes to it, no PR or main push. Three initial distinct runs: [37140560163](https://github.com/ysm-dev/opencode-stats/actions/runs/37140560163), [37140580284](https://github.com/ysm-dev/opencode-stats/actions/runs/37140580284), [37140601190](https://github.com/ysm-dev/opencode-stats/actions/runs/37140601190). A fourth core-only run [37141666401](https://github.com/ysm-dev/opencode-stats/actions/runs/37141666401) follows an unrelated hover assertion failure in the second macOS job. A/C from that failed job are retained; no bad latency observations are discarded. The failed hover trial observed **101 rather than 100** completed samples; it is not a valid sequential hover result. Core-only skips D, not any A/C quality assertion.

- **Documented public-runner resources:** `ubuntu-latest`: **4 vCPU, 16 GB RAM, x64**; `macos-latest`: **3 M1 CPUs, 7 GB RAM, arm64**. GitHub provides **no dedicated-GPU guarantee** for these standard labels; GPU-powered runners are a separate larger-runner offering. [GitHub's specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- **Measured metadata in runs 2/3:** Ubuntu **AMD EPYC 7763**, 4 logical CPUs, **16,766,414,848 bytes RAM**, kernel **6.17.0-1022-azure**, Node **24.21.0**; macOS **Apple M1 (Virtual)**, 3 logical CPUs, **7,516,192,768 bytes RAM**, Darwin **25.6.0**, Node **24.20.0**. Browser versions matched the local trio. Metadata was not captured by run 1; its image details remain in its job logs. Completed Chromium GPU queries on both labels reported software compositing.
- The Ubuntu image is still **24.04** in these runs; GitHub's job annotation says `ubuntu-latest` begins migrating to Ubuntu 26 on **October 19, 2026**. `-latest` is a moving environment label, not a reproducible hardware/image pin.
- Run 4 used **Intel Xeon Platinum 8573C**, 4 logical CPUs, **16,765,374,464 bytes RAM** on Ubuntu; kernel/Node matched runs 2/3. Its macOS metadata matched the earlier M1 VM. Thus variation below includes **host allocation**, not merely repeated execution on one CPU model. Runs were launched close together, not on different days; no inference of exclusive physical-host assignment is made.

The following are **ranges of separate runs' medians, p95s and maxima** for **E → after proxy**, in ms; they are not pooled percentiles. Ubuntu: four measured runs per engine; macOS: four Chromium A/C runs including the valid prefix of the failed job, and three WebKit/Firefox runs. At least three distinct workflow runs per engine/OS completed A/C. Main→Worker behavior and nominal refresh can differ between VM images; these are headless results, not screen presentation.

| Runner | Engine   | Case       | Runs × n per run | Median range ms | p95 range ms | Maximum range ms |
| ------ | -------- | ---------- | ---------------- | --------------- | ------------ | ---------------- |
| Ubuntu | Chromium | A-idle     | 4 × 320          | 1.5–2.6         | 14.9–15.3    | 16.9–17.2        |
| Ubuntu | Chromium | A-animated | 4 × 320          | 7.6–7.8         | 16.2–16.6    | 17.3–17.4        |
| Ubuntu | Chromium | C-2        | 4 × 100          | 21.2–22.3       | 32.1–33.3    | 33.1–34.9        |
| Ubuntu | Chromium | C-5        | 4 × 100          | 19.9–21.6       | 32.4–33.2    | 34.2–34.5        |
| Ubuntu | Chromium | C-10       | 4 × 100          | 19.1–20.5       | 31.3–33.4    | 33.7–34.7        |
| Ubuntu | Chromium | C-14       | 4 × 100          | 20.7–21.4       | 31.4–32.5    | 34.3–34.8        |
| Ubuntu | WebKit   | A-idle     | 4 × 320          | 8.0             | 16.0–17.0    | 17.0–18.0        |
| Ubuntu | WebKit   | A-animated | 4 × 320          | 7.0–8.0         | 16.0         | 17.0–18.0        |
| Ubuntu | WebKit   | C-2        | 4 × 100          | 9.0–11.0        | 18.0–19.0    | 19.0–21.0        |
| Ubuntu | WebKit   | C-5        | 4 × 100          | 14.0–15.0       | 21.0         | 22.0             |
| Ubuntu | WebKit   | C-10       | 4 × 100          | 17.0–19.0       | 25.0–26.0    | 27.0–29.0        |
| Ubuntu | WebKit   | C-14       | 4 × 100          | 23.0–24.0       | 29.0–30.0    | 31.0–32.0        |
| Ubuntu | Firefox  | A-idle     | 4 × 320          | 2.0             | 15.0–16.0    | 17.0             |
| Ubuntu | Firefox  | A-animated | 4 × 320          | 1.0             | 2.0          | 2.0–4.0          |
| Ubuntu | Firefox  | C-2        | 4 × 100          | 17.0–18.0       | 19.0–21.0    | 22.0–25.0        |
| Ubuntu | Firefox  | C-5        | 4 × 100          | 17.0–18.0       | 21.0–23.0    | 24.0–27.0        |
| Ubuntu | Firefox  | C-10       | 4 × 100          | 18.0–19.0       | 26.0–29.0    | 29.0–31.0        |
| Ubuntu | Firefox  | C-14       | 4 × 100          | 18.0–22.0       | 32.0–35.0    | 34.0–36.0        |
| macOS  | Chromium | A-idle     | 4 × 320          | 4.8–10.3        | 38.8–90.4    | 73.6–318.3       |
| macOS  | Chromium | A-animated | 4 × 320          | 24.8–34.1       | 63.2–96.7    | 112.0–387.8      |
| macOS  | Chromium | C-2        | 4 × 100          | 43.0–63.9       | 89.2–150.9   | 109.0–213.8      |
| macOS  | Chromium | C-5        | 4 × 100          | 35.4–62.6       | 74.8–172.4   | 106.2–423.4      |
| macOS  | Chromium | C-10       | 4 × 100          | 31.0–63.6       | 82.8–154.0   | 137.8–210.0      |
| macOS  | Chromium | C-14       | 4 × 100          | 33.8–74.1       | 76.5–167.9   | 116.0–232.4      |
| macOS  | WebKit   | A-idle     | 3 × 320          | 11.0–12.0       | 19.0–20.0    | 25.0–50.0        |
| macOS  | WebKit   | A-animated | 3 × 320          | 11.0–13.0       | 19.0–22.0    | 22.0–47.0        |
| macOS  | WebKit   | C-2        | 3 × 100          | 14.0–15.0       | 21.0–22.0    | 24.0–60.0        |
| macOS  | WebKit   | C-5        | 3 × 100          | 16.0–18.0       | 24.0–25.0    | 27.0–31.0        |
| macOS  | WebKit   | C-10       | 3 × 100          | 20.0–22.0       | 28.0–32.0    | 30.0–39.0        |
| macOS  | WebKit   | C-14       | 3 × 100          | 25.0–27.0       | 33.0–35.0    | 38.0–98.0        |
| macOS  | Firefox  | A-idle     | 3 × 320          | 3.0             | 16.0–17.0    | 20.0–27.0        |
| macOS  | Firefox  | A-animated | 3 × 320          | 2.0             | 4.0          | 6.0–36.0         |
| macOS  | Firefox  | C-2        | 3 × 100          | 17.0–19.0       | 24.0–26.0    | 31.0–33.0        |
| macOS  | Firefox  | C-5        | 3 × 100          | 19.0–21.0       | 29.0–31.0    | 33.0–37.0        |
| macOS  | Firefox  | C-10       | 3 × 100          | 18.0–25.0       | 30.0–33.0    | 33.0–38.0        |
| macOS  | Firefox  | C-14       | 3 × 100          | 29.0–30.0       | 35.0–37.0    | 39.0–40.0        |

The largest illustrative contrast is animated Chromium: **maintainer M4 9.00 / 21.40 / 23.80 ms**, Ubuntu run medians **7.6–7.8** and p95s **16.2–16.6**, versus macOS VM medians **24.8–34.1** and p95s **63.2–96.7**. Even a Worker W14 result has macOS Chromium p95 **76.5–167.9 ms**, versus **31.4–32.5 ms** on Ubuntu and **31.20 ms** locally. The slower/noisier VM path has nothing to do with real OpenCode data.

**Inference:** the very large hosted macOS Chromium tails, compared with the other engines and Ubuntu, make it a poor source of a tight maintainer-Mac absolute latency threshold in this configuration. The spike does not identify the underlying VM/compositor scheduling cause. Pin an environment for a regression gate, retain per-engine/per-input baselines, and do not interpret a 60 Hz nominal timer as evidence of 60 Hz presentation or identical run-to-run scheduling.

## F. Timer resolution and isolation

Poll until **1,000 positive changes** of `performance.now()` and independently of **`new Event('x').timeStamp`**; inspect 50 browser-generated click timestamps per context too. Positive tick distributions include preemption/GC; their minimum/typical tick, not their maximum, identifies the observed quantization. Actual click timestamps matched the same grids.

| Engine   | Isolation checked | now ticks: median / p95 / max ms | Event-creation ticks: median / p95 / max ms | Observed quantum ms |
| -------- | ----------------- | -------------------------------- | ------------------------------------------- | ------------------- |
| Chromium | false             | 0.100 / 0.100 / 0.100            | 0.100 / 0.100 / 5.900                       | 0.100               |
| Chromium | true              | 0.005 / 0.005 / 0.175            | 0.005 / 0.005 / 0.710                       | 0.005               |
| WebKit   | false             | 1.000 / 1.000 / 1.000            | 1.000 / 1.000 / 25.000                      | 1.000               |
| WebKit   | true              | 0.020 / 0.020 / 0.020            | 0.020 / 0.020 / 0.080                       | 0.020               |
| Firefox  | false             | 1.000 / 1.000 / 1.000            | 1.000 / 1.000 / 4.000                       | 1.000               |
| Firefox  | true              | 0.020 / 0.020 / 0.020            | 0.020 / 0.020 / 0.200                       | 0.020               |

**Documented:** [High Resolution Time's coarsening algorithm](https://w3c.github.io/hr-time/#dfn-coarsen-time) specifies **100 µs or coarser** ordinarily and **5 µs or coarser** when isolated; these are not guarantees of a browser exposing exactly that resolution. [MDN Event.timeStamp](https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp#reduced_time_precision) documents the browser-specific **0.1/0.005**, **1/0.02**, **1/0.02 ms** grids, matching this experiment. Firefox privacy/fingerprinting settings can further coarsen the clock. Isolation does **not** remove Event Timing's 8 ms duration rounding. Paint Timing's draft also permits/uses **4 ms-or-coarser presentation rounding on non-isolated pages**; Chromium's ordinary FCP sample was a multiple of 4 ms.

## G. API support as of October 2026

**Documented availability** from pinned [MDN browser-compat-data v8.1.4](https://github.com/mdn/browser-compat-data/tree/v8.1.4/api), cross-checked against the three bundled runtimes. Version numbers are first documented support, **not the tested versions**. Branded Safari was not launched.

| API                                                  | Chromium/Chrome                                                        | Safari/WebKit                              | Firefox                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Event Timing                                         | Chrome **76+**; present                                                | Safari **26.2+**; present in tested WebKit | **89+**; present                                                     |
| `interactionId`                                      | **96+**; nonzero IDs observed                                          | Safari **26.2+**; nonzero IDs observed     | **144+**; nonzero IDs observed                                       |
| Long Animation Frames                                | **123+**; present                                                      | Not supported; absent                      | Not supported; absent                                                |
| Paint Timing Mixin on `PerformancePaintTiming`       | **145+**; both getters observed                                        | Not supported; absent                      | **140+**; `paintTime` observed, `presentationTime` was **null** here |
| Paint Timing Mixin on LoAF                           | **145+**; both getters present                                         | No LoAF                                    | No LoAF                                                              |
| Paint Timing Mixin on Event Timing                   | **Absent in tested Chromium 153**; not covered by Chrome 145 launch    | Absent in tested WebKit                    | Absent in tested Firefox                                             |
| `first-contentful-paint`                             | **60+**; entry observed                                                | Safari **14.1+**; entry observed           | **84+**; entry observed                                              |
| User Timing L3 `measure(name, {start, end, detail})` | Options **77+**, returned entry **78+**; checked                       | Safari **14.1+**; checked                  | **103+**; checked                                                    |
| `measureUserAgentSpecificMemory()`                   | **89+**, secure + isolated; full headed call succeeded, shell rejected | Not supported; absent                      | Not supported; absent                                                |

Nuances that affect the budget:

- **LoAF's threshold is 50 ms**, not configurable downward to 16.7 ms. No LoAF is not evidence of meeting this budget. Script attribution excludes Workers and other cross-origin realms. [LoAF specification](https://w3c.github.io/long-animation-frames/) and [MDN attribution/threshold guide](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing).
- FCP describes the **first contentful paint only**, not every change, and does not prove the **entire page** is complete. It can serve the 250 ms load budget only if the app independently guarantees that its first contentful paint is also its whole completed page. The default/background paint and error UI need separate definition. [Paint Timing specification](https://w3c.github.io/paint-timing/).
- User Timing L3 accepts custom numeric start/end and cloned detail; it **labels clocks you provide**, not a browser paint detector. Every tested engine returned the expected 1 ms custom measure with `{ok: true}` detail. [User Timing specification](https://w3c.github.io/user-timing/#dom-performance-measure).
- Safari's Event Timing support is not hypothetical: [Safari 26.2 release notes](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/) and [Firefox 144 developer notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/144) corroborate current cross-engine `interactionId` availability. Older “Chromium-only Event Timing” guidance is stale.

## H. Memory quick check

**Chromium CDP works for a page and dedicated Worker**, but they are distinct isolates. `context.newCDPSession(page)` → `Runtime.getHeapUsage`; `Performance.enable` → `Performance.getMetrics` exposes `JSHeapUsedSize` / `JSHeapTotalSize` on the inspected target. Browser CDP `Target.getTargets` → worker `targetId` → `Target.attachToTarget` lets you send `Runtime.getHeapUsage` to that Worker. The quick check used a non-flattened child session and `Target.sendMessageToTarget`/`receivedMessageFromTarget`; this command is **deprecated**, so a durable integration should use a flat-session-aware CDP client. Playwright's direct page-session factory does not take a Worker.

**Measured, n=1 before/after**, default shell, isolated SVG fixture, worker allocation **20,000,000 bytes**, every byte touched and buffer held globally:

| Metric                      |      Before |            After |
| --------------------------- | ----------: | ---------------: |
| Worker `usedSize`           |   330,028 B |        330,700 B |
| Worker `backingStorageSize` |       320 B | **20,000,320 B** |
| Page `usedSize`             | 1,507,516 B |      1,511,816 B |
| Page `backingStorageSize`   |     4,703 B |          4,703 B |

**An ArrayBuffer's bytes are backing storage, not the JS wrapper heap.** Page metrics alone miss a separate Worker's retained buffer. CDP documents `getHeapUsage` as isolate-wide, not just one Runtime/context; `backingStorageSize` includes ArrayBuffers and external strings. [Runtime protocol](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage), [Performance metrics](https://chromedevtools.github.io/devtools-protocol/tot/Performance/#method-getMetrics), [Target attachment](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-attachToTarget). No equivalent cross-engine **public Playwright heap API** exists; [CDP sessions are Chromium-only](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session). Native WebKit/Firefox inspector/profiler alternatives were not evaluated.

`performance.measureUserAgentSpecificMemory()`:

- **Default shell:** the function was exposed on the isolated page but rejected with `SecurityError`, “performance.measureUserAgentSpecificMemory is not available,” despite `crossOriginIsolated === true`. Chromium's [availability guard](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/core/timing/measure_memory/measure_memory_controller.cc) additionally requires performance-manager instrumentation. **Inference:** the shell's missing instrumentation explains why headers alone do not ensure success; the flag itself was not independently queried.
- **Full headed Chromium, separate bare page, n=1 pair:** API total **429,067 B → 20,715,528 B**, increase **20,286,461 B**. Breakdown attributed **20,273,376 B** of JavaScript memory to **`DedicatedWorkerGlobalScope`**, plus **225,581 B** Window JavaScript, **25,608 B** DOM and **190,963 B** Shared after allocation. This includes the 20 MB buffer and realm/runtime overhead, not just the buffer size. The Worker was created after the baseline; there was no attempt to subtract Worker startup overhead.
- [Documented requirements/semantics](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory): secure context and cross-origin isolation; aggregate web-application memory including workers/iframes, implementation-specific categories, not comparable absolute bytes across engines/versions. This experiment used localhost's trustworthy context, not HTTPS certificates.

## Implications for a measurement decision

These are **inferences/recommendations**, not amendments to ADR 0007:

1. Name the endpoint explicitly: **complete state ready**, **main-thread render end**, or **browser-reported presentation**. Keep readiness/attributed work separate from elapsed input-to-result presentation; never silently substitute an idle-subtracted cost for the ADR's elapsed budget.
2. For deterministic Chromium integration tests, mark the **whole result commit**, join its containing render frame to presentation by a stable trace identity, and retain all observations. INP/Event Timing is a useful independent responsiveness diagnostic, not the async completion clock.
3. For cross-engine in-page diagnostics, User Timing with `E→D` and `R→M` is implementable everywhere, with isolation improving granularity. Label `E→M` a **proxy**, keep its engine/input baseline, and do not report it as screen presentation.
4. Define the supported refresh/environment matrix and the allowed presentation/scheduling floor separately from work. A fixed 16.7 ms literal presentation p95 “whatever refresh rate” is not proved achievable, and its refresh-independent reading conflicts with even the ideal 30 Hz model. The whole-state rule remains independently implementable.
5. Hosted Ubuntu is useful for stable relative regression measurements here. Hosted macOS Chromium's software-headless timing is not a reliable interchangeable stand-in for this headed M4. A nominal 60 Hz frame source does not fix the tails.

## Caveats and Not verified

- **No actual dashboard/SolidJS rendering, real data, database access, load-to-whole-page 250 ms test, live update, cancellation/coalescing/stale Worker answer test, or proof that one actual app commit is visually whole.** The fixture tests clocks, not application compliance.
- Physical mouse/keyboard/touch input, hardware input generation → browser receipt, independent WebKit/Firefox renderer receipt timestamps, GPU-compositor presentation tracing for those engines, camera/photodiode screen presentation, other displays/refresh rates, mobile devices and background tabs were not measured.
- Ordinary headed-window **occlusion throttling**, production flags, full Chrome's **new headless** mode, branded Safari/Firefox, and GPU/software compositor selection in WebKit/Firefox remain unverified. Playwright defaults disable several background-throttling behaviors.
- One primary local trial per case plus independent follow-ups, not a hard bound. Polling, default button behavior, synthetic input sequence, JIT/GC, timer reduction, trace overhead and machine contention are part of these observations. Worker tasks are synthetic busy loops, not a real chart/data workload.
- Raw reports and large traces are not committed. Hosted artifacts retain synthetic numeric data for **7 days**; persistent workflow logs carry summarized primary evidence. Trace matching/clock tolerance and selected task attribution are described above, not a claim of exact hardware CPU accounting.
- No native WebKit/Firefox heap-inspector integration, memory leak/GC stability series, or same-buffer memory comparison across engines. Heap and UA-memory checks are **n=1**, and their pages/configurations differ intentionally.

## Primary sources and reproduction anchors

- **Measured evidence:** committed [harness](../../scripts/perf-measurement.mjs) / [fixture](./perf-measurement.html), four linked hosted workflow runs; scratch `perf-measurement-report.json`, `perf-measurement-headed.json`, corresponding trace/analysis JSON, `perf-measurement-extra.json`, `perf-memory.json`. Follow-up code remained throwaway: single-promise completion, down/up inputs, positive-tick probes and worker-target memory attachment are specified in the methods above. No private input artifact exists.
- [HTML event-loop processing](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model), [Event Timing](https://w3c.github.io/event-timing/), [Paint Timing/Mixin](https://w3c.github.io/paint-timing/), [HR Time coarsening](https://w3c.github.io/hr-time/#dfn-coarsen-time), [User Timing](https://w3c.github.io/user-timing/), [LoAF](https://w3c.github.io/long-animation-frames/): standards/editor drafts consulted 2026-10-04; drafts are work in progress, not implementation promises.
- Chromium **153.0.8010.12** source links in B/C/H pin trace and memory semantics; [BeginFrame source](https://github.com/chromium/chromium/blob/153.0.8010.12/components/viz/common/frame_sinks/begin_frame_source.cc), [feature defaults](https://github.com/chromium/chromium/blob/153.0.8010.12/components/viz/common/features.cc), [EventLatency recorder](https://github.com/chromium/chromium/blob/153.0.8010.12/cc/metrics/event_latency_tracing_recorder.cc).
- [BCD 8.1.4 API files](https://github.com/mdn/browser-compat-data/tree/v8.1.4/api): `PerformanceEventTiming.json`, `PerformanceLongAnimationFrameTiming.json`, `PerformancePaintTiming.json`, `Performance.json` (`measureOptions_parameter`, `measureUserAgentSpecificMemory`). [Chrome 145 release notes](https://developer.chrome.com/release-notes/145), Safari/Firefox release notes linked in G.
- Playwright **1.63.0** input/default-switch source links in D/E; [browser documentation](https://playwright.dev/docs/browsers), [CDP-session documentation](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session); [GitHub public-runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Reproduction: install Playwright **1.63.0** in a separate scratch directory, install its three browsers with `PLAYWRIGHT_BROWSERS_PATH` set there, then set **`PM_DEPS`** to its `node_modules` and **`PM_OUT`** to a scratch `.json` path and run `node scripts/perf-measurement.mjs`. For headed Chromium add **`PM_ENGINES=chromium PM_HEADED=1`**; for A/C hosted core add **`PM_CORE=1`**. The script writes a large sibling `-trace.json`; do not add it to git. Published numbers use the primary untraced trials unless the table explicitly says traced or follow-up.
