import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { platform as runtimePlatform } from "node:process";
import { isMainThread } from "node:worker_threads";
import { sqliteLibraryFile } from "./paths.ts";
import metadata from "../../../native/sqlite/manifest.json" with { type: "json" };

let selected = false;
export function initializeSQLite(
  platform: NodeJS.Platform,
  mainThread: boolean,
  file: string = sqliteLibraryFile,
): void {
  if (platform !== "darwin" || !mainThread || selected) return;
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (hash !== metadata.sha256) throw new Error("Controlled SQLite library checksum mismatch.");
  Database.setCustomSQLite(file);
  selected = true;
}
initializeSQLite(runtimePlatform, isMainThread);
