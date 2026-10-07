import * as Schema from "effect/Schema";

export const chartMetrics = [
  "tokens",
  "cost",
  "recorded-cost",
  "steps",
  "prompts",
  "tools",
  "sessions",
  "cache",
  "response",
] as const;
export const chartSplits = ["token-kind", "model", "project", "agent", "provider"] as const;
export const ChartMetric = Schema.Literals(chartMetrics);
export const ChartSplit = Schema.Literals(chartSplits);
export const ChartChoice = Schema.Struct({ metric: ChartMetric, split: ChartSplit });
export type ChartChoice = typeof ChartChoice.Type;
export const defaultChart: ChartChoice = { metric: "tokens", split: "token-kind" };
export const normalizeChart = (choice: ChartChoice): ChartChoice =>
  choice.metric !== "tokens" && choice.split === "token-kind"
    ? { ...choice, split: "model" }
    : choice;
export const chartMetricLabels: Record<ChartChoice["metric"], string> = {
  tokens: "Tokens",
  cost: "≈ Estimated cost",
  "recorded-cost": "Recorded cost",
  steps: "Steps",
  prompts: "Prompts",
  tools: "Tool calls",
  sessions: "Sessions",
  cache: "Cache hit rate",
  response: "Response time p50",
};
export const chartSplitLabels: Record<ChartChoice["split"], string> = {
  "token-kind": "token kind",
  model: "model",
  project: "project",
  agent: "agent",
  provider: "provider",
};
export function parseChart(address: string, base: string): ChartChoice {
  const params = new URL(address, base).searchParams;
  for (const key of ["metric", "split"])
    if (params.getAll(key).length > 1) throw new Error("Duplicate chart choice");
  return normalizeChart(
    Schema.decodeUnknownSync(ChartChoice)({
      metric: params.get("metric") ?? defaultChart.metric,
      split: params.get("split") ?? defaultChart.split,
    }),
  );
}
export function chartAddress(address: string, choice: ChartChoice) {
  const params = new URLSearchParams(address.slice(address.indexOf("?") + 1));
  if (choice.metric !== defaultChart.metric) params.set("metric", choice.metric);
  if (choice.split !== defaultChart.split) params.set("split", choice.split);
  return `/?${params}`;
}
