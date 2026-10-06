import * as Schema from "effect/Schema";
import {
  Message,
  type ChannelPort,
  type EngineRequest,
  type EngineState,
  type EngineAction,
} from "./protocol.ts";
import type { EngineNetwork } from "./network.ts";
import { createLiveEngine } from "./live.ts";
import { systemClock, type EngineClock } from "./clock.ts";
import {
  parseRange,
  resolveRange,
  previousPeriod,
  normalizeRange,
  shiftRange,
  rangeAddress,
  presets,
  type TimeRange,
} from "./ranges.ts";
import { changeLabel, periodLabel, rangeLabel, clockLabel } from "./time-labels.ts";

function stateFor(
  range: TimeRange | undefined,
  live: ReturnType<typeof createLiveEngine>,
): EngineState {
  if (range === undefined) return { screen: "problem", reason: "invalid-address" };
  const current = live.current();
  if (!current) return { screen: "problem", reason: "copy-unavailable" };
  const { now, timeZone, locale } = live.time();
  const history = live.history(now, timeZone);
  const period = resolveRange(range, now, timeZone, history);
  const amounts = live.query(period, timeZone);
  const previous = previousPeriod(range, period, timeZone, history);
  const comparison = { tokens: "", sessions: "", caption: "" };
  if (previous) {
    const before = live.query(previous, timeZone);
    comparison.tokens = changeLabel(amounts.tokens.total, before.tokens.total);
    comparison.sessions = changeLabel(amounts.sessions.total, before.sessions.total);
    comparison.caption = `Previous period · ${periodLabel(previous, timeZone, locale)} · through ${clockLabel(previous.end, timeZone, locale)}`;
  }
  return {
    screen: "dashboard",
    address: rangeAddress(range),
    rangeLabel: rangeLabel(range, period, timeZone, locale),
    range: {
      preset:
        typeof range === "string"
          ? range
          : (presets.find((key) => (key === "today" ? 1 : Number.parseInt(key)) === period.days) ??
            "30d"),
      fixedLabel: typeof range === "string" ? "" : periodLabel(period, timeZone, locale),
      canShiftBack: range !== "all",
      canShiftForward: rangeAddress(shiftRange(range, 1, now, timeZone)) !== rangeAddress(range),
    },
    period,
    timeZone,
    comparison,
    ...amounts,
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
  let range: TimeRange | undefined = "30d";
  const selectRange = (action: EngineAction) => {
    live.refreshTime();
    const { now, timeZone } = live.time();
    if (action.kind === "address") {
      try {
        range = parseRange(action.address, network.baseUrl);
      } catch {
        range = undefined;
      }
    } else if (action.kind === "shift")
      range = shiftRange(range ?? "30d", action.direction, now, timeZone);
    else range = action.kind === "all-time" ? "all" : action.preset;
  };
  const paint = () => {
    if (!active || !live.visible()) return;
    const { now, timeZone } = live.time();
    if (range !== undefined) range = normalizeRange(range, now, timeZone);
    const id = pending?.id ?? 0;
    pending = undefined;
    port.postMessage({ id, state: stateFor(range, live) });
  };
  const live = createLiveEngine(network, clock, paint, () => port.postMessage({ reload: true }));
  const decode = Schema.decodeUnknownSync(Message);
  const receive = (event: MessageEvent) => {
    const message = decode(event.data);
    if ("kind" in message) live.signal(message);
    else {
      active = pending = message;
      selectRange(message.action);
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
