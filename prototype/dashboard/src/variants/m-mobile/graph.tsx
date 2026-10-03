// PROTOTYPE: the contribution graph from variant E, with three ways to fit 53 weeks into a
// narrow column: scroll sideways (opened at today), month calendars, or the whole year shrunk.
// A tap reads a day and offers to select its day, week or month; a mouse keeps E's direct clicks.
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { LevelLegend } from "../../charts/contribution-graph";
import { contribution, type ContributionMetric, type DayCell, streaks } from "../../data/series";
import {
  addDays,
  dayKey,
  daysBetween,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "../../data/time";
import { compact, day, int, month, usd } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { useTotals } from "../e-v1/headlines";
import { isTap, narrow, observeWidth, touchScreen } from "./media";
import type { Mix } from "./mix";

const fmt = (v: number) =>
  contributionMetric() === "cost" ? `≈ ${usd(v)}` : `${compact(v)} ${contributionMetric()}`;
const inside = (t: number) => t >= dash.range().start && t < dash.range().axisEnd;
const selectDay = (t: number) => dash.setRange({ kind: "fixed", unit: "day", start: dayKey(t) });
const select = (t: number, unit: "month" | "week") =>
  dash.setRange({
    kind: "fixed",
    unit,
    start: dayKey(unit === "month" ? startOfMonth(t) : startOfWeek(t)),
  });
const weekNumber = (t: number) =>
  Math.floor(daysBetween(new Date(new Date(t).getFullYear(), 0, 1).getTime(), t) / 7) + 1;

export function Graph(props: { mode: Mix["graph"] }) {
  const cells = createMemo(() =>
    contribution(dash.db(), dash.filters(), dash.now(), contributionMetric()),
  );
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  const { now } = useTotals();
  const [pick, setPick] = createSignal<DayCell | null>(null);
  createEffect(on(contributionMetric, () => setPick(null), { defer: true }));
  const months = () => props.mode === "months" && narrow();
  // The month calendars have no week row, so there a click reads too and the readout selects.
  const actions = () => touchScreen() || months();

  // Hover reads with a mouse; a tap reads and leaves the choice of day, week or month to the
  // readout. Keyboard focus reads too, and Enter selects the day as a click does.
  const cellEvents = (c: DayCell) => ({
    onPointerEnter: (e: PointerEvent) => !isTap(e) && setPick(c),
    onPointerLeave: (e: PointerEvent) => !isTap(e) && !months() && setPick(null),
    onFocus: () => setPick(c),
    onClick: (e: MouseEvent) => (isTap(e) || months() ? setPick(c) : selectDay(c.t)),
  });
  return (
    <section class="a-card e-contribution m-graph" data-mode={months() ? "months" : props.mode}>
      <div class="d-graph-heading">
        <div>
          <h2>Contribution graph</h2>
          <p class="faint">Past 365 local days · select a day, week or month</p>
        </div>
        <SegmentedControl
          aria-label="Contribution metric"
          value={contributionMetric()}
          onChange={(v) => v && setContributionMetric(v as ContributionMetric)}
        >
          <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
          <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
          <SegmentedControlItem value="cost">Cost</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <Show
        when={months()}
        fallback={
          <YearGrid
            cells={cells()}
            mode={props.mode}
            events={cellEvents}
            pick={pick()}
            setPick={setPick}
          />
        }
      >
        <MonthGrid cells={cells()} events={cellEvents} pick={pick()} />
      </Show>
      <Readout pick={pick()} clear={() => setPick(null)} actions={actions()} />
      <div class="d-streaks">
        <div>
          <strong class="num">{int(streak().current)}</strong>
          <span>day current streak</span>
        </div>
        <div>
          <strong class="num">{int(streak().longest)}</strong>
          <span>day longest streak</span>
        </div>
        <div>
          <strong class="num">{int(now().activeDays)}</strong>
          <span>active days in range</span>
        </div>
      </div>
    </section>
  );
}

type CellEvents = (c: DayCell) => {
  onPointerEnter: (e: PointerEvent) => unknown;
  onPointerLeave: (e: PointerEvent) => unknown;
  onFocus: () => unknown;
  onClick: (e: MouseEvent) => unknown;
};

function YearGrid(props: {
  cells: DayCell[];
  mode: Mix["graph"];
  events: CellEvents;
  pick: DayCell | null;
  setPick: (c: DayCell) => void;
}) {
  let scroller: HTMLDivElement | undefined;
  const [graphWidth, setGraphWidth] = createSignal(600);
  const origin = () => startOfWeek(props.cells[0]!.t);
  const columns = () => Math.ceil((daysBetween(origin(), props.cells.at(-1)!.t) + 1) / 7);
  const col = (t: number) => Math.floor(daysBetween(origin(), t) / 7);
  const weeks = createMemo(() =>
    Array.from({ length: columns() }, (_, i) => addDays(origin(), i * 7)),
  );
  const monthStarts = createMemo(() =>
    props.cells.filter((c, i) => i === 0 || new Date(c.t).getDate() === 1),
  );
  // Fit: square cells sized so all 53 weeks fill the column.
  const fit = () => props.mode === "fit" && narrow();
  const fitCell = () => Math.max(3, Math.floor(graphWidth() / columns()));
  const scrolls = () => props.mode === "scroll" && narrow();
  createEffect(
    on(scrolls, (s) => {
      if (s) queueMicrotask(() => scroller && (scroller.scrollLeft = scroller.scrollWidth));
    }),
  );
  // Fit: drag a finger across the year to read day after day.
  const scrub = (e: PointerEvent) => {
    if (props.mode !== "fit" || !isTap(e) || e.buttons === 0) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const t = Number(el?.dataset.t);
    const c = props.cells.find((x) => x.t === t);
    if (c) props.setPick(c);
  };
  return (
    <div
      class="d-graph-layout"
      classList={{ "m-fit": fit() }}
      style={fit() ? { "--cell": `${fitCell()}px` } : {}}
    >
      <div class="d-weekdays">
        <For each={["Mon", "", "Wed", "", "Fri", "", "Sun"]}>{(d) => <span>{d}</span>}</For>
      </div>
      <div
        class="m-graph-scroll"
        classList={{ "m-scrolls": scrolls() }}
        ref={(el) => {
          scroller = el;
          observeWidth(el, setGraphWidth);
        }}
      >
        <div class="d-graph" style={{ "--weeks": columns() }}>
          <div class="d-months">
            <For each={monthStarts()}>
              {(m) => (
                <button
                  type="button"
                  style={{
                    "grid-column": `${col(m.t) + 1} / span ${Math.min(3, columns() - col(m.t))}`,
                  }}
                  aria-label={`Select ${month(m.t)}`}
                  onClick={() => select(m.t, "month")}
                >
                  {month(m.t, false)}
                </button>
              )}
            </For>
          </div>
          <div class="d-cells" onPointerMove={scrub}>
            <For each={props.cells}>
              {(c) => (
                <button
                  type="button"
                  class="d-cell"
                  data-t={c.t}
                  classList={{ "d-selected": inside(c.t), "m-picked": props.pick?.t === c.t }}
                  style={{
                    "grid-column": col(c.t) + 1,
                    "grid-row": ((new Date(c.t).getDay() + 6) % 7) + 1,
                    background: `var(--level-${c.level})`,
                  }}
                  aria-label={`${day(c.t, { weekday: true, year: true })}: ${fmt(c.value)}`}
                  aria-pressed={inside(c.t)}
                  {...props.events(c)}
                />
              )}
            </For>
          </div>
          <div class="d-weeks">
            <For each={weeks()}>
              {(t, i) => (
                <button
                  type="button"
                  aria-label={`Select week of ${day(t, { year: true })}`}
                  onClick={() => select(t, "week")}
                >
                  {i() % 4 === 0 ? weekNumber(t) : "·"}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Narrow only: one small calendar per month, newest first. Weeks are selected from the readout. */
function MonthGrid(props: { cells: DayCell[]; events: CellEvents; pick: DayCell | null }) {
  const byDay = createMemo(() => new Map(props.cells.map((c) => [c.t, c])));
  const months = createMemo(() => {
    const today = startOfDay(dash.now());
    const out: { t: number; rows: { week: number; days: (number | null)[] }[] }[] = [];
    for (let m = startOfMonth(today); m >= startOfMonth(props.cells[0]!.t);) {
      const next = new Date(new Date(m).getFullYear(), new Date(m).getMonth() + 1, 1).getTime();
      const rows: { week: number; days: (number | null)[] }[] = [];
      for (let w = startOfWeek(m); w < next && w <= today; w = addDays(w, 7)) {
        rows.push({
          week: w,
          days: Array.from({ length: 7 }, (_, i) => {
            const t = addDays(w, i);
            return t >= m && t < next && t <= today ? t : null;
          }),
        });
      }
      out.push({ t: m, rows });
      m = new Date(new Date(m).getFullYear(), new Date(m).getMonth() - 1, 1).getTime();
    }
    return out;
  });
  return (
    <div class="m-months">
      <For each={months()}>
        {(m) => (
          <div class="m-month">
            <button type="button" class="m-month-name" onClick={() => select(m.t, "month")}>
              {month(m.t)}
            </button>
            <div class="m-month-grid">
              <For each={WEEKDAYS}>{(d) => <span class="m-month-weekday">{d}</span>}</For>
              <For each={m.rows}>
                {(row) => (
                  <>
                    <For each={row.days}>
                      {(t) => {
                        const c = t === null ? undefined : byDay().get(t);
                        return c ? (
                          <button
                            type="button"
                            class="d-cell m-month-day"
                            classList={{
                              "d-selected": inside(c.t),
                              "m-picked": props.pick?.t === c.t,
                            }}
                            style={{ background: `var(--level-${c.level})` }}
                            aria-label={`${day(c.t, { weekday: true, year: true })}: ${fmt(c.value)}`}
                            {...props.events(c)}
                          />
                        ) : (
                          <span class="m-month-day m-month-blank" />
                        );
                      }}
                    </For>
                  </>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function Readout(props: { pick: DayCell | null; clear: () => void; actions: boolean }) {
  return (
    <Show
      when={props.actions}
      fallback={
        <div class="d-graph-footer">
          <span class="faint">
            {props.pick
              ? `${day(props.pick.t, { weekday: true })} · ${fmt(props.pick.value)}`
              : "Quartile levels · week row selects a week · outlined cells are your range"}
          </span>
          <LevelLegend />
        </div>
      }
    >
      <div class="m-graph-readout" aria-live="polite">
        <Show
          when={props.pick}
          fallback={
            <>
              <span class="faint">
                {touchScreen() ? "Tap" : "Click"} a day to read it · outlined days are in the range
              </span>
              <LevelLegend />
            </>
          }
        >
          {(c) => (
            <>
              <span class="m-readout-title">
                {day(c().t, { weekday: true, year: true })} · {fmt(c().value)}
              </span>
              <div class="m-graph-actions">
                <button type="button" class="m-readout-button" onClick={() => selectDay(c().t)}>
                  This day
                </button>
                <button
                  type="button"
                  class="m-readout-button"
                  onClick={() => select(c().t, "week")}
                >
                  Week {weekNumber(startOfWeek(c().t))}
                </button>
                <button
                  type="button"
                  class="m-readout-button"
                  onClick={() => select(c().t, "month")}
                >
                  {month(c().t, false)}
                </button>
                <button
                  type="button"
                  class="m-readout-button m-readout-clear"
                  aria-label="Clear the reading"
                  onClick={() => props.clear()}
                >
                  ✕
                </button>
              </div>
            </>
          )}
        </Show>
      </div>
    </Show>
  );
}
