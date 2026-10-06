# Browser copy

The production entries use no DOM, Node or Bun types:

- `@opencode-stats/browser-copy`: step, session and project facts, `encode`, `decode`, `formatVersion`.
- `@opencode-stats/browser-copy/api`: Effect 4's shared `BrowserCopyApi`. Its
  `browserCopy.whole()` endpoint is `GET /api/browser-copy`, returning
  uncompressed `application/octet-stream` bytes, not JSON.
- `@opencode-stats/browser-copy/testing`: **Node test code only**. Synthetic
  copies and arbitraries, property parameters, and an in-memory HttpApi server.

## Format 3

One little-endian buffer has this 112-byte header, followed by Float64 columns.
Steps carry start, five token kinds, provider, model, variant, agent, project,
owning session and originating subagent. Session columns carry code, parent,
owning session, project and fork origin. Projects and dimension tombstones are
code columns. Every decoded column shares the input buffer.

| Byte | Field                      | Encoding                                 |
| ---- | -------------------------- | ---------------------------------------- |
| 0    | Magic `0x5354434f`         | Uint32                                   |
| 4    | Format version             | Uint32                                   |
| 8    | Generation                 | 36 ASCII bytes, lowercase UUID           |
| 44   | Copy kind                  | Uint32: whole = 0, changes = 1           |
| 48   | From revision              | Float64, nonnegative safe integer        |
| 56   | Through revision           | Float64, safe integer ≥ from revision    |
| 64   | History-complete instant   | Float64, safe integer, Unix milliseconds |
| 72   | Step count                 | Uint32                                   |
| 76   | Entire payload byte length | Uint32                                   |
| 80   | String section byte length | Uint32                                   |
| 84   | Step tombstone count       | Uint32                                   |
| 88   | Dimension name count       | Uint32                                   |
| 92   | Reserved                   | Four zero bytes                          |
| 96   | Session count              | Uint32                                   |
| 100  | Project count              | Uint32                                   |
| 104  | Session tombstone count    | Uint32                                   |
| 108  | Project tombstone count    | Uint32                                   |

Step starts are safe-integer Unix milliseconds. Token amounts are nonnegative
safe integers; NaN means unrecorded, not zero. The decoder validates the header
and exact payload/column lengths before constructing column views, then checks
their values. The encoder also refuses invalid metadata or columns.

Length-prefixed UTF-16LE strings carry step IDs, step tombstones, and dimension
codes with permanent IDs and printed names. A model's permanent ID is
`provider/model`; projects and sessions use OpenCode IDs; variants and agents use
their names. Codes are store-local integers, never addresses. Changes contain
only differing facts/names and explicit tombstones for every fact kind.

The committed SHA-256 fingerprint in `src/binary.test.ts` protects the version:
an encoding change must change the format version, not replace its old hash.

Properties default to seed `20261004` on PRs and local runs. GitHub's weekly
`schedule` event chooses a cryptographically random seed. Each test process
prints its seed; `FC_SEED` replays one, and fast-check reports the shrunk input
and replay path on failure. All data is synthetic.
