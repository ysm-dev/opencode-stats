import { createHash } from "node:crypto";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readBuilt, syntheticFixture, syntheticV1Database } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import type { StoreEvent } from "./store.ts";
import profiles from "./source-schema/profiles.json" with { type: "json" };
import earliest from "./source-schema/2.0.0.json" with { type: "json" };
import latest from "./source-schema/2.0.22.json" with { type: "json" };

it("pins every supported stable release and canonical manifest to its primary source", () => {
  expect(profiles.releases.map((item) => item.release)).toEqual(
    Array.from({ length: 23 }, (_, index) => `2.0.${index}`),
  );
  expect(profiles.releases[0]!.commit).toBe("63f7ceecbed2d7d9a627518d935dd963b9d4ac9f");
  expect(profiles.releases.at(-1)!.commit).toBe("527f0b931d1f9b3ebd34e106c51b31ce5db5b075");
  for (const release of profiles.releases) {
    const profile =
      release.schema === "2.0.0" ? profiles.profiles["2.0.0"] : profiles.profiles["2.0.15"];
    expect(release.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(release.fingerprint).toBe(
      createHash("sha256").update(JSON.stringify(profile.manifest)).digest("hex"),
    );
  }
  expect(earliest.migrations).toEqual(profiles.profiles["2.0.0"].migrations);
  expect(latest.migrations).toEqual(profiles.profiles["2.0.15"].migrations);
});

it.each(profiles.releases)(
  "recognizes the complete pinned $release schema through stayInSync",
  async ({ release, fingerprint }) => {
    const f = syntheticFixture(release);
    const events: StoreEvent[] = [];
    try {
      f.writer.session("synthetic-session");
      f.writer.message({
        id: "synthetic-message",
        session: "synthetic-session",
        seq: 0,
        start: 1,
        tokens: { output: 3 },
      });
      const copy = await readBuilt(
        { source: f.source, cacheHome: f.folder },
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(events).toContainEqual({
        kind: "schema.checked",
        result: "recognized",
        fingerprint,
        migrations: Number(release.split(".").at(-1)) < 15 ? 47 : 48,
      });
      expect(events.some((event) => event.kind === "sync.stopped")).toBe(false);
      expect(copy.steps[0]!.output).toBe(3);
    } finally {
      f.dispose();
    }
  },
);

it.each([
  {
    name: "newer migration",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.migration("20261007120000_future"),
    result: "newer",
  },
  {
    name: "mixed old and newer unknown migrations",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) => {
      writer.migration("20261007120000_future");
      writer.migration("20200101000000_unknown");
    },
    result: "other",
  },
  {
    name: "non-ID migration data",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.migration("SYNTHETIC PRIVATE MESSAGE"),
    result: "other",
  },
  {
    name: "missing known migration",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.migration("20260923013825_project_time_active", false),
    result: "other",
  },
  {
    name: "missing migration journal",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("DROP TABLE migration"),
    result: "other",
  },
  {
    name: "malformed migration journal",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("DROP TABLE migration; CREATE TABLE migration(other text)"),
    result: "other",
  },
  {
    name: "null migration ID",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("INSERT INTO migration VALUES (NULL,0)"),
    result: "other",
  },
  {
    name: "malformed kv layout",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("DROP TABLE kv; CREATE TABLE kv(other text)"),
    result: "other",
  },
  {
    name: "missing kv",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("DROP TABLE kv"),
    result: "other",
  },
  {
    name: "missing internal event_sequence",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("PRAGMA foreign_keys=OFF; DROP TABLE event_sequence"),
    result: "other",
  },
  {
    name: "missing column",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("ALTER TABLE event_sequence DROP COLUMN owner_id"),
    result: "other",
  },
  {
    name: "extra required-table column",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("ALTER TABLE event_sequence ADD private_data text"),
    result: "other",
  },
  {
    name: "missing index",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema("DROP INDEX session_message_session_seq_idx"),
    result: "other",
  },
  {
    name: "changed uniqueness",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema(
        "DROP INDEX session_message_session_seq_idx; CREATE INDEX session_message_session_seq_idx ON session_message(session_id,seq)",
      ),
    result: "other",
  },
  {
    name: "changed partial predicate",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema(
        "DROP INDEX session_pending_session_compaction_idx; CREATE UNIQUE INDEX session_pending_session_compaction_idx ON session_pending(session_id) WHERE type='other'",
      ),
    result: "other",
  },
  {
    name: "changed foreign key",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema(
        "PRAGMA foreign_keys=OFF; DROP TABLE session_message; CREATE TABLE session_message(id text PRIMARY KEY, session_id text NOT NULL REFERENCES session_v2(id) ON DELETE SET NULL,type text NOT NULL,seq integer NOT NULL,time_created integer NOT NULL,time_updated integer NOT NULL,data text NOT NULL)",
      ),
    result: "other",
  },
  {
    name: "duplicated foreign keys",
    change: (writer: ReturnType<typeof syntheticFixture>["writer"]) =>
      writer.schema(
        "PRAGMA foreign_keys=OFF; DROP TABLE session_message; CREATE TABLE session_message(id text PRIMARY KEY, session_id text NOT NULL REFERENCES session_v2(id) ON DELETE CASCADE REFERENCES session_v2(id) ON DELETE CASCADE,type text NOT NULL,seq integer NOT NULL,time_created integer NOT NULL,time_updated integer NOT NULL,data text NOT NULL)",
      ),
    result: "other",
  },
])("stops safely for $name without reading private source rows", async ({ change, result }) => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  try {
    change(f.writer);
    const copy = await readBuilt(
      { source: f.source, cacheHome: f.folder },
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(copy.revision).toBe(0);
    expect(copy.steps).toEqual([]);
    expect(copy.pricing).toEqual({
      catalog: { id: 1, source: "unavailable", stamp: null, updatedAt: 0, digest: null },
      models: [],
    });
    expect(events).toContainEqual(expect.objectContaining({ kind: "schema.checked", result }));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "sync.stopped", reason: `schema.${result}` }),
    );
    expect(JSON.stringify(events)).not.toContain("SYNTHETIC PRIVATE");
  } finally {
    f.dispose();
  }
});

