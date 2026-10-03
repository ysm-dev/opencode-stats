# Local time follows the browser's timezone

The OpenCode database stores every time as a UTC instant and never records where the user was, yet the dashboard groups everything by local day, hour, week and month. We reckon all of it in the browser's current timezone, with no timezone setting, and re-bucket the whole history whenever that timezone changes: the browser's clock is the one the person reads, aggregation already runs in the browser, and the charts' time scales tick in browser-local time without custom code. The server never chooses a timezone: the stats store holds instants only, and the browser works out every local day and hour itself (ADR 0008).

## Considered Options

- **The machine's timezone, resolved by the server.** Simplest for server rendering, but a long-running OpenCode process may keep its start-up timezone after travel, `TZ` can override it, and whenever it differed from the browser's every chart would need custom ticks.
- **The browser's timezone plus a timezone setting.** Every chart and bucket would need code for an arbitrary timezone, to serve a disagreement that one person on one machine rarely has.

## Consequences

- After travel, past activity can move to a different local day: the database cannot say where the user was when a step ran.
- A browser that reports UTC for privacy, such as Firefox with resist-fingerprinting, gets UTC days.
- Boundaries come from the timezone's calendar rules, never from adding 24 hours: a local day is 23 or 25 hours long across a daylight-saving change, and half-hour and 45-minute offsets need no special handling.
- A fixed range keeps its local dates, not its instants, when the timezone changes.
- The dashboard server draws no page and works out no local day (ADR 0008), so not even a first visit needs the browser's timezone on the server.
