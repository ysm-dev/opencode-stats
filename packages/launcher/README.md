# Launcher

Node built-ins only: no Effect, SQLite, lock access or OpenCode writes.

`discover` validates the private state record and its authenticated HTTP answer before joining. Database conflicts leave the owner alone. A newer release replaces only an older plugin-started owner of the same resolved database. Replacement waits for the old listener, not merely removal of its record.

`startOrJoin` starts a detached, output-discarding candidate with the existing restricted Bun command. `holdServer` returns `ready`, `closed` and an idempotent `release`; activations and plugin reloads in one process share a connection. Dropped holds retry with injected jitter and bounded backoff.

## Stable protocol 1

- The record contains `address`, `pid`, `version`, `database`, `starter`, `protocol: 1` and a 256-bit hex `secret`.
- Control requests send `Authorization: Bearer <secret>` and `X-Opencode-Stats-Protocol: 1`. POST requests also send the record's address as `Origin`.
- `GET /api/server` returns the same identity, with optional diagnostics fields. Unknown diagnostics fields must not invalidate the identity.
- `GET /api/hold` acknowledges with the exact ASCII bytes `opencode-stats-hold/1\n`, then remains open. Closing the connection releases its hold.
- `POST /api/stop` returns 204 before shutdown. `POST /api/conflict` optionally records a database conflict in the owner's log; older peers may omit that endpoint.

These paths, headers and hold acknowledgement remain compatible across releases. Reading the dashboard still needs no secret.
