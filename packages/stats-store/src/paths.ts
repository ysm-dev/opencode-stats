import { fileURLToPath } from "node:url";
export const syncWorkerFile = new URL("./sync-worker.ts", import.meta.url).href;
export const sqliteLibraryFile = fileURLToPath(
  new URL("../../../.dev/native/sqlite/libsqlite3.dylib", import.meta.url),
);
