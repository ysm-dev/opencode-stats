// PROTOTYPE: TanStack Charts over the range's buckets. Partial buckets are drawn faded.
import { barY, defineChart, lineY, stack } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/solid-charts";
import { createMemo, For, Show } from "solid-js";
import type { Series } from "../data/series";
import type { Bucket, Unit } from "../data/time";
import { bucketLabel, bucketTitle, compact } from "../format";

interface Row {
  id: string;
  x: string;
  series: string;
  label: string;
  value: number;
  color: string;
  partial: boolean;
}

export interface TimeChartProps {
  series: Series[];
  buckets: Bucket[];
  unit: Unit;
  kind?: "bar" | "line";
  height?: number;
  format?: (v: number) => string;
  onSelect?: (b: Bucket) => void;
  class?: string;
}

const faded = (color: string) => `color-mix(in srgb, ${color} 42%, transparent)`;

export function TimeChart(props: TimeChartProps) {
  const fmt = (v: number) => (props.format ?? compact)(v);
  const rows = createMemo<Row[]>(() =>
    props.buckets.flatMap((b, i) =>
      props.series.map((s) => ({
        id: `${i}:${s.key}`,
        x: String(i),
        series: s.key,
        label: s.label,
        value: Number.isNaN(s.values[i]!) ? 0 : (s.values[i] ?? 0),
        color: s.color,
        partial: b.partial,
      })),
    ),
  );
  const ticks = createMemo(() => {
    const n = props.buckets.length;
    const every = Math.max(1, Math.ceil(n / 8));
    return props.buckets.map((_, i) => String(i)).filter((_, i) => i % every === 0);
  });
  const definition = createMemo(() => {
    const keys = props.series.map((s) => s.key);
    const mark =
      props.kind === "line"
        ? lineY(rows(), {
            x: "x",
            y: "value",
            z: "series",
            key: "id",
            stroke: (d: Row) => d.color,
            strokeWidth: 1.75,
          })
        : barY(rows(), {
            x: "x",
            y: "value",
            z: "series",
            key: "id",
            layout: stack({ order: keys }),
            fill: (d: Row) => (d.partial ? faded(d.color) : d.color),
            inset: props.buckets.length > 60 ? 0.5 : 1.5,
            radius: { end: 2, stack: "outer" },
          });
    return defineChart({
      svgAnimation: false,
      marks: [mark],
      scales: {
        x: {
          scale: scaleBand,
          axis: {
            line: false,
            ticks: {
              values: ticks(),
              format: (k: string) => {
                const b = props.buckets[Number(k)];
                return b ? bucketLabel(b.unitStart, props.unit) : "";
              },
            },
          },
        },
        y: {
          scale: scaleLinear,
          grid: { strokeOpacity: 0.35 },
          nice: true,
          axis: { line: false, ticks: { count: 4, format: (v: number) => fmt(v) } },
        },
      },
      focus: "group-x",
      tooltip: {
        use: tooltip,
        formatGroup: (points: readonly { datum: Row }[]) => {
          const first = points[0]?.datum;
          if (!first) return "";
          const b = props.buckets[Number(first.x)]!;
          const lines = points
            .filter((p) => p.datum.value)
            .map((p) => `${p.datum.label}  ${fmt(p.datum.value)}`);
          const total = points.reduce((s, p) => s + p.datum.value, 0);
          const head = `${bucketTitle(b.start, b.end, props.unit)}${b.partial ? " · partial" : ""}`;
          return [
            head,
            ...lines,
            ...(points.length > 1 && props.kind !== "line" ? [`Total  ${fmt(total)}`] : []),
          ].join("\n");
        },
      },
    } as never);
  });
  return (
    <div class={`chart ${props.class ?? ""}`}>
      <Chart
        definition={definition() as never}
        height={props.height ?? 220}
        ariaLabel="Usage over time"
        onSelect={(p: { datum: Row } | null) => {
          const b = p ? props.buckets[Number(p.datum.x)] : undefined;
          if (b && !b.future) props.onSelect?.(b);
        }}
      />
    </div>
  );
}

export function Legend(props: { series: Series[]; class?: string }) {
  return (
    <Show when={props.series.length > 1}>
      <div
        class={`flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-v2-text-text-muted ${props.class ?? ""}`}
      >
        <For each={props.series}>
          {(s) => (
            <span class="flex items-center gap-1.5">
              <span class="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
