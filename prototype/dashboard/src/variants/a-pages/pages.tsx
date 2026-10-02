// PROTOTYPE variant A: the per-dimension pages, Tools and Sessions.
import { Icon } from "@opencode/ui/icon";
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Donut } from "../../charts/donut";
import { Legend, TimeChart } from "../../charts/time-chart";
import { breakdown, type Dimension, type Row, toolBreakdown, type ToolRow } from "../../data/query";
import { type Metric, timeSeries } from "../../data/series";
import { compact, dateTime, duration, int, pct, usd } from "../../format";
import { dash } from "../../state";
import { Card, type Column, OutcomeBar, SortTable } from "./parts";

const usageColumns = (dim: Dimension): Column<Row>[] => [
  {
    id: "label",
    label: dim === "session" ? "Session" : dim[0]!.toUpperCase() + dim.slice(1),
    align: "left",
    value: (r) => r.label,
    render: (r) => (
      <span class="flex min-w-0 items-center gap-2">
        <span class="truncate">{r.label}</span>
        <Show when={r.sub}>
          <span class="truncate text-v2-text-text-faint">{r.sub}</span>
        </Show>
      </span>
    ),
  },
  { id: "tokens", label: "Tokens", value: (r) => r.tokens, render: (r) => compact(r.tokens) },
  {
    id: "share",
    label: "Share",
    value: (r) => r.share,
    render: (r) => (
      <span class="inline-flex items-center gap-2">
        <span class="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-[var(--level-0)]">
          <span class="block h-full bg-[var(--chart-1)]" style={{ width: `${r.share * 100}%` }} />
        </span>
        {pct(r.share, 0)}
      </span>
    ),
  },
  {
    id: "est",
    label: "Est. cost",
    value: (r) => r.est,
    render: (r) => (r.pricedShare < 1 ? `${usd(r.est)}*` : usd(r.est)),
    title: "* not every token has a list price",
  },
  { id: "rec", label: "Recorded", value: (r) => r.rec, render: (r) => usd(r.rec) },
  { id: "steps", label: "Steps", value: (r) => r.steps, render: (r) => int(r.steps) },
  {
    id: "sessions",
    label: "Sessions",
    value: (r) => r.sessions,
    render: (r) => int(r.sessions),
    title: "A session using two models counts under both",
  },
  {
    id: "cache",
    label: "Cache hit",
    value: (r) => r.cacheHitRate,
    render: (r) => pct(r.cacheHitRate),
  },
  {
    id: "resp",
    label: "Response p50 / p95",
    value: (r) => r.respMedian,
    render: (r) => `${duration(r.respMedian)} / ${duration(r.respP95)}`,
  },
  {
    id: "fail",
    label: "Failed",
    value: (r) => r.failureRate,
    render: (r) => pct(r.failureRate, 2),
  },
];

export function DimensionPage(props: { dim: Exclude<Dimension, "tool" | "session"> }) {
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()),
  );
  const series = createMemo(() =>
    timeSeries(dash.db(), dash.filters(), dash.buckets(), metric(), props.dim, dash.firsts(), 6),
  );
  const total = createMemo(() => rows().reduce((s, r) => s + r.tokens, 0));
  return (
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-[1fr_260px] gap-4">
        <Card
          title={`${metric() === "est" ? "Estimated cost" : metric() === "steps" ? "Steps" : "Tokens"} by ${props.dim}`}
          actions={
            <SegmentedControl
              value={metric()}
              onChange={(v) => v && setMetric(v as Metric)}
              style={{ width: "auto" }}
            >
              <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
              <SegmentedControlItem value="est">Cost</SegmentedControlItem>
              <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
            </SegmentedControl>
          }
        >
          <TimeChart
            series={series()}
            buckets={dash.buckets()}
            unit={dash.range().bucket}
            height={220}
            format={metric() === "est" ? usd : compact}
            onSelect={(b) => dash.drill(b)}
          />
          <Legend class="mt-2" series={series()} />
        </Card>
        <Card title="Share of tokens">
          <div class="flex flex-col items-center gap-3 pt-2">
            <Donut
              slices={series().map((s) => ({
                key: s.key,
                label: s.label,
                color: s.color,
                value: s.values.reduce((a, b) => a + b, 0),
              }))}
              size={150}
              center={compact(total())}
              sub="tokens"
            />
            <div class="text-center text-[12px] text-v2-text-text-faint">
              Steps, tokens and costs add up across rows. Sessions don't: a session can use several.
            </div>
          </div>
        </Card>
      </div>
      <Card
        title={`${rows().length} ${props.dim === "agent" ? "agents" : `${props.dim}s`}`}
        pad={false}
      >
        <SortTable
          rows={rows()}
          columns={usageColumns(props.dim)}
          initialSort="tokens"
          onRow={(r) => dash.toggleFilter(props.dim, r.key)}
          selected={(r) => !!dash.filters()[props.dim]?.includes(r.key)}
        />
      </Card>
    </div>
  );
}

