// PROTOTYPE variant A: the Overview page.
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { Select } from "@opencode/ui/select";
import { createMemo, createSignal, Show } from "solid-js";
import { ContributionGraph } from "../../charts/contribution-graph";
import { RankedBars } from "../../charts/ranked-bars";
import { Legend, TimeChart } from "../../charts/time-chart";
import { breakdown, totals } from "../../data/query";
import {
  contribution,
  type ContributionMetric,
  type Metric,
  type Split,
  streaks,
  timeSeries,
} from "../../data/series";
import { dayKey } from "../../data/time";
import { change, compact, duration, int, pct, previousLabel, usd } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { Card, Kpi, OutcomeBar } from "./parts";

export function useTotals() {
  const now = createMemo(() => totals(dash.db(), dash.filters(), dash.range(), dash.firsts()));
  const prev = createMemo(() => {
    const p = dash.previous();
    return p ? totals(dash.db(), dash.filters(), p, dash.firsts()) : null;
  });
  return { now, prev };
}

export function spark(metric: Metric) {
  return createMemo(
    () =>
      timeSeries(dash.db(), dash.filters(), dash.buckets(), metric, "none", dash.firsts())[0]
        ?.values ?? [],
  );
}

const SPLITS: [Split, string][] = [
  ["kind", "Token kind"],
  ["model", "Model"],
  ["project", "Project"],
  ["agent", "Agent"],
  ["provider", "Provider"],
];

