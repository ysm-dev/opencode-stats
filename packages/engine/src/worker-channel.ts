import * as Schema from "effect/Schema";
import type { CopyCursor } from "@opencode-stats/browser-copy/api";
import { Request, type ChannelPort, type EngineRequest, type EngineState } from "./protocol.ts";
import { followCopy, loadCopy, type EngineNetwork } from "./network.ts";
import { createFacts } from "./tokens.ts";
import { systemClock, type EngineClock } from "./clock.ts";

function stateFor(
  request: EngineRequest,
  current: ReturnType<ReturnType<typeof createFacts>["current"]>,
  baseUrl: string,
  liveLabel: string,
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
  if (!current) return { screen: "problem", reason: "copy-unavailable" };
  return {
    screen: "dashboard",
    address: "/?range=all",
    rangeLabel: "All time",
    tokens: current.tokens,
    generation: current.generation,
    revision: current.revision,
    liveLabel,
  };
}

export function connectEngine(
  port: ChannelPort,
  network: EngineNetwork,
  clock: EngineClock = systemClock,
): () => Promise<void> {
  const facts = createFacts(clock);
  const controller = new AbortController();
  let pending: EngineRequest | undefined;
  let active: EngineRequest | undefined;
  let initialized: Promise<void> | undefined;
  let target: CopyCursor | undefined;
  let catchingUp: Promise<void> | undefined;
  let stopStream: (() => Promise<void>) | undefined;
  let stopClock: (() => void) | undefined;
  let lastWrite: number | undefined;
  let lastLabel = "Live";
  let closed = false;
  const label = () => {
    if (lastWrite === undefined) return "Live";
    const seconds = Math.max(0, Math.floor((clock.now() - lastWrite) / 1000));
    return seconds === 0 ? "Last write just now" : `Last write ${seconds} s ago`;
  };
  const paint = (id: number, request: EngineRequest) => {
    lastLabel = label();
    port.postMessage({ id, state: stateFor(request, facts.current(), network.baseUrl, lastLabel) });
  };
  const livePaint = () => {
    if (!closed) paint(0, active!);
  };
  const catchUp = async () => {
    while (target && !closed) {
      const wanted = target;
      target = undefined;
      const current = facts.current()!;
      if (wanted.generation === current.generation && wanted.revision <= current.revision) continue;
      const copy = await loadCopy(
        network,
        wanted.generation === current.generation ? current : undefined,
        controller.signal,
      );
      if (!(await facts.apply(copy, controller.signal)) && !closed) {
        await facts.apply(await loadCopy(network, undefined, controller.signal), controller.signal);
      }
      lastWrite = clock.now();
      livePaint();
    }
  };
  const wake = () => {
    if (catchingUp || !target || closed) return;
    catchingUp = catchUp()
      .catch(() => {
        target = undefined;
      })
      .finally(() => {
        catchingUp = undefined;
        wake();
      });
  };
  const initialize = async () => {
    const copy = await loadCopy(network, undefined, controller.signal);
    if (!(await facts.apply(copy, controller.signal)) || closed) return;
    stopStream = followCopy(network, (cursor) => {
      target = cursor;
      wake();
    });
    stopClock = clock.everySecond(() => {
      if (label() !== lastLabel) livePaint();
    });
  };
  const answer = async () => {
    initialized ??= initialize().catch(() => {});
    await initialized;
    if (closed || !pending) return;
    const request = pending;
    pending = undefined;
    paint(request.id, request);
  };
  const decodeRequest = Schema.decodeUnknownSync(Request);
  const receive = (event: MessageEvent) => {
    active = pending = decodeRequest(event.data);
    void answer();
  };
  port.addEventListener("message", receive);
  return async () => {
    closed = true;
    controller.abort();
    stopClock?.();
    port.removeEventListener("message", receive);
    await stopStream?.();
    await initialized;
    await catchingUp;
  };
}
