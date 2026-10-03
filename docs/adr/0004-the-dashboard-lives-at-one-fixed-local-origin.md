# The dashboard lives at one fixed local origin

Browsers key bookmarks, history and storage by origin, and the origin includes the port: a dashboard whose address changed would lose every bookmarked range and filter, and the preferences the browser keeps for it. So the dashboard is always served from `http://127.0.0.1:22439` (0x57A7, "STAT": unassigned by IANA, and below every OS's range of temporary ports), or from the one port the user configures, and the dashboard server fails with a clear message when another program holds that port rather than moving to the next one. It listens on IPv4 loopback only, and redirects requests addressed to `localhost` so the browser never splits its storage across two origins. It rejects requests whose `Host` is not its own address, which defeats DNS rebinding; sends no CORS headers; refuses anything but reads unless they come from its own origin; forbids framing and cross-origin embedding; and makes the dashboard cross-origin isolated (COOP `same-origin`, COEP `require-corp`), so its timers are precise enough to time a change (ADR 0007). Reading the dashboard needs no token: v1 serves one person on one machine, and any program running as that person can read the OpenCode database directly anyway. Only holds and stop requests between opencode-stats' own processes carry a secret, taken from a record only the user's account can read.

## Considered Options

- **The next free port when the default is taken**, as `opencode serve` does from 4096: the origin, and with it every bookmark and anything the browser keeps, would change without a word.
- **A random port on every start**: the same loss on every start.
- **`http://localhost:22439`**: easier to type, but the dashboard server would also have to listen on `::1`, or another program listening there could stand in for it.
- **A per-install access token**, opened as a one-time `?token=` link that sets a cookie: it would keep other accounts on a shared machine out, but OpenCode Desktop gives a plugin no clean way to hand the user that link.

## Consequences

- Other accounts on the same machine can read the dashboard, project names and session titles included, though not the OpenCode database file, which only its owner can read. They cannot stop the dashboard server or keep it running.
- Changing the port starts a new origin, where bookmarks no longer open and the preferences kept for the old one don't carry over. The browser copy itself is fetched afresh on every load (ADR 0008).
- A second account on the same machine needs its own port.
- Nothing listens beyond loopback, so remote access stays out of scope.
- Cross-origin isolation costs nothing, since the dashboard loads nothing from elsewhere, and it keeps shared memory available for splitting a computation across workers, the reserve in ADR 0008.
