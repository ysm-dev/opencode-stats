import * as Schema from "effect/Schema";
import {
  Message,
  type ChannelPort,
  type EngineRequest,
  type EngineState,
  type EngineAction,
} from "./protocol.ts";
import type { EngineNetwork } from "./network.ts";
import type { ChangeKind } from "./change.ts";
import { createPostClock } from "./post-clock.ts";
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
import {
  changeLabel,
  periodLabel,
  rangeLabel,
  clockLabel,
  dateLabel,
  summarySpan,
} from "./time-labels.ts";
import { localDate } from "./calendar.ts";
import { parseFilters, filterAddress, toggleFilter, removeFilter, type Filter } from "./filters.ts";
import { historyLine } from "./history.ts";
import {
  defaultChart,
  parseChart,
  chartAddress,
  normalizeChart,
  type ChartChoice,
} from "./chart-choice.ts";

const measuredChange = (value: number | null, before: number | null) =>
  value === null || before === null ? "" : changeLabel(value, before);

function stateFor(
  range: TimeRange | undefined,
  filters: readonly Filter[],
  choice: ChartChoice,
  live: ReturnType<typeof createLiveEngine>,
): EngineState {
  if (range === undefined) return { screen: "problem", reason: "invalid-address" };
  const current = live.current();
  if (!current || !live.ready())
    return {
      screen: "problem",
      reason: "copy-unavailable",
      ...(live.status().stop ? { stop: live.status().stop! } : {}),
    };
  const { now, timeZone, locale } = live.time();
  const history = live.history(now, timeZone);
  const historyLabel = dateLabel(localDate(history, timeZone), locale, false);
  const status = live.status();
  const period = resolveRange(range, now, timeZone, history);
  const amounts = live.query(period, timeZone, filters);
  const previous = previousPeriod(range, period, timeZone, history);
  const comparison = {
    tokens: "",
    sessions: "",
    steps: "",
    prompts: "",
    failed: "",
    response: "",
    cacheHitRate: "",
    tools: "",
    cost: "",
    caption: "",
  };
  if (previous) {
    const before = live.query(previous, timeZone, filters);
    comparison.tokens = changeLabel(amounts.tokens.total, before.tokens.total);
    comparison.sessions = changeLabel(amounts.sessions.total, before.sessions.total);
    comparison.tools = changeLabel(amounts.tools.calls, before.tools.calls);
    for (const key of ["steps", "prompts", "failed"] as const)
      comparison[key] = changeLabel(amounts.metrics[key], before.metrics[key]);
    comparison.response = measuredChange(amounts.metrics.response.p50, before.metrics.response.p50);
    comparison.cacheHitRate = measuredChange(
      amounts.metrics.cacheHitRate,
      before.metrics.cacheHitRate,
    );
    comparison.cost = measuredChange(amounts.metrics.cost.estimated, before.metrics.cost.estimated);
    comparison.caption = `Previous period · ${periodLabel(previous, locale)} · through ${clockLabel(previous.end, timeZone, locale)}`;
  }
  return {
    screen: "dashboard",
    address: chartAddress(filterAddress(rangeAddress(range), filters), choice),
    chart: live.chart(period, timeZone, locale, filters, choice),
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
    historyStart: history,
    historyComplete: current.historyComplete,
    summary: `You ran ${amounts.metrics.steps.toLocaleString("en-US")} steps across ${amounts.sessions.total.toLocaleString("en-US")} sessions ${period.start < history ? `since ${historyLabel}` : summarySpan(range, period, locale)}.`,
    comparison,
    ...amounts,
    recordedFromLabel:
      amounts.metrics.response.recordedFrom === null
        ? ""
        : dateLabel(localDate(amounts.metrics.response.recordedFrom, timeZone), locale),
    ...live.filterState(period, timeZone, filters),
    generation: current.generation,
    revision: current.revision,
    ...status,
    statusLine: historyLine(
      current.historyComplete,
      historyLabel,
      status.statusLine,
      status.paused,
    ),
    announcement: status.announcement.startsWith("Not updating")
      ? historyLine(current.historyComplete, historyLabel, status.announcement, status.paused)
      : status.announcement,
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
  let choice = defaultChart;
  let filterChange:
    | Extract<EngineAction, { kind: "filter" | "remove-filter" | "clear-filters" }>
    | undefined;
  let filterAnnouncement = "";
  let inputWork = 0;
  let sequence = 0;
  const selectRange = (action: EngineAction) => {
    filterChange = undefined;
    filterAnnouncement = "";
    live.refreshTime();
    const { now, timeZone } = live.time();
    if (action.kind === "address" || action.kind === "drill") {
      try {
        const address =
          action.kind === "address"
            ? action.address
            : rangeAddress({ from: action.from, to: action.to, kind: action.unit });
        range = parseRange(address, network.baseUrl);
        if (action.kind === "address") {
          filters = parseFilters(address, network.baseUrl);
          choice = parseChart(address, network.baseUrl);
        }
      } catch {
        range = undefined;
      }
    } else if (action.kind === "preset" || action.kind === "remove-fixed") {
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
    } else if (action.kind === "chart-metric")
      choice = normalizeChart({ ...choice, metric: action.metric });
    else if (action.kind === "chart-split")
      choice = normalizeChart({ ...choice, split: action.split });
    else if (action.kind === "shift")
      range = shiftRange(range ?? "30d", action.direction, now, timeZone);
    else range = "all";
  };
  const paint = (kind: ChangeKind = "live", work = 0, elapsed = 0) => {
    if (!active || !live.visible()) return;
    if (live.current() && !live.ready() && live.status().liveLabel !== "Not updating") return;
    const started = clock.workNow();
    const id = pending?.id ?? 0;
    const changeKind = pending?.action.kind ?? kind;
    pending = undefined;
    const state = stateFor(range, filters, choice, live);
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
    const posted = createPostClock();
    port.postMessage({
      id,
      sequence: ++sequence,
      state:
        state.screen === "dashboard"
          ? {
              ...state,
              filterAnnouncement,
              chart: {
                ...state.chart,
                announcement: changeKind === "drill" ? state.rangeLabel : "",
              },
            }
          : state,
      timing: {
        kind: changeKind,
        compute: clock.workNow() - started + inputWork + work,
        elapsed: clock.workNow() - started + elapsed,
      },
      posted: posted.data,
    });
    posted.complete(
      clock.workNow() - started + inputWork + work,
      clock.workNow() - started + elapsed,
    );
    inputWork = 0;
  };
  const live = createLiveEngine(network, clock, paint, () => port.postMessage({ reload: true }));
  const decode = Schema.decodeUnknownSync(Message);
  const receive = (event: MessageEvent) => {
    const started = clock.workNow();
    const message = decode(event.data);
    if ("kind" in message) {
      const decoded = clock.workNow() - started;
      inputWork = (pending ? inputWork : 0) + decoded;
      live.signal(message);
    } else {
      active = pending = message;
      selectRange(message.action);
      inputWork = clock.workNow() - started;
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
