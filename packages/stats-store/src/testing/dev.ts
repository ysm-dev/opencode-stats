import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import * as Schema from "effect/Schema";
import { syntheticDatabase } from "./index.ts";
import { fingerprintFixture } from "./fingerprint.ts";

const { values } = parseArgs({ options: { db: { type: "string" } } });
const filename = Schema.decodeUnknownSync(Schema.String)(values.db);
if (!existsSync(filename)) {
  const writer = syntheticDatabase(filename);
  fingerprintFixture(writer);
  writer.close();
}
