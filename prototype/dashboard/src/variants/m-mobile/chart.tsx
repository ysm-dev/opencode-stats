// PROTOTYPE: a hand-rolled SVG time chart standing in for TanStack Charts, so the narrow-width
// behaviours (fit, scroll sideways, coarser buckets) and tap-to-read can be tried on any screen.
// Production keeps TanStack Charts and drives the same readout from onFocusChange and onSelect.
//
// The legend doubles as the readout: at rest it shows each series' total for the range; a hovered
// or tapped bucket shows that bucket's values, with "Drill in" beside its title. Nothing is
// reachable only by hover. A mouse click still drills at once, as in variant E.
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import type { Series } from "../../data/series";
import { type Bucket, buckets as makeBuckets, drill, type Unit } from "../../data/time";
import { bucketLabel, bucketTitle } from "../../format";
import { dash } from "../../state";
import { isTap, observeWidth, touchScreen } from "./media";

const AXIS = 44;
const PITCH = 12; // scroll mode: the narrowest bucket before the chart scrolls sideways
const COARSE = 6; // coarser mode: the narrowest bucket before buckets grow a size
const TOP = 10;
const BOTTOM = 22;

export type ChartMode = "fit" | "scroll" | "coarse";

/**
 * The buckets a chart shows. Normally the range's own; in the coarser mode, buckets grow from
 * days to weeks to months until each is at least COARSE px wide. A coarser bucket drills to itself.
 */
export function chartBuckets(mode: ChartMode, width: number): { buckets: Bucket[]; unit: Unit } {
  const range = dash.range();
  let unit = range.bucket;
  let list = dash.buckets();
  const plot = Math.max(1, width - AXIS);
  while (mode === "coarse" && plot / list.length < COARSE && (unit === "day" || unit === "week")) {
    unit = unit === "day" ? "week" : "month";
    list = makeBuckets({ ...range, bucket: unit }, dash.now());
  }
  return { buckets: list, unit };
}

export function drillInto(b: Bucket, unit: Unit): void {
  const next = drill(b, unit);
  if (next) dash.setRange(next);
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

const faded = (color: string) => `color-mix(in srgb, ${color} 42%, transparent)`;
const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : 0);

