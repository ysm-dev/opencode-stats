# Sync follows OpenCode's per-session event sequence

The OpenCode database keeps no change log of its messages: OpenCode rewrites a step's row in place while it runs and sometimes after it completes, reverts and session deletions remove rows, `time_updated` has no index, and plugin events exist only inside OpenCode and are never replayed. What OpenCode does keep is `event_sequence`: one counter per session, advanced in the same transaction as every insert, rewrite and deletion of that session's messages. So the dashboard server's sync polls `PRAGMA data_version` every 500 ms and, when it changes, compares every session's counter with the one its facts came from (13,044 counters, read in under 1 ms), then re-reads each changed session whole, in one read transaction together with its counter, and writes only the facts that differ. A first build is the same loop with every session changed, each read together with its subagent sessions, newest first by the latest message among them.

## Considered Options

- **Scanning `time_updated`.** Without an index it touches every message row, and a row rewritten twice within one millisecond looks unchanged.
- **OpenCode's plugin events.** Standalone mode has none, and a dashboard server that wasn't running misses them for good.
- **Rowid cursors.** They notice new rows, but neither rewrites nor deletions.
- **Re-reading only the rows of a changed session that changed.** Around a hundred times cheaper, but with no per-row change marker it needs overlap windows and a fallback, for a saving the measurements don't call for yet.
- **A fresh stats store after every OpenCode migration or v1 import.** The import moves its progress marker once per session, so a first build running during an import would start over on every pass until the import ended, and each migration would empty the dashboard's history for as long as a build takes.

## Consequences

- Re-reading a session costs about 26 µs per message: 13–37 ms for the largest session today, at most twice a second while it streams.
- `event_sequence` is internal to OpenCode, so the schema fingerprint covers it, and an OpenCode release that changes how it advances is an unrecognised schema.
- Some writes don't advance a session's counter, so every pass also re-reads all session details and projects (moving sessions between projects advances the project's counter instead).
- OpenCode's migrations and its import of v1 history can rewrite rows without advancing their counters. So when OpenCode's migration list changes in a way the schema check recognises, or its v1 import finishes, sync re-reads every session in place: a first build's loop over the existing stats store, writing only the facts that differ, so the dashboard keeps its whole history meanwhile. The import's progress marker, which moves once per imported session, is not a trigger: each imported session is committed together with its counter and read like a new one.
- At startup and every 10 minutes, sync compares each session's message count and highest position with what it derived, re-reads any session that differs, and records a diagnostic, since a difference means a change slipped past the counters.
- An interrupted build resumes where it stopped: each session records the counter its facts came from, so only sessions not yet read, or changed since, are read again.
