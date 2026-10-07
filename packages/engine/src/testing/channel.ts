import { createPageClient } from "../index.ts";
import { connectEngine } from "../worker-channel.ts";
import type { ChannelPort } from "../protocol.ts";
import { systemClock, type EngineClock } from "../clock.ts";
import * as Schema from "effect/Schema";

let reportedRealm = false;
const postRealm = (message: object) => {
  if (!("posted" in message)) return undefined;
  const value = message.posted;
  return {
    tag: Object.prototype.toString.call(value),
    schema: Schema.is(Schema.Uint8Array)(value),
    local: value instanceof Uint8Array,
    view: ArrayBuffer.isView(value),
    shared: ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer,
  };
};
const cloneMessage = (message: object): object => {
  const copy = structuredClone(message);
  const before = postRealm(message);
  const after = postRealm(copy);
  if (!reportedRealm && before && (!before.schema || !after?.schema)) {
    reportedRealm = true;
    process.stderr.write(`[DEBUG-post-realm] ${JSON.stringify({ before, after })}\n`);
  }
  return copy;
};

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
      listener(new MessageEvent("message", { data: cloneMessage(message) }));
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
      const data = cloneMessage(message);
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
    { ...systemClock, timeZone: () => "UTC", locale: () => "en-GB", ...clock },
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
