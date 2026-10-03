# The stats store is a rebuildable cache of counted facts

Counting the transcript (ADR 0002) takes rules that need a whole session at once: leaving a fork's copies out, rolling subagent sessions up into their session, tying each prompt to the step after it, merging tool names, classifying failures and outcomes, and pricing each step. The dashboard server's sync applies all of them once, as it reads the OpenCode database, and the stats store keeps the results as facts at the grain the metrics need: steps, tool calls, prompts and sessions, with times as instants and dimensions as integer codes that never change for the life of the store. Whatever reads it, such as the browser copy (ADR 0008), only filters, buckets and aggregates. Because nothing in it is original, the stats store is a cache: one per OpenCode database, in `${XDG_CACHE_HOME:-~/.cache}/opencode-stats/`, never migrated (a release that changes its layout or a counting rule builds a new one from scratch, newest history first), and never guessed at: it stops updating when the OpenCode database's schema is unrecognised or its file is missing.

## Considered Options

- **Totals precomputed on the server.** Medians, p95 and arbitrary combinations of filters need the individual facts, and local-time buckets would put a timezone on the server (ADR 0001).
- **Counting rules applied in the browser.** Fork exclusion, prompt attribution and pricing would live in two places, and the browser would need OpenCode's raw rows.
- **Migrations between stats-store versions.** Each one could leave a store that no fresh install would produce, and every old version would need testing forever, to save a rebuild of about 15 s.
- **One stats store shared by every OpenCode database.** Every switch between databases, such as two OpenCode channels, would throw it away and rebuild it.
- **The XDG data folder.** It would be backed up and spared by cleaners, for data that one rebuild reproduces.

## Consequences

- Deleting the stats store, or the whole cache folder, is always safe: the next start rebuilds it. On the maintainer's database, with a warm disk cache, the last 30 days were back in about 6 s and all history in about 15 s.
- A release that changes a counting rule makes every user wait through a rebuild, so the stats-store version changes only when the layout or a rule does.
- Estimated cost is stored per step. When OpenCode's price catalog changes, only steps of models whose prices changed are re-priced.
- It holds session titles and project names, so its folder is private to the user (0700, files 0600), like the state folder.
- While OpenCode's schema is unrecognised, the dashboard shows the numbers of its last sync, and says it is not updating, since when and why.
- When the dashboard server starts, it deletes the stats stores of OpenCode databases that no longer exist, never the one it serves.
