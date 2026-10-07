import * as Schema from "effect/Schema";
import { tokenKinds, type DimensionName } from "@opencode-stats/browser-copy";
import { adjust, emptyAmounts, totals, type Fact } from "./amounts.ts";
import { stepMetrics, type PromptFact } from "./step-metrics.ts";
import { emptyCost, addCost, costTotals } from "./cost.ts";
import type { ToolFact } from "./tool-metrics.ts";
import type { Period } from "./ranges.ts";
import { ChartChoice, chartMetricLabels, chartSplitLabels } from "./chart-choice.ts";
import { BucketUnit, ChartBucket, chartBuckets } from "./chart-buckets.ts";

const measured = Schema.NullOr(Schema.Number);
export const Chart = Schema.Struct({
  ...ChartChoice.fields,
  unit: BucketUnit,
  additive: Schema.Boolean,
  name: Schema.String,
  total: measured,
  basis: Schema.String,
  announcement: Schema.String,
  series: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, total: measured })),
  buckets: Schema.Array(
    Schema.Struct({
      ...ChartBucket.fields,
      values: Schema.Array(measured),
      total: measured,
      basis: Schema.String,
    }),
  ),
});
type ChartData = typeof Chart.Type;
type Rows = { steps: Fact[]; prompts: PromptFact[]; tools: ToolFact[]; sessions: number[] };
const emptyRows = (): Rows => ({ steps: [], prompts: [], tools: [], sessions: [] });
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;
const mergeRows = (groups: readonly Rows[]): Rows => ({
  steps: groups.flatMap((rows) => rows.steps),
  prompts: groups.flatMap((rows) => rows.prompts),
  tools: groups.flatMap((rows) => rows.tools),
  sessions: groups.flatMap((rows) => rows.sessions),
});

function summary(
  rows: Rows,
  names: readonly DimensionName[],
  period: Period,
  metric: ChartChoice["metric"],
) {
  const metrics =
    metric === "cache" || metric === "response"
      ? stepMetrics(rows.steps, rows.prompts, names, period)
      : null;
  const amounts = emptyAmounts();
  if (metric === "tokens") for (const step of rows.steps) adjust(amounts, step, 1n);
  const tokens = totals(amounts);
  const prices = emptyCost();
  if (metric === "cost" || metric === "recorded-cost")
    for (const step of rows.steps) addCost(prices, step);
  const cost = costTotals(prices);
  const values = {
    tokens: tokens.total,
    cost: cost.estimated,
    "recorded-cost": cost.recorded,
    steps: rows.steps.length,
    prompts: rows.prompts.length,
    tools: rows.tools.length,
    sessions: rows.sessions.length,
    cache: metrics?.cacheHitRate ?? null,
    response: metrics?.response.p50 ?? null,
  };
  const basis =
    metric === "cost"
      ? `${percent(cost.pricedShare)} of tokens priced`
      : metric === "response"
        ? `p95 ${metrics!.response.p95 === null ? "—" : `${metrics!.response.p95 / 1000} s`} · ${percent(metrics!.response.timedShare)} of steps timed`
        : "";
  return { value: values[metric], basis, tokens };
}

function seriesRows(
  rows: Rows,
  metric: ChartChoice["metric"],
  dimension: Exclude<ChartChoice["split"], "token-kind">,
  names: readonly DimensionName[],
) {
  const grouped = new Map<string, { id: string; name: string; rows: Rows }>();
  const byCode = new Map<number, DimensionName>(
    names.filter((name) => name.dimension === dimension).map((name) => [name.code, name]),
  );
  const append = <T extends Fact | PromptFact | ToolFact>(
    facts: readonly T[],
    add: (rows: Rows, fact: T) => void,
  ) => {
    for (const fact of facts) {
      const code = fact[dimension];
      const name = byCode.get(code);
      const id = name ? `${dimension}:${name.id}` : "unrecorded";
      const group = grouped.get(id) ?? { id, name: name?.name ?? "Unrecorded", rows: emptyRows() };
      add(group.rows, fact);
      grouped.set(id, group);
    }
  };
  if (metric === "prompts") append(rows.prompts, (row, fact) => row.prompts.push(fact));
  else if (metric === "tools") append(rows.tools, (row, fact) => row.tools.push(fact));
  else append(rows.steps, (row, fact) => row.steps.push(fact));
  return grouped;
}

