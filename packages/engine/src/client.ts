import * as Schema from "effect/Schema";
import type { ChangeTime } from "./change.ts";
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
  let pending:
    | { id: number; input: number; started: number; resolve: (result: RequestOutcome) => void }
    | undefined;
  let signalInput = 0;
  let signalStarted = 0;
  const listeners = new Set<(state: EngineState, timing: ChangeTime) => void>();
  const decodeAnswer = Schema.decodeUnknownSync(Answer);
  const receive = (event: MessageEvent): void => {
    const started = performance.now();
    const answer = decodeAnswer(event.data);
    if ("reload" in answer) {
      reload();
      return;
    }
    let input = signalInput;
    let inputStarted = signalStarted || started - answer.timing.elapsed;
    if (answer.id === 0) {
      if (pending) return;
    } else {
      if (pending?.id !== answer.id) return;
      input = pending.input;
      inputStarted = pending.started;
      pending.resolve({ kind: "paint", state: answer.state });
      pending = undefined;
    }
    signalInput = signalStarted = 0;
    const timing = {
      ...answer.timing,
      input,
      started: inputStarted,
      page: performance.now() - started,
    };
    // Decoding and selecting a complete answer are page-thread work too.
    for (const listener of listeners) listener(answer.state, timing);
  };
  port.addEventListener("message", receive);
  return {
    signal(signal: EngineSignal, started = performance.now()): void {
      if (!closed) {
        port.postMessage(signal);
        if (signal.kind === "paused") {
          signalInput = performance.now() - started;
          signalStarted = signal.paused ? started : 0;
        }
      }
    },
    subscribe(listener: (state: EngineState, timing: ChangeTime) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(action: EngineAction, started = performance.now()): Promise<RequestOutcome> {
      if (closed) return Promise.resolve({ kind: "closed" });
      pending?.resolve({ kind: "replaced" });
      const id = ++nextId;
      return new Promise((resolve) => {
        pending = { id, resolve, input: 0, started };
        port.postMessage({ id, action });
        pending.input = performance.now() - started;
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
