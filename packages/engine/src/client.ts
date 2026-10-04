import * as Schema from "effect/Schema";
import { Answer, type ChannelPort, type EngineAction, type RequestOutcome } from "./protocol.ts";

export function createPageClient(port: ChannelPort) {
  let nextId = 0;
  let closed = false;
  let pending: { id: number; resolve: (result: RequestOutcome) => void } | undefined;
  const decodeAnswer = Schema.decodeUnknownSync(Answer);
  const receive = (event: MessageEvent): void => {
    const answer = decodeAnswer(event.data);
    if (pending?.id !== answer.id) return;
    pending.resolve({ kind: "paint", state: answer.state });
    pending = undefined;
  };
  port.addEventListener("message", receive);
  return {
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
    },
  };
}
