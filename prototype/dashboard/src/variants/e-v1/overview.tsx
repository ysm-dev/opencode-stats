import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { Select } from "@opencode/ui/select";
import { createMemo, createSignal, For } from "solid-js";
import { RankedBars } from "../../charts/ranked-bars";
import { Legend, TimeChart } from "../../charts/time-chart";
import { breakdown } from "../../data/query";
import { timeSeries, type Metric, type Split } from "../../data/series";
import { compact, pct, usd } from "../../format";
import { dash } from "../../state";
import { Card } from "../a-pages/parts";
import { Rhythm } from "../b-report/details";
import { Headlines, useTotals } from "./headlines";
import { YearGraph } from "./year-graph";
import type { Page } from "./index";

export function Overview(props: { go: (page: Page) => void }) {
  return (
    <div class="e-overview">
      <Headlines />
      <section class="a-card e-contribution">
        <YearGraph />
      </section>
      <Usage />
      <div class="e-rank-grid">
        <Ranking dim="model" title="Top models" go={() => props.go("models")} />
        <Ranking dim="project" title="Top projects" go={() => props.go("projects")} />
      </div>
      <Rhythm />
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
  const [metric, setMetric] = createSignal<Metric>("tokens");
  const [split, setSplit] = createSignal<Split>("kind");
  const effectiveSplit = () => (metric() !== "tokens" && split() === "kind" ? "model" : split());
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
  return (
    <Card
      title="Usage over time"
      actions={
        <>
          <SegmentedControl
            value={metric()}
            onChange={(v) => v && setMetric(v as Metric)}
            style={{ width: "auto" }}
          >
            <For
              each={[
                ["tokens", "Tokens"],
                ["est", "Cost"],
                ["steps", "Steps"],
                ["toolCalls", "Tool calls"],
              ]}
            >
              {([value, title]) => (
                <SegmentedControlItem value={value!}>{title}</SegmentedControlItem>
              )}
            </For>
          </SegmentedControl>
          <Select
            options={SPLITS.filter(([s]) => metric() === "tokens" || s !== "kind")}
            current={SPLITS.find(([s]) => s === effectiveSplit())}
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
        format={metric() === "est" ? (v) => `≈ ${usd(v)}` : compact}
        onSelect={(b) => dash.drill(b)}
      />
      <div class="e-chart-footer">
        <Legend series={series()} />
        <span>Faded bars are partial · click a bar to drill in</span>
      </div>
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
        <button type="button" class="e-link" onClick={props.go}>
          All {props.dim}s →
        </button>
      }
    >
      <RankedBars
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
