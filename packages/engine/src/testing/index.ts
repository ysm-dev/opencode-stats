import { createPageClient } from "../index.ts";
import { connectEngine } from "../worker-channel.ts";
import type { ChannelPort } from "../protocol.ts";
import { systemClock, type EngineClock } from "../clock.ts";
export { referenceTokens } from "./reference.ts";
export { manualClock } from "./manual-clock.ts";

export function inThreadEngine(
  fetch: typeof globalThis.fetch,
  deliverAnswer: (deliver: () => void) => void = queueMicrotask,
  clock: Partial<EngineClock> = {},
  reload: () => void = () => {},
) {
  const answers: object[] = [];
  type Listeners = Map<string, Set<(event: MessageEvent) => void>>;
  const page: Listeners = new Map();
  const worker: Listeners = new Map();
  const deliver = (to: Listeners, message: object): void => {
    for (const listener of to.get("message") ?? [])
      listener(new MessageEvent("message", { data: structuredClone(message) }));
  };
  const port = (from: Listeners, to: Listeners): ChannelPort => ({
    addEventListener: (type, listener) => {
      const listeners = from.get(type) ?? new Set();
      from.set(type, listeners.add(listener));
    },
    removeEventListener: (type, listener) => {
      from.get(type)?.delete(listener);
    },
    postMessage: (message) => {
      const data = structuredClone(message);
      if (to === page) answers.push(data);
      const schedule = to === page ? deliverAnswer : queueMicrotask;
      schedule(() => {
        deliver(to, data);
      });
    },
  });
  const stop = connectEngine(
    port(worker, page),
    { baseUrl: "http://127.0.0.1:22440", fetch, release: "test-release" },
    { ...systemClock, ...clock },
  );
  const client = createPageClient(port(page, worker), reload);
  return {
    client,
    answers,
    sendToWorker: (message: object) => Promise.resolve().then(() => deliver(worker, message)),
    sendToPage: (message: object) => Promise.resolve().then(() => deliver(page, message)),
    dispose: async () => {
      client.dispose();
      await stop();
    },
  };
}
