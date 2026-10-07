import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  useContext,
  type Accessor,
} from "solid-js";
import {
  addDates,
  dateCount,
  calendarRange,
  chartMetricLabels,
  type CalendarUnit,
  type GraphMetric,
  type ContributionGraph as Graph,
} from "@opencode-stats/engine";
import { PageState, PageActions } from "./page-context.ts";
import { changes, stateMark } from "./change-time.ts";
import { HeadlineText, number, percent } from "./step-headlines.tsx";
import {
  graphGeometry,
  graphRow,
  readingLabel,
  monthName,
  weekNumber,
} from "./contribution-geometry.ts";
import { useMediaSize } from "./media-size.tsx";

const graphMetrics: readonly GraphMetric[] = ["tokens", "steps", "cost"];
const indices = Array.from({ length: 365 }, (_, index) => index);
function createGraphReading(
  graph: Accessor<Graph>,
  narrow: Accessor<boolean>,
  select: (date: string, unit: CalendarUnit) => void,
) {
  const [reading, setReading] = createSignal<{ date: string; spoken: string }>();
  const geometry = createMemo(() => graphGeometry(graph().days));
  const read = createMemo(() => {
    const date = reading()?.date;
    if (date === undefined) return undefined;
    // A midnight/timezone change must not remove focused readout actions.
    return graph().days[Math.min(364, Math.max(0, dateCount(graph().days[0]!.date, date) - 1))]!;
  });
  let svg!: SVGSVGElement;
  let scroll!: HTMLDivElement;
  const value = () => {
    const current = read()!;
    const metric = graph().metric;
    if (metric === "cost")
      return current.cost.estimated === null
        ? "Unavailable estimated cost"
        : `$${number(current.cost.estimated)} estimated cost`;
    return `${number(current[metric])} ${metric}`;
  };
  const about = () => graph().metric === "cost" && read()!.cost.estimated !== null;
  const basis = () =>
    graph().metric === "cost" ? ` · ${percent(read()!.cost.pricedShare)} of tokens priced` : "";
  const hit = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    const bounds = svg.getBoundingClientRect();
    return geometry().nearest(
      ((event.clientX - bounds.left) * geometry().columns * 16) / bounds.width,
      ((event.clientY - bounds.top) * 176) / bounds.height,
    );
  };
  const pointerRead = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    const nearest = hit(event);
    if (reading()?.date !== nearest.date)
      changes.local("graph-read", () => setReading({ date: nearest.date, spoken: "" }));
  };
  const pointerUp = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    pointerRead(event);
    if (event.pointerType === "mouse" && event.button === 0) {
      const nearest = hit(event);
      select(nearest.date, nearest.unit);
    }
  };
  const clear = () => {
    // Return focus before removing the readout's full-size actions.
    svg.focus();
    changes.local("graph-read", () => setReading(undefined));
  };
  const scrollReading = (date: string) => {
    const column = geometry().column(date);
    const x = (column * svg.getBoundingClientRect().width) / geometry().columns;
    if (x < scroll.scrollLeft) scroll.scrollLeft = x;
    else if (x + 16 > scroll.scrollLeft + scroll.clientWidth)
      scroll.scrollLeft = x + 16 - scroll.clientWidth;
  };
  const key = (event: KeyboardEvent) => {
    const last = graph().days.at(-1)!.date;
    const date = read()?.date ?? last;
    if (event.key === "Enter") {
      event.preventDefault();
      select(date, "day");
      return;
    }
    if (event.key === "Escape") {
      clear();
      return;
    }
    const moves: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    const move = moves[event.key];
    if (move === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const first = graph().days[0]!.date;
    const next = event.key === "Home" ? first : event.key === "End" ? last : addDates(date, move!);
    const bounded = next < first ? first : next > last ? last : next;
    changes.local("graph-read", () => {
      setReading({ date: bounded, spoken: "" });
      setReading({
        date: bounded,
        spoken: `${readingLabel(bounded)} · ${about() ? "about " : ""}${value()}${basis()}`,
      });
      scrollReading(bounded);
    });
  };
  createEffect(
    on(narrow, (entered) => {
      if (!entered) return;
      changes.local("resize", () => {
        const current = read();
        if (current) scrollReading(current.date);
        else scroll.scrollLeft = scroll.scrollWidth;
      });
    }),
  );
  return {
    reading,
    read,
    geometry,
    value,
    about,
    basis,
    clear,
    pointerRead,
    pointerUp,
    key,
    svgRef: (element: SVGSVGElement) => {
      svg = element;
    },
    scrollRef: (element: HTMLDivElement) => {
      scroll = element;
    },
  };
}

