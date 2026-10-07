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
  normalizeRange,
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
import {
  contributionGraph,
  graphAddress,
  parseGraphMetric,
  type GraphMetric,
  withGraphMetric,
} from "./contributions.ts";

const measuredChange = (value: number | null, before: number | null) =>
  value === null || before === null ? "" : changeLabel(value, before);
const actionKind = (action: EngineAction | undefined, fallback: ChangeKind): ChangeKind =>
  action?.kind === "drill" && action.source === "graph"
    ? "graph-select"
    : (action?.kind ?? fallback);
const announcedState = (
  state: EngineState,
  filterAnnouncement: string,
  kind: ChangeKind,
): EngineState =>
  state.screen === "dashboard"
    ? {
        ...state,
        filterAnnouncement,
        selectionAnnouncement: kind === "graph-select" ? state.rangeLabel : "",
        chart: { ...state.chart, announcement: kind === "drill" ? state.rangeLabel : "" },
      }
    : state;

function stateFor(
  range: TimeRange | undefined,
  filters: readonly Filter[],
  choice: ChartChoice,
  live: ReturnType<typeof createLiveEngine>,
  metric: GraphMetric,
): EngineState {
  if (range === undefined) return { screen: "problem", reason: "invalid-address" };
  const current = live.current();
  if (!current || !live.ready()) return { screen: "problem", reason: "copy-unavailable" };
  const { now, timeZone, locale } = live.time();
  const history = live.history(now, timeZone);
  const historyLabel = dateLabel(localDate(history, timeZone), locale, false);
  const status = live.status();
  const period = resolveRange(range, now, timeZone, history);
  const amounts = live.query(period, timeZone, filters, now);
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
    activeDays: "",
    caption: "",
  };
  if (previous) {
    const before = live.query(previous, timeZone, filters, now);
    comparison.tokens = changeLabel(amounts.tokens.total, before.tokens.total);
    comparison.sessions = changeLabel(amounts.sessions.total, before.sessions.total);
    comparison.tools = changeLabel(amounts.tools.calls, before.tools.calls);
    comparison.activeDays = changeLabel(amounts.activeDays, before.activeDays);
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
    address: graphAddress(
      chartAddress(filterAddress(rangeAddress(range), filters), choice),
      metric,
    ),
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
    summary: `You ran ${amounts.metrics.steps.toLocaleString("en-US")} steps across ${amounts.sessions.total.toLocaleString("en-US")} sessions ${period.start < history && period.end > history ? `since ${historyLabel}` : summarySpan(range, period, locale)}.`,
    comparison,
    ...amounts,
    graph: contributionGraph(
      live.activity(timeZone, filters, now),
      localDate(now, timeZone),
      metric,
    ),
    selectionAnnouncement: "",
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
  let metric: GraphMetric = "tokens";
  let lastState: EngineState | undefined;
  let filterChange:
    | Extract<EngineAction, { kind: "filter" | "remove-filter" | "clear-filters" }>
    | undefined;
  let filterAnnouncement = "";
  let inputWork = 0;
  let sequence = 0;
  const selectRange = (action: EngineAction) => {
    filterChange = undefined;
    filterAnnouncement = "";
    if (action.kind === "graph-metric") {
      metric = action.metric;
      return;
    }
    live.refreshTime();
    const { now, timeZone } = live.time();
    switch (action.kind) {
      case "address":
      case "drill":
        try {
          const address =
            action.kind === "address"
              ? action.address
              : rangeAddress({ from: action.from, to: action.to, kind: action.unit });
          const parsed = parseRange(address, network.baseUrl);
          range = action.kind === "drill" ? normalizeRange(parsed, now, timeZone) : parsed;
          if (action.kind === "address") {
            filters = parseFilters(address, network.baseUrl);
            choice = parseChart(address, network.baseUrl);
            metric = parseGraphMetric(address, network.baseUrl);
          }
        } catch {
          range = undefined;
        }
        break;
      case "preset":
      case "remove-fixed":
        range = action.preset;
        break;
      case "filter":
        filters = toggleFilter(filters, action);
        filterChange = action;
        break;
      case "remove-filter":
        filters = removeFilter(filters, action);
        filterChange = action;
        break;
      case "clear-filters":
        filters = [];
        filterChange = action;
        break;
      case "chart-metric":
        choice = normalizeChart({ ...choice, metric: action.metric });
        break;
      case "chart-split":
        choice = normalizeChart({ ...choice, split: action.split });
        break;
      case "shift":
        range = shiftRange(range ?? "30d", action.direction, now, timeZone);
        break;
      case "all-time":
        range = "all";
        break;
    }
  };
  const stateForChange = (kind: ChangeKind): EngineState =>
    kind === "graph-metric" && lastState?.screen === "dashboard"
      ? {
          ...lastState,
          address: graphAddress(
            chartAddress(filterAddress(rangeAddress(range!), filters), choice),
            metric,
          ),
          graph: withGraphMetric(lastState.graph, metric),
          selectionAnnouncement: "",
        }
      : stateFor(range, filters, choice, live, metric);
  const paint = (kind: ChangeKind = "live", work = 0, elapsed = 0) => {
    if (!active || !live.visible()) return;
    if (live.current() && !live.ready() && live.status().liveLabel !== "Not updating") return;
    const started = clock.workNow();
    const id = pending?.id ?? 0;
    const changeKind = actionKind(pending?.action, kind);
    pending = undefined;
    const state = stateForChange(changeKind);
    lastState = state;
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
      state: announcedState(state, filterAnnouncement, changeKind),
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
