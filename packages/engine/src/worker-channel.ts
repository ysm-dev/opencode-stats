import * as Schema from "effect/Schema";
import { Message, type ChannelPort, type EngineRequest, type EngineState } from "./protocol.ts";
import type { EngineNetwork } from "./network.ts";
import { createLiveEngine } from "./live.ts";
import { systemClock, type EngineClock } from "./clock.ts";

function stateFor(
  request: EngineRequest,
  live: ReturnType<typeof createLiveEngine>,
  baseUrl: string,
): EngineState {
  if (request.action.kind === "address") {
    try {
      const address = new URL(request.action.address, baseUrl);
      if (address.origin !== new URL(baseUrl).origin || address.pathname !== "/")
        return { screen: "problem", reason: "invalid-address" };
    } catch {
      return { screen: "problem", reason: "invalid-address" };
    }
  }
  const current = live.current();
  if (!current) return { screen: "problem", reason: "copy-unavailable" };
  return {
    screen: "dashboard",
    address: "/?range=all",
    rangeLabel: "All time",
    tokens: current.tokens,
    sessions: current.sessions,
    generation: current.generation,
    revision: current.revision,
    ...live.status(),
  };
}

export function connectEngine(
  port: ChannelPort,
  network: EngineNetwork,
  clock: EngineClock = systemClock,
): () => Promise<void> {
  let pending: EngineRequest | undefined;
  let active: EngineRequest | undefined;
  const paint = () => {
    if (!active || !live.visible()) return;
    const id = pending?.id ?? 0;
    pending = undefined;
    port.postMessage({ id, state: stateFor(active, live, network.baseUrl) });
  };
  const live = createLiveEngine(network, clock, paint, () => port.postMessage({ reload: true }));
  const decode = Schema.decodeUnknownSync(Message);
  const receive = (event: MessageEvent) => {
    const message = decode(event.data);
    if ("kind" in message) live.signal(message);
    else {
      active = pending = message;
      if (live.current()) paint();
      else live.start();
    }
  };
  port.addEventListener("message", receive);
  return async () => {
    port.removeEventListener("message", receive);
    await live.dispose();
  };
}
