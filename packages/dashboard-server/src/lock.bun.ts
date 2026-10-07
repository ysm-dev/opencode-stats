import { Database } from "bun:sqlite";
import { initializeSQLite } from "@opencode-stats/stats-store/bun";
import { isMainThread } from "node:worker_threads";
import { lock } from "./lock.ts";

export const bunLock = lock((file) => {
  initializeSQLite(process.platform, isMainThread);
  return new Database(file);
});
