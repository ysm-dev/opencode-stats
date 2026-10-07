import { barY } from "@tanstack/charts/bar";
import { lineY } from "@tanstack/charts/line";
import { dot } from "@tanstack/charts/dot";
import { rect } from "@tanstack/charts/rect";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import type { ChartDefinition } from "@tanstack/solid-charts";
import type { ChartMark } from "@tanstack/charts";
import type { CompletePage } from "./page-context.ts";

type Datum = { bucket: number; bottom: number; top: number | null };
export const chartMargin = { left: 64, right: 8, top: 8, bottom: 8 } as const;
export const chartColour = (id: string, index: number) => {
  if (id === "more") return "var(--dashboard-series-8)";
  const kinds: Record<string, string> = {
    input: "input",
    cacheRead: "cache-read",
    cacheWrite: "cache-write",
    output: "output",
    reasoning: "reasoning",
  };
  const kind = kinds[id];
  return `var(--dashboard-${kind ? `kind-${kind}` : `series-${index + 1}`})`;
};
export const chartHeight = (width: number) => (width < 720 ? 190 : 260);
const axisValue = (metric: CompletePage["chart"]["metric"], value: number) => {
  const compact = value.toLocaleString("en", { notation: "compact", maximumFractionDigits: 2 });
  if (metric === "cost" || metric === "recorded-cost")
    return `${metric === "cost" ? "≈ " : ""}$${compact}`;
  return ["tokens", "steps", "prompts", "tools", "sessions"].includes(metric)
    ? compact
    : chartValue(metric, value);
};
export function chartDrawing(
  chart: CompletePage["chart"],
  highlighted: string | null,
): ChartDefinition<Datum, number, number> {
  const maximum = Math.max(0, ...chart.buckets.map((bucket) => bucket.total ?? 0));
  const remaining = chart.buckets.map((bucket) =>
    bucket.values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
  const marks = chart.series.flatMap<ChartMark<Datum, number, number>>((series, index) => {
    const data = chart.buckets.map((bucket, bucketIndex) => {
      const top = remaining[bucketIndex]!;
      const value = bucket.values[index]!;
      const base = top - (value ?? 0);
      remaining[bucketIndex] = base;
      return {
        bucket: bucketIndex,
        bottom: base,
        top: value === null || bucket.start === bucket.end ? null : top,
      };
    });
    const fill = chartColour(series.id, index);
    if (!chart.additive)
      return [
        lineY(data, {
          x: "bucket",
          y: "top",
          stroke: fill,
          strokeWidth: 2,
          points: false,
          motion: false,
        }),
        ...[false, true].map((partial) =>
          dot(
            data.filter((datum) => chart.buckets[datum.bucket]!.partial === partial),
            {
              x: "bucket",
              y: "top",
              r: 3,
              fill,
              fillOpacity: partial ? 0.45 : 1,
              stroke: fill,
              strokeWidth: 1,
              motion: false,
            },
          ),
        ),
      ];
    const opacity = highlighted !== null && highlighted !== series.id ? 0.25 : 1;
    return [false, true].flatMap((partial) => {
      const rows = data.filter(
        (datum) =>
          datum.top !== null &&
          datum.top > datum.bottom &&
          chart.buckets[datum.bucket]!.partial === partial,
      );
      // The rect's all-edge inset leaves a surface-colour pixel between full-
      // strength partial outlines. A bar's inset only affects categorical edges.
      if (partial)
        return [
          rect(rows, {
            x: "bucket",
            y1: "bottom",
            y2: "top",
            fill,
            fillOpacity: opacity * 0.45,
            stroke: fill,
            strokeWidth: 1,
            inset: 1,
            motion: false,
          }),
        ];
      const mark = barY(rows, {
        x: "bucket",
        y1: "bottom",
        y2: "top",
        fill,
        fillOpacity: opacity,
        stroke: "var(--dashboard-base)",
        strokeWidth: 1,
        inset: 0,
        motion: false,
      });
      return [mark];
    });
  });
  return {
    marks,
    scales: {
      x: {
        scale: scaleBand<number>()
          .domain(chart.buckets.map((_, index) => index))
          .padding(0),
        axis: false,
      },
      y: {
        scale: scaleLinear().domain([0, maximum === 0 ? 1 : maximum]),
        axis: {
          tickLabels: false,
          ticks: {
            format: (value: number) => axisValue(chart.metric, value),
          },
        },
        grid: true,
      },
    },
    theme: {
      background: "var(--dashboard-base)",
      foreground: "var(--dashboard-text-base)",
      muted: "var(--dashboard-muted-base)",
      grid: "var(--dashboard-edge-base)",
      palette: chart.series.map((series, index) => chartColour(series.id, index)),
    },
    margin: chartMargin,
    pointer: false,
    keyboard: false,
    tooltip: false,
    focusRing: false,
    svgAnimation: false,
    motion: false,
  };
}
export function chartValue(metric: CompletePage["chart"]["metric"], value: number | null) {
  if (value === null) return "—";
  if (metric === "cost" || metric === "recorded-cost")
    return `${metric === "cost" ? "≈ " : ""}$${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (metric === "cache")
    return `${(value * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;
  if (metric === "response")
    return `${(value / 1000).toLocaleString("en", { maximumFractionDigits: 3 })} s`;
  return value.toLocaleString("en");
}
