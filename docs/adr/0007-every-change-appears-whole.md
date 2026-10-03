# Every change appears whole

The brief asks for every view on the next frame from cache, with no spinners, skeletons or loading states anywhere. We hold it as a rule and a budget. The rule: the dashboard never paints a partial or pending state. A change (a page, time range, filter, drill, contribution-graph selection, reading a chart, a menu, a resize, theme or colour scheme, new data, or a new minute, day or timezone) appears only once its results are complete, and the controls, headline numbers, charts, tables and checklists change in the same paint; until then the screen stays exactly as it was, and no change waits on the network. A load paints nothing until its page is complete. The budget: a change's change time, the time the dashboard itself spends on it from its input to painting it, leaving out any wait for the browser's next frame, within one 60 Hz frame (16.7 ms) for 95% of each kind of change on the maintainer's OpenCode database, whatever the display's refresh rate, with no page, time range and filters whose changes take longer at the median; and a complete page within 250 ms of a load (first visit, reload, bookmark or new tab) for 95% of loads while the dashboard server runs. A change that misses the budget is a performance bug, never a loading state.

## Considered Options

- **Spinners, skeletons or progress bars while a result is worked out.** The brief rules them out, and with everything already in the tab there is nothing to wait for but computing.
- **Controls first, numbers a frame later.** The range control or a filter chip would describe numbers that aren't on screen yet.
- **Every change within one frame, always.** Broad pages can't promise it: with nothing cached, a complete Overview for 365 days or All time took 23–27 ms to compute in a worker, before anything was drawn.
- **"Feels instant", 100 ms.** Easy to meet, and it would allow visible lag on every click.
- **From input to the screen within one frame, as this ADR first said.** No change can meet it, not even one that does nothing: in Chromium, a click that changed one word reached the screen 33 ms after its input at p95 headless and 40 ms with a window, and reached the end of painting after 15–21 ms in every engine, since input lands anywhere between frames and the browser presents a frame or more after the page paints.
- **Time from input to painted, counted in frames** (three, 50 ms). What the user sees, but at the mercy of each engine's scheduling: Chromium's emulated touch alone waited up to 18 ms before the dashboard's code ran.
- **Event Timing as the clock.** It rounds to 8 ms, reports nothing under 16 ms, and stops at the first paint after the input rather than at the worker's answer.
- **Only each kind's p95.** A page, time range and filters slow on every visit could hide in the other 5%.

## Consequences

- The screen draws from the last complete state, and a change becomes visible only together with its results, so the worker that computes them (ADR 0008) may answer asynchronously.
- Everything a change needs is in the tab before it happens: the browser copy, one code bundle with every theme, fonts and styles, and all six pages already built.
- Every colour, the charts' included, comes from CSS variables, so a theme or colour-scheme change restyles the page without redrawing it.
- A load shows a blank page in the stored theme's background colour until its page is complete. When there is nothing to show yet, or the copy can't be fetched or read, or the worker fails, and a retry doesn't help, it shows the problem screen instead.
- Charts don't animate, and new data appears in place.
- Live updates are changes too, and they never delay a change the user makes: they, idle-time work and hidden pages catching up run in slices of at most 4 ms on either thread, so a change waits behind one slice at most.
- A 120 Hz display doesn't tighten the budget.
- The dashboard times its own changes: each part of a change where it runs, added up. The same change times feed "Copy diagnostics" and the tests, through the browser's performance marks. The dashboard is cross-origin isolated (ADR 0004), since WebKit's and Firefox's 1 ms timers are too coarse for parts this short.
- Time from input to painted, and in Chromium to the screen, is reported beside each change time, never judged.
- A new timezone must appear whole, but its change time is only reported: it re-indexes all history, and it is rare.
- The reference run judges the budget before each release, and CI on every pull request at three times it (ADR 0016).
