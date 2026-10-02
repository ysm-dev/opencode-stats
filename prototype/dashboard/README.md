# Dashboard prototype (throwaway)

**PROTOTYPE: never merge, never import.** It answers [What pages, charts and hotkeys does the dashboard have?](https://github.com/ysm-dev/opencode-stats/issues/14) by showing four structurally different dashboards side by side, on invented data.

Four dashboard variants, switchable via `?variant=`, on one route, fake data only.

```sh
bun run prototype        # from the repo root; serves http://localhost:4747
```

Flip variants with ← → or the yellow bar at the bottom. The same bar switches the date order, the clock, the colour scheme, and the simulated live writes (a new step every 8 s). The range and filters live in the URL, so they survive a reload and a variant switch.

| Key | Variant  | Structure                                                                                              |
| --- | -------- | ------------------------------------------------------------------------------------------------------ |
| A   | Pages    | OpenCode's settings layout: a sidebar of pages (Overview, Models, Projects, Agents, Tools, Sessions).  |
| B   | Report   | One long scrolling page with a sticky range bar and jump links.                                        |
| C   | Explorer | Pick a metric and a dimension; facet filters on the left, one chart and one wide table.                |
| D   | Calendar | The contribution graph is the navigation; a journal of sessions by day beside a summary of the period. |

## What is real and what isn't

- **Real.** `@opencode/ui@2.0.21` controls and v2 tokens, TanStack Charts 0.18, and TanStack Hotkeys 0.12. The time-range rules come from issue #12, and the metric definitions from issue #13.
- **Fake.** The usage history (`src/data/db.ts`): about 18k steps generated in the browser from a fixed seed. Projects, session titles and models are invented. Response and run times only exist from Aug 24, 2026, as in the real database.
- **Not answered here.** Performance, SSR, and how the data reaches the browser.
- **Not production code.** Plain Vite SPA, no tests, no error handling. Shared code sits in `src/data`, `src/charts`, `src/ui` and `src/state.ts`; each variant sits in `src/variants/<key>-<name>`.
