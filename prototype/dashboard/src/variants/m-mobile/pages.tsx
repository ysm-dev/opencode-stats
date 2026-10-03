// PROTOTYPE: variant E's six pages, holding exactly what E's pages hold, built from the
// mobile-first pieces so each narrow form can be switched from the bar's Mix panel.
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
import { RankedBars } from "../../charts/ranked-bars";
import { breakdown } from "../../data/query";
import { METRICS, type Metric, type Split, timeSeries } from "../../data/series";
import type { Unit } from "../../data/time";
import { compact, pct, rangeLabel, usd } from "../../format";
import { dash } from "../../state";
import { Card } from "../a-pages/parts";
import { formatMetric } from "../c-explorer/model";
import { useTotals } from "../e-v1/headlines";
import { chartBuckets, TimeChart } from "./chart";
import { useMobile } from "./context";
import { Graph } from "./graph";
import { contentWidth, narrow } from "./media";
import { Headlines } from "./numbers";
import { Choice, Menu } from "./overlay";
import { Rhythm } from "./rhythm";
import { SessionDays } from "./sessions";
import type { Page, SessionView } from "./shell";
import { MetricTable, sessionTable, toolTable, usageTable } from "./table";

export function Pages(props: {
  page: Page;
  go: (page: Page) => void;
  sessions: SessionView;
  setSessions: (view: SessionView) => void;
}) {
  return (
    <Switch>
      <Match when={props.page === "overview"}>
        <Overview go={props.go} />
      </Match>
      <Match when={props.page === "models"}>
        <DimensionPage dim="model" />
      </Match>
      <Match when={props.page === "projects"}>
        <DimensionPage dim="project" />
      </Match>
      <Match when={props.page === "agents"}>
        <DimensionPage dim="agent" />
      </Match>
      <Match when={props.page === "tools"}>
        <ToolsPage />
      </Match>
      <Match when={props.page === "sessions"}>
        <SessionsPage view={props.sessions} setView={props.setSessions} />
      </Match>
    </Switch>
  );
}

const UNIT_WORD: Record<Unit, string> = {
  hour: "Hourly",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

/** The chart's buckets for the current mix and width, and a note when they're coarser. */
function useChartBuckets() {
  const m = useMobile();
  const chart = createMemo(() => chartBuckets(m.mix().chart, contentWidth() - 32));
  const note = () =>
    chart().unit === dash.range().bucket
      ? ""
      : ` · ${UNIT_WORD[chart().unit]} buckets at this width`;
  return { chart, note, scroll: () => m.mix().chart === "scroll" };
}

function Overview(props: { go: (page: Page) => void }) {
  const m = useMobile();
  return (
    <div class="e-overview">
      <Headlines mode={m.mix().numbers} />
      <Graph mode={m.mix().graph} />
      <Usage />
      <div class="e-rank-grid">
        <Ranking dim="model" title="Top models" go={() => props.go("models")} />
        <Ranking dim="project" title="Top projects" go={() => props.go("projects")} />
      </div>
      <Rhythm mode={m.mix().rhythm} />
    </div>
  );
}

const SPLITS: [Split, string][] = [
  ["kind", "Token kind"],
  ["model", "Model"],
  ["project", "Project"],
  ["agent", "Agent"],
  ["provider", "Provider"],
];

function Usage() {
  const m = useMobile();
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const [split, setSplit] = createSignal<Split>("kind");
  const effectiveSplit = () => (metric() !== "tokens" && split() === "kind" ? "model" : split());
  const { chart, note, scroll } = useChartBuckets();
  const series = createMemo(() =>
    timeSeries(
      dash.db(),
      dash.filters(),
      chart().buckets,
      metric(),
      effectiveSplit(),
      dash.firsts(),
    ),
  );
  return (
    <Card
      title="Usage over time"
      actions={
        <>
          <Choice
            label="Usage metric"
            value={metric()}
            options={[
              ["tokens", "Tokens"],
              ["est", "Cost"],
              ["steps", "Steps"],
              ["toolCalls", "Tool calls"],
            ]}
            onChange={setMetric}
            style={m.controls()}
          />
          <Menu
            ariaLabel="Split"
            class="m-select"
            align="end"
            label={<span>By {SPLITS.find(([s]) => s === effectiveSplit())![1].toLowerCase()}</span>}
            value={effectiveSplit()}
            options={SPLITS.filter(([s]) => metric() === "tokens" || s !== "kind").map(
              ([value, label]) => ({ value, label: `By ${label.toLowerCase()}` }),
            )}
            onSelect={setSplit}
          />
        </>
      }
    >
      <TimeChart
        series={series()}
        buckets={chart().buckets}
        unit={chart().unit}
        kind="bar"
        scroll={scroll()}
        height={narrow() ? 190 : 240}
        format={metric() === "est" ? (v) => `≈ ${usd(v)}` : compact}
        restLabel={`${rangeLabel(dash.range())} · totals`}
        ariaLabel="Usage over time"
      />
      <p class="m-chart-note">Faded bars are partial{note()}</p>
    </Card>
  );
}

function Ranking(props: { dim: "model" | "project"; title: string; go: () => void }) {
  const { now } = useTotals();
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()),
  );
  return (
    <Card
      title={props.title}
      actions={
        <button type="button" class="e-link" onClick={() => props.go()}>
          All {props.dim}s →
        </button>
      }
    >
      <RankedBars
        class="m-ranked"
        items={rows().map((r) => ({
          key: r.key,
          label: r.label,
          sub: r.sub,
          value: r.tokens,
          color: props.dim === "project" ? "var(--chart-3)" : "var(--chart-1)",
          selected: dash.filters()[props.dim]?.includes(r.key),
        }))}
        format={compact}
        extra={(i) => pct(i.value / (now().tokens || 1), 0)}
        onSelect={(key) => dash.toggleFilter(props.dim, key)}
        limit={5}
      />
    </Card>
  );
}

