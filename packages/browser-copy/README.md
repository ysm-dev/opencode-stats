# Browser copy

The production entries use no DOM, Node or Bun types:

- `@opencode-stats/browser-copy`: step facts, `encode`, `decode`, `formatVersion`.
- `@opencode-stats/browser-copy/api`: Effect 4's shared `BrowserCopyApi`. Its
  `browserCopy.whole()` endpoint is `GET /api/browser-copy`, returning
  uncompressed `application/octet-stream` bytes, not JSON.
- `@opencode-stats/browser-copy/testing`: **Node test code only**. Synthetic
  copies and arbitraries, property parameters, and an in-memory HttpApi server.

## Format 1

One little-endian buffer has this 80-byte header, followed by six Float64
columns: start instant, input, cache read, cache write, output, reasoning.
Every column has the same row count and shares the decoded input buffer.

| Byte | Field                      | Encoding                                 |
| ---- | -------------------------- | ---------------------------------------- |
| 0    | Magic `0x5354434f`         | Uint32                                   |
| 4    | Format version             | Uint32                                   |
| 8    | Generation                 | 36 ASCII bytes, lowercase UUID           |
| 44   | Reserved                   | Four zero bytes                          |
| 48   | From revision              | Float64, nonnegative safe integer        |
| 56   | Through revision           | Float64, safe integer ≥ from revision    |
| 64   | History-complete instant   | Float64, safe integer, Unix milliseconds |
| 72   | Step count                 | Uint32                                   |
| 76   | Entire payload byte length | Uint32                                   |

Step starts are safe-integer Unix milliseconds. Token amounts are nonnegative
safe integers; NaN means unrecorded, not zero. The decoder validates the header
and exact payload/column lengths before constructing column views, then checks
their values. The encoder also refuses invalid metadata or columns.

The committed SHA-256 fingerprint in `src/binary.test.ts` protects the version:
an encoding change must change the format version, not replace its old hash.

Properties default to seed `20261004` on PRs and local runs. GitHub's weekly
`schedule` event chooses a cryptographically random seed. Each test process
prints its seed; `FC_SEED` replays one, and fast-check reports the shrunk input
and replay path on failure. All data is synthetic.
