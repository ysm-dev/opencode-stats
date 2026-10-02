import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Legend } from "../../charts/time-chart";
import { METRICS, timeSeries, type Metric } from "../../data/series";
import { dash } from "../../state";
import { Card } from "../a-pages/parts";
import { formatMetric } from "../c-explorer/model";
import { ExplorerTable } from "../c-explorer/table";
import { TimeChart } from "../c-explorer/time-chart";
import { Journal } from "../d-calendar/journal";
import { useTotals } from "./headlines";
import { SessionTable } from "./session-table";
import type { SessionView } from "./index";

const metrics: { id: Metric; label: string }[] = [
  { id: "tokens", label: "Tokens" },
  { id: "est", label: "Cost" },
  { id: "steps", label: "Steps" },
  { id: "prompts", label: "Prompts" },
  { id: "sessions", label: "Sessions" },
  { id: "cacheHitRate", label: "Cache hit rate" },
  { id: "respMedian", label: "Response time" },
];

export function DimensionPage(props: { dim: "model" | "project" | "agent" }) {
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const { now } = useTotals();
  const additive = () => METRICS.find((m) => m.id === metric())!.additive;
  const series = createMemo(() =>
    timeSeries(
      dash.db(),
      dash.filters(),
      dash.buckets(),
      metric(),
      additive() ? props.dim : "none",
      dash.firsts(),
    ),
  );
  const name = () => metrics.find((m) => m.id === metric())!.label;
  return (
    <div class="e-page-stack">
      <div class="e-metric-switch" aria-label="Chart metric">
        <SegmentedControl
          value={metric()}
          onChange={(v) => v && setMetric(v as Metric)}
          style={{ width: "auto" }}
        >
          <For each={metrics}>
            {(m) => <SegmentedControlItem value={m.id}>{m.label}</SegmentedControlItem>}
          </For>
        </SegmentedControl>
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
          buckets={dash.buckets()}
          unit={dash.range().bucket}
          kind={additive() ? "bar" : "line"}
          height={240}
          format={(v) => formatMetric(metric(), v)}
          onSelect={(b) => dash.drill(b)}
        />
        <div class="e-chart-footer">
          <Legend series={series()} />
          <span>
            {additive() ? "Faded bars are partial" : "Gaps mean no recorded values"} · click a
            bucket to drill in
          </span>
        </div>
      </Card>
      <ExplorerTable cut={props.dim} metric={metric()} total={now()} />
    </div>
  );
}

export function ToolsPage() {
  const { now } = useTotals();
  const series = createMemo(() =>
    timeSeries(dash.db(), dash.filters(), dash.buckets(), "toolCalls", "tool", dash.firsts()),
  );
  return (
    <div class="e-page-stack">
      <p class="e-tool-note">
        The tool filter narrows tool calls only; steps, tokens and costs ignore it.
      </p>
      <Card title="Tool calls by tool">
        <TimeChart
          series={series()}
          buckets={dash.buckets()}
          unit={dash.range().bucket}
          height={240}
          onSelect={(b) => dash.drill(b)}
        />
        <div class="e-chart-footer">
          <Legend series={series()} />
          <span>Faded bars are partial · click a bar to drill in</span>
        </div>
      </Card>
      <ExplorerTable cut="tool" metric="toolCalls" total={now()} />
    </div>
  );
}

export function SessionsPage(props: { view: SessionView; setView: (v: SessionView) => void }) {
  return (
    <div class="e-page-stack">
      <div class="e-session-view">
        <span class="e-chart-note">
          Sessions with steps in this range · click a session to filter
        </span>
        <SegmentedControl
          value={props.view}
          onChange={(v) => v && props.setView(v as SessionView)}
          style={{ width: "auto" }}
        >
          <SegmentedControlItem value="day">By day</SegmentedControlItem>
          <SegmentedControlItem value="table">Table</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <Show when={props.view === "day"} fallback={<SessionTable />}>
        <Journal />
      </Show>
    </div>
  );
}
