// Shared TimeChart turns NaN into zero. Keep its bars; draw lines locally so missing
// timing/rate buckets are gaps, never fabricated zero measurements.
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { TimeChart as SharedTimeChart, type TimeChartProps } from "../../charts/time-chart";
import { bucketLabel, bucketTitle, compact } from "../../format";

export function TimeChart(props: TimeChartProps) {
  return (
    <Show when={props.kind === "line"} fallback={<SharedTimeChart {...props} />}>
      <GapLine {...props} />
    </Show>
  );
}

interface Point {
  x: number;
  y: number;
  value: number;
}

function linePath(points: Point[]): string {
  let continuing = false;
  return points
    .map((p) => {
      if (!Number.isFinite(p.value)) {
        continuing = false;
        return "";
      }
      const command = continuing ? "L" : "M";
      continuing = true;
      return `${command}${p.x},${p.y}`;
    })
    .join(" ");
}

function GapLine(props: TimeChartProps) {
  const [width, setWidth] = createSignal(800);
  const height = () => props.height ?? 220;
  let host!: HTMLDivElement;
  const left = 42;
  const top = 12;
  const bottom = 26;
  const plotWidth = () => width() - left - 8;
  const plotHeight = () => height() - top - bottom;
  const values = () => props.series[0]?.values ?? [];
  const max = () => Math.max(...values().filter(Number.isFinite), 0) * 1.08 || 1;
  const step = () => plotWidth() / Math.max(props.buckets.length, 1);
  const points = createMemo(() =>
    values().map((value, i) => ({
      x: left + (i + 0.5) * step(),
      y: top + (1 - value / max()) * plotHeight(),
      value,
    })),
  );
  const valid = createMemo(() => points().filter((p) => Number.isFinite(p.value)));
  const ticks = () =>
    props.buckets
      .map((b, i) => ({ b, i }))
      .filter((_, i) => i % Math.max(1, Math.ceil(props.buckets.length / 8)) === 0);
  const format = (n: number) => (props.format ?? compact)(n);
  onMount(() => {
    const observer = new ResizeObserver(() => setWidth(host.clientWidth));
    setWidth(host.clientWidth);
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div
      ref={(el) => {
        host = el;
      }}
      class={`chart ${props.class ?? ""}`}
    >
      <svg
        width="100%"
        height={height()}
        viewBox={`0 0 ${width()} ${height()}`}
        role="img"
        aria-label="Usage over time; gaps mean no recorded values"
      >
        <For each={props.buckets}>
          {(b, i) => (
            <Show when={b.partial}>
              <rect
                x={left + i() * step()}
                y={top}
                width={step()}
                height={plotHeight()}
                fill="var(--v2-background-bg-layer-03)"
                fill-opacity=".55"
              />
            </Show>
          )}
        </For>
        <For each={[0, 1, 2, 3]}>
          {(i) => {
            const value = () => (max() * i) / 3;
            const y = () => top + (1 - i / 3) * plotHeight();
            return (
              <>
                <line
                  x1={left}
                  x2={width() - 8}
                  y1={y()}
                  y2={y()}
                  stroke="var(--v2-border-border-base)"
                  stroke-opacity=".65"
                />
                <text x={left - 6} y={y() + 4} text-anchor="end" fill="currentColor" font-size="10">
                  {format(value())}
                </text>
              </>
            );
          }}
        </For>
        <path
          data-line-path
          d={linePath(points())}
          stroke={props.series[0]?.color ?? "var(--chart-1)"}
          fill="none"
          stroke-width="1.75"
        />
        <For each={valid()}>
          {(p) => (
            <circle cx={p.x} cy={p.y} r="1.5" fill={props.series[0]?.color ?? "var(--chart-1)"} />
          )}
        </For>
        <For each={ticks()}>
          {({ b, i }) => (
            <text
              x={left + (i + 0.5) * step()}
              y={height() - 6}
              text-anchor="middle"
              fill="currentColor"
              font-size="10"
            >
              {bucketLabel(b.unitStart, props.unit)}
            </text>
          )}
        </For>
        <For each={props.buckets}>
          {(b, i) => (
            <rect
              x={left + i() * step()}
              y={top}
              width={step()}
              height={plotHeight()}
              fill="transparent"
              tabindex={b.future ? undefined : 0}
              role="button"
              aria-label={`${bucketTitle(b.start, b.end, props.unit)}: ${Number.isFinite(values()[i()]) ? format(values()[i()]!) : "No recorded value"}`}
              style={{ cursor: b.future ? "default" : "pointer" }}
              onClick={() => !b.future && props.onSelect?.(b)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !b.future) props.onSelect?.(b);
              }}
            >
              <title>
                {bucketTitle(b.start, b.end, props.unit)} ·{" "}
                {Number.isFinite(values()[i()]) ? format(values()[i()]!) : "No recorded value"}
                {b.partial ? " · partial" : ""}
              </title>
            </rect>
          )}
        </For>
      </svg>
    </div>
  );
}
