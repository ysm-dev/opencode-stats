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
  shiftRange,
  rangeAddress,
  presets,
  type TimeRange,
} from "./ranges.ts";
import { changeLabel, periodLabel, rangeLabel, clockLabel } from "./time-labels.ts";
import { parseFilters, filterAddress, toggleFilter, removeFilter, type Filter } from "./filters.ts";

function stateFor(
  range: TimeRange | undefined,
  filters: readonly Filter[],
  live: ReturnType<typeof createLiveEngine>,
): EngineState {
  if (range === undefined) return { screen: "problem", reason: "invalid-address" };
  const current = live.current();
  if (!current) return { screen: "problem", reason: "copy-unavailable" };
  const { now, timeZone, locale } = live.time();
  const history = live.history(now, timeZone);
  const period = resolveRange(range, now, timeZone, history);
  const amounts = live.query(period, timeZone, filters);
  const previous = previousPeriod(range, period, timeZone, history);
  const comparison = { tokens: "", sessions: "", caption: "" };
  if (previous) {
    const before = live.query(previous, timeZone, filters);
    comparison.tokens = changeLabel(amounts.tokens.total, before.tokens.total);
    comparison.sessions = changeLabel(amounts.sessions.total, before.sessions.total);
    comparison.caption = `Previous period · ${periodLabel(previous, locale)} · through ${clockLabel(previous.end, timeZone, locale)}`;
  }
  return {
    screen: "dashboard",
    address: filterAddress(rangeAddress(range), filters),
    rangeLabel: rangeLabel(range, period, locale),
    range: {
      preset:
        typeof range === "string"
          ? range
          : (presets.find((key) => (key === "today" ? 1 : Number.parseInt(key)) === period.days) ??
            "30d"),
      fixedLabel: typeof range === "string" ? "" : periodLabel(period, locale),
      canShiftBack: range !== "all",
      canShiftForward: rangeAddress(shiftRange(range, 1, now, timeZone)) !== rangeAddress(range),
    },
    period,
    timeZone,
    comparison,
    ...amounts,
    ...live.filterState(period, timeZone, filters),
    generation: current.generation,
    revision: current.revision,
    ...live.status(),
    filterAnnouncement: "",
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
  let filters: readonly Filter[] = [];
  let filterChange:
    | Extract<EngineAction, { kind: "filter" | "remove-filter" | "clear-filters" }>
    | undefined;
  let filterAnnouncement = "";
  const selectRange = (action: EngineAction) => {
    filterChange = undefined;
    filterAnnouncement = "";
    live.refreshTime();
    const { now, timeZone } = live.time();
    if (action.kind === "address") {
      try {
        range = parseRange(action.address, network.baseUrl);
        filters = parseFilters(action.address, network.baseUrl);
      } catch {
        range = undefined;
      }
    } else if (action.kind === "preset") {
      range = action.preset;
    } else if (
      action.kind === "filter" ||
      action.kind === "remove-filter" ||
      action.kind === "clear-filters"
    ) {
      filters =
        action.kind === "clear-filters"
          ? []
          : action.kind === "remove-filter"
            ? removeFilter(filters, action)
            : toggleFilter(filters, action);
      filterChange = action;
    } else if (action.kind === "shift")
      range = shiftRange(range ?? "30d", action.direction, now, timeZone);
    else range = "all";
  };
  const paint = () => {
    if (!active || !live.visible()) return;
    const id = pending?.id ?? 0;
    pending = undefined;
    const state = stateFor(range, filters, live);
    if (state.screen === "dashboard" && filterChange) {
      if (filterChange.kind === "clear-filters") filterAnnouncement = "Filters cleared";
      else if (filterChange.announce) {
        const change = filterChange;
        const selected = state.filters.find(
          (filter) => filter.dimension === change.dimension && filter.id === change.id,
        );
        filterAnnouncement = `Filter ${selected ? "added" : "removed"}: ${change.dimension} ${selected?.name ?? live.filterLabel(change)}`;
      }
    }
    filterChange = undefined;
    port.postMessage({
      id,
      state: state.screen === "dashboard" ? { ...state, filterAnnouncement } : state,
    });
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
