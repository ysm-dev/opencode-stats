import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ContributionGraph, LevelLegend } from "../../charts/contribution-graph";
import { Legend } from "../../charts/time-chart";
import { totals, type Totals } from "../../data/query";
import { contribution, streaks, type ContributionMetric, type Metric } from "../../data/series";
import { dayKey } from "../../data/time";
import { change, changeText, compact, duration, int, pct, previousLabel, usd } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { dimensions, explorerSeries, formatMetric, metrics, metricValue, type Cut } from "./model";
import { ExplorerTable } from "./table";
import { TimeChart } from "./time-chart";

export function Workspace(props: { metric: Metric; cut: Cut }) {
  const t = createMemo(() => totals(dash.db(), dash.filters(), dash.range(), dash.firsts()));
  const previous = createMemo(() => {
    const p = dash.previous();
    return p ? totals(dash.db(), dash.filters(), p, dash.firsts()) : null;
  });
  const series = createMemo(() => explorerSeries(props.metric, props.cut));
  const additive = () => metrics.find((m) => m.id === props.metric)?.additive ?? true;
  const metricLabel = () => metrics.find((m) => m.id === props.metric)?.label;
  const dimensionLabel = () => dimensions.find((d) => d.id === props.cut)?.label;
  return (
    <div class="c-workspace">
      <Headline metric={props.metric} total={t()} previous={previous()} />
      <ContributionStrip />
      <section class="c-chart-section">
        <div class="c-section-heading">
          <h2>
            {metricLabel()}{" "}
            <span class="c-note">
              {additive() ? `by ${dimensionLabel()?.toLowerCase()}` : "over time"}
            </span>
          </h2>
          <span class="c-note">{dash.range().bucket} buckets · browser timezone</span>
        </div>
        <Show when={!additive()}>
          <div class="c-chart-explanation">
            One unsplit line:{" "}
            {props.metric === "sessions"
              ? "sessions overlap across dimensions."
              : "rates and response times do not add up."}{" "}
            The table still breaks down by {dimensionLabel()?.toLowerCase()}.
          </div>
        </Show>
        <Show when={props.cut === "tool" && props.metric !== "toolCalls"}>
          <div class="c-chart-explanation">
            Only tool calls split by Tool. This chart shows the chosen metric unsplit.
          </div>
        </Show>
        <Show when={props.metric === "respMedian"}>
          <div class="c-chart-explanation">
            p50 of timed steps · {pct(t().respBasis / (t().steps || 1), 0)} of steps timed in range
            · recorded from Aug 24, 2026 · gaps = no timed steps
          </div>
        </Show>
        <TimeChart
          series={series()}
          buckets={dash.buckets()}
          unit={dash.range().bucket}
          kind={additive() ? "bar" : "line"}
          height={200}
          format={(v) => formatMetric(props.metric, v)}
          onSelect={(b) => dash.drill(b)}
        />
        <div class="c-chart-footer">
          <Legend series={series()} />
          <span class="c-note">
            {additive() ? "Faded" : "Shaded"} = partial · click a bucket to drill in
          </span>
        </div>
      </section>
      <ExplorerTable cut={props.cut} metric={props.metric} total={t()} />
    </div>
  );
}

function related(metric: Metric, t: Totals): { label: string; value: string }[] {
  if (metric === "tokens")
    return [
      {
        label: "Input / output / reasoning",
        value: `${compact(t.input)} / ${compact(t.output)} / ${compact(t.reasoning)}`,
      },
      { label: "Cache read / write", value: `${compact(t.cacheRead)} / ${compact(t.cacheWrite)}` },
      { label: "Cache hit rate", value: pct(t.cacheHitRate) },
    ];
  if (metric === "est" || metric === "rec")
    return [
      { label: "Estimated cost", value: `≈ ${usd(t.est)}` },
      { label: "Recorded cost", value: usd(t.rec) },
      { label: "Tokens priced", value: pct(t.pricedShare, 0) },
    ];
  if (metric === "respMedian")
    return [
      { label: "Response time p95", value: duration(t.respP95) },
      {
        label: "Steps timed",
        value: `${pct(t.respBasis / (t.steps || 1), 0)} · ${int(t.respBasis)} steps`,
      },
      { label: "Recorded from", value: "Aug 24, 2026" },
    ];
  if (metric === "toolCalls")
    return [
      {
        label: "Succeeded / failed / stopped",
        value: `${compact(t.succeeded)} / ${compact(t.toolFailed)} / ${compact(t.stopped)}`,
      },
      { label: "Tool-call failure rate", value: pct(t.toolFailureRate) },
      { label: "Steps", value: compact(t.steps) },
    ];
  return [
    { label: "Tokens", value: compact(t.tokens) },
    { label: `Estimated cost · ${pct(t.pricedShare, 0)} priced`, value: `≈ ${usd(t.est)}` },
    { label: "Prompts / steps", value: `${compact(t.prompts)} / ${compact(t.steps)}` },
  ];
}

function Headline(props: { metric: Metric; total: Totals; previous: Totals | null }) {
  const delta = () =>
    changeText(
      change(
        metricValue(props.total, props.metric),
        props.previous ? metricValue(props.previous, props.metric) : null,
      ),
    );
  return (
    <section class="c-headline">
      <div class="c-primary-number">
        <span class="c-note">{metrics.find((m) => m.id === props.metric)?.label}</span>
        <div class="c-number num">
          {formatMetric(props.metric, metricValue(props.total, props.metric))}
        </div>
        <Show when={props.previous && delta()}>
          <div class="c-note num">
            {delta()} {previousLabel(dash.range())}
          </div>
        </Show>
      </div>
      <For each={related(props.metric, props.total)}>
        {(item) => (
          <div class="c-related">
            <span class="c-note">{item.label}</span>
            <span class="num">{item.value}</span>
          </div>
        )}
      </For>
    </section>
  );
}

function ContributionStrip() {
  const [open, setOpen] = createSignal(true);
  const cells = createMemo(() =>
    contribution(dash.db(), dash.filters(), dash.now(), contributionMetric()),
  );
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  return (
    <section class="c-contribution">
      <div class="c-contribution-heading">
        <button
          type="button"
          class="c-collapse"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open() ? "⌄" : "›"}</span> Contribution graph{" "}
          <span class="c-note">past 365 days</span>
        </button>
        <span class="c-note num">
          {streak().current} day streak · longest {streak().longest}
        </span>
        <SegmentedControl
          value={contributionMetric()}
          onChange={(v) => v && setContributionMetric(v as ContributionMetric)}
          style={{ width: "auto" }}
        >
          <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
          <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
          <SegmentedControlItem value="cost">Cost</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <Show when={open()}>
        <div class="c-contribution-body">
          <ContributionGraph
            cells={cells()}
            range={dash.range()}
            cell={7}
            gap={2}
            caption={false}
            format={contributionFormat}
            onSelect={(t) => dash.setRange({ kind: "fixed", unit: "day", start: dayKey(t) })}
          />
          <div class="c-note c-contribution-legend">
            <LevelLegend />
            <span>Outlined = in range · click a day to drill in</span>
          </div>
        </div>
      </Show>
    </section>
  );
}

const contributionFormat = (v: number) =>
  contributionMetric() === "cost" ? `≈ ${usd(v)}` : `${compact(v)} ${contributionMetric()}`;