const toolColumns: Column<ToolRow>[] = [
  {
    id: "tool",
    label: "Tool",
    align: "left",
    value: (r) => r.key,
    render: (r) => <span class="mono">{r.key}</span>,
  },
  { id: "calls", label: "Calls", value: (r) => r.calls, render: (r) => int(r.calls) },
  { id: "share", label: "Share", value: (r) => r.share, render: (r) => pct(r.share, 1) },
  {
    id: "outcome",
    label: "Outcomes",
    render: (r) => <OutcomeBar succeeded={r.succeeded} failed={r.failed} stopped={r.stopped} />,
  },
  { id: "failed", label: "Failed", value: (r) => r.failed, render: (r) => int(r.failed) },
  {
    id: "rate",
    label: "Failure rate",
    value: (r) => r.failureRate,
    render: (r) => pct(r.failureRate),
  },
  { id: "stopped", label: "Stopped", value: (r) => r.stopped, render: (r) => int(r.stopped) },
  {
    id: "run",
    label: "Run time p50 / p95",
    value: (r) => r.runMedian,
    render: (r) => `${duration(r.runMedian)} / ${duration(r.runP95)}`,
  },
  {
    id: "basis",
    label: "Timed",
    value: (r) => r.runBasis / r.calls,
    render: (r) => pct(r.runBasis / r.calls, 0),
    title: "Share of calls with a recorded run start (from Aug 24, 2026)",
  },
];

export function ToolsPage() {
  const rows = createMemo(() => toolBreakdown(dash.db(), dash.filters(), dash.range()));
  const series = createMemo(() =>
    timeSeries(dash.db(), dash.filters(), dash.buckets(), "toolCalls", "tool", dash.firsts(), 6),
  );
  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 text-[12px] text-v2-text-text-faint">
        <Icon name="info" size="small" /> The tool filter only narrows tool calls. Steps, tokens and
        costs ignore it.
      </div>
      <Card title="Tool calls by tool">
        <TimeChart
          series={series()}
          buckets={dash.buckets()}
          unit={dash.range().bucket}
          height={200}
          onSelect={(b) => dash.drill(b)}
        />
        <Legend class="mt-2" series={series()} />
      </Card>
      <Card title={`${rows().length} tools`} pad={false}>
        <SortTable
          rows={rows()}
          columns={toolColumns}
          initialSort="calls"
          onRow={(r) => dash.toggleFilter("tool", r.key)}
          selected={(r) => !!dash.filters().tool?.includes(r.key)}
        />
      </Card>
    </div>
  );
}

