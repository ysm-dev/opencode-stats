import { workerClient } from "./worker-client.ts";
import { syncWorkerFile } from "./paths.ts";

export const bunWorker = workerClient(() => new Worker(syncWorkerFile));