it("ignores physical column order and legacy or embedder-owned tables, not required semantic shapes", async () => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  try {
    f.writer.schema(
      "ALTER TABLE project DROP COLUMN time_active; ALTER TABLE project ADD time_active integer DEFAULT 0 NOT NULL; CREATE TABLE _embedder(data text); CREATE TABLE __drizzle_migrations(id integer); CREATE TABLE session(id text)",
    );
    const copy = await readBuilt(
      { source: f.source, cacheHome: f.folder },
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(copy.historyComplete).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "schema.checked", result: "recognized" }),
    );
  } finally {
    f.dispose();
  }
});

it.each(["virtual", "stored", "hidden"])(
  "rejects extra %s columns with the exact known migration set",
  async (kind) => {
    const f = syntheticFixture();
    const events: StoreEvent[] = [];
    try {
      const change =
        kind === "virtual"
          ? "ALTER TABLE event_sequence ADD COLUMN added TEXT GENERATED ALWAYS AS (aggregate_id) VIRTUAL"
          : kind === "stored"
            ? "PRAGMA foreign_keys=OFF; DROP TABLE event_sequence; CREATE TABLE event_sequence(aggregate_id TEXT PRIMARY KEY,seq INTEGER NOT NULL,owner_id TEXT,added TEXT GENERATED ALWAYS AS (aggregate_id) STORED)"
            : "PRAGMA foreign_keys=OFF; DROP TABLE event_sequence; CREATE VIRTUAL TABLE event_sequence USING fts5(aggregate_id,seq,owner_id)";
      f.writer.schema(change);
      const result = await readBuilt(
        { source: f.source, cacheHome: f.folder },
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(result.revision).toBe(0);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "schema.checked", result: "other", migrations: 48 }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "sync.stopped", reason: "schema.other" }),
      );
    } finally {
      f.dispose();
    }
  },
);

it.each([false, true])(
  "classifies pinned v1 without importing it, and rejects incomplete legacy shapes (%s)",
  async (incomplete) => {
    const f = syntheticFixture();
    const source = join(f.folder, "legacy.db");
    const events: StoreEvent[] = [];
    try {
      syntheticV1Database(source, incomplete);
      const copy = await readBuilt(
        { source, cacheHome: f.folder },
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(copy.revision).toBe(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "sync.stopped",
          reason: incomplete ? "schema.other" : "schema.v1",
        }),
      );
    } finally {
      f.dispose();
    }
  },
);