export function SessionsPage() {
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts()),
  );
  const [open, setOpen] = createSignal<Row | null>(null);
  const columns: Column<Row>[] = [
    {
      id: "label",
      label: "Session",
      align: "left",
      value: (r) => r.label,
      render: (r) => <span class="block max-w-[320px] truncate">{r.label}</span>,
    },
    {
      id: "project",
      label: "Project",
      align: "left",
      value: (r) => r.sub ?? "",
      render: (r) => <span class="text-v2-text-text-muted">{r.sub}</span>,
    },
    { id: "first", label: "Started", value: (r) => r.first, render: (r) => dateTime(r.first) },
    { id: "prompts", label: "Prompts", value: (r) => r.prompts, render: (r) => int(r.prompts) },
    { id: "steps", label: "Steps", value: (r) => r.steps, render: (r) => int(r.steps) },
    { id: "tokens", label: "Tokens", value: (r) => r.tokens, render: (r) => compact(r.tokens) },
    { id: "est", label: "Est. cost", value: (r) => r.est, render: (r) => usd(r.est) },
    {
      id: "models",
      label: "Models",
      align: "left",
      render: (r) => (
        <span class="text-v2-text-text-muted">
          {r.models.length > 1 ? `${r.models.length} models` : r.models[0]?.split("/")[1]}
        </span>
      ),
    },
  ];
  return (
    <div class="flex gap-4">
      <Card
        class="min-w-0 flex-1"
        title={`${int(rows().length)} sessions with steps in range`}
        pad={false}
      >
        <SortTable
          rows={rows()}
          columns={columns}
          initialSort="first"
          onRow={setOpen}
          selected={(r) => open()?.key === r.key}
          limit={150}
        />
      </Card>
      <Show when={open()}>{(r) => <SessionPanel row={r()} onClose={() => setOpen(null)} />}</Show>
    </div>
  );
}

function SessionPanel(props: { row: Row; onClose: () => void }) {
  const sub = createMemo(
    () => [...dash.db().sessions.values()].filter((s) => s.parent === Number(props.row.key)).length,
  );
  return (
    <aside class="a-card sticky top-0 flex h-fit w-[300px] flex-none flex-col gap-3 p-4">
      <div class="flex items-start justify-between gap-2">
        <span class="font-medium">{props.row.label}</span>
        <button
          type="button"
          class="text-v2-icon-icon-muted"
          onClick={props.onClose}
          aria-label="Close"
        >
          <Icon name="close" size="small" />
        </button>
      </div>
      <div class="text-[12px] text-v2-text-text-muted">
        {props.row.sub} · started {dateTime(props.row.first)}
      </div>
      <dl class="grid grid-cols-2 gap-y-2 text-[13px]">
        <dt class="text-v2-text-text-faint">Prompts</dt>
        <dd class="num text-right">{int(props.row.prompts)}</dd>
        <dt class="text-v2-text-text-faint">Steps</dt>
        <dd class="num text-right">{int(props.row.steps)}</dd>
        <dt class="text-v2-text-text-faint">Subagent sessions</dt>
        <dd class="num text-right">{sub()}</dd>
        <dt class="text-v2-text-text-faint">Tokens</dt>
        <dd class="num text-right">{compact(props.row.tokens)}</dd>
        <dt class="text-v2-text-text-faint">Estimated cost</dt>
        <dd class="num text-right">≈ {usd(props.row.est)}</dd>
        <dt class="text-v2-text-text-faint">Cache hit rate</dt>
        <dd class="num text-right">{pct(props.row.cacheHitRate)}</dd>
      </dl>
      <div class="flex flex-wrap gap-1">
        <For each={props.row.models}>
          {(m) => (
            <span class="rounded-[4px] bg-v2-background-bg-layer-02 px-1.5 text-[12px]">{m}</span>
          )}
        </For>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="h-7 flex-1 rounded-[6px] bg-v2-background-bg-layer-02 text-[12px] hover:bg-v2-background-bg-layer-03"
          onClick={() => dash.setFilter("session", [props.row.key])}
        >
          Filter to this session
        </button>
        <button
          type="button"
          class="flex h-7 flex-1 items-center justify-center gap-1 rounded-[6px] bg-v2-background-bg-layer-02 text-[12px] hover:bg-v2-background-bg-layer-03"
          title="Would open the session in OpenCode's web app (needs its server URL)"
        >
          Open in OpenCode <Icon name="arrow-up-right" size="small" />
        </button>
      </div>
    </aside>
  );
}
