import * as Schema from "effect/Schema";
import type { BrowserCopy } from "@opencode-stats/browser-copy";
import { Request, type ChannelPort, type EngineRequest, type EngineState } from "./protocol.ts";
import { loadCopy, type EngineNetwork } from "./network.ts";
import { completeState } from "./tokens.ts";

export function connectEngine(port: ChannelPort, network: EngineNetwork): () => Promise<void> {
  let pending: EngineRequest | undefined;
  let result: Promise<{ copy: BrowserCopy | null; state: EngineState }> | undefined;
  let closed = false;
  const decodeRequest = Schema.decodeUnknownSync(Request);
  const answer = async (): Promise<void> => {
    // The cached load owns the facts for the lifetime of this worker channel.
    // Only its complete state crosses the channel; the copy remains here.
    result ??= loadCopy(network)
      .then((copy) => ({ copy, state: completeState(copy) }))
      .catch(() => ({ copy: null, state: { screen: "problem", reason: "copy-unavailable" } }));
    const { state } = await result;
    if (closed || !pending) return;
    const request = pending;
    pending = undefined;
    let response = state;
    if (request.action.kind === "address") {
      try {
        const address = new URL(request.action.address, network.baseUrl);
        if (address.origin !== new URL(network.baseUrl).origin || address.pathname !== "/")
          response = { screen: "problem", reason: "invalid-address" };
      } catch {
        response = { screen: "problem", reason: "invalid-address" };
      }
    }
    port.postMessage({ id: request.id, state: response });
  };
  const receive = (event: MessageEvent): void => {
    pending = decodeRequest(event.data);
    void answer();
  };
  port.addEventListener("message", receive);
  return async () => {
    closed = true;
    port.removeEventListener("message", receive);
    await result;
  };
}
