import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeSQLite } from "./sqlite-library.bun.ts";
import metadata from "../../../native/sqlite/manifest.json" with { type: "json" };
import * as Schema from "effect/Schema";

test("controlled library selection precedes bun:sqlite and node:sqlite and is idempotent", async () => {
  initializeSQLite(process.platform, true);
  initializeSQLite(process.platform, true);
  const db = new Database(":memory:");
  try {
    const row = Schema.decodeUnknownSync(
      Schema.Struct({ version: Schema.String, sourceId: Schema.String }),
    )(db.query("SELECT sqlite_version() AS version,sqlite_source_id() AS sourceId").get());
    if (process.platform === "darwin")
      expect(row).toEqual({ version: metadata.version, sourceId: metadata.sourceId });
    else expect(row).toHaveProperty("version");
    initializeSQLite(process.platform, false);
    initializeSQLite(process.platform, true);
    const { DatabaseSync } = await import("node:sqlite");
    const twin = new DatabaseSync(":memory:");
    try {
      expect({
        ...twin.prepare("SELECT sqlite_version() AS version,sqlite_source_id() AS sourceId").get(),
      }).toEqual(row);
    } finally {
      twin.close();
    }
  } finally {
    db.close();
  }
});