const DIMENSION_METRICS: [Metric, string][] = [
  ["tokens", "Tokens"],
  ["est", "Cost"],
  ["steps", "Steps"],
  ["prompts", "Prompts"],
  ["sessions", "Sessions"],
  ["cacheHitRate", "Cache hit rate"],
  ["respMedian", "Response time"],
];

function DimensionPage(props: { dim: "model" | "project" | "agent" }) {
  const m = useMobile();
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const { now } = useTotals();
  const { chart, note, scroll } = useChartBuckets();
  const additive = () => METRICS.find((x) => x.id === metric())!.additive;
  const series = createMemo(() =>
    timeSeries(
      dash.db(),
      dash.filters(),
      chart().buckets,
      metric(),
      additive() ? props.dim : "none",
      dash.firsts(),
    ),
  );
  const name = () => DIMENSION_METRICS.find(([id]) => id === metric())![1];
  const table = createMemo(() => usageTable(props.dim, metric(), now()));
  return (
    <div class="e-page-stack">
      <div class="e-metric-switch">
        <Choice
          label="Chart metric"
          value={metric()}
          options={DIMENSION_METRICS}
          onChange={setMetric}
          style={m.controls()}
        />
      </div>
      <Card title={`${name()}${additive() ? ` by ${props.dim}` : " over time"}`}>
        <div class="e-chart-note">
          {additive()
            ? "Stacked values add up across rows."
            : "One unsplit line: sessions overlap across rows; rates and response times do not add up."}
          {metric() === "respMedian" ? " p50 of timed steps · recorded from Aug 24, 2026." : ""}
        </div>
        <TimeChart
          series={series()}
          buckets={chart().buckets}
          unit={chart().unit}
          kind={additive() ? "bar" : "line"}
          scroll={scroll()}
          height={narrow() ? 190 : 240}
          format={(v) => formatMetric(metric(), v)}
          restLabel={`${rangeLabel(dash.range())}${additive() ? " · totals" : ""}`}
          ariaLabel={`${name()} over time`}
        />
        <p class="m-chart-note">
          {additive() ? "Faded bars are partial" : "Gaps mean no recorded values"}
          {note()}
        </p>
      </Card>
      <MetricTable spec={table()} mode={m.mix().table} />
    </div>
  );
}

function ToolsPage() {
  const m = useMobile();
  const { now } = useTotals();
  const { chart, note, scroll } = useChartBuckets();
  const series = createMemo(() =>
    timeSeries(dash.db(), dash.filters(), chart().buckets, "toolCalls", "tool", dash.firsts()),
  );
  const table = createMemo(() => toolTable(now()));
  return (
    <div class="e-page-stack">
      <p class="e-tool-note">
        The tool filter narrows tool calls only; steps, tokens and costs ignore it.
      </p>
      <Card title="Tool calls by tool">
        <TimeChart
          series={series()}
          buckets={chart().buckets}
          unit={chart().unit}
          kind="bar"
          scroll={scroll()}
          height={narrow() ? 190 : 240}
          format={compact}
          restLabel={`${rangeLabel(dash.range())} · totals`}
          ariaLabel="Tool calls by tool"
        />
        <p class="m-chart-note">Faded bars are partial{note()}</p>
      </Card>
      <MetricTable spec={table()} mode={m.mix().table} />
    </div>
  );
}

function SessionsPage(props: { view: SessionView; setView: (v: SessionView) => void }) {
  const m = useMobile();
  const { now } = useTotals();
  const table = createMemo(() => sessionTable(now()));
  return (
    <div class="e-page-stack">
      <div class="e-session-view">
        <span class="e-chart-note">
          Sessions with steps in this range · tap a session to filter
        </span>
        <SegmentedControl
          aria-label="Sessions view"
          value={props.view}
          onChange={(v) => v && props.setView(v as SessionView)}
        >
          <SegmentedControlItem value="day">By day</SegmentedControlItem>
          <SegmentedControlItem value="table">Table</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <Show
        when={props.view === "day"}
        fallback={<MetricTable spec={table()} mode={m.mix().table} />}
      >
        <SessionDays />
      </Show>
    </div>
  );
}