export function usageChart(
  period: Period,
  timeZone: string,
  locale: string,
  choice: ChartChoice,
  rows: Rows,
  names: readonly DimensionName[],
  dataStart: number,
): ChartData {
  const { unit, buckets } = chartBuckets(period, timeZone, locale, dataStart);
  const additive = !["sessions", "cache", "response"].includes(choice.metric);
  const total = summary(rows, names, period, choice.metric);
  const tokenSplit = additive && choice.metric === "tokens" && choice.split === "token-kind";
  const dimension = choice.split === "token-kind" ? null : choice.split;
  const split = additive && dimension !== null;
  const grouped = split
    ? seriesRows(rows, choice.metric, dimension!, names)
    : new Map<string, { id: string; name: string; rows: Rows }>();
  const ranked = [...grouped.values()].map((group) => ({
    ...group,
    total: summary(group.rows, names, period, choice.metric).value,
  }));
  ranked.sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || a.id.localeCompare(b.id));
  const selected = ranked.slice(0, 6);
  const more = ranked.slice(6);
  const series = tokenSplit
    ? tokenKinds.map((id) => ({
        id,
        name: {
          input: "Input",
          cacheRead: "Cache read",
          cacheWrite: "Cache write",
          output: "Output",
          reasoning: "Reasoning",
        }[id],
        total: total.tokens[id],
      }))
    : split
      ? [
          ...selected.map(({ id, name, total: value }) => ({ id, name, total: value })),
          ...(more.length
            ? [
                {
                  id: "more",
                  name: `${more.length} more`,
                  total: summary(
                    mergeRows(more.map((group) => group.rows)),
                    names,
                    period,
                    choice.metric,
                  ).value,
                },
              ]
            : []),
        ]
      : [{ id: "total", name: chartMetricLabels[choice.metric], total: total.value }];
  const bucketRows = buckets.map(emptyRows);
  const distribute = <T extends { start: number }>(
    facts: readonly T[],
    add: (row: Rows, fact: T) => void,
  ) => {
    for (const fact of facts) {
      let index = 0;
      let high = buckets.length - 1;
      while (index < high) {
        const middle = Math.floor((index + high) / 2);
        if (fact.start >= buckets[middle]!.end) index = middle + 1;
        else high = middle;
      }
      // Inputs have already been clipped to the period. The full calendar axis
      // covers it, so every fact has exactly one destination, including at DST.
      add(bucketRows[index]!, fact);
    }
  };
  distribute(rows.steps, (row, fact) => row.steps.push(fact));
  distribute(rows.prompts, (row, fact) => row.prompts.push(fact));
  distribute(rows.tools, (row, fact) => row.tools.push(fact));
  distribute(
    rows.sessions.map((start) => ({ start })),
    (row, fact) => row.sessions.push(fact.start),
  );
  return {
    ...choice,
    unit,
    additive,
    total: total.value,
    basis: total.basis,
    announcement: "",
    series,
    name: `${chartMetricLabels[choice.metric]}${tokenSplit || split ? ` by ${chartSplitLabels[choice.split]}` : ""}`,
    buckets: buckets.map((bucket, index) => {
      const row = bucketRows[index]!;
      const span = { ...period, start: bucket.start, end: bucket.end };
      const amount = summary(row, names, span, choice.metric);
      const groups = split ? seriesRows(row, choice.metric, dimension!, names) : grouped;
      const valueFor = (id: string) => {
        const group = groups.get(id);
        return group ? summary(group.rows, names, span, choice.metric).value : 0;
      };
      const values = tokenSplit
        ? tokenKinds.map((kind) => amount.tokens[kind])
        : split
          ? series.map((item) =>
              item.id === "more"
                ? summary(
                    mergeRows(more.map((group) => groups.get(group.id)?.rows ?? emptyRows())),
                    names,
                    span,
                    choice.metric,
                  ).value
                : valueFor(item.id),
            )
          : [amount.value];
      return { ...bucket, values, total: amount.value, basis: amount.basis };
    }),
  };
}
