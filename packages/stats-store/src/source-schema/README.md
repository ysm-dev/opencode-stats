# Pinned OpenCode schemas

`profiles.json` records the immutable Git commit and canonical schema fingerprint
for every stable supported release, 2.0.0–2.0.22. Sources are those exact tags in
[`anomalyco/opencode`](https://github.com/anomalyco/opencode):

- `packages/core/src/database/schema.gen.ts`: bootstrap statements;
- `packages/core/src/database/migration.gen.ts`: complete migration IDs;
- `packages/core/src/database/migration.ts`: migration journal definition;
- `packages/core/src/database/migration/20260923013825_project_time_active.ts`:
  the only migration added during this release interval;
- `packages/core/src/database/v1-migration.bun.ts`: the completed import marker.

Each tag was read independently, not inferred from the version number. All tags
before 2.0.15 have the same 47 IDs and schema. Tags 2.0.15–2.0.22 have the same 48
IDs and schema. The reviewed `2.0.22.json` fixture from commit
`d259ae716379a67bcc35943ba75590f1fc7a1b26` is byte-for-byte identical in statements
and migration IDs to the pinned stable schema at
`527f0b931d1f9b3ebd34e106c51b31ce5db5b075`.

The canonical manifest comes from applying only the bootstrap SQL to disposable
in-memory SQLite databases, adding the journal as defined upstream, and reading
table, index and foreign-key pragmas. It includes column types, nullability,
defaults and primary keys; index uniqueness, origin, key columns, collation,
direction and partial predicate; and foreign-key actions. Columns, indexes and
foreign keys are sorted; physical column ordinals and foreign-key IDs are not
part of the fingerprint. The SHA-256 input is the compact JSON manifest. Runtime
recognition compares the complete migration set and every required table's exact
manifest, permitting additional legacy and embedder-owned tables. It never runs
OpenCode migrations or changes an OpenCode connection's journal.

`1.4.9.json` contains the SQL migrations from tag v1.4.9, commit
`803d9eb7ad5f4dfd832d7506a7cad83ded52253e`, under
`packages/opencode/migration`. It supplies a synthetic v1 database for diagnostic
classification only; no v1 facts are read. The legacy session/message/part tables
and Drizzle journal distinguish it from supported v2 and unrelated SQLite files.

The per-store `.sync` sidecar is a private, atomically replaced receipt containing
only the store generation, accepted migration list, completed-import flag and last
successful reconciliation time and source-file identity. A replacement or repaired
damaged source is conservatively reread even if its counters happen to match.
It advances only after a complete successful pass. This allows migration/import
rereads to resume after interruption or downtime without changing the SQLite
layout, counted facts, store version (8), or binary format version (7).
