import { workerClient } from "./worker-client.ts";
// oxlint-disable-next-line import/no-unassigned-import -- ADR 0017: the main process selects SQLite before constructing its worker
import "./sqlite-library.bun.ts";
import { syncWorkerFile } from "./paths.ts";

export const bunWorker = workerClient(() => {
  const worker = new Worker(syncWorkerFile);
  let closed!: () => void;
  const completion = new Promise<void>((resolve) => {
    closed = resolve;
  });
  worker.addEventListener("close", closed);
  return {
    postMessage: worker.postMessage.bind(worker),
    addEventListener: worker.addEventListener.bind(worker),
    removeEventListener: worker.removeEventListener.bind(worker),
    terminate: async () => {
      worker.terminate();
      await completion;
      worker.removeEventListener("close", closed);
    },
  };
});
