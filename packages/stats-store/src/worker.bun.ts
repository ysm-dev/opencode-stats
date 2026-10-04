import { workerClient } from "./worker-client.ts";
// oxlint-disable-next-line import/no-unassigned-import -- ADR 0017: the main process selects SQLite before constructing its worker
import "./sqlite-library.bun.ts";
import { syncWorkerFile } from "./paths.ts";

export const bunWorker = workerClient(() => new Worker(syncWorkerFile));