export function TimeChart(props: {
  series: Series[];
  buckets: Bucket[];
  unit: Unit;
  kind: "bar" | "line";
  scroll: boolean;
  height: number;
  format: (v: number) => string;
  restLabel: string;
  ariaLabel: string;
}) {
  const [width, setWidth] = createSignal(600);
  const [focus, setFocus] = createSignal<number | null>(null);
  let wrap: HTMLDivElement | undefined;
  let plot: SVGSVGElement | undefined;
  let dragging = false;

  const n = () => Math.max(1, props.buckets.length);
  const available = () => Math.max(1, width() - AXIS);
  const scrolls = () => props.scroll && available() / n() < PITCH;
  const pitch = () => (scrolls() ? PITCH : available() / n());
  const plotWidth = () => pitch() * n();
  const inner = () => props.height - TOP - BOTTOM;

  const totals = createMemo(() =>
    props.buckets.map((_, i) => props.series.reduce((s, x) => s + finite(x.values[i]), 0)),
  );
  const top = createMemo(() =>
    niceMax(
      props.kind === "bar"
        ? Math.max(0, ...totals())
        : Math.max(0, ...props.series.flatMap((s) => s.values.filter(Number.isFinite))),
    ),
  );
  const y = (v: number) => TOP + inner() * (1 - v / top());
  const bar = () => Math.max(1, pitch() * (pitch() > 8 ? 0.72 : 0.84));
  const labelEvery = () => Math.max(1, Math.ceil(46 / pitch()));
  // Edge labels hug the edges instead of being clipped.
  const labelX = (i: number) => {
    if (i === 0) return 0;
    const x = (i + 0.5) * pitch();
    return x > plotWidth() - 22 ? plotWidth() : x;
  };

  // A new range or bucket size clears the readout; live writes keep it.
  const shape = () => `${props.buckets[0]?.unitStart}:${props.buckets.length}:${props.unit}`;
  createEffect(
    on(shape, () => {
      setFocus(null);
      if (wrap && scrolls()) queueMicrotask(() => wrap && (wrap.scrollLeft = wrap.scrollWidth));
    }),
  );
  createEffect(
    on(scrolls, (s) => {
      if (s && wrap) queueMicrotask(() => wrap && (wrap.scrollLeft = wrap.scrollWidth));
    }),
  );

  const indexAt = (e: PointerEvent | MouseEvent) => {
    const r = plot!.getBoundingClientRect();
    return Math.min(n() - 1, Math.max(0, Math.floor((e.clientX - r.left) / pitch())));
  };
  const focused = () => {
    const i = focus();
    return i === null ? null : (props.buckets[i] ?? null);
  };
  const canDrill = (b: Bucket | null) => !!b && !b.future && props.unit !== "hour";

  const value = (s: Series) => {
    const i = focus();
    if (i !== null) return s.values[i];
    return props.kind === "bar" ? s.values.reduce((a, v) => a + finite(v), 0) : Number.NaN;
  };
  const total = () => {
    const i = focus();
    return i !== null ? totals()[i]! : totals().reduce((a, v) => a + v, 0);
  };
  const show = (v: number | undefined) =>
    v === undefined || !Number.isFinite(v) ? (focus() === null ? "" : "–") : props.format(v);

  function keydown(e: KeyboardEvent) {
    const last = props.buckets.findLastIndex((b) => !b.future);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const from = focus() ?? last + (e.key === "ArrowLeft" ? 1 : 0);
      setFocus(Math.min(last, Math.max(0, from + (e.key === "ArrowLeft" ? -1 : 1))));
    }
    if (e.key === "Enter" && canDrill(focused())) drillInto(focused()!, props.unit);
    if (e.key === "Escape") setFocus(null);
  }

  const linePath = (s: Series) => {
    let open = false;
    return s.values
      .map((v, i) => {
        if (!Number.isFinite(v)) {
          open = false;
          return "";
        }
        const cmd = open ? "L" : "M";
        open = true;
        return `${cmd}${(i + 0.5) * pitch()},${y(v)}`;
      })
      .join(" ");
  };

  return (
    <div class="m-chart chart" ref={(el) => observeWidth(el, setWidth)}>
      <div class="m-chart-body">
        <svg class="m-chart-axis" width={AXIS} height={props.height} aria-hidden="true">
          <For each={[0, 1, 2, 3]}>
            {(t) => (
              <text x={AXIS - 6} y={y((top() * t) / 3) + 3} text-anchor="end" font-size="10">
                {t === 0 ? "0" : props.format((top() * t) / 3)}
              </text>
            )}
          </For>
        </svg>
        <div
          class="m-chart-plot"
          classList={{ "m-chart-scrolls": scrolls() }}
          ref={(el) => (wrap = el)}
        >
          <svg
            ref={(el) => (plot = el)}
            width={plotWidth()}
            height={props.height}
            role="img"
            tabindex="0"
            aria-label={props.ariaLabel}
            classList={{ "m-scrub": !scrolls() }}
            onPointerDown={(e) => {
              if (!isTap(e)) return;
              dragging = true;
              setFocus(indexAt(e));
            }}
            onPointerMove={(e) => {
              if (!isTap(e) || (dragging && !scrolls())) setFocus(indexAt(e));
            }}
            onPointerUp={() => (dragging = false)}
            onPointerCancel={() => (dragging = false)}
            onPointerLeave={(e) => {
              if (!isTap(e)) setFocus(null);
            }}
            onClick={(e) => {
              if (isTap(e)) return;
              const b = props.buckets[indexAt(e)];
              if (canDrill(b ?? null)) drillInto(b!, props.unit);
            }}
            onKeyDown={keydown}
          >
            <For each={[1, 2, 3]}>
              {(t) => (
                <line
                  x1={0}
                  x2={plotWidth()}
                  y1={y((top() * t) / 3)}
                  y2={y((top() * t) / 3)}
                  stroke="var(--v2-border-border-base)"
                  stroke-opacity=".6"
                />
              )}
            </For>
            <line
              x1={0}
              x2={plotWidth()}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--v2-border-border-strong)"
              stroke-opacity=".6"
            />
            <Show when={focus() !== null}>
              <rect
                x={focus()! * pitch()}
                y={TOP}
                width={pitch()}
                height={inner()}
                fill="var(--v2-background-bg-layer-03)"
              />
            </Show>
            <Show
              when={props.kind === "bar"}
              fallback={
                <For each={props.series}>
                  {(s) => <path d={linePath(s)} fill="none" stroke={s.color} stroke-width="1.75" />}
                </For>
              }
            >
              <For each={props.buckets}>
                {(b, i) => {
                  const segments = () => {
                    let base = 0;
                    return props.series.map((s) => {
                      const v = finite(s.values[i()]);
                      const seg = { y0: base, y1: base + v, color: s.color };
                      base += v;
                      return seg;
                    });
                  };
                  return (
                    <For each={segments()}>
                      {(seg) => (
                        <Show when={seg.y1 > seg.y0}>
                          <rect
                            x={i() * pitch() + (pitch() - bar()) / 2}
                            y={y(seg.y1)}
                            width={bar()}
                            height={Math.max(0.5, y(seg.y0) - y(seg.y1))}
                            fill={b.partial ? faded(seg.color) : seg.color}
                          />
                        </Show>
                      )}
                    </For>
                  );
                }}
              </For>
            </Show>
            <Show when={props.kind === "line" && focus() !== null}>
              <For each={props.series}>
                {(s) => (
                  <Show when={Number.isFinite(s.values[focus()!])}>
                    <circle
                      cx={(focus()! + 0.5) * pitch()}
                      cy={y(s.values[focus()!]!)}
                      r="3"
                      fill={s.color}
                    />
                  </Show>
                )}
              </For>
            </Show>
            <For each={props.buckets}>
              {(b, i) => (
                <Show when={i() % labelEvery() === 0}>
                  <text
                    x={labelX(i())}
                    y={props.height - 6}
                    text-anchor={
                      i() === 0 ? "start" : labelX(i()) === plotWidth() ? "end" : "middle"
                    }
                    font-size="10"
                  >
                    {bucketLabel(b.unitStart, props.unit)}
                  </text>
                </Show>
              )}
            </For>
          </svg>
        </div>
      </div>
      <div class="m-readout" aria-live="polite">
        <Show
          when={focused()}
          fallback={
            <span class="m-readout-rest">
              {props.restLabel}
              <span class="faint">
                {" · "}
                {touchScreen()
                  ? "tap a bucket to read it"
                  : "hover a bucket to read it · click to drill in"}
              </span>
            </span>
          }
        >
          {(b) => (
            <>
              <span class="m-readout-title">
                {bucketTitle(b().start, b().end, props.unit)}
                {b().partial ? " · partial" : ""}
                {b().future ? " · not yet" : ""}
              </span>
              <Show when={canDrill(b())}>
                <button
                  type="button"
                  class="m-readout-button"
                  onClick={() => drillInto(b(), props.unit)}
                >
                  Drill in ›
                </button>
              </Show>
              <button
                type="button"
                class="m-readout-button m-readout-clear"
                aria-label="Clear the reading"
                onClick={() => setFocus(null)}
              >
                ✕
              </button>
            </>
          )}
        </Show>
      </div>
      <div class="m-legend">
        <For each={props.series}>
          {(s) => (
            <div class="m-legend-row">
              <i class="swatch" style={{ background: s.color }} />
              <span class="m-legend-label">{s.label}</span>
              <span class="num">{show(value(s))}</span>
            </div>
          )}
        </For>
        <Show when={props.kind === "bar" && props.series.length > 1}>
          <div class="m-legend-row m-legend-total">
            <i class="swatch" />
            <span class="m-legend-label">Total</span>
            <span class="num">{props.format(total())}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
