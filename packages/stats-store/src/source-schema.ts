import * as Schema from "effect/Schema";
import type { NativeReader } from "./source-reader.ts";
import profiles from "./source-schema/profiles.json" with { type: "json" };

const column = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  notnull: Schema.Int,
  dflt_value: Schema.NullOr(Schema.String),
  pk: Schema.Int,
  hidden: Schema.Int,
});
const index = Schema.Struct({
  name: Schema.String,
  unique: Schema.Int,
  origin: Schema.String,
  partial: Schema.Int,
});
const indexColumn = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  desc: Schema.Int,
  coll: Schema.NullOr(Schema.String),
  key: Schema.Int,
});
const foreignKey = Schema.Struct({
  seq: Schema.Int,
  table: Schema.String,
  from: Schema.String,
  to: Schema.NullOr(Schema.String),
  on_update: Schema.String,
  on_delete: Schema.String,
  match: Schema.String,
});
const normalize = (value: string) => value.trim().replace(/\s+/gu, " ");
function ordered<A>(rows: A[]) {
  return rows.toSorted((a, b) =>
    JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0,
  );
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function tableManifest(db: NativeReader, name: string) {
  const columns = Schema.decodeUnknownSync(Schema.Array(column))(
    db.all(`PRAGMA table_xinfo(${quote(name)})`),
  ).map((row) => [
    row.name,
    row.type.toUpperCase(),
    row.notnull,
    row.dflt_value,
    row.pk,
    row.hidden,
  ]);
  const indexes = Schema.decodeUnknownSync(Schema.Array(index))(
    db.all(`PRAGMA index_list(${quote(name)})`),
  ).map((row) => {
    const parts = Schema.decodeUnknownSync(Schema.Array(indexColumn))(
      db.all(`PRAGMA index_xinfo(${quote(row.name)})`),
    )
      .filter((part) => part.key === 1)
      .map((part) => [part.name, part.desc, part.coll]);
    const sql = Schema.decodeUnknownSync(Schema.NullOr(Schema.String))(
      db.all("SELECT sql FROM sqlite_schema WHERE name=?", row.name)[0]!["sql"],
    );
    const where = sql?.match(/\bWHERE\s+(.+)$/isu)?.[1];
    return [
      row.name,
      row.unique,
      row.origin,
      row.partial,
      parts,
      where === undefined ? null : normalize(where),
    ];
  });
  const foreignKeys = Schema.decodeUnknownSync(Schema.Array(foreignKey))(
    db.all(`PRAGMA foreign_key_list(${quote(name)})`),
  ).map((row) => [row.seq, row.table, row.from, row.to, row.on_update, row.on_delete, row.match]);
  return {
    name,
    columns: ordered(columns),
    indexes: ordered(indexes),
    foreignKeys: ordered(foreignKeys),
  };
}

type SchemaResult = {
  readonly kind: "recognized" | "newer" | "v1" | "other";
  readonly migrations: readonly string[];
  readonly fingerprint: string;
};

function unrecognized(
  db: NativeReader,
  names: ReadonlySet<string>,
  migrations: readonly string[],
): "newer" | "v1" | "other" {
  const known = profiles.profiles["2.0.15"].migrations;
  const unseen = migrations.filter((id) => !known.includes(id));
  if (
    unseen.length > 0 &&
    unseen.every(
      (id) => /^\d{14}_[\w-]+$/u.test(id) && id.slice(0, 14) > known.at(-1)!.slice(0, 14),
    )
  )
    return "newer";
  const v1 =
    !names.has("session_v2") &&
    ["session", "message", "part", "project", "__drizzle_migrations"].every((name) =>
      names.has(name),
    ) &&
    ["id", "session_id", "data", "time_created", "time_updated"].every((name) =>
      db.all("PRAGMA table_info('message')").some((row) => row["name"] === name),
    );
  return v1 ? "v1" : "other";
}

function journalRows(db: NativeReader, names: ReadonlySet<string>) {
  return names.has("migration") &&
    db.all("PRAGMA table_info('migration')").some((row) => row["name"] === "id")
    ? db.all("SELECT id FROM migration ORDER BY id")
    : [];
}

function importMarker(db: NativeReader, names: ReadonlySet<string>) {
  return names.has("kv") &&
    ["key", "value"].every((name) =>
      db.all("PRAGMA table_info('kv')").some((row) => row["name"] === name),
    )
    ? db.all(
        "SELECT value, json_extract(value,'$.phase') AS phase FROM kv WHERE key='migration.v1-v2'",
      )[0]
    : undefined;
}

export function schemaReader(db: NativeReader) {
  let stamp = "";
  let result: SchemaResult;
  return () => {
    const tables = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(
      db.all("SELECT name FROM sqlite_schema WHERE type='table'"),
    );
    const names = new Set(tables.map((row) => row.name));
    const journal = journalRows(db, names);
    const migrations = journal.flatMap((row) => (typeof row["id"] === "string" ? [row["id"]] : []));
    const marker = importMarker(db, names);
    const completed = marker?.["phase"] === "completed";
    const version = db.all("PRAGMA schema_version")[0]!["schema_version"];
    const next = JSON.stringify([migrations, journal.length, marker?.["value"], version]);
    const changed = next !== stamp;
    if (changed) {
      stamp = next;
      const profile = Object.values(profiles.profiles).find(
        (item) => JSON.stringify(item.migrations) === JSON.stringify(migrations),
      );
      const matches =
        journal.length === migrations.length &&
        profile?.manifest.every(
          (table) =>
            names.has(table.name) &&
            JSON.stringify(tableManifest(db, table.name)) === JSON.stringify(table),
        );
      result = {
        kind: matches ? "recognized" : unrecognized(db, names, migrations),
        migrations,
        fingerprint: matches ? profile!.fingerprint : "unrecognized",
      };
    }
    return { ...result!, completed, changed };
  };
}
