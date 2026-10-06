import * as Schema from "effect/Schema";
import {
  Answer,
  type ChannelPort,
  type EngineAction,
  type EngineState,
  type RequestOutcome,
  type EngineSignal,
} from "./protocol.ts";

export function createPageClient(port: ChannelPort, reload: () => void) {
  let nextId = 0;
  let closed = false;
  let pending: { id: number; resolve: (result: RequestOutcome) => void } | undefined;
  const listeners = new Set<(state: EngineState) => void>();
  const decodeAnswer = Schema.decodeUnknownSync(Answer);
  const receive = (event: MessageEvent): void => {
    const answer = decodeAnswer(event.data);
    if ("reload" in answer) {
      reload();
      return;
    }
    if (answer.id === 0) {
      if (pending) return;
    } else {
      if (pending?.id !== answer.id) return;
      pending.resolve({ kind: "paint", state: answer.state });
      pending = undefined;
    }
    for (const listener of listeners) listener(answer.state);
  };
  port.addEventListener("message", receive);
  return {
    signal(signal: EngineSignal): void {
      if (!closed) port.postMessage(signal);
    },
    subscribe(listener: (state: EngineState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(action: EngineAction): Promise<RequestOutcome> {
      if (closed) return Promise.resolve({ kind: "closed" });
      pending?.resolve({ kind: "replaced" });
      const id = ++nextId;
      return new Promise((resolve) => {
        pending = { id, resolve };
        port.postMessage({ id, action });
      });
    },
    dispose(): void {
      closed = true;
      port.removeEventListener("message", receive);
      pending?.resolve({ kind: "closed" });
      pending = undefined;
      listeners.clear();
    },
  };
}