export const ContributionGraph = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const media = useMediaSize();
  const narrow = createMemo(() => media().columnWidth < 720);
  const graph = () => state().graph;
  const select = (date: string, unit: CalendarUnit) => {
    const { from, to } = calendarRange(date, unit);
    void client.request({ kind: "drill", from, to, unit, source: "graph" });
  };
  const {
    reading,
    read,
    geometry,
    value,
    about,
    basis,
    clear,
    pointerRead,
    pointerUp,
    key,
    svgRef,
    scrollRef,
  } = createGraphReading(graph, narrow, select);
  const day = (index: number) => graph().days[index]!;
  const local = createMemo(() => ({ reading: reading(), media: media() }));
  const inRange = (date: string) =>
    !(
      state().period.from <= graph().days[0]!.date && state().period.to >= graph().days.at(-1)!.date
    ) &&
    date >= state().period.from &&
    date <= state().period.to;
  return (
    <section
      class="contribution-graph"
      aria-labelledby="contribution-heading"
      data-state={stateMark(state())}
      data-local-state={stateMark(local())}
      data-narrow={narrow()}
      data-coarse={media().coarse}
    >
      <h2 id="contribution-heading">Contribution graph</h2>
      <div
        class="graph-metrics"
        role="group"
        aria-label="Contribution metric"
        data-state={stateMark(state())}
      >
        <For each={graphMetrics}>
          {(metric) => (
            <button
              type="button"
              tabIndex={0}
              aria-pressed={graph().metric === metric}
              onClick={() => void client.request({ kind: "graph-metric", metric })}
            >
              {chartMetricLabels[metric]}
            </button>
          )}
        </For>
      </div>
      <p class="sr-only" id="graph-help">
        Past 365 local days. Left and right move by week; up and down by day. Home and End jump to
        the first and last day. Enter selects the day. Escape clears the readout.
      </p>
      <div class="graph-calendar">
        <div class="graph-weekdays" aria-hidden="true">
          <For each={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}>
            {(label) => <span>{label}</span>}
          </For>
        </div>
        <div class="graph-scroll" ref={scrollRef}>
          <div
            class="graph-plot"
            style={{ "--graph-width": `${geometry().columns * 16}px` }}
            data-state={stateMark(state())}
            data-local-state={stateMark(local())}
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label="Contribution graph, past 365 local days"
              aria-describedby="graph-help graph-readout"
              tabIndex={0}
              class="graph-surface"
              viewBox={`0 0 ${geometry().columns * 16} 176`}
              preserveAspectRatio="none"
              data-state={stateMark(state())}
              data-local-state={stateMark(local())}
              onPointerMove={pointerRead}
              onPointerUp={pointerUp}
              onKeyDown={key}
            >
              <defs>
                <pattern id="graph-unavailable" width={4} height={4} patternUnits="userSpaceOnUse">
                  <path d="M0,4 L4,0" class="graph-hatch" />
                </pattern>
              </defs>
              <For each={indices}>
                {(index) => (
                  <rect
                    data-date={day(index).date}
                    data-level={day(index).level}
                    data-selected={inRange(day(index).date)}
                    data-reading={read()?.date === day(index).date}
                    x={geometry().column(day(index).date) * 16 + 1.5}
                    y={graphRow(day(index).date) * 16 + 33.5}
                    width={13}
                    height={13}
                    rx={2}
                    aria-hidden="true"
                  />
                )}
              </For>
            </svg>
            {/* Opaque HTML labels remain contrast-checkable above the SVG image. */}
            <div class="graph-labels" aria-hidden="true">
              <For each={geometry().months}>
                {(month) => (
                  <span
                    class="graph-label"
                    data-month={month.date}
                    style={{ left: `${(month.x / (geometry().columns * 16)) * 100}%` }}
                  >
                    {month.label}
                  </span>
                )}
              </For>
              <For each={geometry().weeks}>
                {(week) => (
                  <span
                    class="graph-label graph-week"
                    data-week={week.date}
                    style={{ left: `${(week.x / (geometry().columns * 16)) * 100}%` }}
                  >
                    {week.label}
                  </span>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
      <div
        class="graph-legend"
        role="img"
        aria-label="Less to more activity; four quartile levels of active days"
      >
        <span>Less</span>
        <For each={[0, 1, 2, 3, 4]}>
          {(level) => <span class="graph-level" data-level={level} aria-hidden="true" />}
        </For>
        <span>More</span>
      </div>
      <p>
        Active days have at least one step. Levels are quartiles of active days with available
        values, following filters, not the time range. Hatched cells have unavailable estimated
        cost.
      </p>
      <div
        class="graph-readout"
        id="graph-readout"
        data-state={stateMark(state())}
        data-local-state={stateMark(local())}
      >
        <Show when={read()} fallback={<p>Point, tap or use the arrow keys to read a day.</p>}>
          {(current) => (
            <>
              <p>
                {readingLabel(current().date)} · <HeadlineText text={value()} about={about()} />
                {basis()}
              </p>
              <div class="graph-actions">
                <button type="button" tabIndex={0} onClick={() => select(current().date, "day")}>
                  This day
                </button>
                <button type="button" tabIndex={0} onClick={() => select(current().date, "week")}>
                  Week {weekNumber(current().date)}
                </button>
                <button type="button" tabIndex={0} onClick={() => select(current().date, "month")}>
                  {monthName(current().date)}
                </button>
                <button type="button" tabIndex={0} onClick={clear}>
                  Clear readout
                </button>
              </div>
            </>
          )}
        </Show>
      </div>
      <span
        class="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-state={stateMark(state())}
        data-local-state={stateMark(local())}
      >
        {reading()?.spoken ?? ""}
      </span>
      <span class="sr-only" aria-live="polite" aria-atomic="true" data-state={stateMark(state())}>
        {state().selectionAnnouncement}
      </span>
      <dl class="graph-streaks" data-state={stateMark(state())}>
        <div>
          <dt>Active days in range</dt>
          <dd>{number(state().activeDays)}</dd>
        </div>
        <div>
          <dt>Current streak</dt>
          <dd>{number(graph().currentStreak)} days</dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{number(graph().longestStreak)} days</dd>
        </div>
      </dl>
    </section>
  );
};
