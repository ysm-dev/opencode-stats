# Every change appears whole

The brief asks for every view on the next frame from cache, with no spinners, skeletons or loading states anywhere. We hold it as a rule and a budget. The rule: the dashboard never paints a partial or pending state. A change (a page, time range, filter, drill, contribution-graph selection, theme or colour scheme, new data, or a new minute, day or timezone) appears only once its results are complete, and the controls, headline numbers, charts, tables and checklists change in the same paint; until then the screen stays exactly as it was, and no change waits on the network. A page load paints nothing until its page is complete. The budget: from input to that paint within one 60 Hz frame (16.7 ms) for 95% of each kind of change on the maintainer's OpenCode database, whatever the display's refresh rate, and a complete page within 250 ms of a load (first visit, reload, bookmark or new tab) for 95% of loads while the dashboard server runs. A change that misses the budget is a performance bug, never a loading state.

## Considered Options

- **Spinners, skeletons or progress bars while a result is worked out.** The brief rules them out, and with everything already in the tab there is nothing to wait for but computing.
- **Controls first, numbers a frame later.** The range control or a filter chip would describe numbers that aren't on screen yet.
- **Every change within one frame, always.** Broad pages can't promise it: with nothing cached, a complete Overview for 365 days or All time took 23–27 ms to compute in a worker, before anything was drawn.
- **"Feels instant", 100 ms.** Easy to meet, and it would allow visible lag on every click.

## Consequences

- The screen draws from the last complete state, and a change becomes visible only together with its results, so the worker that computes them (ADR 0008) may answer asynchronously.
- Everything a change needs is in the tab before it happens: the browser copy, one code bundle with every theme, fonts and styles, and all six pages already built.
- Every colour, the charts' included, comes from CSS variables, so a theme or colour-scheme change restyles the page without redrawing it.
- A load shows a blank page in the stored theme's background colour until its page is complete. When there is nothing to show yet, or the copy can't be fetched or read, or the worker fails, and a retry doesn't help, it shows the problem screen instead.
- Charts don't animate, and new data appears in place.
- Live updates are changes too, and they never delay a change the user makes.
- A 120 Hz display doesn't tighten the budget.
