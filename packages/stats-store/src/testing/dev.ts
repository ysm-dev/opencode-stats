import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-unassigned-import -- the synthetic Bun producer must initialize SQLite before node:sqlite opens
import "../sqlite-library.bun.ts";
import { parseArgs } from "node:util";
import { syntheticDatabase } from "./database.ts";
import { fingerprintFixture } from "./fingerprint.ts";

const { values } = parseArgs({ options: { db: { type: "string" } } });
const filename = values.db;
if (filename === undefined) throw new Error("Expected --db <path>");
if (!existsSync(filename)) {
  const writer = syntheticDatabase(filename);
  fingerprintFixture(writer);
  writer.close();
}
