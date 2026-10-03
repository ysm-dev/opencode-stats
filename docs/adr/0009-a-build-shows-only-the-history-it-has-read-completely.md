# A build shows only the history it has read completely

A build reads the OpenCode database newest history first, each session whole together with its subagent sessions: on the maintainer's database, with a warm disk cache, Today was complete after about 1.2 s, the default 30 days after about 6 s and all history after about 15 s. Standalone mode opens the browser as it starts, and a tab can load during a rebuild, so the dashboard must show something meanwhile, with no loading state (ADR 0007). It shows the dashboard throughout, counting only the history the build has read completely: until the build reaches the OpenCode database's first activity, the start of history is the start of the earliest local day from which it has read everything, facts before that aren't counted even when already read, and every rule about the start of history uses it. Every page says so in its header ("History from Sep 26 · older history is still being read"), so each number on screen is exact for a span the page names: recent ranges are exact as soon as they're read, and longer ones grow in place with each commit, which appears whole like any live change.

## Considered Options

- **Counting everything read so far.** Sessions arrive in order of their latest message, so a session begun in June and resumed yesterday would put its June steps on screen while the rest of June was unread, and every number reaching back past the complete history would be an undercount with no definite meaning.
- **A one-time setup screen**, until the build finishes or reaches the default range. A loading state by another name, hiding 30 days that are ready at about 6 s for the whole build.
- **A blank page until the build finishes.** A load's 250 ms would become about 15 s, longer on a cold disk or a larger database, and a blank page that long looks broken.
- **A blank page until the build covers the range in the address.** Exact without qualification, but the default page would stay blank for about 6 s, and choosing All time during a build would leave the screen unchanged for up to about 10 s.
- **The instant from which history is complete, rather than the next local midnight.** The day holding it would count in part and look like a quiet day, and in a build's first second a page would read "History from 14:37 today".
- **Reading subagent sessions apart from their session.** A session is placed at its first step matching the filters, its own or a subagent session's, so under a filter it could count inside the history shown until the build reached an older subagent session of it.
- **Keeping open tabs on their complete copy until a rebuild finishes.** It helps only when the copy's format is unchanged, and it would hide new activity for the whole rebuild.

## Consequences

- Days and buckets before the start of history look like days without activity, and the bucket holding it isn't marked partial: the header's line says why.
- A previous-period change is hidden when that period starts before the start of history, and streaks and active days count from it. No headline number carries a mark of its own.
- When a time range starts before the start of history, Overview's summary sentence names the span it counts: "since Sep 26", not "in the last 90 days".
- A load paints nothing until its copy covers all of today, about 1.2 s into a first build on the maintainer's database: the one wait a load may take beyond ADR 0007's 250 ms. The reference run holds it to 2 s from the build's start on a warm disk (ADR 0016). An open tab moving to a fresh stats store keeps what it shows until then. If sync stops before the copy covers today, a load shows the problem screen instead.
- A rebuild looks like a first build. Only an opencode-stats release that changes the stats-store version starts one: OpenCode's migrations and its v1 import re-read every session in place instead (ADR 0006).
- A build that stops partway, because OpenCode's schema is unrecognised or its database is missing, keeps its date in the header's line.
- With no activity at all, history starts today: All time is Today, and every number is zero.
- The browser copy holds facts from before the start of history, read with their sessions, that no page counts until the build reaches them.
