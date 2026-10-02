# Statistics count what the OpenCode database holds now

OpenCode deletes rows when a session is deleted or a revert is committed, copies settled history into forks with its original timestamps and usage, and keeps per-session usage counters that are not a sum of the transcript. Every number on the dashboard is derived from the transcript as the OpenCode database holds it now, with each step counted once: deleting a session or committing a revert removes that usage, a fork's copied history is never counted, and the per-session counters are never read. This keeps the stats store rebuildable from the OpenCode database at any time, and keeps the history shown independent of whether opencode-stats was running when the work happened.

## Considered Options

- **A ledger in the stats store**, keeping steps after OpenCode deletes them. Deleted and reverted work would keep counting, but only if opencode-stats saw it first, and any rebuild after a schema change or upgrade would silently lose it.
- **OpenCode's per-session counters.** They include reverted and title-generation usage, but carry no model, agent or time, and forks and reverts stop them agreeing with the transcript.
- **Counting a fork's copied history once its origin is deleted.** Past days would change whenever an unrelated session is deleted.

## Consequences

- Deleting a session in OpenCode changes past days on the dashboard. Archived sessions still count: archiving only hides them.
- Reverted steps stop counting, although they were paid for.
- Title generation's usage is never counted, so totals won't match OpenCode's per-session counters.
- When a fork's origin is deleted, the usage the fork copied from it disappears with it.
