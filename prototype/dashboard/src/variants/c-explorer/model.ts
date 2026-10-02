import { breakdown, toolsIn, type Dimension, type Row, type Totals } from "../../data/query";
import { METRICS, timeSeries, type Metric, type Series, type Split } from "../../data/series";
import { compact, duration, pct, usd } from "../../format";
import { dash, urlParam } from "../../state";

export type Cut = Dimension | "kind";
export const metrics = METRICS.filter((m) => m.id !== "failureRate").map((m) => ({
  ...m,
  label: m.id === "est" ? "Cost (estimated)" : m.label.replace(" (median)", ""),
}));
export const dimensions: { id: Cut; label: string }[] = [
  { id: "model", label: "Model" },
  { id: "provider", label: "Provider" },
  { id: "project", label: "Project" },
  { id: "agent", label: "Agent" },
  { id: "variant", label: "Variant" },
  { id: "tool", label: "Tool" },
  { id: "session", label: "Session" },
  { id: "kind", label: "Token kind" },
];

export const cutsFor = (metric: Metric) =>
  dimensions.filter((d) => d.id !== "kind" || metric === "tokens");

export function useQuery() {
  const [storedMetric, storeMetric] = urlParam<Metric>("c.metric", "tokens");
  const [storedCut, storeCut] = urlParam<Cut>("c.by", "model");
  const metric = () => metrics.find((m) => m.id === storedMetric())?.id ?? "tokens";
  const cut = () => cutsFor(metric()).find((d) => d.id === storedCut())?.id ?? "model";
  function setMetric(m: Metric) {
    if (storedCut() === "kind" && m !== "tokens") storeCut("model");
    storeMetric(m);
  }
  function setCut(c: Cut) {
    if (c === "tool") setMetric("toolCalls");
    storeCut(c);
  }
  return { metric, cut, setMetric, setCut };
}

export function formatMetric(metric: Metric, value: number | null): string {
  if (metric === "est") return `≈ ${usd(value ?? 0)}`;
  if (metric === "rec") return usd(value ?? 0);
  if (metric === "cacheHitRate" || metric === "failureRate") return pct(value);
  if (metric === "respMedian") return duration(value);
  return value === null ? "–" : compact(value);
}

export function metricValue(row: Row | Totals, metric: Metric, calls = 0): number | null {
  if (metric === "toolCalls") return "toolCalls" in row ? row.toolCalls : calls;
  return row[metric];
}

export function callsBy(dim: Exclude<Dimension, "tool">): Map<string, number> {
  const counts = new Map<string, number>();
  for (const call of toolsIn(dash.db(), dash.filters(), dash.range())) {
    const key = String(call[dim]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sessionSeries(metric: Metric): Series[] {
  const rows = breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts());
  const calls = callsBy("session");
  const ranked = rows.toSorted(
    (a, b) =>
      (metricValue(b, metric, calls.get(b.key)) ?? 0) -
      (metricValue(a, metric, calls.get(a.key)) ?? 0),
  );
  const top = new Set(ranked.slice(0, 6).map((r) => r.key));
  const series = ranked.slice(0, 6).map((r, i) => ({
    key: r.key,
    label: r.label,
    color: `var(--chart-${i + 1})`,
    values:
      timeSeries(
        dash.db(),
        { ...dash.filters(), session: [r.key] },
        dash.buckets(),
        metric,
        "none",
        dash.firsts(),
      )[0]?.values ?? [],
  }));
  const remainder = rows.filter((r) => !top.has(r.key)).map((r) => r.key);
  if (remainder.length)
    series.push({
      key: "__other",
      label: `${remainder.length} more sessions`,
      color: "var(--chart-other)",
      values:
        timeSeries(
          dash.db(),
          { ...dash.filters(), session: remainder },
          dash.buckets(),
          metric,
          "none",
          dash.firsts(),
        )[0]?.values ?? [],
    });
  return series;
}

export function explorerSeries(metric: Metric, cut: Cut): Series[] {
  const additive = metrics.find((m) => m.id === metric)?.additive;
  if (cut === "session" && additive) return sessionSeries(metric);
  const split: Split = cut === "session" ? "none" : cut;
  return timeSeries(
    dash.db(),
    dash.filters(),
    dash.buckets(),
    metric,
    additive ? split : "none",
    dash.firsts(),
  );
}

export function cycle<T>(values: T[], current: T, dir: -1 | 1): T {
  return values[(values.indexOf(current) + dir + values.length) % values.length]!;
}
