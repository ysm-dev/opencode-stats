# Engine

`@opencode-stats/engine` exports `createPageClient(worker)` and the request,
complete-state and outcome types. The supplied worker runs the
`@opencode-stats/engine/worker` entry as a module. Its own origin supplies the
dashboard server address; the page receives only state, never facts.

`client.request({ kind: "address", address: "/?range=all" })` opens an address;
`client.request({ kind: "all-time" })` selects All time. This tracer bullet
supports Overview at `/` and answers with all-time Tokens, including each of
the five kinds, and Sessions with subagent sessions counted separately. A session
is placed at its earliest step, including nested subagent activity; empty sessions
never count. Missing token amounts contribute nothing. Token counts accumulate
as integers before conversion to page numbers, avoiding summation-order
rounding errors. Later tickets add
pages, ranges and actions.

A request resolves to `paint` with the complete dashboard or problem state,
`replaced` if a newer request arrived first, or `closed` after disposal. Stale
worker replies cannot paint. `client.dispose()` disconnects the page end.

Production is typed against WebWorker only. Node tests live under
`src/testing/` with their own tsconfig, so their Node globals do not leak into
the worker or portable browser-copy production checks.

`@opencode-stats/engine/testing` connects the real engine and page client in
the test's thread with structured-cloned messages. Pass the in-memory
dashboard server's `fetch`; it exercises the real leaf-imported HttpApi client,
binary decoding and token computation. Dispose both the engine and server.
The row-oriented BigInt reference checks results independently of the engine's
column accumulation. Property seeds follow browser-copy's testing policy.

The four-line worker entry has a maintainer-approved coverage
exception under #27 (issuecomment-5977547319) and an exact CODEOWNERS line.
All channel and engine logic is tested through the in-thread adapter.
