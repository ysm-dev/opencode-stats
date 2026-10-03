# The browser computes every page from a complete copy

Every page must answer a time range and filters never seen before within a frame (ADR 0007), with exact medians and p95 and with sessions placed at their first matching step, so its numbers can come neither from a server round trip nor from a cache of earlier answers. Each dashboard tab therefore holds a browser copy: every fact the stats store holds, for all history, with every dimension, the names pages print and a permanent ID for every code, about 20 MB on the maintainer's database. A worker in the tab owns it and computes every page, keeping per-local-day totals, keeping results by what they depend on and working out likely next states while idle; the page only draws. The copy is fetched whole and uncompressed from the dashboard server on every load, and kept current by fetching the changes since its revision whenever the live stream announces a commit. The dashboard server never draws a page or computes a statistic: the dashboard renders only in the browser, on TanStack Router without Start (ADR 0013), and the server serves the files, the copy it keeps encoded in memory, the changes since a revision, and the live stream.

## Considered Options

- **Server rendering through Start's handler.** Numbers in the first HTML, but the server would need the aggregation and the browser's timezone, a chart path around Solid Charts' crash under server rendering, and hydration, to save tens of milliseconds on loopback.
- **Answers computed by the dashboard server and cached in the browser.** A combination never seen before would wait on the network.
- **Computing on the page's main thread.** The rule in ADR 0007 would hold for free, but every computation would freeze hovering and scrolling, and the same engine measured about 5 ms slower there than in a worker.
- **Splitting each computation across several workers sharing one copy.** Kept in reserve: a simpler engine than doing less work per change, but its cost still grows with every recorded fact, and its gain depends on the machine's cores.
- **Saving the copy in OPFS or IndexedDB.** Restores took 7–11 ms against a 16 ms fetch, for code that handles format versions, eviction and several tabs writing.
- **Compressing it.** Over loopback, gzip (41 ms) and Brotli (64 ms) arrived later than the raw 20 MB (16 ms).
- **JSON or Apache Arrow on the wire.** JSON is several times larger and slow to parse; Arrow needs a large library on both sides. One dashboard-owned binary format, checked at a trust boundary, carries both the whole copy and its changes.
- **TanStack Query.** The worker already keeps every result, and the copy follows the live stream rather than requests, so Query would have nothing of its own to cache.
- **One copy shared by every tab**, through a shared worker or a leader tab. Less memory, but one tab's computing would delay another's.

## Consequences

- Each tab holds about 40 MB for its copy and indexes, and every load fetches the whole copy (about 16 ms on the maintainer's machine). The dashboard server keeps the encoded copy in memory, built from the stats store at start and patched after each commit.
- A hidden tab closes its live stream, because browsers allow six connections per origin over plain HTTP, and catches up when shown.
- Local days and hours are worked out in the tab, about 8.5 ms for all history, and again whenever the timezone changes. The dashboard server never needs the browser's timezone, not even on a first visit (ADR 0001).
- Addresses and bookmarks hold permanent IDs, never the copy's codes, which change with every rebuild.
- The live stream reports the dashboard server's version and format version. A new format reloads open tabs at once; a new version reloads them the next time they're hidden.
- The brief's stack changes: the dashboard renders only in the browser (on TanStack Router without Start, ADR 0013), TanStack Query is not used, and TanStack Virtual draws the lists that can run to thousands of rows.
