// PROTOTYPE B: the opening three sections of the report.
import { Select } from "@opencode/ui/select";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ContributionGraph } from "../../charts/contribution-graph";
import { Legend, TimeChart } from "../../charts/time-chart";
import { totals, type Totals } from "../../data/query";
import { contribution, type Metric, type Split, streaks, timeSeries } from "../../data/series";
import { dayKey } from "../../data/time";
import {
  change,
  changeText,
  compact,
  day,
  int,
  pct,
  previousLabel,
  rangeLabel,
  usd,
} from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";

function period() {
  const spec = dash.spec();
  if (spec.kind === "fixed") return "in this fixed range";
  if (spec.preset === "today") return "today";
  if (spec.preset === "all") return "over all time";
  return `in the ${rangeLabel(dash.range()).toLowerCase()}`;
}

const contributionFormat = (v: number) =>
  contributionMetric() === "cost" ? `≈ ${usd(v)}` : `${compact(v)} ${contributionMetric()}`;

export function Headline(props: { totals: Totals }) {
  const previous = createMemo(() => {
    const span = dash.previous();
    return span ? totals(dash.db(), dash.filters(), span, dash.firsts()) : null;
  });
  const numbers = createMemo(() => [
    {
      label: "Tokens",
      value: compact(props.totals.tokens),
      delta: change(props.totals.tokens, previous()?.tokens),
      sub: "Read + written",
    },
    {
      label: "Cost · estimate",
      value: `≈ ${usd(props.totals.est)}`,
      delta: change(props.totals.est, previous()?.est),
      sub: `${usd(props.totals.rec)} recorded cost`,
      extra: `${pct(props.totals.pricedShare, 0)} of tokens priced`,
    },
    {
      label: "Steps",
      value: int(props.totals.steps),
      delta: change(props.totals.steps, previous()?.steps),
      sub: "Model calls",
    },
    {
      label: "Sessions",
      value: int(props.totals.sessions),
      delta: change(props.totals.sessions, previous()?.sessions),
      sub: `+ ${int(props.totals.subagentSessions)} subagent sessions`,
    },
    {
      label: "Prompts",
      value: int(props.totals.prompts),
      delta: change(props.totals.prompts, previous()?.prompts),
      sub: "From you",
    },
    {
      label: "Cache hit rate",
      value: pct(props.totals.cacheHitRate),
      delta: change(props.totals.cacheHitRate, previous()?.cacheHitRate),
      sub: "Of tokens sent",
    },
  ]);
  return (
    <section id="b-headline" class="b-section b-headline">
      <div class="b-eyebrow">
        <span>01 / Your usage, at a glance</span>
        <span>{day(dash.now(), { year: true })}</span>
      </div>
      <h1>
        You ran <span class="num">{int(props.totals.steps)}</span> steps across{" "}
        <span class="num">{int(props.totals.sessions)}</span> sessions {period()}.
      </h1>
      <div class="b-number-strip">
        <For each={numbers()}>
          {(n) => (
            <div class="b-headline-number">
              <div class="b-number-label">{n.label}</div>
              <div class="b-big-number num">{n.value}</div>
              <div class="b-number-sub">
                {n.sub}
                <Show when={n.extra}>
                  <br />
                  {n.extra}
                </Show>
              </div>
              <Show when={dash.previous()}>
                <div class="delta b-number-change">{changeText(n.delta) || "No comparison"}</div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={dash.previous()}>
        {(p) => (
          <p class="b-caption b-comparison">
            Headline changes {previousLabel(dash.range())} · {day(p().start)} – {day(p().end - 1)}.
            Usage changes are neutral.
          </p>
        )}
      </Show>
    </section>
  );
}

export function Activity(props: { totals: Totals }) {
  const cells = createMemo(() =>
    contribution(dash.db(), dash.filters(), dash.now(), contributionMetric()),
  );
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  return (
    <section id="b-activity" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>02</span> Activity
        </h2>
        <div class="b-metric-controls" aria-label="Contribution metric">
          <For each={["tokens", "steps", "cost"] as const}>
            {(m) => (
              <button
                type="button"
                class="b-text-control"
                classList={{ "b-chosen": contributionMetric() === m }}
                onClick={() => setContributionMetric(m)}
              >
                {m[0]!.toUpperCase() + m.slice(1)}
              </button>
            )}
          </For>
        </div>
      </header>
      <ContributionGraph
        cells={cells()}
        range={dash.range()}
        format={contributionFormat}
        cell={12}
        gap={3}
        onSelect={(t) => dash.setRange({ kind: "fixed", unit: "day", start: dayKey(t) })}
      />
      <div class="b-activity-foot">
        <div class="b-streaks">
          <span>
            <strong class="num">{streak().current}</strong> days current streak
          </span>
          <span>
            <strong class="num">{streak().longest}</strong> days longest streak
          </span>
          <span>
            <strong class="num">{props.totals.activeDays}</strong> active days in range
          </span>
        </div>
        <span class="b-caption">Past 365 days · quartile levels · outlined days are in range</span>
      </div>
    </section>
  );
}

const METRICS: { id: Metric; label: string }[] = [
  { id: "tokens", label: "Tokens" },
  { id: "est", label: "Cost" },
  { id: "steps", label: "Steps" },
  { id: "prompts", label: "Prompts" },
  { id: "toolCalls", label: "Tool calls" },
  { id: "sessions", label: "Sessions" },
  { id: "cacheHitRate", label: "Cache hit rate" },
];
const SPLITS: { id: Split; label: string }[] = [
  { id: "none", label: "None" },
  { id: "kind", label: "Token kind" },
  { id: "model", label: "Model" },
  { id: "project", label: "Project" },
  { id: "agent", label: "Agent" },
  { id: "provider", label: "Provider" },
];

export function OverTime() {
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const [split, setSplit] = createSignal<Split>("kind");
  const singleLine = () => metric() === "sessions" || metric() === "cacheHitRate";
  const effectiveSplit = () =>
    singleLine() || (metric() !== "tokens" && split() === "kind") ? "none" : split();
  const series = createMemo(() =>
    timeSeries(
      dash.db(),
      dash.filters(),
      dash.buckets(),
      metric(),
      effectiveSplit(),
      dash.firsts(),
    ),
  );
  const format = (v: number) =>
    metric() === "est" ? `≈ ${usd(v)}` : metric() === "cacheHitRate" ? pct(v, 0) : compact(v);
  return (
    <section id="b-over-time" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>03</span> Over time
        </h2>
        <Show
          when={!singleLine()}
          fallback={<span class="b-caption">Single line · not split</span>}
        >
          <div class="b-split">
            <span class="faint">Split by</span>
            <Select
              options={SPLITS.filter((s) => metric() === "tokens" || s.id !== "kind")}
              current={SPLITS.find((s) => s.id === effectiveSplit())}
              value={(s) => s.id}
              label={(s) => s.label}
              onSelect={(s) => s && setSplit(s.id)}
            />
          </div>
        </Show>
      </header>
      <div class="b-metric-controls b-chart-metrics" aria-label="Over time metric">
        <For each={METRICS}>
          {(m) => (
            <button
              type="button"
              class="b-text-control"
              classList={{ "b-chosen": metric() === m.id }}
              onClick={() => setMetric(m.id)}
            >
              {m.label}
            </button>
          )}
        </For>
      </div>
      <TimeChart
        series={series()}
        buckets={dash.buckets()}
        unit={dash.range().bucket}
        kind={singleLine() ? "line" : "bar"}
        height={230}
        format={format}
        onSelect={(b) => dash.drill(b)}
      />
      <div class="b-chart-foot">
        <Legend series={series()} />
        <span class="b-caption">Faded bars are partial · click a bar to drill in</span>
      </div>
      <Show when={metric() === "est"}>
        <p class="b-caption">
          Estimated cost at current list prices; unpriced tokens are excluded.
        </p>
      </Show>
      <Show when={metric() === "toolCalls" && dash.filters().tool?.length}>
        <p class="b-caption">Tool filter applies to tool calls only.</p>
      </Show>
    </section>
  );
}