export function Overview(props: { go: (page: string) => void }) {
  const { now: t, prev: p } = useTotals();
  const vs = () => previousLabel(dash.range());
  const partial = () => dash.buckets().at(-1)?.partial ?? false;
  const sparks = {
    tokens: spark("tokens"),
    est: spark("est"),
    steps: spark("steps"),
    sessions: spark("sessions"),
    prompts: spark("prompts"),
    cache: spark("cacheHitRate"),
  };
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const [split, setSplit] = createSignal<Split>("kind");
  const series = createMemo(() =>
    timeSeries(
      dash.db(),
      dash.filters(),
      dash.buckets(),
      metric(),
      metric() === "tokens" ? split() : split() === "kind" ? "none" : split(),
      dash.firsts(),
    ),
  );
  const cells = createMemo(() =>
    contribution(dash.db(), dash.filters(), dash.now(), contributionMetric()),
  );
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  const models = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), "model", dash.firsts()),
  );
  const projects = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), "project", dash.firsts()),
  );
  const cgFormat = (v: number) =>
    contributionMetric() === "cost"
      ? `≈ ${usd(v)}`
      : contributionMetric() === "steps"
        ? `${int(v)} steps`
        : `${compact(v)} tokens`;
  const valueFormat = (v: number) => (metric() === "est" ? usd(v) : compact(v));

  return (
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-6 gap-3">
        <Kpi
          label="Tokens"
          value={compact(t().tokens)}
          change={change(t().tokens, p()?.tokens)}
          changeLabel={vs()}
          spark={sparks.tokens()}
          partialLast={partial()}
          sub={`${pct(t().cacheRead / (t().tokens || 1), 0)} cache read`}
        />
        <Kpi
          label="Estimated cost"
          approx
          value={usd(t().est)}
          change={change(t().est, p()?.est)}
          changeLabel={vs()}
          spark={sparks.est()}
          partialLast={partial()}
          sub={
            <span title="Share of tokens whose model has a list price, and the cost OpenCode recorded">
              {pct(t().pricedShare, 0)} priced · {usd(t().rec)} recorded
            </span>
          }
        />
        <Kpi
          label="Steps"
          value={int(t().steps)}
          change={change(t().steps, p()?.steps)}
          changeLabel={vs()}
          spark={sparks.steps()}
          partialLast={partial()}
          sub={`${t().stepsPerPrompt?.toFixed(1) ?? "–"} per prompt`}
        />
        <Kpi
          label="Sessions"
          value={int(t().sessions)}
          change={change(t().sessions, p()?.sessions)}
          changeLabel={vs()}
          spark={sparks.sessions()}
          partialLast={partial()}
          sub={`+ ${int(t().subagentSessions)} subagent sessions`}
        />
        <Kpi
          label="Prompts"
          value={int(t().prompts)}
          change={change(t().prompts, p()?.prompts)}
          changeLabel={vs()}
          spark={sparks.prompts()}
          partialLast={partial()}
          sub={`${int(t().activeDays)} active days`}
        />
        <Kpi
          label="Cache hit rate"
          value={pct(t().cacheHitRate)}
          change={change(t().cacheHitRate, p()?.cacheHitRate)}
          changeLabel={vs()}
          spark={sparks.cache()}
          partialLast={partial()}
          sub={`context median ${compact(t().ctxMedian ?? 0)}`}
        />
      </div>
      <Show when={dash.previous()}>
        <div class="-mt-2 text-right text-[12px] text-v2-text-text-faint">
          Changes {previousLabel(dash.range())}
        </div>
      </Show>

      <Card
        title="Usage over time"
        actions={
          <>
            <SegmentedControl
              value={metric()}
              onChange={(v) => v && setMetric(v as Metric)}
              style={{ width: "auto" }}
            >
              <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
              <SegmentedControlItem value="est">Cost</SegmentedControlItem>
              <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
              <SegmentedControlItem value="toolCalls">Tool calls</SegmentedControlItem>
            </SegmentedControl>
            <Select
              options={SPLITS.filter(([s]) => metric() === "tokens" || s !== "kind")}
              current={SPLITS.find(([s]) => s === split()) ?? SPLITS[1]}
              value={(o) => o[0]}
              label={(o) => `By ${o[1].toLowerCase()}`}
              onSelect={(o) => o && setSplit(o[0])}
            />
          </>
        }
      >
        <TimeChart
          series={series()}
          buckets={dash.buckets()}
          unit={dash.range().bucket}
          height={240}
          format={valueFormat}
          onSelect={(b) => dash.drill(b)}
        />
        <div class="mt-2 flex items-center justify-between">
          <Legend series={series()} />
          <span class="text-[12px] text-v2-text-text-faint">
            Faded bars are partial · click a bar to drill in
          </span>
        </div>
      </Card>

      <Card
        title="Contribution graph"
        actions={
          <SegmentedControl
            value={contributionMetric()}
            onChange={(v) => v && setContributionMetric(v as ContributionMetric)}
            style={{ width: "auto" }}
          >
            <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
            <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
            <SegmentedControlItem value="cost">Cost</SegmentedControlItem>
          </SegmentedControl>
        }
      >
        <div class="flex gap-8">
          <ContributionGraph
            class="min-w-0 flex-1"
            cells={cells()}
            range={dash.range()}
            format={cgFormat}
            onSelect={(day) => dash.setRange({ kind: "fixed", unit: "day", start: dayKey(day) })}
          />
          <div class="flex w-[150px] flex-none flex-col gap-3 pt-4">
            <Stat label="Current streak" value={`${streak().current} days`} />
            <Stat label="Longest streak" value={`${streak().longest} days`} />
            <Stat
              label="Active days in range"
              value={`${t().activeDays} of ${dash.range().days}`}
            />
          </div>
        </div>
      </Card>

      <div class="grid grid-cols-2 gap-4">
        <Card
          title="Top models"
          actions={
            <button
              type="button"
              class="text-[12px] text-v2-text-text-accent"
              onClick={() => props.go("models")}
            >
              All models →
            </button>
          }
        >
          <RankedBars
            items={models().map((r) => ({
              key: r.key,
              label: r.label,
              sub: r.sub,
              value: r.tokens,
              selected: dash.filters().model?.includes(r.key),
            }))}
            format={compact}
            extra={(i) => pct(i.value / (t().tokens || 1), 0)}
            onSelect={(k) => dash.toggleFilter("model", k)}
            limit={6}
          />
        </Card>
        <Card
          title="Top projects"
          actions={
            <button
              type="button"
              class="text-[12px] text-v2-text-text-accent"
              onClick={() => props.go("projects")}
            >
              All projects →
            </button>
          }
        >
          <RankedBars
            items={projects().map((r) => ({
              key: r.key,
              label: r.label,
              value: r.tokens,
              color: "var(--chart-3)",
              selected: dash.filters().project?.includes(r.key),
            }))}
            format={compact}
            extra={(i) => pct(i.value / (t().tokens || 1), 0)}
            onSelect={(k) => dash.toggleFilter("project", k)}
            limit={6}
          />
        </Card>
      </div>

      <div class="grid grid-cols-4 gap-3">
        <Kpi
          label="Response time"
          value={duration(t().respMedian)}
          sub={
            <span title="Only steps with a recorded stream end (from Aug 24, 2026)">
              p95 {duration(t().respP95)} · {pct(t().respBasis / (t().steps || 1), 0)} of steps
            </span>
          }
        />
        <Kpi
          label="Failed steps"
          value={int(t().failed)}
          sub={`${pct(t().failureRate, 2)} · ${int(t().interrupted)} interrupted`}
          change={change(t().failed, p()?.failed)}
          changeLabel={vs()}
        />
        <Kpi
          label="Tool calls"
          value={compact(t().toolCalls)}
          sub={
            <OutcomeBar
              succeeded={t().succeeded}
              failed={t().toolFailed}
              stopped={t().stopped}
              width={120}
            />
          }
          change={change(t().toolCalls, p()?.toolCalls)}
          changeLabel={vs()}
        />
        <Kpi
          label="Context size"
          value={compact(t().ctxMedian ?? 0)}
          sub={`p95 ${compact(t().ctxP95 ?? 0)} · max ${compact(t().ctxMax ?? 0)}`}
        />
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div>
      <div class="text-[12px] text-v2-text-text-faint">{props.label}</div>
      <div class="num text-[15px] font-medium">{props.value}</div>
    </div>
  );
}
